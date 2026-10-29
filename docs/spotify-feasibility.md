# Spotify feasibility for Glassnik

## Purpose

This note answers one question: **could Glassnik play its music through
Spotify instead of through local files?**

The short answer is: **not for the product we are describing.** Spotify is a
personal music service for listeners, not a background-music engine for a
travel video product. This document explains why, what Spotify could do, and
what we would have to do to change the answer.

This is an engineering feasibility summary, not legal advice. Confirm the
current Spotify Developer Terms, Web Playback SDK documentation, API policies
and any commercial licensing requirements before implementing anything.

## What Spotify actually offers

| Product | What it is | Can it be our music engine? |
| --- | --- | --- |
| Web Playback SDK | Plays a user's Spotify catalogue in the browser through the Web API | No — it plays a listener's own songs, one queue at a time, and needs a paid account |
| Web API | Metadata, playlists, playback control for the signed-in user | No — the playback endpoints are for the signed-in user's own account |
| Embedded player (iframe) | A small player for one track or album | No — it is a Spotify-branded player, not something you can drive programmatically |
| Spotify Connect / SDK for apps | Hands playback to a device | No — the same account and catalogue rules apply |

None of these give a product the right to pick "the right music for this
moment" from a catalogue it controls, keep playing in the background, or sync
the music to a video.

## 1. The Premium requirement

- The **Web Playback SDK only works with Spotify Premium**. A free Spotify
  account cannot be used with the SDK, and the SDK documentation makes the
  paid account a prerequisite for using it in a browser.
- The **Web API playback endpoints** (`/me/player/*`) have the same
  restriction: starting playback, adding to the queue and reading the current
  track require a Premium subscription for the signed-in user.
- A **free listener** can still use the *catalogue* endpoints (search, track
  and playlist metadata), but those only return metadata. There is no stream
  URL and no audio.

For Glassnik this means: every user of the product would need their own
Spotify Premium account, and the product would be playing *their* music, not
music the product chose. A prototype cannot ask its users to subscribe, and a
travel product certainly cannot assume it.

## 2. Anonymous (not signed in) users

- Every endpoint that returns or controls **audio needs an OAuth access
  token** for a real user. There is no anonymous way to start playback.
- The Web Playback SDK is built around an OAuth flow with the scopes
  `user-read-email`, `user-read-private`, `user-read-playback-state` and
  `user-modify-playback-state`. It also needs a client id registered in the
  Spotify developer dashboard.
- **Token handling is a product problem, not a technical detail.** Tokens
  expire, must be refreshed, and must never be put in source control or in
  the browser as a shared secret. A shared "service" token that the product
  uses for all visitors is not something Spotify offers for this use case.
- An anonymous visitor who does not sign in can therefore get **metadata
  only** — no playable audio. Our app needs audio for every visitor, so the
  music would simply be missing for anyone who is not signed in with a paid
  account.

## 3. Using Spotify music with video, or as a product soundtrack

This is the part that stops us.

- Spotify music **in a video** (a "sync" use) is a separate commercial
  licensing conversation with the rights holders. The Spotify Developer Terms
  do not grant the right to synchronise Spotify audio with a video, to embed
  it in a product, or to use Spotify as the background-music catalogue of an
  app.
- The terms also restrict **caching, recording, ripping and redistributing**
  streams. We may not download a Spotify track, store it, or hand it to the
  video player.
- The **music choice belongs to the user**, not to the product. A product that
  silently swaps the track when the context changes fights the listener's
  own queue, and the SDK is not designed to do it well.
- The **Watermark / attribution** rules mean the UI must show Spotify
  branding and playback attribution. A travel video with a Spotify logo over
  the soundtrack is a product decision, not a technical detail.
- **Commercial use** of the Web Playback SDK in a product that is not
  monetised in a Spotify-approved way needs written approval. We do not have
  that.

**Conclusion for the video-sync use case:** Spotify cannot be the soundtrack
engine of a Glassnik video. Even with Premium accounts and OAuth in place,
the sync and commercial rights are missing.

## 4. What we do instead

- The player is built around a small interface (`AudioEngineLike`) so the
  source of the audio can change without rewriting the app.
- The prototype uses **local files** in `public/audio/`, produced and
  documented by our own pipeline, so there is no account, no token, no
  network call and no third-party player.
- The music choice is made by our own recommender from documented metadata
  (place type, category, mood, energy), which is exactly what Spotify's
  catalogue API could not do for us anyway.
- If we ever want to *add* Spotify as an extra, the honest way is a clearly
  separate "Play from your Spotify account" button that hands playback to the
  user's own Spotify session — not the product's soundtrack.

## 5. If someone still wants to try it

Minimum work before writing any code:

1. Register an application in the Spotify developer dashboard and get the
   client id.
2. Decide who signs in. Without a signed-in Premium user there is **no
   audio**, so this decision blocks everything else.
3. Implement the OAuth redirect and refresh flow, and keep the secrets out
   of the repository.
4. Read the Web Playback SDK terms and check whether our use case (music
   that continues in the background, follows the video, and changes by
   itself) is allowed at all.
5. Get written confirmation for the commercial, monetised and video-sync
   scenario before shipping anything.

## Verification checklist

- [ ] Review the current Spotify Developer Terms and Web Playback SDK
      requirements.
- [ ] Confirm that every user needs a Premium account and that we are
      willing to require that.
- [ ] Confirm whether anonymous visitors may receive audio at all.
- [ ] Obtain written confirmation for any synchronisation, commercial
      display or monetisation scenario.
- [ ] Document the technical restrictions and keep the local-file provider as
      the fallback for prototype testing.
