# Licensing and sourcing policy for the Glassnik research prototype

This document is a practical checklist for the team. It is not legal advice.
If the product will be shipped or monetised, get qualified legal review and
written permission where it is needed.

## The short version

- Nothing in this repository was downloaded or scraped. Every audio file was
  produced locally from recordings that were already in the repository.
- The catalogue of 59 tracks is **scaffolding for research**, not a list of
  59 licensed Pixabay tracks. All 59 hold real local music (55 full
  recordings and 4 excerpts), but none of them is a verified Pixabay
  recording.
- No track is cleared for a real product yet. `approved_for_production` is
  `true` for all 59 records under the pool-backed convention: the flag means
  "backed by a file we produced", not "cleared by a lawyer".
- Every `source_url` in the generated catalogue is a **candidate** page
  marked `source_url_status: "candidate_unverified"`. The licence-review
  register records which URLs a human has actually opened.

## "Royalty-free" is not the same as "free to use"

"Royalty-free" does not mean public domain, copyright-free or unrestricted.
A licence can allow some uses and forbid others, for example redistributing
the file on its own or using it in an advert. The licence of each asset and
the platform terms must be checked for the exact use we have in mind.

## Pixabay research candidates

Pixabay has **no music API**. The public API only covers images
(`/api/`) and videos (`/api/videos/`). There is no supported way to search
or download music through an API, and this project does not scrape,
crawl or bulk-download anything from Pixabay.

Treat Pixabay music as a **research candidate** until a person has opened the
individual asset page and recorded:

- the exact URL of the track page,
- the displayed title and creator,
- the date it was accessed,
- the licence text that applies,
- whether the track may be used in a product, in a video, and whether the
  file itself may be shipped.

Do not assume a Pixabay asset may be redistributed as a standalone file or
bundled into a downloadable music library.

## How the 59-track catalogue was actually made

`scripts/build-data.mjs` writes `data/catalogue.json` from local facts. It
first scans `assets/audio-pool/` and registers **every MP3 file it finds**
(59 recordings: 55 named `Songs0.mp3` … `Songs54.mp3` plus four
Pixabay-sourced files kept under their download names, one re-download
removed - no working file is skipped).
Every record belongs to exactly one music pool: a dedicated pool for every
one of the 21 upload categories (since 28 October 2026 - the eight
sample-experience categories, nightlife, dining, cycling, hiking, road
trips, nature, architecture, plus one- and two-song pools for family,
adventure, festivals, wellness, historic_sites and rainy_day), plus a
small versatile general pool for contexts without a category. The general
pool's five songs are deliberately spread across the loudness range.

How each track landed in its pool: the pipeline decodes every recording and
measures its loudness (RMS), then hands the songs out loudest-first down a
hand-tuned category order, so livelier categories end up with the louder
recordings:

| Pool | Tracks | Songs per trip |
| --- | --- | --- |
| shopping | 006, 007, 009, 012, 043, 045 | 6 |
| walking | 001, 024, 030, 059 | 4 |
| waterfronts | 005, 034, 041, 044 | 4 |
| markets | 003, 028, 036 | 3 |
| beaches | 002, 016, 048 | 3 |
| cafes | 033, 035, 050 | 3 |
| dining | 014, 027, 040 | 3 |
| nightlife | 020, 039, 056 | 3 |
| parks | 042, 047, 058 | 3 |
| architecture | 011, 037, 049 | 3 |
| general | 008, 010, 017, 018, 031 | 5 |
| cycling | 004, 057 | 2 |
| road trips | 013, 015 | 2 |
| hiking | 029, 051 | 2 |
| nature | 026, 038 | 2 |
| family | 023, 055 | 2 |
| festivals | 025, 054 | 2 |
| wellness | 022, 052 | 2 |
| museums | 019, 046 | 2 |
| adventure | 021 | 1 |
| historic sites | 032 | 1 |
| rainy day | 053 | 1 |

Tracks 056-059 are the four excerpts; each follows the parent recording it
was cut from.

