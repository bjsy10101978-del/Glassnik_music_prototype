# Playback architecture

This document describes the playback system as implemented in
`src/player/audioEngine.ts`, `src/player/MusicProvider.tsx`,
`src/player/clips.ts` and `src/components/VideoSurface.tsx`.

## Two independent media elements

The app deliberately keeps **one audio element and one video element**, owned
by different layers:

| Element | Owner | Purpose |
| --- | --- | --- |
| `<audio>` (not in the DOM) | `AudioEngine` singleton | all music playback |
| `<video>` (in the DOM, muted) | `VideoSurface` component | uploaded clip preview |

The video element is always `muted`, so it can never compete with the music
engine for audio output and continuity stays observable. React keeps the same
`<video>` node by identity, so moving between clips changes `src` instead of
creating new players.

## One persistent audio element

`AudioEngine` owns exactly one `HTMLAudioElement`, created once in its
constructor (`new Audio()`, or `document.createElement('audio')` when
`Audio` is unavailable). A module-level singleton guarantees there is only
one engine:

```ts
export function getAudioEngine(): AudioEngineLike {
  if (injected) return injected;      // test hook
  if (!singleton) singleton = new AudioEngine();
  return singleton;
}
```

`MusicProvider` calls `getAudioEngine()` once and stores it in a ref, so React
re-renders and StrictMode's double effect invocation cannot create a second
element. Components never construct media elements.

The element is deliberately **not attached to the DOM**. It is controlled
through the engine API, which prevents accidental duplication and keeps all
media state in one place.

## Separate recommendation and playback state

`MusicProvider` keeps two distinct concerns in React state:

**Recommendation state**

- `DecisionMemo`: `{ key, signature, mode, context, recommendation }` —
  memoised per experience context.
- `historyRef`: recently selected track ids used for repetition avoidance.
- `appliedTrackRef`: the track id last handed to the engine (idempotency).

**Playback state**

- Engine state via subscription: `{ status, url, error }` where status is one
  of `idle | loading | playing | paused | blocked | error`.
- `musicEnabled` and `volume`, both persisted in `localStorage`
  (`glassnik.musicEnabled`, `glassnik.volume`).

Recommendation decisions never depend on playback status; playback never
recomputes recommendations.

## Context resolution

A context groups consecutive videos that should share one music decision:

```ts
resolveContextKey(experience) =
  experience.sequence_group ?? experience.experience_id
```

`buildContext()` then captures the inputs: place type, category, destination,
preferred moods and energy range.

Two sources produce contexts:

- **Sample experiences.** The five Kuala Lumpur shopping records all have
  `sequence_group: "kuala-lumpur-shopping-continuous"`, so they resolve to the
  same key even though their `place_type` differs (city centre, street market,
  shopping mall, night market).
- **Uploaded clips.** `buildClipExperiences()` in `src/player/clips.ts` gives
  every clip in a trip `sequence_group: "uploaded-trip"`, so all clips in the
  trip share one key. The trip's category, place type, destination and moods
  are user-chosen and apply to the whole trip.

`MusicProvider` picks the active item as: the active uploaded clip when the
clip source is active and populated, otherwise the selected sample experience.

### One music decision per trip

A trip makes **one** music decision, not one per video. The provider therefore
resolves the context from the *representative* of the trip, not from whichever
video the user happens to be watching:

```ts
resolveContextSource(experience, allExperiences)
  // -> the first member of the same sequence_group, or the experience itself
```

So every video of the Kuala Lumpur sequence gets the same place type, the
same category and the same track. Stepping through the videos never changes
the music.

### Context signature (important)

The context *key* alone is not enough to decide whether to recompute. A trip
keeps the key `uploaded-trip` while the user changes its category, so the memo
also stores a signature of the context inputs:

```ts
contextSignature(context) = JSON.stringify([
  context.categoryId,
  context.placeType,
  context.destination,
  context.preferredMoods,
  context.energyRange,
])
```

