/**
 * Glassnik audio engine.
 *
 * Owns exactly ONE persistent HTML audio element for the whole application.
 * Components never create their own media elements: they go through the
 * singleton returned by `getAudioEngine()`, so simulated video changes and
 * React re-renders can never spawn a second player or restart a track.
 *
 * Responsibilities:
 *  - source assignment with change detection (same URL -> no-op, no restart)
 *  - play/pause with autoplay-rejection handling (`blocked` status)
 *  - short fade-out / fade-in transitions between different tracks
 *  - volume control (fades restore the user's chosen volume)
 *  - error surfacing for missing or unreadable files
 *  - playback lifecycle events (`ended`, `error`) for the provider
 *
 * The element itself is injectable so unit tests can use a fake media
 * element. Tests using the fake element are MOCKED unit tests, not proof of
 * real browser playback.
 */
import type { PlaybackStatus } from '../types';

export interface AudioEngineState {
  status: PlaybackStatus;
  url: string | null;
  error: string | null;
}

/**
 * Playback lifecycle events that are *not* part of the engine state.
 *
 * `ended` fires when a track reaches its natural end and `error` fires when
 * the media element cannot load or decode the file. The provider listens to
 * both so it can advance to the next recommended track instead of leaving the
 * user with silence.
 *
 * `wasPlaying` tells the listener whether the track was really playing when
 * it ended. A paused player must ignore the event, otherwise it would start
 * a new track the user never asked for.
 */
export type AudioEngineEvent =
  | { type: 'ended'; wasPlaying: boolean }
  | { type: 'error'; message: string };