Every track carries exactly one category (or none, for the general pool) and
its own set of place-type tags: each category pool owns the place types that
belong to it (hiking owns `mountain_trail`), and the general pool owns
`city_centre` and `transport_hub`. That keeps the recommendation rules
honest and disjoint - an experience selects music first from its own
category pool, a track is never chosen because of a stereotype about a city,
and no song repeats across categories - while place types act as a bridge
for contexts without a category: the missing-category experience (Barcelona,
place type `city_centre`) matches the general pool's five tracks via
`place_type_match` instead of dropping all the way to the bare fallback.
All 59 tracks are pool-backed and production-approved under the pool-backed
convention.

One consequence to be open about: after 28 October 2026 every one of the
21 categories owns its own pool, but three of them run thin. Museums sits
at 2 songs of the agreed 3-4 range (its cinematic recording moved to
historic sites during the afternoon intake), and adventure, historic sites
and rainy day each run on a single song. Until replacements arrive, a trip
in one of those categories repeats its small pool with the recency memory
described in `playback-architecture.md` instead of offering much variety.
The sourcing plan (`library-expansion-plan.md`) tracks what each pool owes.

Every record carries the honesty fields:

- `source_url` — a **candidate** Pixabay Music URL, marked
  `source_url_status: "candidate_unverified"`,
- `source_search_url` — the real search page a person can open to find a
  track with the same mood, genre and tempo,
- `review_status: "pending_source_verification"`,
- `content_id_flag: "unverified"` — nobody has checked whether a rights
  holder has a claim on it,
- `checksum` — the SHA-256 of the file the record points at,
- `duration_seconds` — measured from the file, never guessed.

The validator reports how many source URLs a human has confirmed
(`sourceUrlVerifiedCount`). Right now that number is **0**, and the
diagnostics panel in the app shows it.

## The licence review register

`data/licence-review.csv` is the working spreadsheet for rights
verification, one row per track. It began as the output of
`npm run licence:csv`, but the file is now the **master record**: its
identities were corrected against the download stamps and four excerpt URLs
point at their parent recordings. Do not regenerate it — the generator
script is kept for reference only, and re-running it would overwrite the
corrections.
Its 30 columns carry everything the catalogue already knows (title,
artist, file, checksum, duration, audio origin, candidate source URL and
its status, content-ID flag, review status) plus one column for every
question a reviewer must answer from the actual licence text - commercial
use, hosting/streaming, continuous background playback alongside changing
videos, permanent embedding, standalone distribution, subscription/premium
use, attribution requirements and method, content-ID risk, extra
permissions - and who verified it, when, and where the evidence is kept.

Every verification cell starts as `UNKNOWN` and every row is flagged
`UNVERIFIED - do not use in production until every UNKNOWN is resolved`.
Nothing may be guessed: a cell is filled only after a human opens the real
licence text for that recording and records the evidence location.

**URL-check update, 11 November 2026.** The owner manually opened the
candidate item URLs and the register now marks 58 of 59 rows
`source_url_status: candidate_verified`. Corrected canonical item URLs are
recorded for `glassnik-002`, `glassnik-003` and `glassnik-005`; their item
pages match the register title, creator and duration. `glassnik-032` stays
`candidate_unverified`: the replacement link supplied was a search page, and
the direct item page currently resolves to a 1:59 NastelBom track titled
"Cinematic - Cinematic Music", not the register title "Suspense Suspense
Background". That row needs the exact item URL and title confirmation.

This is URL checking only, not a licence pass. Every row still has
`review_status: pending_source_verification`, every licence verdict cell is
still `UNKNOWN`, and `verified_by` / `verified_date` are empty. The
generated `data/catalogue.json` still says `candidate_unverified`; the CSV
is the master record.

## The audio files

The repository ships **59** MP3 files: `public/audio/track-1.mp3` up to
`public/audio/track-59.mp3`. Every one of the 59 catalogue records points at
one of them, so every track in the app is playable.