The memoised decision is reused only when **key, mode and signature all
match**. This is what makes "change the trip category → new recommendation"
work while keeping "next clip → same track" behaviour.

## Track selection

`recommend()` is a pure, deterministic function. It filters to:

1. structurally valid catalogue records (`track_id`, `title`), and
2. playable records (the file exists, see the audio manifest below), and
3. mode-eligible records (production mode requires the strict boolean
   `approved_for_production === true` and a non-rejected review status).

It then picks the first non-empty tier in this fixed order: category →
place type → destination → general fallback. (Category comes first so a
context that has both a category and a place type is always served by its
own category pool - for example the Kuala Lumpur shopping sequence, whose
first video is "city centre", stays on the shopping tracks.) Within the tier
it ranks by
preferred-mood overlap and energy within the experience range, then
ascending `track_id`. When every candidate in the tier has already played,
the played-longest-ago order outranks mood and energy, so the pool keeps
alternating instead of sticking on whoever scores best.

In the current catalogue every track belongs to exactly one music pool: a
dedicated pool for every active category - the eight categories the sample
experiences use (shopping 6, markets 3, beaches 3, walking 4, cafes 3,
waterfronts 4, museums 2, parks 3) plus nightlife 3, dining 3, cycling 2,
hiking 2, road trips 2, nature 2 and architecture 3 - and, since 28 October
2026, pools for family 2, adventure 1, festivals 2, wellness 2,
historic_sites 1 and rainy_day 1 (the recordings the team downloaded for
those categories turned out to already be in the library, so those tracks
moved; museums dropped a size when its recording became the historic_sites
song and owes one replacement) - plus a small versatile
general pool of 5 tracks spread across the loudness range. No track is ever
shared. Tracks also carry place-type tags: every category pool owns the
place types that belong to it (shopping `shopping_mall`, markets
`street_market`/`night_market`, parks `urban_park`/`botanical_garden`,
hiking `mountain_trail`, and so on), while the general pool owns
`city_centre`/`transport_hub`. That makes place types the bridge for
contexts without a category: `exp-missing-category` (Barcelona, place type
`city_centre`) matches the general pool via `place_type_match` instead of
dropping to the bare fallback, while category-matched experiences always
stay inside their own pool. Every taxonomy category now owns a pool
(21 of 21); the general pool only serves contexts without a category.

**Never the same song twice in a row.** The provider keeps the ids of the last
fifteen tracks it chose (`historyRef`, `HISTORY_LIMIT = 15`, a ring buffer of
the most recent picks) and passes them to `recommend()` as `avoidTrackIds`.
Those tracks are skipped while another eligible candidate exists in that
category, place-type or fallback pool, so recently played songs are pushed
out of the ranking whenever there is an alternative. If every candidate in
the tier has already played, the track that played *longest ago* is used
again, so the queue never gets stuck. The explanation says so in plain
words: "No unplayed candidate was left in this tier, so the track that was
played longest ago is used again."

The history is reset when the context or the mode changes, so a trip always
resolves to the same music no matter how many trips came before it.

The result includes the reason, explanation, matched field/value, tier counts,
eligible count, missing audio files, unverified flag and notes.

### The audio manifest

The catalogue has 59 tracks and the repository ships 59 matching MP3 files
(`public/audio/track-1.mp3` … `track-59.mp3`), each with its own checksum
and duration. 51 of them are byte-identical copies of the local pool
recordings; the other 4 are locally cut, re-encoded excerpts of the four
byte-duplicate recordings on disk, so every file in `assets/audio-pool/`
maps into the catalogue while every track still holds unique audio.
`src/audioManifest.ts` is generated from
`data/audio-library.json`, which the local build pipeline writes from the
files that really exist. The manifest carries the facts that were measured on
each file: SHA-256 checksum, byte size, duration, sample rate, channels and
where the audio came from.

Because the manifest is the single source of truth, both the recommender and
the validator can tell the difference between "a track that exists" and "a
catalogue entry without a file". A missing file is reported in the diagnostics
panel instead of being requested from the browser.

