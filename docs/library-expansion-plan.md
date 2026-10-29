# Library expansion plan — the road to ~100 verified tracks across 21 categories

The brief asks for the original target of roughly 100 tracks across the 21
Glassnik categories, with the six categories that currently have no
dedicated music addressed first, quality/suitability/rights leading — and
explicitly orders this **after** licence verification. So this is the plan
to execute once the register is cleared; sourcing new recordings before
that would contradict the brief.

## Where the library stands (59 recordings, updated 28 October 2026)

- 21 disjoint category pools (every upload category has one now), plus
  a 5-track versatile general pool; 59 unique audio files (55 full pool
  recordings + 4 locally cut excerpts, byte-duplicate pool files reused as
  excerpt sources).

| Category pool | Tracks | | Category pool | Tracks |
|---|---|---|---|---|
| shopping | 6 | | parks | 3 |
| markets | 3 | | nightlife | 3 |
| beaches | 3 | | dining | 3 |
| walking | 4 | | architecture | 3 |
| cafes | 3 | | nature | 2 |
| waterfronts | 4 | | cycling | 2 |
| museums | 2 | | hiking | 2 |
| family | 2 | | road_trips | 2 |
| adventure | 1 | | general | 5 |
| festivals | 2 | | | |
| wellness | 2 | | | |
| historic_sites | 1 | | | |
| rainy_day | 1 | | | |

- **No category is without a pool any more (28 October):** uploads in
  historic_sites and rainy_day now play their own song instead of the
  general fallback. The general pool only serves contexts without a
  category.

- Same-day notes, in plain words:
  1. The four songs downloaded in the morning were recordings the library
     already had (byte-identical copies: glassnik-023 Ferris Wheels,
     glassnik-021 Soft Machine, glassnik-025 Marble Floor,
     glassnik-022 Paper Boats). The downloaded duplicate copies were
     removed and those four existing tracks were REASSIGNED: cafes →
     family, beaches → adventure, shopping (was 7) → festivals, markets
     → wellness. Donor pools stay in range, except museums (below).
  2. The five songs downloaded in the afternoon: four were genuinely new
     (quiet-courtyard lofi → rainy_day, indie-rock → family, percussion
     → festivals, long-day → wellness). The fifth, the cinematic pick,
     was byte-identical to glassnik-032 "Quiet Machines" in museums - so
     the duplicate copy was removed and that recording moved from
     museums to historic_sites instead. That covers the last category;
     **museums drops 3 → 2, below its agreed 3-4 range, and owes one
     replacement song** (restoring it is step 3 of the sourcing plan).
  3. Because one recording may not sit in two pools, moving (reassigning)
     beats copying every time; the build script now pins every recording
     to its pool by checksum across rebuilds (`POOL_REASSIGNMENTS` +
     `NEW_BUCKET_BY_SOURCE` record the decisions), so future rebuilds
     never reshuffle established pools, and it fails loudly if a pool's
     size drifts from the plan.

- Same-day tidy-up: the store-wide title list had a hidden flaw from an
  earlier expansion - tracks 39-55 had re-used the placeholder titles of
  tracks 18-34 (17 duplicate pairs). The title build now picks always
  fresh titles and the 17 duplicates were renamed ("Soft Machine" still
  belongs to the adventure recording; its parks lookalike is now
  "Soft Meridian", and so on). Every title in the credits page is unique
  again, which matters because that list is what people read to confirm
  real songs really rotate.

## The gap to ~100

41 additional verified recordings, allocated roughly as:

1. **First rights on all 59 existing** (the register; zero new sourcing
   until done — brief's rule). Note: several songs HAVE been added by
   hand during late October; verification of the whole set is still the
   gate before anything ships publicly.
2. **Museums owes one song** (it dropped 3 → 2 when its recording moved
   to historic_sites; restore it to the agreed 3-4 range first).
3. **Grow the six newest pools** (family 2, adventure 1, festivals 2,
   wellness 2, historic_sites 1, rainy_day 1) toward 2-3 each
   ≈ 6 tracks, so no category is a single-song rotation.
4. **Deepen the smallest older pools** (cycling, hiking, road_trips,
   nature at 2 each): 2 more each ≈ 8 tracks.
5. **Balance the remainder** across pools to reach ~100 with the same
   disjoint-pool guarantee (update `POOL_ORDER` sizes in
   `scripts/build-data.mjs`; the build enforces that sizes sum to the
   catalogue count and refuses drift).

## Category briefs (quality + anti-stereotype, per the brief)

Music must suit scrolling Eye-POV Experiences and must not lean on
cultural clichés (the engine already has the rule "no country/city → genre
mapping"; the sourcing briefs follow the same principle):

- `historic_sites` — understated, timeless acoustic/ambient textures;
  explicitly NOT "ancient-pastiche" or national anthem colours.
- `festivals` — upbeat but region-neutral percussion/melody; crowd-joy
  without stereotypes of any particular festival tradition.
- `wellness` — calm ambient/piano, low energy, steady — sits well behind
  yoga/meditation Experiences.
- `adventure` — mid-tempo, forward-moving, light percussion; energetic
  without being cinematic-trailer bombastic.
- `family` — bright, simple, friendly rhythms; nothing infantile.
- `rainy_day` — mellow piano/lofi warmth; contemplative, not sad-salvation.

General house criteria for every candidate:

- Instrumental preferred (vocal lines compete with spoken Experiences);
  the catalogue already marks vocals status honestly and never assumes.
- Musically listenable for repeated exposure (the pool rotation principle).
- Clean Content-ID history is a hard criterion: a track that is likely to
  trigger claims on YouTube/app stores is a liability for Glassnik — record
  findings in the `content_id_claim_risk` column.
- Licence must explicitly cover: hosting/streaming in an app + website,
  continuous background playback over changing videos (not permanent
  embedding), and commercial use including a future Premium tier.

## Candidate sources (terms already captured — 26 October 2026)

- **Pixabay Music** (`pixabay.com/music/`): licence summary captured in
  `docs/licensing-and-sourcing.md` (no attribution, commercial use,
  standalone-distribution prohibition). Best fit for volume sourcing;
  per-item page must still be recorded with evidence.
- **Mixkit Stock Music** (`mixkit.co/free-stock-music/`): free licence
  captured (commercial + non-commercial, web/social/streaming permitted;
  no CDs/DVDs/games/broadcast; no music-only remixes; no rights-service
  registration). Good for gaps where Pixabay lacks suitable options.

Both: download by hand, item page + licence page saved to
`assets/licence-evidence/<track_id>/`, then the register row completed as
described in `docs/licensing-and-sourcing.md`.

## Intake pipeline (after verification, per track)

1. Human listen + suitability check against the category brief.
2. Record item URL, exact title/creator, licence answers, evidence files.
3. File into `assets/audio-pool/`, run `npm run verify:audio` (checksums,
   duration, uniqueness, catalogue match are all enforced).
4. Add to `POOL_ORDER` (category + size) in `scripts/build-data.mjs` and
   rebuild with `npm run build:data` — the build validates disjointness and
   coverage; tests must stay green (pool expectations live in
   `tests/audioLibrary.test.ts`).
5. `approved_for_production` flips only when the register row is fully
   verified (the build-data pipeline documents this; missing approval is
   never treated as approval).
