/**
 * Continuity tests — MusicProvider + AudioEngine with a MOCKED media element.
 *
 * These prove the state-machine behaviour:
 *  - consecutive videos inside one sequence context never touch the audio
 *    element (no source re-assignment, no extra play() call) while playing
 *  - switching to a genuinely different context recomputes the decision and,
 *    when the track differs, transitions the engine to the new source
 *  - a context change that resolves to the SAME track does not restart it
 *  - mode switches only touch the engine when the selected track changes
 *
 * They are mocked tests: the media element is fake, so they do not prove
 * audible playback. Real-browser verification is listed in the README.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MusicProvider, useMusic } from '../src/player/MusicProvider';
import { AudioEngine, type MediaElementLike } from '../src/player/audioEngine';

class FakeMediaElement implements MediaElementLike {
  declare src: string;
  declare volume: number;
  srcAssignments = 0;
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

function Probe() {
  const music = useMusic();
  return (
    <div>
      <span data-testid="track">{music.recommendation?.track?.track_id ?? 'none'}</span>
      <span data-testid="ctx">{music.context?.key ?? 'none'}</span>
      <span data-testid="status">{music.engineState.status}</span>
      <span data-testid="reason">{music.recommendation?.reason ?? 'none'}</span>
      <span data-testid="video-index">{music.sequence.currentIndex}</span>
      <span data-testid="mode">{music.mode}</span>
      <button data-testid="playpause" type="button" onClick={music.togglePlayPause}>
        play/pause
      </button>
      <button
        data-testid="nextvideo"
        type="button"
        onClick={() => music.goToVideo(music.sequence.currentIndex + 1)}
      >
        next video
      </button>
      <button
        data-testid="tokyo"
        type="button"
        onClick={() => music.selectExperience('exp-tokyo-shopping')}
      >
        tokyo
      </button>
      <button
        data-testid="phuquoc"
        type="button"
        onClick={() => music.selectExperience('exp-phu-quoc-beach')}
      >
        phu quoc
      </button>
      <button
        data-testid="production"
        type="button"
        onClick={() => music.setMode('production')}
      >
        production
      </button>
      <button
        data-testid="musictoggle"
        type="button"
        onClick={() => music.toggleMusic(!music.musicEnabled)}
      >
        music {music.musicEnabled ? 'on' : 'off'}
      </button>
    </div>
  );
}

let fake: FakeMediaElement;
let engine: AudioEngine;

function renderProbe(): void {
  render(
    <MusicProvider engine={engine}>
      <Probe />
    </MusicProvider>,
  );
}

function text(testId: string): string {
  return screen.getByTestId(testId).textContent ?? '';
}

async function click(testId: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
}

beforeEach(() => {
  fake = new FakeMediaElement();
  engine = new AudioEngine({ createMediaElement: () => fake, fadeMs: 0, fadeStepMs: 0 });
});

describe('continuous playback across consecutive videos', () => {
  it('keeps music playing untouched while stepping through sequence videos', async () => {
    renderProbe();

    // Initial context resolves to the KL shopping sequence and applies once.
    // The trip is a shopping trip, so its category pool supplies the track.
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));
    expect(text('ctx')).toBe('kuala-lumpur-shopping-continuous');
    expect(text('reason')).toBe('category_match');
    expect(fake.src).toBe('/audio/track-6.mp3');
    expect(fake.srcAssignments).toBe(1);
    expect(text('status')).toBe('paused');

    // User gesture starts playback (autoplay policy respected: nothing played before).
    expect(fake.playCalls).toBe(0);
    await click('playpause');
    await waitFor(() => expect(text('status')).toBe('playing'));
    expect(fake.playCalls).toBe(1);

    const assignmentsBefore = fake.srcAssignments;
    const playCallsBefore = fake.playCalls;

    // Move to video 2 of the same sequence.
    await click('nextvideo');
    await waitFor(() => expect(text('video-index')).toBe('1'));

    expect(text('track')).toBe('glassnik-006');
    expect(text('ctx')).toBe('kuala-lumpur-shopping-continuous');
    expect(text('status')).toBe('playing');
    // The engine was not touched: no restart, no new source assignment.
    expect(fake.srcAssignments).toBe(assignmentsBefore);
    expect(fake.playCalls).toBe(playCallsBefore);

    // And again to video 3.
    await click('nextvideo');
    await waitFor(() => expect(text('video-index')).toBe('2'));
    expect(fake.srcAssignments).toBe(assignmentsBefore);
    expect(fake.playCalls).toBe(playCallsBefore);
    expect(text('status')).toBe('playing');
    expect(text('track')).toBe('glassnik-006');
  });

  it('recomputes the decision and transitions when the context genuinely changes', async () => {
    renderProbe();
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));
    await click('playpause');
    await waitFor(() => expect(text('status')).toBe('playing'));

    const playCallsBefore = fake.playCalls;

    await click('phuquoc');
    await waitFor(() => expect(text('ctx')).toBe('exp-phu-quoc-beach'));

    expect(text('reason')).toBe('category_match');
    expect(text('track')).toBe('glassnik-002');
    // Different track => the engine transitioned to the new source.
    await waitFor(() => expect(fake.src).toBe('/audio/track-2.mp3'));
    await waitFor(() => expect(text('status')).toBe('playing'));
    expect(fake.playCalls).toBe(playCallsBefore + 1);
  });

  it('does not restart audio when a context change resolves to the same track', async () => {
    renderProbe();
    // Research and production mode resolve the Kuala Lumpur shopping trip to
    // the same approved track, so switching modes must not restart the audio.
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));
    await click('playpause');
    await waitFor(() => expect(text('status')).toBe('playing'));

    const assignmentsBefore = fake.srcAssignments;
    const playCallsBefore = fake.playCalls;

    await click('production');
    await waitFor(() => expect(text('mode')).toBe('production'));

    expect(text('track')).toBe('glassnik-006');
    expect(text('reason')).toBe('category_match');
    expect(fake.srcAssignments).toBe(assignmentsBefore);
    expect(fake.playCalls).toBe(playCallsBefore);
    expect(text('status')).toBe('playing');
  });

  it('switching to production mode keeps the approved music playing', async () => {
    renderProbe();
    await click('phuquoc');
    await waitFor(() => expect(text('track')).toBe('glassnik-002'));
    await click('playpause');
    await waitFor(() => expect(text('status')).toBe('playing'));

    const assignmentsBefore = fake.srcAssignments;
    const playCallsBefore = fake.playCalls;

    await click('production');
    await waitFor(() => expect(text('mode')).toBe('production'));

    // Every library recording is a production-eligible pool-backed track,
    // so the same approved track keeps playing: no restart, no new source.
    expect(text('track')).toBe('glassnik-002');
    expect(text('reason')).toBe('category_match');
    expect(fake.srcAssignments).toBe(assignmentsBefore);
    expect(fake.src).toBe('/audio/track-2.mp3');
    expect(fake.playCalls).toBe(playCallsBefore);
    await waitFor(() => expect(text('status')).toBe('playing'));
  });

  it('stops playback when music is switched off and resumes on switch on', async () => {
    renderProbe();
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));
    await click('playpause');
    await waitFor(() => expect(text('status')).toBe('playing'));
    expect(fake.playCalls).toBe(1);

    await click('musictoggle');
    await waitFor(() => expect(text('status')).toBe('paused'));
    expect(fake.pauseCalls).toBeGreaterThanOrEqual(1);
    expect(fake.playCalls).toBe(1); // switching off never plays

    await click('musictoggle');
    await waitFor(() => expect(text('status')).toBe('playing'));
    expect(fake.playCalls).toBe(2);
    // Same source: switching music back on does not reassign src.
    expect(fake.srcAssignments).toBe(1);
  });
});