## Continuity and transitions

On every selection or clip change the provider resolves the key and signature:

```ts
const key = activeItem.sequence_group ?? activeItem.experience_id;
const context = buildContext(activeItem);
const signature = contextSignature(context);
if (memo.key === key && memo.mode === mode && memo.signature === signature) {
  // reuse memo — the engine is not touched at all
  return;
}
// otherwise: call recommend(), store new memo
```

A separate effect applies the memoised track:

```ts
if (appliedTrackRef.current === recommendation.track.track_id) return; // same track
const wasActive = status === 'loading' || status === 'playing';
appliedTrackRef.current = recommendation.track.track_id;
void engine.transitionTo(url, { autoplay: musicEnabled && wasActive });
```

Consequences:

- **Same sequence, next video** → same key *and* signature → memo reused → no
  `recommend()` call, no engine call, `src` untouched, playback continues.
- **Same trip, next clip** → identical context → same as above.
- **Different context, different track** → `transitionTo()` fades out, swaps
  `src`, plays, fades in.
- **Different context, same track** → `appliedTrackRef` matches, so the
  engine is untouched and the track is not restarted.
- **Editing the trip context** → same key, different signature → the decision
  is recomputed and the engine transitions only if the track changed.
- **Mode switch** → decision recomputed; the engine is only touched if the
  resulting track id differs.

`transitionTo()` is also a no-op when the target URL equals the current URL
(unless the engine is in an `error` state), so calling it twice never restarts
playback.

## Automatic advance when a track ends

The player keeps going on its own. When a track reaches its end, the engine
reports it and the provider moves on to the next recommended track and keeps
playing.

The engine emits two playback events that are not part of its state:

```ts
export type AudioEngineEvent =
  | { type: 'ended'; wasPlaying: boolean }
  | { type: 'error'; message: string };
```

`MusicProvider` listens with `engine.subscribeEvents(listener)`.

**Why `ended` carries `wasPlaying`.** A browser fires `pause` just before
`ended`, so the engine status alone cannot tell us whether the track was
really playing. The engine therefore keeps a `playbackActive` flag: it is
switched on when playback starts and switched off by an *explicit* pause (the
user pressed pause, or the music was turned off) or by an error — but not by
the automatic pause at the end of a track. The provider ignores an `ended`
event with `wasPlaying === false`, so a paused player never starts a track
the user did not ask for.

**The advance itself.** `advanceTrack({ forceAutoplay: true })` asks the
recommender for the next track in the same context, with the current track on
the avoid list, and forces playback even though the engine is momentarily
paused. The new track is never the one that just finished. If the tier has no
other track, the player stays where it is instead of repeating the same song.

**Broken files.** A media `error` event skips the broken track and tries the
next one. A run of broken files stops after `MAX_AUTO_SKIPS = 5` so a broken
catalogue cannot start an endless skip loop, and the app never crashes.

**Manual control.** The "next track" button uses the same path without the
forced autoplay, so it never starts playing on its own.

## Fades

Transitions use a single-element fade rather than a two-deck overlap:

1. If audio was active, ramp `element.volume` from the user volume to `0`
   over `fadeMs` (default 320 ms, 40 ms steps).
2. Assign the new `src`, start playback.
3. Ramp volume from `0` back to the persisted user volume.

A monotonically increasing `transitionToken` cancels an in-flight fade when a
new transition, `setSource`, `pause`, or `dispose` occurs, preventing orphaned
fade loops from raising the volume of the wrong track.

This is a fade-out/fade-in, not an overlapping crossfade. Overlap would
require a second media element or Web Audio gain graphs and is intentionally
out of scope for the single-element design.

## Video pipeline (uploaded clips)

`VideoSurface` reuses one `<video>` element and pulls the file from memory
with `URL.createObjectURL`. It tries native playback first, because MP4, WebM
and MOV can usually be decoded and seeked directly:

