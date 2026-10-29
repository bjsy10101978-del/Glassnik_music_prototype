# Integration guide — connecting this music system to the real Glassnik

This answers the brief's architecture questions concretely: how the music
system plugs into Glassnik's existing videos, what data it consumes, and
what has to be built where.

## 1. What the prototype is today

A standalone research prototype (Vite + React + TypeScript) that
demonstrates the music system end to end: 59 held recordings, the
recommendation engine, the viewer bar, the credits page and the grouping
browsing. It is not yet wired to the real Glassnik product — by design, so
that the selection rules could be built and verified in isolation.

## 2. The engine: what Glassnik would reuse

`src/engine/recommender.ts` is the whole decision system as pure
functions (no React, no DOM, no audio):

- `buildContext(experience)` — maps video metadata to the decision inputs:
  `categoryId`, `placeType`, `destination`, `preferredMoods`, `energyRange`.
- `recommend({ context, tracks, mode, avoidTrackIds })` — deterministic pick
  with the documented tier order **category → place type → destination →
  general fallback**, the last-15 variety window, and never the same song
  twice in a row.
- Context keys: one decision per Experience/sequence
  (`resolveContextKey`, `resolveContextSource`), and one decision per
  Category / Place / Location grouping
  (`groupingContextKey`, `groupingMembers`, `resolveGroupingContextSource`).

Because it is data-driven, plugging in real Glassnik videos means feeding
it records shaped like `Experience`:

```jsonc
{
  "experience_id": "<Glassnik video id>",
  "title": "<video title>",
  "destination": "<Location, e.g. Kuala Lumpur>",
  "category_id": "<Glassnik category id, from the 21-category taxonomy>",
  "place_type": "<place type, e.g. shopping_mall / island_beach>",
  "video_reference": "<video URL>",
  "sequence_group": "<optional: multi-part Experience>",
  "music_context": { "preferred_moods": [...], "energy_range": [...] }
}
```

Only `category_id` / `place_type` / `destination` are required by the
engine; anything absent degrades gracefully (missing place type → category
pool; both missing → general pool), never to a crash.

## 3. The grouping rule (the brief's central behaviour — implemented)

The rule "music continues across Experiences within one Category, Place or
Location, and changes on switching" is implemented and verified:

- While the viewer browses **a** grouping, the grouping owns one decision
  (key `browse:location:…` / `browse:category:…` / `browse:place_type:…`);
  opening any other Experience inside it never restarts the music.
- Switching the grouping recomputes once (one engine transition).
- The grouping to apply = **the viewer's active browse filter** — the same
  list Glassnik shows. When Glassnik builds (or the CTO specifies) the
  browse views, the integration point is a single line: pass the active
  filter as `{ type, value }` to `groupingContextKey` /
  `resolveGroupingContextSource` (see `MusicProvider`, `groupingFilter`).

The grouping's soundtrack context is deterministic: the grouping's first
Experience in catalogue order speaks for it (dates: catalogue order is the
shared contract; the real integration can swap in any stable ordering
Glassnik already has).

## 4. Playback shell per platform

Web (the prototype's current shell): `MusicProvider` owns one
`HTMLAudioElement`, applies a changed decision exactly once, never restarts
a same-track context, handles track-end auto-advance, broken-file skipping,
music on/off + volume persistence, and gesture-gated start.

Android / iPhone: the same engine + data, with native playback shells for
background audio, lock screen/notification controls and interruption
handling — the concrete list lives in `docs/platform-compatibility.md`.

## 5. What integration into the real product requires (checklist)

1. **Metadata feed**: per-video `category_id` / `place_type` /
   `destination` (and optional music_context) from Glassnik's real system;
   verified against the 21-category taxonomy mapping in
   `data/taxonomy.json`.
2. **Grouping wiring**: pass the viewer's active browse filter as the
   grouping (section 3).
3. **Audio hosting**: a decision on serving audio (same-origin assets vs
   CDN) and environment-specific paths in `src/audioManifest.ts`.
4. **Licence clearance first**: every played track must have a completed,
   evidenced row in `data/licence-review.csv` (`docs/licensing-and-sourcing.md`).
   The build keeps unverified tracks out of claims; production sign-off is
   a human step.
5. **Viewer rules carried over**: no track/artist names in the viewer;
   credits served from the Music credits page (implemented here and
   portable).
6. **Remove research-only surfaces** (research mode toggle, diagnostics
   inspector) or keep them behind a feature flag for the team.

## 6. Direct answers to the brief's questions

- **Does it already use Glassnik's existing video metadata?** Not yet — it
  uses a faithful sample dataset shaped exactly like the required metadata.
  The mapping above is the integration point.
- **Can it identify Category / Place / Location switches?** Yes — the
  context signature and grouping keys recompute on any change of those
  inputs, and the engine transitions exactly once.
- **Can it keep music playing while viewers scroll within one grouping?**
  Yes — one decision per grouping, verified (unit + full-browser checks on
  two engines).
- **Can it pick new music on switching groupings?** Yes — one engine
  transition per genuine change; same-track switches do not restart.
- **Can it run inside the existing viewer without a separate app?** Yes —
  the engine is a pure module; the provider is an ordinary React subtree.
- **Is the code structured so website, Android and iPhone share one system?**
  Yes — engine + data + grouping rules are shared; only the playback shell
  differs per platform (`docs/platform-compatibility.md`).
- **What additional work is needed?** The checklist above; labour is mostly
  data-wiring and native playback configuration, not new selection logic.
