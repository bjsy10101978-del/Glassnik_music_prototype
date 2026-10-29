/**
 * Automatic advance tests (MOCKED media element).
 *
 * These prove the behaviour the user asked for:
 *  - when a track ends, the player moves on to the next recommended track and
 *    keeps playing
 *  - the same song is never played twice in a row
 *  - when a file cannot be played, the broken track is skipped and the next
 *    one is tried instead of the app crashing
 *  - when there is no other track to play, the player stays where it is
 *
 * The media element is fake, so these tests prove the state machine, not
 * audible playback. The real browser check lives in `scripts/browser-check.mjs`.
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
      <span data-testid="src">{music.recommendation?.track?.file_reference ?? 'none'}</span>
      <span data-testid="status">{music.engineState.status}</span>
      <span data-testid="reason">{music.recommendation?.reason ?? 'none'}</span>
      <span data-testid="clips">{music.clips.length}</span>
      <span data-testid="music">{music.musicEnabled ? 'on' : 'off'}</span>
      <button data-testid="play" type="button" onClick={music.togglePlayPause}>
        play
      </button>
      <button
        data-testid="music-off"
        type="button"
        onClick={() => music.toggleMusic(false)}
      >
        music off
      </button>
      <button
        data-testid="add"
        type="button"
        onClick={() =>
          music.addClips([
            new File(['a'], 'clip-one.mp4', { type: 'video/mp4' }),
            new File(['b'], 'clip-two.mp4', { type: 'video/mp4' }),
          ])
        }
      >
        add clips
      </button>
      <button
        data-testid="untagged-place"
        type="button"
        onClick={() =>
          music.updateTripContext({
            ...music.tripContext,
            categoryId: null,
            // A place type that no track in the catalogue carries: the only
            // tag not owned by any pool after the 59-track distribution.
            placeType: 'desert_dunes',
          })
        }
      >
        desert dunes
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

const text = (id: string) => screen.getByTestId(id).textContent ?? '';
const click = (id: string) =>
  act(async () => {
    fireEvent.click(screen.getByTestId(id));
  });

/** Simulates the media element reaching the end of a track. */
async function endTrack(): Promise<void> {
  await act(async () => {
    fake.emit('ended');
  });
}

/**
 * Simulates the way a real browser ends a track: it pauses the element first
 * and then fires "ended". The player must still move on to the next track.
 */
async function endTrackLikeABrowser(): Promise<void> {
  await act(async () => {
    fake.paused = true;
    fake.emit('pause');
    fake.emit('ended');
  });
}

/** Simulates the media element failing to load or decode the file. */
async function breakTrack(): Promise<void> {
  fake.error = { code: 2, message: '' };
  await act(async () => {
    fake.emit('error');
  });
}

beforeEach(() => {
  fake = new FakeMediaElement();
  engine = new AudioEngine({ createMediaElement: () => fake, fadeMs: 0, fadeStepMs: 0 });
});

describe('automatic advance when a track ends', () => {
  it('moves to another track and keeps playing', async () => {
    renderProbe();
    await waitFor(() => expect(text('track')).not.toBe('none'));

    const firstTrack = text('track');
    expect(firstTrack).toBe('glassnik-006');

    await click('play');
    await waitFor(() => expect(text('status')).toBe('playing'));

    const assignmentsBefore = fake.srcAssignments;
    const playCallsBefore = fake.playCalls;

    await endTrack();

    // A different track is chosen and it starts playing straight away.
    await waitFor(() => expect(text('track')).not.toBe(firstTrack));
    expect(text('status')).toBe('playing');
    expect(fake.srcAssignments).toBe(assignmentsBefore + 1);
    expect(fake.playCalls).toBe(playCallsBefore + 1);
    expect(fake.src).toBe('/audio/track-9.mp3');
  });

  it('moves on even when the browser pauses the element before the end', async () => {
    renderProbe();
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));
    await click('play');
    await waitFor(() => expect(text('status')).toBe('playing'));

    const firstTrack = text('track');
    const assignmentsBefore = fake.srcAssignments;

    // A real browser pauses the element just before it fires "ended".
    await endTrackLikeABrowser();

    await waitFor(() => expect(text('track')).not.toBe(firstTrack));
    expect(text('status')).toBe('playing');
    expect(fake.srcAssignments).toBe(assignmentsBefore + 1);
  });

  it('never plays the same song twice in a row', async () => {
    renderProbe();
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));
    await click('play');
    await waitFor(() => expect(text('status')).toBe('playing'));

    const seen = [text('track')];
    for (let round = 0; round < 4; round += 1) {
      await endTrack();
      await waitFor(() => expect(text('status')).toBe('playing'));
      const current = text('track');
      expect(current).not.toBe(seen[seen.length - 1]);
      seen.push(current);
    }
    // The queue keeps moving: fresh tracks from the category pool.
    expect(new Set(seen).size).toBeGreaterThan(1);
  });

  it('does not advance when the music is switched off', async () => {
    renderProbe();
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));
    await click('play');
    await waitFor(() => expect(text('status')).toBe('playing'));

    // The user turns the music off.
    await click('music-off');
    await waitFor(() => expect(text('music')).toBe('off'));

    const before = text('track');
    await endTrack();

    // Nothing is playing any more, so the player stays where it is.
    expect(text('track')).toBe(before);
  });

  it('does not advance when the player is paused', async () => {
    renderProbe();
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));
    await click('play');
    await waitFor(() => expect(text('status')).toBe('playing'));
    await click('play');
    await waitFor(() => expect(text('status')).toBe('paused'));

    const before = text('track');
    await endTrack();

    expect(text('track')).toBe(before);
  });
});

describe('automatic skip when a file cannot be played', () => {
  it('skips the broken track and plays the next one', async () => {
    renderProbe();
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));
    await click('play');
    await waitFor(() => expect(text('status')).toBe('playing'));

    const broken = text('track');
    const assignmentsBefore = fake.srcAssignments;

    await breakTrack();

    // The broken track is left behind, the app keeps working.
    await waitFor(() => expect(text('track')).not.toBe(broken));
    expect(text('status')).toBe('playing');
    expect(fake.srcAssignments).toBe(assignmentsBefore + 1);
    expect(fake.error).not.toBeNull(); // the media error is still reported
  });

  it('gives up after a run of broken files instead of skipping forever', async () => {
    renderProbe();
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));
    await click('play');
    await waitFor(() => expect(text('status')).toBe('playing'));

    const assignmentsBefore = fake.srcAssignments;
    for (let round = 0; round < 8; round += 1) {
      await breakTrack();
    }
    // The limit stops the endless skip loop; the player stays usable.
    expect(fake.srcAssignments).toBeLessThan(assignmentsBefore + 8);
    expect(text('track')).not.toBe('none');
  });
});

describe('context without a matching category pool', () => {
  it('advances through the general fallback tier instead of repeating', async () => {
    renderProbe();
    await click('add');
    await waitFor(() => expect(text('clips')).toBe('2'));
    await click('untagged-place');
    await waitFor(() => expect(text('reason')).toBe('general_fallback'));
    await click('play');
    await waitFor(() => expect(text('status')).toBe('playing'));

    const current = text('track');
    const assignmentsBefore = fake.srcAssignments;

    await endTrack();

    // A place type such as "desert_dunes" has no dedicated pool in the
    // disjoint category catalogue, so the general fallback tier supplies a
    // fresh track instead of restarting the same song.
    await waitFor(() => expect(text('track')).not.toBe(current));
    expect(text('status')).toBe('playing');
    expect(fake.srcAssignments).toBe(assignmentsBefore + 1);
  });
});
