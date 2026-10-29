import { useState, type JSX } from 'react';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { ExperienceSelector } from './components/ExperienceSelector';
import { Header } from './components/Header';
import { MusicCredits } from './components/MusicCredits';
import { PlayerBar } from './components/PlayerBar';
import { RecommendationPanel } from './components/RecommendationPanel';
import { VideoPanel } from './components/VideoPanel';
import { MusicProvider, useMusic } from './player/MusicProvider';

type Tab = 'video' | 'experiences' | 'credits' | 'diagnostics';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'video', label: 'Video & experiences' },
  { id: 'experiences', label: 'Sample experiences' },
  { id: 'credits', label: 'Music credits' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

function Onboarding(): JSX.Element | null {
  const { onboardingDismissed, dismissOnboarding } = useMusic();
  if (onboardingDismissed) return null;
  return (
    <div className="onboarding" role="note">
      <div>
        <strong>How to use this prototype</strong>
        <ol>
          <li>Press <strong>Play</strong> in the bar at the bottom (browsers block autoplay).</li>
          <li>
            Open <strong>Video &amp; experiences</strong>, add two or three clips from the same
            Experience, then use <strong>Next clip</strong> — the same track keeps playing.
          </li>
          <li>
            Change the Experience&apos;s category or place type to hear the recommendation switch.
          </li>
        </ol>
      </div>
      <button type="button" className="btn btn-small" onClick={dismissOnboarding}>
        Got it
      </button>
    </div>
  );
}

function Workspace(): JSX.Element {
  const [tab, setTab] = useState<Tab>('video');

  return (
    <div className="app">
      <Header />
      <Onboarding />

      <div className="tabs" role="tablist" aria-label="Sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`panel-${entry.id}`}
            className={`tab${tab === entry.id ? ' active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <main className="layout">
        <div
          className="layout-primary"
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          {tab === 'video' && <VideoPanel />}
          {tab === 'experiences' && <ExperienceSelector />}
          {tab === 'credits' && <MusicCredits />}
          {tab === 'diagnostics' && <DiagnosticsPanel />}
        </div>
        <aside className="layout-secondary">
          <RecommendationPanel />
        </aside>
      </main>

      <PlayerBar />
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <MusicProvider>
      <Workspace />
    </MusicProvider>
  );
}
