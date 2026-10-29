/**
 * Audio engine tests — MOCKED media element.
 *
 * A fake HTMLMediaElement is injected, so these tests prove engine logic
 * (source assignment, change detection, play/pause, volume, error handling,
 * fade restoration, singleton behaviour, cleanup). They do NOT prove real
 * browser playback or audible crossfades — that still requires manual
 * verification in Safari.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AudioEngine,
  getAudioEngine,
  resetAudioEngineForTests,
  type MediaElementLike,
} from '../src/player/audioEngine';

class FakeMediaElement implements MediaElementLike {
  declare src: string;
  declare volume: number;
  srcAssignments = 0;
  volumeHistory: number[] = [];
  paused = true;
  preload = 'auto';
  error: { code: number | null; message: string } | null = null;
  playCalls = 0;
  pauseCalls = 0;
  playError: Error | null = null;

  private _src = '';
  private _volume = 1;
  private listeners = new Map<string, Set<() => void>>();

  constructor() {
    Object.defineProperty(this, 'src', {
      configurable: true,
      get: () => this._src,
      set: (value: string) => {
        this._src = value;
        this.srcAssignments += 1;
      },
    });
    Object.defineProperty(this, 'volume', {
      configurable: true,
      get: () => this._volume,
      set: (value: number) => {
        this._volume = value;
        this.volumeHistory.push(value);
      },
    });
  }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  play(): Promise<void> {
    this.playCalls += 1;
    if (this.playError) return Promise.reject(this.playError);
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
    this.emit('pause');
  }
}

let fake: FakeMediaElement;
let engine: AudioEngine;

beforeEach(() => {
  fake = new FakeMediaElement();
  engine = new AudioEngine({
    createMediaElement: () => fake,
    fadeMs: 0,
    fadeStepMs: 0,
  });
});

describe('source assignment', () => {
  it('assigns the source URL to the media element', () => {
    const changed = engine.setSource('/audio/track-1.mp3');
    expect(changed).toBe(true);
    expect(fake.src).toBe('/audio/track-1.mp3');
    expect(engine.getState()).toEqual({
      status: 'loading',
      url: '/audio/track-1.mp3',
      error: null,
    });
  });

  it('does not reassign the source when the URL is unchanged', () => {
    engine.setSource('/audio/track-1.mp3');
    const assignmentsAfterFirst = fake.srcAssignments;
    const changed = engine.setSource('/audio/track-1.mp3');
    expect(changed).toBe(false);
    expect(fake.srcAssignments).toBe(assignmentsAfterFirst);
  });

  it('can force a reload after an error (recoverable state)', async () => {
    engine.setSource('/audio/track-404.mp3');
    fake.error = { code: 2, message: '' };
    fake.emit('error');
    expect(engine.getState().status).toBe('error');

    engine.setSource('/audio/track-404.mp3', true);
    expect(engine.getState().status).toBe('loading');
    expect(engine.getState().error).toBeNull();

    await engine.play();
    expect(engine.getState().status).toBe('playing');
  });
});

describe('play and pause', () => {
  it('plays and pauses the single element', async () => {
    engine.setSource('/audio/track-1.mp3');
    await engine.play();
    expect(engine.getState().status).toBe('playing');
    expect(fake.playCalls).toBe(1);

    engine.pause();
    expect(engine.getState().status).toBe('paused');
    expect(fake.pauseCalls).toBe(1);
    expect(fake.paused).toBe(true);
  });

  it('maps autoplay rejection to a blocked state with a user-facing message', async () => {
    const notAllowed = new Error('permission denied');
    notAllowed.name = 'NotAllowedError';
    fake.playError = notAllowed;

    engine.setSource('/audio/track-1.mp3');
    await engine.play(); // must not throw or leave an unhandled rejection

    expect(engine.getState().status).toBe('blocked');
    expect(engine.getState().error).toMatch(/autoplay/i);
  });

  it('maps unexpected play failures to an error state', async () => {
    fake.playError = new Error('decode failed');
    engine.setSource('/audio/track-1.mp3');
    await engine.play();
    expect(engine.getState().status).toBe('error');
    expect(engine.getState().error).toContain('decode failed');
  });
});

describe('volume', () => {
  it('sets and clamps volume', () => {
    engine.setVolume(0.4);
    expect(engine.getVolume()).toBe(0.4);
    expect(fake.volume).toBe(0.4);

    engine.setVolume(5);
    expect(engine.getVolume()).toBe(1);
    engine.setVolume(-2);
    expect(engine.getVolume()).toBe(0);
  });
});

describe('transitions', () => {
  it('transitions to a different track and restores the user volume', async () => {
    engine.setVolume(0.6);
    engine.setSource('/audio/track-1.mp3');
    await engine.play();

    const changed = await engine.transitionTo('/audio/track-4.mp3', {
      fadeMs: 0,
      autoplay: true,
    });
    expect(changed).toBe(true);
    expect(fake.src).toBe('/audio/track-4.mp3');
    expect(fake.playCalls).toBe(2);
    expect(fake.volume).toBe(0.6);
    expect(engine.getState().status).toBe('playing');
  });

  it('does not restart when the target track is already loaded', async () => {
    engine.setSource('/audio/track-1.mp3');
    await engine.play();
    const assignments = fake.srcAssignments;
    const playCalls = fake.playCalls;

    const changed = await engine.transitionTo('/audio/track-1.mp3');
    expect(changed).toBe(false);
    expect(fake.srcAssignments).toBe(assignments);
    expect(fake.playCalls).toBe(playCalls);
    expect(engine.getState().status).toBe('playing');
  });

  it('swaps the source without autoplaying when playback was stopped', async () => {
    engine.setSource('/audio/track-1.mp3');
    const changed = await engine.transitionTo('/audio/track-2.mp3', { autoplay: false });
    expect(changed).toBe(true);
    expect(fake.src).toBe('/audio/track-2.mp3');
    expect(fake.playCalls).toBe(0);
    expect(engine.getState().status).toBe('paused');
  });

  it('fades out and back in when a fade duration is configured', async () => {
    const fadeEngine = new AudioEngine({
      createMediaElement: () => fake,
      fadeMs: 60,
      fadeStepMs: 10,
    });
    fadeEngine.setVolume(0.8);
    fadeEngine.setSource('/audio/track-1.mp3');
    await fadeEngine.play();
    fake.volumeHistory.length = 0;

    await fadeEngine.transitionTo('/audio/track-2.mp3', { autoplay: true });

    expect(fake.src).toBe('/audio/track-2.mp3');
    expect(fake.volume).toBeCloseTo(0.8, 5);
    expect(fake.volumeHistory.length).toBeGreaterThan(1);
    expect(Math.min(...fake.volumeHistory)).toBeLessThan(0.8); // it dipped
    fadeEngine.dispose();
  });
});

describe('error handling', () => {
  it('surfaces media errors with a readable message', () => {
    engine.setSource('/audio/track-9.mp3');
    fake.error = { code: 4, message: '' };
    fake.emit('error');
    const state = engine.getState();
    expect(state.status).toBe('error');
    expect(state.error).toMatch(/not supported/i);
  });

  it('reports decode failures distinctly', () => {
    engine.setSource('/audio/track-1.mp3');
    fake.error = { code: 3, message: '' };
    fake.emit('error');
    expect(engine.getState().error).toMatch(/decoded|MP3/i);
  });

  it('recovers from an error via a forced source reload and replay', async () => {
    engine.setSource('/audio/track-1.mp3');
    fake.error = { code: 2, message: '' };
    fake.emit('error');
    expect(engine.getState().status).toBe('error');

    engine.setSource('/audio/track-1.mp3', true);
    await engine.play();
    expect(engine.getState().status).toBe('playing');
    expect(engine.getState().error).toBeNull();
  });
});

describe('singleton and cleanup', () => {
  it('returns the same engine instance every time', () => {
    resetAudioEngineForTests();
    const first = getAudioEngine();
    const second = getAudioEngine();
    expect(second).toBe(first);
    resetAudioEngineForTests();
  });

  it('removes listeners and stops playback on dispose', async () => {
    engine.setSource('/audio/track-1.mp3');
    await engine.play();
    engine.dispose();

    expect(fake.pauseCalls).toBeGreaterThanOrEqual(1);
    fake.emit('playing'); // listeners must already be detached
    expect(engine.getState().status).toBe('playing'); // unchanged after dispose

    // Operations after dispose are no-ops.
    const changed = engine.setSource('/audio/track-2.mp3');
    expect(changed).toBe(false);
    await engine.play();
    expect(fake.playCalls).toBe(1);
  });

  it('ignores transitions after dispose', async () => {
    engine.setSource('/audio/track-1.mp3');
    await engine.play();
    engine.dispose();
    const changed = await engine.transitionTo('/audio/track-2.mp3');
    expect(changed).toBe(false);
    expect(fake.src).toBe('/audio/track-1.mp3');
  });
});