The local pool folder `assets/audio-pool/` holds **59 recordings** (55 named
`Songs0.mp3` … `Songs54.mp3` plus four Pixabay-sourced additions, one
re-download removed), but four of them are byte-identical
duplicates of four others (Songs27 = Songs19, Songs32 = Songs23,
Songs34 = Songs25, Songs35 = Songs26). So the library is built from the 55
unique recordings plus four excerpts, and `data/audio-library.json` says
which is which for every file:

| Files | Origin | What they are |
| --- | --- | --- |
| `track-1` … `track-55` | `approved_pool_recording` | the 55 byte-unique pool recordings, copied byte for byte |
| `track-56` … `track-59` | `approved_pool_excerpt` | real excerpts of the four duplicate recordings: decoded locally, a different part cut out and encoded again |

This way **every file on disk** backs a catalogue entry - the 55 unique
recordings directly, and each of the four duplicate files as the source of
its own excerpt - while all 59 shipped tracks still hold unique audio.

Facts we measured, not facts we invented:

- All 59 files are **different**. Every one has its own SHA-256 checksum,
  its own duration and its own bytes. The test suite checks this, and the
  diagnostics panel shows the count of unique checksums.
- The shortest file is about 26 seconds, the longest about 3 minutes 31,
  and the whole library is about 112.6 minutes long.
- `data/audio-library.json` records, for every file: checksum, byte size,
  duration, sample rate, channels, bitrate, where the audio came from and a
  provenance note.
- The pool recordings live in `assets/audio-pool/`. That folder is not part
  of the repository (it is in `.gitignore`), because a recording may only be
  committed when the project's rights and size rules allow it.

**Rights are still open.** A file existing in the repository is not a
licence. Since the 9 November 2026 truth pass, all 59 tracks carry
`approved_for_production: false`: none of them has been licence-verified by
a human, so production mode selects no track at all and the player pauses
when no eligible track exists. The earlier "pool-backed" convention — where
a file we produced was treated as approval — was removed because it made an
unverified library look approved.

## Source licence terms, as published (captured 26 October 2026)

These are the licence summaries of the sources the brief asks about, quoted
from the live pages on the date above. They are **source-level guidance,
not per-track verification**: every recording still needs its own row in
`data/licence-review.csv` filled in by a human who has opened the item page
and the licence text that applies to it. Sources can also change their terms
- always re-read the live page before deciding.

### Pixabay — Content License Summary

Source: https://pixabay.com/service/license-summary/ (the legally binding
text is the full Content License at https://pixabay.com/service/terms/)

Allowed (subject to the Prohibited Uses):

- Use Content for free.
- Use Content **without attribution** (credit is appreciated, not required).
- Modify or adapt Content into new works.

Prohibited Uses include:

- Selling or distributing Content **on a standalone basis** — "standalone
  means where no creative effort has been applied to the Content and it
  remains in substantially the same form as it exists on our website".
- Using Content containing recognisable trademarks/logos/brands for
  commercial purposes related to goods and services.
- Immoral or illegal use; misleading or deceptive use; using Content as
  part of a trademark, trade name or service mark.

Also stated: certain Content may carry additional intellectual-property
rights, and it is the user's responsibility to check whether third-party
consent is needed. That is the per-track check the register performs.

**One licence for the whole site** (observed 28 October 2026): Pixabay
does not issue a different licence per track - every item page links to
this same Content License summary, and every song the team downloaded
shows exactly this one link. Two consequences for the register: (1) the
licence-answer columns have the same source-level answers for every
Pixabay row - what differs per row is only the item-page facts (title,
creator, duration), the shield/Content ID state, and the evidence saved;
(2) the one exception written in the terms (section 4): content
published before 9 January 2019 is CC0 instead of this licence. The item
pages sampled so far all show 2026 publication dates, so the Content
License is the one that applies; the per-row pass, when it happens,
confirms it per page.

