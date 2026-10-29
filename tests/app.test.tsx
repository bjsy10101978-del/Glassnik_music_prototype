/**
 * Application smoke test (mocked media element via jsdom).
 *
 * Renders the real <App /> and checks the required UI regions are present and
 * interactive at a basic level. This does not verify audible playback.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { resetAudioEngineForTests, setAudioEngineForTests } from '../src/player/audioEngine';
import type { AudioEngineLike, AudioEngineState } from '../src/player/audioEngine';

function makeStubEngine(): AudioEngineLike {
  const state: AudioEngineState = { status: 'paused', url: null, error: null };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listener(state);
      return () => undefined;
    },
    subscribeEvents: () => () => undefined,
    setSource: (url) => {
      state.url = url;
      state.status = 'loading';
      return true;
    },
    play: async () => {
      state.status = 'playing';
    },
    pause: () => {
      state.status = 'paused';
    },
    setVolume: () => undefined,
    getVolume: () => 1,
    transitionTo: async (url) => {
      state.url = url;
      state.status = 'paused';
      return true;
    },
    dispose: () => undefined,
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  setAudioEngineForTests(makeStubEngine());
});

afterEach(() => {
  cleanup();
  resetAudioEngineForTests();
  const calls = consoleErrorSpy.mock.calls;
  consoleErrorSpy.mockRestore();
  expect(calls).toEqual([]);
});

describe('App smoke test', () => {
  it('renders all required interface regions', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Glassnik' })).toBeTruthy();
    expect(screen.getByText(/Research prototype · music rights unverified/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Recommendation' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Music player' })).toBeTruthy();

    // Video experiences tab is the default landing tab. (Glassnik videos are
    // Eye-POV Experiences, not trips, so the wording avoids "trip".)
    expect(screen.getByRole('tab', { name: 'Video & experiences' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Video & experiences/ })).toBeTruthy();
    expect(screen.getByLabelText('Choose video files to upload')).toBeTruthy();

    // Product rule: the viewer bar shows no track names. The research
    // inspector (Recommendation side panel) still names the track so the
    // decision can be reviewed, and the full credits live on their own tab.
    const player = screen.getByRole('region', { name: 'Music player' });
    expect(within(player).queryByText('Velvet Skyline')).toBeNull();
    // The Kuala Lumpur sequence is a shopping Experience, so its category
    // pool supplies the track "Velvet Skyline" (shown in the inspector).
    expect(screen.getAllByText('Velvet Skyline').length).toBeGreaterThan(0);
    expect(screen.getByText('Category match')).toBeTruthy();
  });

  it('exposes working player controls', () => {
    render(<App />);
    const player = screen.getByRole('region', { name: 'Music player' });

    const play = within(player).getByRole('button', { name: /Play music/i });
    expect((play as HTMLButtonElement).disabled).toBe(false);
    const next = within(player).getByRole('button', { name: /next recommended track/i });
    expect((next as HTMLButtonElement).disabled).toBe(false);

    const volume = within(player).getByRole('slider');
    expect(volume.getAttribute('min')).toBe('0');
    expect(volume.getAttribute('max')).toBe('100');

    // The music source menu mirrors the planned integration menu:
    // Glassnik Music / Spotify (future, disabled) / No Music.
    const source = within(player).getByRole('combobox', {
      name: 'Music source',
    }) as HTMLSelectElement;
    expect(source.value).toBe('glassnik');
    const spotify = source.querySelector('option[value="spotify"]') as HTMLOptionElement | null;
    expect(spotify).toBeTruthy();
    expect(spotify!.disabled).toBe(true);
    const none = source.querySelector('option[value="none"]') as HTMLOptionElement | null;
    expect(none?.disabled).toBe(false);
  });

  it('keeps no track names in the viewer bar when music is switched off', () => {
    render(<App />);
    const player = screen.getByRole('region', { name: 'Music player' });
    const source = within(player).getByRole('combobox', {
      name: 'Music source',
    }) as HTMLSelectElement;
    fireEvent.change(source, { target: { value: 'none' } });

    // "No Music" and "Glassnik Music" are the only live options and the bar
    // still shows no track or artist names in either state.
    expect(source.value).toBe('none');
    expect(within(player).queryByText(/Amber|Velvet/)).toBeNull();
  });

  it('lists the library on the Music credits tab, not in the viewer', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Music credits' }));

    expect(screen.getByRole('heading', { name: 'Music credits' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Now playing' })).toBeTruthy();
    // Honest licence status, not an invented clearance.
    expect(screen.getByText(/No usage rights have been verified by a person yet/)).toBeTruthy();

    const rows = document.querySelectorAll('table.credits-table tbody tr');
    expect(rows.length).toBe(59);
    expect(document.body.textContent).toContain('Velvet Skyline');
    // The bar itself still shows no track names.
    const player = screen.getByRole('region', { name: 'Music player' });
    expect(within(player).queryByText('Velvet Skyline')).toBeNull();
  });

  it('navigates to the sample experiences tab and lists 15 experiences', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sample experiences' }));

    const items = document.querySelectorAll('button.experience-item');
    expect(items.length).toBe(15);
    for (const item of items) {
      expect(item.getAttribute('type')).toBe('button');
    }
    const tokyo = [...items].find((b) => b.textContent?.includes('Tokyo shopping district'));
    expect(tokyo).toBeTruthy();

    // Grouping browse (brief behaviour): the tab exposes the Category / Place
    // / Location selector; per Experience is the default.
    const grouping = screen.getByRole('combobox', { name: 'Explore grouping' });
    expect(grouping.textContent).toContain('Every Experience separately');
    expect(grouping.textContent).toContain('All Experiences in Kuala Lumpur');
    expect(grouping.textContent).toContain('All Shopping Experiences');
  });

  it('shows diagnostics in its own tab', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Diagnostics' }));
    const diagnostics = document.querySelector('details.diagnostics');
    expect(diagnostics).toBeTruthy();
    // Every referenced audio file now exists and is listed as playable.
    expect(diagnostics?.textContent).toMatch(/audio\/track-9\.mp3.*available for playback/);
    expect(diagnostics?.textContent).toMatch(/audio\/track-10\.mp3.*available for playback/);
    expect(diagnostics?.textContent).toMatch(/every referenced audio file exists/i);
  });
});
