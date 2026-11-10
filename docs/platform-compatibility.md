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

One battery, `npm run check:browser`, runs 67 checks against the local dev
site: gesture-gated start, continuity across sequences and across grouping
browsing, one-assignment context switches, the music menu (Glassnik / No
Music, Spotify slot), volume persistence, pause/resume, reload behaviour
(nothing autoplays; saved volume and music choice restored), uploads,
track-end auto-advance, failed audio loads (clear error state, no crash,
recovery when the network returns), credits and diagnostics.

- **Chromium engine: 67/67 passed (9 November 2026).**
- **Safari engine (WebKit 27.2, Playwright `BROWSER=webkit`): 67/67 passed
  (9 November 2026).**
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
- **Production native app builds (Android/iPhone).** Kazi has run the app in
  **Expo Go** on both phones (reported 10–11 Nov 2026, not re-verified here).
  Expo Go is a development runtime, not a production native container; an
  installable dev build and a production-build re-run are still owed.
- **Backgrounded playback / lock screen.** Observed in Expo Go: iPhone
  music+video keep playing in the background; Android both stop. On both
  phones music+video stop on the lock screen and during a phone call. The
  Android background stop and the lock-screen stop are recorded as observed
  behaviour/gaps, not silently counted as passes; the native configuration
  below is intended to change them and must be verified in the production
  build.
- **Android/iOS-specific audio interruptions** — partially observed: both
  phones stop during a call (the expected interruption). Recovery after the
  call and headphone-disconnect behaviour are not yet recorded.

### Device results reported by Kazi (Expo Go)

| Environment | Reported result |
|---|---|
| Android — Expo Go | First play ✓; background: music+video stop; call: stop; headphones ✓; lock screen: stop; audio focus ✓; tab switch ✓ |
| iPhone — Expo Go | Runs ✓; silent switch ON: music still plays ✓; background: music+video continue; lock screen: stop; call: stop |
| Production build | Not run — waiting for an installable dev build |

Reported 10–11 Nov 2026. These are **observed behaviours**, not a formal
PASS/FAIL against the production acceptance criteria; the production build
is the approval environment.

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

**Expo Go observations (10–11 Nov):** iPhone silent-switch playback works
and iPhone background playback continues; Android background playback stops
in Expo Go; both stop on lock screen and during calls. Treat these as shell
behaviour to re-check in the production build, not engine results.

Until a production native build exists, none of these can be signed off —
the honest state is "engine shared and verified on the web; Expo Go shells
observed on both phones; production playback shells pending".

## App-store timing (as requested in the brief)

If app-store publication happens before the above verification is done, the
music feature can ship with **Glassnik Music + No Music** only, with the
same interface (the menu already reserves the Spotify slot), or be held for
a subsequent update — the brief allows either. Nothing here blocks the
publisher's timeline, and nothing ships with unverified licences.
