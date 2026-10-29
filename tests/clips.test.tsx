/**
 * Uploaded-clip tests (MOCKED media elements).
 *
 * Proves the trip model and continuity rules:
 *  - several uploaded clips form one trip with a single shared context
 *  - moving between clips does not touch the audio element (music continues)
 *  - changing the trip context (category/place type) recomputes the
 *    recommendation and, when the track differs, transitions the engine
 *  - clips are never treated as verified project research data
 *
 * These are mocked tests: the <audio> element is fake.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MusicProvider, useMusic } from '../src/player/MusicProvider';
import { AudioEngine, type MediaElementLike } from '../src/player/audioEngine';
import { buildClipExperiences, defaultTripContext, type Clip } from '../src/player/clips';

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

// jsdom does not implement object URLs.
beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:mock-url',
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: () => undefined,
    });
  }
});

function Probe() {
  const music = useMusic();
  return (
    <div>
      <span data-testid="ctx">{music.context?.key ?? 'none'}</span>
      <span data-testid="track">{music.recommendation?.track?.track_id ?? 'none'}</span>
      <span data-testid="reason">{music.recommendation?.reason ?? 'none'}</span>
      <span data-testid="status">{music.engineState.status}</span>
      <span data-testid="clips">{music.clips.length}</span>
      <span data-testid="active">
        {music.activeClip ? music.activeClip.name : 'none'}
      </span>
      <span data-testid="clip-context">
        {music.recommendation?.contextKey ?? 'none'}
      </span>
      <button
        data-testid="add"
        type="button"
        onClick={() =>
          music.addClips([
            new File(['a'], 'kl-mall-1.mp4', { type: 'video/mp4' }),
            new File(['b'], 'kl-mall-2.mp4', { type: 'video/mp4' }),
            new File(['c'], 'kl-mall-3.mp4', { type: 'video/mp4' }),
          ])
        }
      >
        add
      </button>
      <button
        data-testid="toggle-source"
        type="button"
        onClick={() =>
          music.setSourceMode(music.sourceMode === 'clips' ? 'soundtracks' : 'clips')
        }
      >
        soundtracks
      </button>
      <button data-testid="play" type="button" onClick={music.togglePlayPause}>
        play
      </button>
      <button
        data-testid="next-clip"
        type="button"
        onClick={() => music.goToClip(music.activeClipIndex + 1)}
      >
        next clip
      </button>
      <button
        data-testid="ctx-beaches"
        type="button"
        onClick={() => music.updateTripContext({ ...music.tripContext, categoryId: 'beaches' })}
      >
        beaches
      </button>
      <button
        data-testid="ctx-null"
        type="button"
        onClick={() =>
          music.updateTripContext({
            ...music.tripContext,
            categoryId: null,
            placeType: null,
            destination: null,
          })
        }
      >
        clear context
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

beforeEach(() => {
  fake = new FakeMediaElement();
  engine = new AudioEngine({ createMediaElement: () => fake, fadeMs: 0, fadeStepMs: 0 });
});

describe('clip model', () => {
  const clips = (): Clip[] => [
    { id: 'c1', name: 'a.mp4', file: new File(['a'], 'a.mp4', { type: 'video/mp4' }) },
    { id: 'c2', name: 'b.mp4', file: new File(['b'], 'b.mp4', { type: 'video/mp4' }) },
  ];

  it('gives every clip in a trip the same sequence group', () => {
    const built = buildClipExperiences(clips(), defaultTripContext());
    expect(built).toHaveLength(2);
    expect(new Set(built.map((e) => e.sequence_group)).size).toBe(1);
    expect(built.map((e) => e.sequence_index)).toEqual([1, 2]);
    expect(built.every((e) => e.metadata_status === 'local_upload_unverified')).toBe(true);
  });

  it('is never labelled as verified project research data', () => {
    const built = buildClipExperiences(clips(), defaultTripContext());
    for (const experience of built) {
      expect(experience.metadata_status).not.toBe('synthetic_test_record');
      expect(experience.notes).toMatch(/not part of the project research dataset/i);
    }
  });
});

describe('uploaded trip continuity', () => {
  it('keeps one context and one unchanged audio source across clips', async () => {
    renderProbe();
    await click('add');
    await waitFor(() => expect(text('clips')).toBe('3'));

    // One shared context covering all three clips.
    expect(text('ctx')).toBe('uploaded-trip');
    expect(text('track')).toBe('glassnik-006');
    expect(text('reason')).toBe('category_match');

    // The track is applied without autoplaying (no user gesture yet), and the
    // clip changes never add another source assignment.
    expect(fake.playCalls).toBe(0);
    const assignmentsPlaying = fake.srcAssignments;
    expect(assignmentsPlaying).toBeGreaterThanOrEqual(1);

    await click('play');
    await waitFor(() => expect(text('status')).toBe('playing'));
    const playCallsPlaying = fake.playCalls;
    expect(playCallsPlaying).toBe(1);

    await click('next-clip');
    await waitFor(() => expect(text('active')).toBe('kl-mall-2.mp4'));

    expect(text('ctx')).toBe('uploaded-trip');
    expect(text('track')).toBe('glassnik-006');
    expect(text('status')).toBe('playing');
    // Music continues: the element was neither re-pointed nor re-played.
    expect(fake.srcAssignments).toBe(assignmentsPlaying);
    expect(fake.playCalls).toBe(playCallsPlaying);

    await click('next-clip');
    await waitFor(() => expect(text('active')).toBe('kl-mall-3.mp4'));
    expect(fake.srcAssignments).toBe(assignmentsPlaying);
    expect(fake.playCalls).toBe(playCallsPlaying);
    expect(text('status')).toBe('playing');
  });

  it('recomputes and transitions when the trip context changes', async () => {
    renderProbe();
    await click('add');
    await waitFor(() => expect(text('clips')).toBe('3'));
    await click('play');
    await waitFor(() => expect(text('status')).toBe('playing'));
    expect(text('track')).toBe('glassnik-006');

    const assignmentsBefore = fake.srcAssignments;
    const playCallsBefore = fake.playCalls;

    await click('ctx-beaches');
    await waitFor(() => expect(text('reason')).toBe('category_match'));
    await waitFor(() => expect(text('track')).toBe('glassnik-002'));

    expect(fake.srcAssignments).toBe(assignmentsBefore + 1);
    expect(fake.playCalls).toBe(playCallsBefore + 1);
    expect(fake.src).toBe('/audio/track-2.mp3');
    await waitFor(() => expect(text('status')).toBe('playing'));
  });

  it('falls back to the general pool when the context has no metadata match', async () => {
    renderProbe();
    await click('add');
    await waitFor(() => expect(text('clips')).toBe('3'));

    await click('ctx-null');
    await waitFor(() => expect(text('reason')).toBe('general_fallback'));
    expect(text('track')).not.toBe('none');
  });

  it('uses the sample experiences again when switching the source back', async () => {
    renderProbe();
    await click('add');
    await waitFor(() => expect(text('ctx')).toBe('uploaded-trip'));

    await click('toggle-source');
    await waitFor(() => expect(text('ctx')).toBe('kuala-lumpur-shopping-continuous'));
    // The Kuala Lumpur sequence is a shopping trip, so it resolves through
    // the shopping category pool.
    expect(text('track')).toBe('glassnik-006');
    expect(text('reason')).toBe('category_match');
  });

  it('moves to the sample sequence track and keeps playing when the source switches back', async () => {
    renderProbe();
    await click('add');
    await waitFor(() => expect(text('clips')).toBe('3'));
    await click('ctx-beaches');
    await waitFor(() => expect(text('track')).toBe('glassnik-002'));
    await click('play');
    await waitFor(() => expect(text('status')).toBe('playing'));

    const assignments = fake.srcAssignments;
    const playCalls = fake.playCalls;

    // The uploaded trip and the sample sequence are different contexts, so the
    // player moves to the track of the new context - and keeps playing.
    await click('toggle-source');
    await waitFor(() => expect(text('ctx')).toBe('kuala-lumpur-shopping-continuous'));
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));

    expect(fake.srcAssignments).toBe(assignments + 1);
    expect(fake.src).toBe('/audio/track-6.mp3');
    expect(fake.playCalls).toBe(playCalls + 1);
    await waitFor(() => expect(text('status')).toBe('playing'));
  });

  it('resolves to the same trip track again when the source switches back', async () => {
    renderProbe();
    await click('add');
    await waitFor(() => expect(text('clips')).toBe('3'));
    await click('ctx-beaches');
    await waitFor(() => expect(text('track')).toBe('glassnik-002'));
    await click('play');
    await waitFor(() => expect(text('status')).toBe('playing'));

    // Leave the trip for the sample sequence and come back.
    await click('toggle-source');
    await waitFor(() => expect(text('ctx')).toBe('kuala-lumpur-shopping-continuous'));
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));

    const assignmentsAfterSwitch = fake.srcAssignments;
    const playCallsAfterSwitch = fake.playCalls;

    await click('toggle-source');
    await waitFor(() => expect(text('ctx')).toBe('uploaded-trip'));

    // The trip context is unchanged, so it resolves to the same track as
    // before: the player moves back to it and keeps playing.
    await waitFor(() => expect(text('track')).toBe('glassnik-002'));
    expect(fake.src).toBe('/audio/track-2.mp3');
    expect(fake.srcAssignments).toBe(assignmentsAfterSwitch + 1);
    expect(fake.playCalls).toBe(playCallsAfterSwitch + 1);
    await waitFor(() => expect(text('status')).toBe('playing'));
  });
});