What this means for Glassnik, pending the per-track review: streaming
background music over Experiences inside an app/service is a "used in a
project" scenario, not a standalone distribution - and the FAQ's
subscription-platforms answer (below) supports the same reading for a
paid tier, provided the music stays embedded in the Experience and is
never offered on its own. The app already enforces this: music plays only
while an Experience is active, there is no jukebox screen, no audio
downloads, and any single track can be removed with one catalogue row and
a rebuild. The app-store distribution question and the per-track
content-ID exposure (the shield icon) remain rows the human reviewer
decides, per track. Nothing is assumed.

**Re-checked 9 November 2026.** The live summary page was read again on
this date. It states the same three allowances (free use, no attribution
required, modification allowed) and the same prohibitions (standalone
distribution, trademark use on goods and services, immoral or illegal use,
misleading use, use as part of a trademark). No wording change since the
26 October capture; the legally binding text remains the Content License in
the Terms of Service.

### Pixabay — Music FAQ (captured 28 October 2026)

Source: https://pixabay.com/service/faq/ (Music section). These answers
are source-level guidance; the per-track register still needs a human
pass. Quote wording below is exactly as published on the capture date.

- **Licence certificates — the exact answer to "Can I get a license
  certificate for all tracks?"**: "License certificates are available for
  tracks registered with YouTube's Content ID. For other tracks, users
  should keep the download link, file name, and the Pixabay Content
  License summary as proof of permitted use." So a certificate is NOT
  issued with every download — it exists only for Content ID-registered
  tracks. For every other track, Pixabay's own proof recipe is exactly
  our evidence convention: item page + licence summary + download record.
- **The shield icon.** "Tracks displaying a shield icon are registered
  with Content ID and may trigger claims, which can usually be disputed
  using the *Download certificate*." The shield on the track page is the
  visible per-track Content ID signal — record it in the
  `content_id_claim_risk` column during verification, and keep the
  certificate PDF when it is offered.
- **Subscription / OTT platforms.** "Music from Pixabay can be used in
  content published on OTT or subscription platforms (e.g. documentaries,
  short films, branded content), provided the music is embedded as part
  of a creative project and not distributed separately or claimed as your
  own." This answers the subscription-tier question at source level:
  allowed when embedded, not when standalone.
- **Standalone for music.** "you can't sell or distribute content (either
  in digital or physical form) on a standalone basis (i.e. where no
  creative effort has been applied to the content and it remains
  substantially the same form as it exists on the Pixabay website)."
  Music glued into a larger creative work is fine; music on its own is
  not. Pixabay's FAQ also advises: "Avoid uploading music-only content
  (e.g. static images with just an audio track), which is more likely to
  be flagged." Glassnik never serves music-only playback.
- **A Content ID claim is not a copyright strike.** A claim "may affect
  monetisation, visibility, or regional availability. It does not affect
  your channel standing." Claims can hit legally-used tracks because
  contributors (or their distributors) register tracks with Content ID
  while still offering them free on Pixabay.
- **Disputing a claim.** YouTube Studio → the video → "See Details" →
  Dispute, choosing "I have permission or a license to use the content",
  including the track title, the track URL on Pixabay and the
  licence-summary link. That dispute kit is the same evidence the
  register and evidence folder keep.
- **Pixabay's own record-keeping advice.** "Keep records of your
  downloads (file name, screenshots, or project files)"; "Only download
  music directly from the official Pixabay site." Our register does both.

### Pixabay — Terms of Service (captured 28 October 2026; page states "Last updated: 20 October 2026")

Source: https://pixabay.com/service/terms/ — the legally binding text.
Pixabay is operated by Canva Germany GmbH.

- **The grant (section 5).** For Content that is not CC0, downloading
  grants "an irrevocable, worldwide, perpetual (or as long as allowed by
  law), non-exclusive and royalty-free right to download, use, copy,
  modify or adapt the Content for commercial or non-commercial purposes"
  — conditional on not engaging in the Prohibited Uses. (CC0 note: content
  published before 9 January 2019 is CC0; our candidate tracks are all
  newer, so the Content License above is the one that applies.)
