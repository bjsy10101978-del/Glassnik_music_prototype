# Platform compatibility — what is tested, and what the apps need

The music brief requires one music system that works on the Glassnik
website, the Android app and the iPhone app, with continuous playback
inside a Category / Place / Location grouping and automatic changes on
switching. This document records exactly what has been verified, what has
not, and what the app teams must add — so the platform claim stays honest.

## The shared system (one music engine, platform-specific playback only)

The selection logic is pure, dependency-free TypeScript
(`src/engine/recommender.ts`): it maps a context (category, place type,
destination, moods, energy) onto a deterministic track decision with the
pool tier order, history window and grouping rules. It contains no DOM and
no playback code. `src/player/MusicProvider.tsx` + `src/player/audioEngine.ts`
own context state and the media element for the web build only.

That means website and Android/iPhone apps can share:

- the same decision engine (run as-is inside a WebView, or port the pure
  functions to Kotlin/Swift — they use no JavaScript APIs),
- the same catalogue data (`data/catalogue.json`, taxonomy, experiences),
- the same grouping rules for Category / Place / Location browsing.

Only the playback shell is platform-specific.

## Automated verification (this repository)

One battery, `npm run check:browser`, runs 56 checks against the local dev
site: gesture-gated start, continuity across sequences and across grouping
browsing, one-assignment context switches, the music menu (Glassnik / No
Music, Spotify slot), volume persistence, uploads, track-end auto-advance,
credits and diagnostics.

- **Chromium engine: 56/56 passed.**
- **Safari engine (WebKit 27.2, Playwright `BROWSER=webkit`): 56/56 passed.**
  This is the engine Safari is built on, so the two iOS/macOS-sensitive
  behaviours that matter — playback only after a user gesture, and no
  restarts on context changes — now have Safari-engine evidence.

Re-run at any time: `npm run check:browser` and `BROWSER=webkit npm run
check:browser`.

## What is still NOT verified

- **Real Safari.app manual checks — COMPLETE (28 October).** All three
  confirmed by eye in the real Safari browser: no sound before pressing
  Play ✅, the next song starting automatically when one finishes ✅,
  and the Kuala Lumpur 7-song rotation ✅ (song names were read on the
  Music credits page, since the viewer itself shows none).
- **Android and iPhone devices and app WebViews.** Nothing mobile has run in
  a real app container yet.
- **Backgrounded playback / lock screen.** Not applicable on desktop web;
  on mobile it needs the native configurations below.
- **Android/IOS-specific audio interruptions** (calls, other apps claiming
  audio) — untested until there is an app container.

## What the Android and iPhone apps need (integration items)

Because the engine is UI-free, the app work is playback configuration only:

1. **iOS**: background audio capability (`UIBackgroundModes: audio`),
   `AVAudioSession` category `.playback` (so the silent switch does not mute
   Glassnik Music and interruptions can be handled), lock-screen metadata +
   transport controls via `MPNowPlayingInfoCenter`/`MPRemoteCommandCenter`.
   Track/artist strings for lock-screen metadata come from the credits
   register, not the viewer (the viewer shows no names — a deliberate
   product rule, unchanged on mobile).
2. **Android**: WebView autoplay policies (gesture-gated start already
   written for this), a foreground service with a `MediaSession` for
   playback while the app is backgrounded, and notification transport
   controls. Volume/on-off map to the same music menu.
3. **Both**: platform audio focus/interruption handling (a phone call must
   pause the music and recovery on return), and headphones disconnect.

Until an app container exists, none of these can be signed off — the
honest state is "engine shared and verified on the web; playback shells
pending".

## App-store timing (as requested in the brief)

If app-store publication happens before the above verification is done, the
music feature can ship with **Glassnik Music + No Music** only, with the
same interface (the menu already reserves the Spotify slot), or be held for
a subsequent update — the brief allows either. Nothing here blocks the
publisher's timeline, and nothing ships with unverified licences.
