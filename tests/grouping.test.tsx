/**
 * Grouping-browse tests — the music brief's central behaviour.
 *
 * While the viewer browses by a Category, Place or Location grouping, every
 * Experience inside that grouping shares ONE music decision, and the music
 * only changes when the grouping itself changes:
 *
 *  - opening a different Experience inside the grouping never restarts the
 *    track and never re-decides (the grouping key is the decision key)
 *  - switching to a different grouping starts a new decision
 *  - clearing the grouping resumes per-Experience behaviour
 *
 * The decision is deterministic: a grouping is represented by its FIRST
 * Experience in catalogue order, so the same grouping always starts the same
 * track (Kuala Lumpur's first Experience is a shopping Experience, so its
 * category pool supplies "Velvet Skyline"/glassnik-006; Lisbon's single
 * Experience is a market, so the markets pool supplies glassnik-003).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MusicProvider, useMusic } from '../src/player/MusicProvider';
import { AudioEngine, type MediaElementLike } from '../src/player/audioEngine';
import type { GroupingFilter } from '../src/types';

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
      <span data-testid="label">{music.context?.label ?? 'none'}</span>
      <span data-testid="reason">{music.recommendation?.reason ?? 'none'}</span>
      <span data-testid="members">{music.groupingItems.length}</span>
      <button
        data-testid="set-group-kl"
        type="button"
        onClick={() =>
          music.setGroupingFilter(
            { type: 'location', value: 'Kuala Lumpur' } satisfies GroupingFilter,
          )
        }
      >
        grouping: Kuala Lumpur
      </button>
      <button
        data-testid="set-group-shopping"
        type="button"
        onClick={() =>
          music.setGroupingFilter(
            { type: 'category', value: 'shopping' } satisfies GroupingFilter,
          )
        }
      >
        grouping: shopping
      </button>
      <button
        data-testid="set-group-street-market"
        type="button"
        onClick={() =>
          music.setGroupingFilter(
            { type: 'place_type', value: 'street_market' } satisfies GroupingFilter,
          )
        }
      >
        grouping: street market
      </button>
      <button
        data-testid="set-group-lisbon"
        type="button"
        onClick={() =>
          music.setGroupingFilter(
            { type: 'location', value: 'Lisbon' } satisfies GroupingFilter,
          )
        }
      >
        grouping: Lisbon
      </button>
      <button data-testid="clear-grouping" type="button" onClick={() => music.setGroupingFilter(null)}>
        no grouping
      </button>
      <button
        data-testid="tokyo"
        type="button"
        onClick={() => music.selectExperience('exp-tokyo-shopping')}
      >
        tokyo
      </button>
      <button
        data-testid="lisbon"
        type="button"
        onClick={() => music.selectExperience('exp-lisbon-market')}
      >
        lisbon
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

describe('browsing by Category, Place or Location', () => {
  it('gives one experience its own decision when no grouping is active', async () => {
    renderProbe();

    // Default state: the selected experience speaks for itself.
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));
    expect(text('ctx')).toBe('kuala-lumpur-shopping-continuous');
    expect(text('members')).toBe('0');
  });

  it('makes the grouping the decision key and lists its members', async () => {
    renderProbe();
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));

    await click('set-group-kl');

    // The Kuala Lumpur grouping's first experience (a shopping experience)
    // speaks for the whole location, so the deciding pool is unchanged.
    await waitFor(() => expect(text('ctx')).toBe('browse:location:kuala_lumpur'));
    expect(text('track')).toBe('glassnik-006');
    expect(text('reason')).toBe('category_match');
    expect(text('members')).toBe('5');
    expect(text('label')).toContain('Kuala Lumpur');
  });

  it('keeps the same track when a different experience inside the grouping is opened', async () => {
    renderProbe();
    await waitFor(() => expect(text('track')).toBe('glassnik-006'));

    const assignmentsBefore = fake.srcAssignments;
    const playCallsBefore = fake.playCalls;

    await click('set-group-kl');
    await waitFor(() => expect(text('ctx')).toBe('browse:location:kuala_lumpur'));

    // Open Tokyo — outside the KL grouping while it is active the selection
    // still cannot move the music: the grouping owns the decision.
    await click('tokyo');
    await waitFor(() => expect(text('ctx')).toBe('browse:location:kuala_lumpur'));
    expect(text('track')).toBe('glassnik-006');
    expect(fake.srcAssignments).toBe(assignmentsBefore);
    expect(fake.playCalls).toBe(playCallsBefore);
  });

  it('changes the track when the grouping switches (category -> location)', async () => {
    renderProbe();
    await click('set-group-kl');
    await waitFor(() => expect(text('ctx')).toBe('browse:location:kuala_lumpur'));
    expect(text('track')).toBe('glassnik-006');

    // Switching grouping = a new music decision. Lisbon's grouping decides
    // from its market experience, so the markets pool supplies the track.
    await click('set-group-lisbon');
    await waitFor(() => expect(text('ctx')).toBe('browse:location:lisbon'));
    expect(text('track')).toBe('glassnik-003');
    expect(text('members')).toBe('1');
  });

  it('gives the category grouping and place-type grouping their own keys', async () => {
    renderProbe();
    await click('set-group-shopping');
    await waitFor(() => expect(text('ctx')).toBe('browse:category:shopping'));
    expect(text('members')).toBe('6');

    await click('set-group-street-market');
    await waitFor(() => expect(text('ctx')).toBe('browse:place_type:street_market'));
    expect(text('members')).toBe('2');
  });

  it('resumes per-experience decisions when the grouping is cleared', async () => {
    renderProbe();
    await click('set-group-kl');
    await waitFor(() => expect(text('ctx')).toBe('browse:location:kuala_lumpur'));

    await click('clear-grouping');
    await waitFor(() => expect(text('ctx')).not.toContain('browse:'));
    expect(text('members')).toBe('0');
  });
});