- **The kill-switch clause (section 11, Infringement claims) — quoted in
  full.** "If you find out – from Pixabay or somewhere else – that there
  is a claim relating to any Content and Pixabay might be liable, you
  have to stop using the Content immediately, at your own expense. This
  applies whether the claim is threatened, potential or actual. You also
  have to immediately delete or remove the Content from your premises,
  computer systems and storage (electronic or physical); ensure that your
  clients, printers or ISPs do likewise; and let Pixabay know as soon as
  possible by emailing info@pixabay.com." Glassnik's takedown mechanism
  is built for exactly this: one catalogue row plus a rebuild removes a
  single track without touching the other 58.
- **No warranty of clean rights (section 5).** "We do not warrant that
  any consents or licenses have been obtained in relation to any Content,
  and we expressly disclaim any and all responsibility and liability in
  relation to such matters." And: "Responsibility for determining whether
  permissions are needed always rests solely and exclusively with you."
  This is the fake-uploader risk in Pixabay's own words — the reason the
  per-track human verification and the evidence folder exist.
- **"AS IS" (section 14).** The service and content are provided as-is,
  with no warranty regarding rights; Pixabay "cannot be held responsible
  for the acts or omissions of its users, including any misuse or abuse
  of any content".

### Mixkit — Stock Music Free License

Source: https://mixkit.co/license/modal/musicFree/ (limits are described in
the User Terms: https://mixkit.co/terms/)

Allowed (items can be used in commercial and non-commercial projects for
free):

- Download, copy, **modify, distribute and publicly perform** the Music
  Items on any web or social-media platform, including internet-based
  video-on-demand services, podcasts and advertisements.
- Listed uses: podcasts, social-media video posts, online marketing ads,
  educational purposes, YouTube videos.

Not allowed:

- CDs & DVDs, TV & Radio broadcasts, video games.
- Remixing them or incorporating them into a music-only track.
- Claiming them as your own or registering them on any rights-management
  service.
- Content-claims note: if a claim arrives, forward the details to
  team@mixkit.co for assistance.

No attribution requirement is stated in the music licence (none appears on
the licence page). What needs the human review anyway: whether
"web or social media platform" covers a subscription-backed app-store
product the way Glassnik distributes it, and the video-games exclusion
context — both rows sit UNKNOWN in the register until checked.

## Glassnik use-case determination (9 November 2026)

This is the project's documented reading of the Pixabay Content License for
Glassnik's specific use case, prepared from the summary, the Music FAQ and
the Terms captured above. It is **not legal advice**, and it does **not**
tick any row of `data/licence-review.csv`: the per-track human pass remains
the only thing that can mark a track verified. It answers the checklist
question "do the commercial rights work for our use?" at the level the
published licence allows a careful reader to answer it.

**The use case.** Glassnik plays background music under travel video
Experiences inside an app/website. The music is chosen per Experience (or
per Category / Place / Location grouping), starts only after the viewer
presses Play, continues while the viewer browses, and changes when the
context changes. There is no screen that lists tracks for standalone
listening, no audio download, and any track can be removed by editing one
catalogue row and rebuilding. The planned product is commercial
(app-store distribution), potentially with a paid tier.

