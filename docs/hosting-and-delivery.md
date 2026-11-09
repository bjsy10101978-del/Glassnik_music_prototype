# Hosting and audio delivery — analysis and options (9 November 2026)

This is the decision material for checklist item D6 ("hosting/CDN plan").
The numbers below were measured on this repository on 9 November 2026;
provider prices and limits are indicative and must be re-checked at signup
because they change.

## What has to be hosted (measured)

| Item | Measured value |
| --- | --- |
| Audio library | **59 MP3 files, 203 MB total** |
| Per-file audio size | average 3.4 MB; smallest 0.8 MB; largest 6.5 MB |
| Total listening time | about 112.6 minutes |
| Built app shell (`dist/assets`) | **960 KB** (562 KB HLS library, 377 KB app JS, 15 KB CSS) |
| Full production build (`dist/`) | **231 MB** (230 MB audio + app shell) |
| Git repository | 237 MB (audio is committed, as agreed on 29 October) |
| Audio protocol needs | byte-range requests (`206 Partial Content`) for seeking; HTTPS; long-lived caching |

The dev server already answers audio requests with `206` (observed in the
browser battery's network log), so the player's seek/stream behaviour is
not dependent on loading whole files.

## What the app needs from any host

1. **HTTPS** — required by browser autoplay/security rules and by the
   planned app WebViews.
2. **Range requests** — the audio element seeks with `Range`; a host that
   ignores it still plays but seeking degrades.
3. **Correct content type** — `audio/mpeg` for `.mp3`.
4. **Caching** — the app shell's hashed assets can be immutable; audio files
   have stable names (`track-N.mp3`), so either version them or use a
   moderate cache with `ETag` revalidation.
5. **CORS only if audio moves off-origin** — same-origin needs nothing;
   a separate CDN origin must send `Access-Control-Allow-Origin` and allow
   the `Range` header.
6. **No secrets in the bundle** — everything here is static; there is no
   server component to host.

## Options

| Option | How it works | Cost sketch | Trade-offs |
| --- | --- | --- | --- |
| **A. Same-origin static hosting** (current model) | Deploy `dist/` (app + 203 MB audio) to one static host, e.g. Cloudflare Pages, Netlify or Vercel. `toAudioUrl` returns `/audio/...`. | Free tiers are usually enough at prototype traffic; paid static hosting is typically a few dollars a month. | Simplest; one deploy; no CORS. Large deploys are slower, and some hosts cap per-file or total size — check the current limit before choosing. |
| **B. Static app + object-storage CDN** | App shell on the static host; audio on Cloudflare R2 / Bunny / S3 + CDN, with `VITE_AUDIO_BASE_URL` pointing at it. | Storage for 203 MB is cents per month; egress dominates. R2's zero-egress model and Bunny's low per-GB rate are the cheap options; check current pricing. | Best scaling and caching control; needs CORS + Range verification and a second deploy step. The code already supports it (see below). |
| **C. Mobile app bundling** | Ship a subset of tracks inside the Android/iOS binary, or stream from B. | Store size limits and review friction; a 203 MB bundle is too large for a store build. | Bundling only a small starter set is possible; streaming is the realistic default. |

### Rough traffic maths

At an average 3.4 MB per track, **1,000 track plays ≈ 3.4 GB** of audio
egress; 10,000 plays ≈ 34 GB; 30,000 plays ≈ 102 GB per month. That is
well inside free tiers for a prototype and low single-digit dollars on a
cheap CDN. The app shell (under 1 MB) is negligible.

## What is already implemented for the CDN option

`src/audioManifest.ts` now reads an optional build-time base URL:

```bash
# same-origin (default)
npm run build

# audio on a CDN
VITE_AUDIO_BASE_URL=https://cdn.example.com npm run build
```

`toAudioUrl()` then returns `https://cdn.example.com/audio/track-N.mp3`
instead of `/audio/track-N.mp3`; every component already goes through that
function, so nothing else changes. The default is unchanged and covered by
unit tests.

## Recommendation

1. **For the prototype and the first real demo: option A** — deploy the
   whole `dist/` to one static host. It is the least moving parts and keeps
   the player same-origin.
2. **Before real launch, or as soon as traffic is more than a demo: option
   B** — move only the audio to a CDN, keep the app shell static, set
   `VITE_AUDIO_BASE_URL` in the build. This also makes it possible to swap
   or remove a track without redeploying the app shell.
3. **Whichever host is chosen, verify Range + CORS before sign-off** with a
   one-line `curl -I -H "Range: bytes=0-1023" <audio-url>`: the response
   should be `206` and include `Accept-Ranges: bytes`.

The decision (which host and whether to split audio) is a team/budget call;
this document supplies the numbers and the implementation point, not the
choice.

## Open questions for the team

- Which static host is already used for Glassnik's site (reuse it if so)?
- Is a custom audio domain acceptable for CORS and caching?
- Expected launch traffic (to choose A vs B and size the cache)?
- Should the four excerpt files be regenerated at a different bitrate to
  reduce the 203 MB total, or is quality the priority?