1. `video.src = objectURL; video.load()`
2. On a media `error` event, it falls back to HLS.js imported dynamically:

   ```ts
   const { default: Hls } = await import('hls.js');
   new Hls({ enableWorker: false }).attachMedia(video);
   ```

   HLS.js repackages the local file into fragments in memory (`blob:` input,
   no network, no service worker), which lets the browser play files it cannot
   decode natively. `hlsError` and `hlsManifestParsed` drive the ready/error
   states, and a **Retry** button restarts the whole pipeline.

Cleanup on clip change or unmount destroys the Hls instance first, then
removes `src` and calls `load()` so nothing keeps decoding in the background.
Object URLs are revoked on every path.

Dynamic import keeps HLS.js (≈575 kB built) out of the initial bundle; it is
only downloaded if a native decode failure actually occurs.

The video element is `muted` and never feeds the audio engine, so the music
continuity rules are unaffected by video playback.

## Autoplay restrictions

Nothing plays automatically:

- On load the provider assigns the recommended source without calling
  `play()`; the status becomes `paused`.
- Playback begins only from the Play button or the music on/off toggle — both
  user gestures.
- If the browser still rejects `play()` with `NotAllowedError`/`SecurityError`,
  the engine emits status `blocked` with the message "Playback blocked by the
  browser autoplay policy. Press Play to start." No unhandled promise
  rejection escapes.
- The automatic advance after a track ends calls `play()` again, but only
  after the user has already started the music with a click, so the browser's
  "sticky" user activation allows it. If the browser still refuses, the
  engine reports `blocked` and the UI asks the user to press play.

## Error handling

- Media `error` events map `MediaError.code` to readable messages (aborted,
  network/missing file, decode failure, unsupported source).
- `error` status is recoverable: pressing Play calls `setSource(url, true)`
  (forced reload) and retries playback.
- Missing files are filtered before selection using the audio manifest, so
  the app does not normally request them. All 59 shipped catalogue
  references exist; the validator reports any reference that is not in the
  manifest as a `missing_audio_file` warning in the diagnostics panel.
- A media error during playback skips to the next track (see "Automatic
  advance" above) instead of leaving the user with silence.
- `ended` pauses the element and hands over to the automatic advance.
- A video file that the browser cannot decode does not leave the app
  spinning: `VideoSurface` gives up after `LOAD_TIMEOUT_MS = 5000` and shows
  "This clip could not be loaded. It may not be a video file."

## Lifecycle and cleanup

`AudioEngine.dispose()` increments the transition token, removes all media
listeners, pauses the element (only if it is actually playing), clears
subscribers and marks the engine disposed. All public methods early-return
after disposal. The provider subscribes with `engine.subscribe(listener)` and
returns the unsubscribe function from `useEffect`.

## Tested vs manually verified

`tests/audioEngine.test.ts`, `tests/autoAdvance.test.tsx`,
`tests/continuity.test.tsx`, `tests/clips.test.tsx` and
`tests/audioLibrary.test.ts` use a fake media element (and read the real
MP3 headers directly). They prove: source assignment/change detection,
play/pause, volume, blocked/error states, fade restoration, singleton
identity, disposal, the automatic advance (including the browser's
"pause before ended" order), the skip of a broken file, the rule that the
same song is never played twice in a row, the provider's continuity rules (no
reassignment or extra `play()` across sequence videos or trip clips;
transition on context change; no restart for the same track), that the ten
shipped audio files have ten different checksums, and that uploaded clips are
labelled unverified rather than as project research data.

`scripts/browser-check.mjs` goes further and drives the real page in headless
Chromium. It runs 42 checks, among them:

- the media element really plays and `currentTime` advances,
- a track that reaches its end moves on to the next track **by itself** and
  keeps playing (the check seeks close to the end of the file),
- consecutive sequence videos and trip clips do **not** restart the audio,
- changing the trip category transitions to `/audio/track-4.mp3`,
- a placeholder video file ends in a clear error state instead of loading
  forever,
- no console errors and no uncaught page errors.

Safari-specific audio behaviour still requires a manual check.