| Licence question | Answer for this use case | Basis |
| --- | --- | --- |
| Free use in a commercial product | Yes | Summary: "Use Content for free" — no non-commercial restriction |
| Attribution | Not required; credit is given anyway on the Music credits page | Summary: use "without attribution" |
| Modification | Not needed (files ship unmodified); allowed if ever needed | Summary: modify or adapt allowed |
| Standalone distribution | Not applicable — music is never offered on its own; it is embedded under video Experiences inside the app | Summary/FAQ: standalone means no creative effort and substantially the same form; embedding in a greater work is the allowed case |
| Subscription / paid tier | Allowed while the music stays embedded in the creative project and is not distributed separately | FAQ: OTT / subscription platforms answer |
| App-store distribution | The site-wide licence does not forbid distribution as part of an app; this reading should be confirmed in the human/legal pass | Terms §5 grant + standalone prohibition |
| Synchronisation (music paired with video) | The project's reading: the licence's grant to use the music in creative projects covers pairing it with video; Pixabay offers no separate synchronisation licence and requires none | Summary/FAQ: use in creative projects; Terms §5 grant — confirm in the legal sign-off |
| Content ID claims | Possible per track; a claim is not a copyright strike; dispute kit = item URL + licence link + download record | FAQ: shield icon, claims, dispute |
| Third-party rights | The user's responsibility to check; the per-track pass records the shield state and any extra rights | Summary: third-party rights note; Terms §5 disclaimer |

**Design controls that keep the use inside the permitted case** (all already
in the prototype): the music decision is tied to an Experience or a browse
grouping; the viewer shows no track names; the credits page names every
track and creator; there is no audio download; a takedown is one catalogue
edit plus a rebuild; production mode plays nothing until a human has
approved a track.

**What this determination does not do.** It does not verify any individual
track, it does not decide the Content ID shield state per track, and it is
not a legal opinion. Those stay with the human per-track pass (quick guide
below) and, if the team wants one, a lawyer's review of this page.

## The manual workflow for a real track

1. Search for the music manually in a browser.
2. Open the individual track page.
3. Record the exact URL, the displayed title and creator, the date, and the
   licence that applies.
4. Download a small number of sample files by hand, only if the site's
   current terms allow it. Keep them out of version control until the rights
   are clear.
5. Measure the file locally: SHA-256 checksum, real duration, sample rate.
   Never invent a value.
6. Check whether the track has Content ID or another rights claim: on the
   track page, the shield icon marks Content ID-registered tracks (Pixabay
   FAQ, captured 28 October 2026). If the shield is there, use the page's
   "Download certificate" link and keep the PDF as `certificate.pdf`. Not
   seeing a shield or warning is not proof that there is no risk.
7. Only then set `approved_for_production: true`, and have a second person
   confirm it for the exact intended use and distribution model.
8. Remove or replace any asset whose terms do not support the intended use.

### Where a recording's identity comes from (no account was used)

Every download in this project was made **without a Pixabay account**, and
that is fine: Pixabay allows downloads without one, the licence applies to
the download either way, and Pixabay's own proof recipe ("keep the
download link, file name, and the Pixabay Content License summary",
captured 28 October 2026) does not require an account. What an account
would add — a download-history page — simply does not exist for us.
Instead, the evidence is:

- the macOS "downloaded from" stamp on each file, which records the exact
  Pixabay CDN URL (the item ID sits in its `filename=` parameter) and the
  download date and time;
- the Pixabay download filename itself (creator - title - item ID);
- the file's checksum, byte size and measured duration.