/** The subset of HTMLAudioElement the engine actually uses. */
export interface MediaElementLike {
  src: string;
  volume: number;
  paused: boolean;
  preload?: string;
  readonly error?: { code?: number | null; message?: string } | null;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface AudioEngineOptions {
  createMediaElement?: () => MediaElementLike;
  /** Default fade duration in ms for track transitions. */
  fadeMs?: number;
  /** Fade tick duration in ms. */
  fadeStepMs?: number;
}

export interface TransitionOptions {
  fadeMs?: number;
  /** Whether to start playback after the swap. Defaults to "was playing". */
  autoplay?: boolean;
}

export interface AudioEngineLike {
  getState(): AudioEngineState;
  subscribe(listener: (state: AudioEngineState) => void): () => void;
  /**
   * Subscribes to playback lifecycle events that are not part of the state:
   * `ended` when a track finishes, `error` when a file cannot be played.
   * The provider uses them to move on to the next track automatically.
   */
  subscribeEvents(listener: (event: AudioEngineEvent) => void): () => void;
  /** Assigns a source without playing. No-op when the URL is unchanged. */
  setSource(url: string, force?: boolean): boolean;
  play(): Promise<void>;
  pause(): void;
  setVolume(volume: number): void;
  getVolume(): number;
  /**
   * Moves playback to `url`. Resolves to false when the URL is unchanged and
   * no restart occurred, true when a transition happened.
   */
  transitionTo(url: string, options?: TransitionOptions): Promise<boolean>;
  dispose(): void;
}

const DEFAULT_FADE_MS = 320;
const DEFAULT_FADE_STEP_MS = 40;
const MIN_VOLUME = 0;
const MAX_VOLUME = 1;

function clamp01(value: number): number {
  return Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeMediaError(error: { code?: number | null; message?: string } | null): string {
  if (!error) return 'Audio failed to load.';
  const code = typeof error.code === 'number' ? error.code : null;
  switch (code) {
    case 1:
      return 'Audio loading was aborted.';
    case 2:
      return 'Audio could not be downloaded (network error or missing file).';
    case 3:
      return 'Audio could not be decoded (file is not a valid MP3).';
    case 4:
      return 'Audio source is not supported by this browser.';
    default:
      return error.message || 'Audio failed to load.';
  }
}

export class AudioEngine implements AudioEngineLike {
  private readonly el: MediaElementLike;
  private readonly fadeMs: number;
  private readonly fadeStepMs: number;
  private readonly listeners = new Set<(state: AudioEngineState) => void>();
  private readonly eventListeners = new Set<(event: AudioEngineEvent) => void>();
  private readonly handlePlaying = () => {
    this.playbackActive = true;
    this.emit({ status: 'playing', error: null });
  };
  private readonly handlePause = () => {
    if (this.state.status !== 'error') this.emit({ status: 'paused' });
  };
  private readonly handleWaiting = () => {
    if (this.state.status === 'playing') this.emit({ status: 'loading' });
  };
  private readonly handleError = () => {
    this.playbackActive = false;
    const mediaError =
      (this.el as { error?: { code?: number | null; message?: string } | null }).error ?? null;
    const message = describeMediaError(mediaError);
    this.emit({ status: 'error', error: message });
    this.emitEvent({ type: 'error', message });
  };
  private readonly handleEnded = () => {
    // Browsers fire "pause" just before "ended", so the state alone cannot
    // tell us whether the track was really playing. The flag can.
    const wasPlaying = this.playbackActive;
    this.emit({ status: 'paused' });
    this.emitEvent({ type: 'ended', wasPlaying });
  };

  private state: AudioEngineState = { status: 'idle', url: null, error: null };
  private userVolume = 1;
  private transitionToken = 0;
  private disposed = false;
  /**
   * True while the current track is meant to be playing.
   *
   * It is switched off by an explicit pause (the user pressed pause or the
   * music was turned off) and by an error, but not by the automatic pause a
   * browser fires when a track reaches its end.
   */
  private playbackActive = false;

  constructor(options: AudioEngineOptions = {}) {
    const factory =
      options.createMediaElement ??
      ((): MediaElementLike => {
        const element =
          typeof Audio !== 'undefined'
            ? new Audio()
            : (document.createElement('audio') as unknown as MediaElementLike);
        element.preload = 'auto';
        return element;
      });
    this.el = factory();
    this.fadeMs = options.fadeMs ?? DEFAULT_FADE_MS;
    this.fadeStepMs = options.fadeStepMs ?? DEFAULT_FADE_STEP_MS;
    this.el.volume = this.userVolume;
    this.el.addEventListener('playing', this.handlePlaying);
    this.el.addEventListener('pause', this.handlePause);
    this.el.addEventListener('waiting', this.handleWaiting);
    this.el.addEventListener('error', this.handleError);
    this.el.addEventListener('ended', this.handleEnded);
  }

  getState(): AudioEngineState {
    return this.state;
  }

  subscribe(listener: (state: AudioEngineState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeEvents(listener: (event: AudioEngineEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  private emit(patch: Partial<AudioEngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) listener(this.state);
  }

  private emitEvent(event: AudioEngineEvent): void {
    for (const listener of [...this.eventListeners]) listener(event);
  }

  setSource(url: string, force = false): boolean {
    if (this.disposed) return false;
    if (!force && url === this.state.url && this.state.status !== 'error') {
      // Same source: never touch the element, so playback is not restarted.
      return false;
    }
    this.transitionToken += 1;
    this.playbackActive = false;
    this.el.src = url;
    this.emit({ url, status: 'loading', error: null });
    return true;
  }

  async play(): Promise<void> {
    if (this.disposed) return;
    try {
      this.playbackActive = true;
      const result = this.el.play();
      if (result && typeof (result as Promise<void>).then === 'function') {
        await result;
      }
      if (this.disposed) return;
      if (this.state.status !== 'error') this.emit({ status: 'playing', error: null });
    } catch (err) {
      this.playbackActive = false;
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        // Autoplay policy: a user gesture is required before playback starts.
        this.emit({
          status: 'blocked',
          error: 'Playback blocked by the browser autoplay policy. Press Play to start.',
        });
      } else if (name !== 'AbortError') {
        this.emit({
          status: 'error',
          error: err instanceof Error ? err.message : 'Playback failed to start.',
        });
      }
    }
  }

  pause(): void {
    if (this.disposed) return;
    this.transitionToken += 1;
    // An explicit pause means the track is no longer "playing on purpose".
    this.playbackActive = false;
    // Skip the element call when it is already paused (also avoids jsdom's
    // "not implemented" noise for elements that never started playback).
    if (!this.el.paused) this.el.pause();
    if (this.state.status !== 'error') this.emit({ status: 'paused' });
  }

  setVolume(volume: number): void {
    this.userVolume = clamp01(volume);
    if (!this.disposed) this.el.volume = this.userVolume;
  }

  getVolume(): number {
    return this.userVolume;
  }

  private async fade(target: number, ms: number, token: number): Promise<void> {
    if (this.disposed || token !== this.transitionToken) return;
    if (ms <= 0 || this.fadeStepMs <= 0) {
      this.el.volume = clamp01(target);
      return;
    }
    const start = this.el.volume;
    const steps = Math.max(1, Math.round(ms / this.fadeStepMs));
    for (let i = 1; i <= steps; i += 1) {
      if (this.disposed || token !== this.transitionToken) return;
      this.el.volume = clamp01(start + (target - start) * (i / steps));
      await sleep(this.fadeStepMs);
    }
    if (token === this.transitionToken) this.el.volume = clamp01(target);
  }

  async transitionTo(url: string, options: TransitionOptions = {}): Promise<boolean> {
    if (this.disposed) return false;

    const wasActive =
      this.state.status === 'loading' ||
      this.state.status === 'playing' ||
      this.state.status === 'blocked';
    const shouldPlay = options.autoplay ?? wasActive;
    const fadeMs = options.fadeMs ?? this.fadeMs;

    if (url === this.state.url && this.state.status !== 'error') {
      // Same track: do not restart it.
      return false;
    }

    const token = ++this.transitionToken;

    if (wasActive && shouldPlay && fadeMs > 0) {
      await this.fade(0, fadeMs, token);
      if (token !== this.transitionToken || this.disposed) return false;
    }

    this.playbackActive = false;
    this.el.src = url;
    this.emit({ url, status: 'loading', error: null });

    if (shouldPlay) {
      await this.play();
    } else {
      this.emit({ status: 'paused' });
    }

    if (fadeMs > 0 && shouldPlay) {
      this.el.volume = 0;
      await this.fade(this.userVolume, fadeMs, token);
    } else {
      this.el.volume = this.userVolume;
    }
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.transitionToken += 1;
    this.el.removeEventListener('playing', this.handlePlaying);
    this.el.removeEventListener('pause', this.handlePause);
    this.el.removeEventListener('waiting', this.handleWaiting);
    this.el.removeEventListener('error', this.handleError);
    this.el.removeEventListener('ended', this.handleEnded);
    if (!this.el.paused) this.el.pause();
    this.listeners.clear();
    this.eventListeners.clear();
  }
}

let singleton: AudioEngine | null = null;
let injected: AudioEngineLike | null = null;

/**
 * Returns the one and only audio engine. Repeated calls return the same
 * instance so multiple simultaneous players cannot be created.
 */
export function getAudioEngine(): AudioEngineLike {
  if (injected) return injected;
  if (!singleton) singleton = new AudioEngine();
  return singleton;
}

/** Test hook: inject a fake engine (pass null to restore the singleton). */
export function setAudioEngineForTests(engine: AudioEngineLike | null): void {
  injected = engine;
}

/** Test hook: dispose and drop the singleton. */
export function resetAudioEngineForTests(): void {
  if (singleton) singleton.dispose();
  singleton = null;
  injected = null;
}