All of it is copied into `data/download-stamps.json` and, in
human-readable form, `assets/licence-evidence/download-stamps.md`
(captured 28 October 2026, all 59 pool recordings). The MP3 files carry
no ID3 tags at all, so the stamps are the only identity carrier: do not
delete the originals in `~/Downloads` (and the pool copies' metadata)
until every register row is verified. The item page URL pattern built
from the stamp (`https://pixabay.com/music/<title-slug>-<item-ID>/`) is a
**candidate** like any other — a human still opens it, listens, and ticks
the row. An account is still worth creating for FUTURE downloads (better
records, and certificates for Content ID tracks may need one), but it
changes nothing about the recordings already in the library.

### Evidence retention

Every verified track keeps its evidence in
`assets/licence-evidence/<track_id>/`, named exactly like the row in
`data/licence-review.csv` (a `glassnik-NNN` folder):

- `item-page.pdf` — a saved copy (or screenshot) of the provider's item page
  for that recording at the time of verification, showing title, creator,
  duration and download page.
- `licence-page.pdf` — the licence text or summary that applied at that
  moment (for example the Pixabay Content License page).
- `certificate.pdf` — only when the track page shows the Content ID shield
  icon: that is the only case where Pixabay issues a "licence certificate"
  (Pixabay FAQ, captured 28 October 2026). For every other track, Pixabay's
  own proof recipe applies instead — "keep the download link, file name,
  and the Pixabay Content License summary" — which is exactly the three
  files above.
- `record.md` — who verified it, the date, the exact URLs visited, what was
  answered for each verification column and why, plus any correspondence
  with the provider. For excerpt tracks (glassnik-056…059), `record.md`
  points at the parent recording's evidence folder instead of repeating it.

The `evidence_location` column of the register points at that folder. If a
cell cannot be evidenced, it stays `UNKNOWN` and the row stays flagged
`UNVERIFIED - do not use in production until every UNKNOWN is resolved`.

## The 59-row licence pass — quick guide (prepared 9 November 2026)

Every one of the 59 recordings is Pixabay content under the same site-wide
Pixabay Content License (see the one-licence note above). That makes the
human pass repetitive rather than hard: the licence answers are the same for
every row, and what differs is the item-page fact check and the Content ID
shield. A careful reviewer can do a row in about a minute.

For each row in `data/licence-review.csv`:

1. Open the row's `candidate_source_url` (or `source_search_url` when the
   candidate is marked unconfirmed). Check that the page's title, creator
   and duration match the row. If they do not match, do not tick anything —
   mark the row's source status and move on.
2. Confirm the page links to the Pixabay Content License summary (it is the
   same licence site-wide). Save the item page as `item-page.pdf` and the
   licence summary as `licence-page.pdf` in
   `assets/licence-evidence/<track_id>/`.
3. Look for the Content ID shield icon. Record it in
   `content_id_claim_risk`; if the shield is present, download the
   certificate and save it as `certificate.pdf`.
4. Fill the licence-answer columns with the same source-level answers the
   determination above records (commercial use: yes; hosting/streaming: yes;
   continuous background playback: yes; permanent embedding: yes;
   standalone distribution: not applicable — never offered standalone;
   subscription/premium: yes while embedded; attribution: not required;
   extra permissions: none known; content-ID risk: per the shield).
5. Fill `reviewer`, `review_date` and `evidence_location`, set the row status
   to `VERIFIED`, and write `record.md` with the URLs and what you saw.
6. Excerpt rows (`glassnik-056`…`059`) reuse their parent recording's
   evidence folder; do not duplicate the PDFs.

The four excerpt parents are already in the register, so the pass is 59 item
pages, not 63. Do not fill a cell from memory or from this guide alone: the
guide tells you what the licence says, the human still has to see the item
page and sign the row. When a row is complete, that is the only moment its
`approved_for_production` may become `true`.

### Printable procedure and status report

A printable version of this procedure — with the current status (0/59
signed), the corrected claim and trademark wording, and the dual sign-off
rule — is in `Glassnik_Licensing_Verification_Report_09_Nov_2026.docx` at the
repository root.

## What the app shows the user

The recommendation panel labels every track with its source status, and the
diagnostics panel lists the library size, the number of unique checksums, the
number of duplicates, the total duration and the number of source URLs that
have been confirmed. Nothing in the UI claims that a track is licensed when
it is not.

## Sources to review

- Pixabay Licence Summary: https://pixabay.com/service/license-summary/
- Pixabay Content Licence (full terms): https://pixabay.com/service/terms/
- Pixabay FAQ, Music section: https://pixabay.com/service/faq/
- Pixabay Music: https://pixabay.com/music/
- Mixkit Licence overview: https://mixkit.co/license/
- Mixkit Stock Music Free License: https://mixkit.co/license/modal/musicFree/
- Mixkit User Terms: https://mixkit.co/terms/
- Spotify Developer Terms: https://developer.spotify.com/terms/
- Spotify Web Playback SDK: https://developer.spotify.com/documentation/web-playback-sdk
