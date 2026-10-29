# Glassnik Music Prototype

A small app to show how music can follow Glassnik's Eye-POV Experiences. You can pick sample Experiences, upload your own video clips, or look at the data. Glassnik organises its videos by Categories, Places and Locations - the music follows those, not the word "trip". When music is playing, it moves to the next song by itself when a track ends. It won't play the same song twice in a row.

Open it in your browser at **http://localhost:5173/** when the dev server is running.

## What it does

- **Plays music for each Experience.** All clips of one Experience share the same music. If you step from clip to clip, the song keeps playing without restarting.
- **Picks music for you.** It looks at the place, category, mood and energy of your Experience and picks a track that fits. It always shows you why it picked that track.
- **Moves on by itself.** When a track ends, it picks the next one and keeps playing. If a file is broken, it skips it. It never repeats the same song back to back.
- **Works with your own videos.** Upload video clips from your computer. They stay in your browser — nothing gets sent to a server. You can change the Experience's place or category and the music will change too.
- **No track names in the viewer.** The player bar shows only music controls, never track or artist names — the video is the focus, not the music.
- **Music credits live on their own page.** The **Music credits** tab lists every track in the library, what is playing now, and the honest licence status.
- **A three-option music menu.** The bar's music source menu mirrors the planned Glassnik menu: **Glassnik Music**, **Spotify** (a future integration — visible but switched off) and **No Music**.
- **Comes with sample Experiences.** There are 15 sample Eye-POV Experiences, including a five-video walk through a shopping area.
- **Shows you the details.** The Diagnostics tab shows which tracks are loaded, whether their files exist, and whether any sources have been checked.
- **Saves your settings.** It remembers if music is on or off and how loud it is.

## Getting started

You need Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/) in your browser.

To build it:

```bash
npm run build
npm run preview
```

## Audio files

The repository contains the application, catalogue, metadata, tests and documentation. The MP3 demo files are deliberately not committed because their redistribution/licensing status has not yet been independently verified.

To run the audio demo, place the approved MP3 files locally in `public/audio/` using the filenames referenced by the catalogue. Do not redistribute or publish any track unless its licence and attribution requirements have been checked and approved. The local `public/audio/*.mp3` files are excluded by `.gitignore`.

The catalogue currently describes 59 tracks. A catalogue entry does not itself prove that a track is cleared for production use. The licence review records the status of each source; review and verify each track before any production deployment.

## How to use it

1. Go to the **Video & experiences** tab.
2. Upload two or more video clips, or use the sample Experiences on the **Sample experiences** tab.
3. Press **Play** in the player bar at the bottom.
4. Move between clips with **Next clip** or **Previous clip**. The music should stay the same for clips in the same Experience.
5. Change the category or place type for your Experience to see the music selection change.
6. Let a track finish to test automatic progression.

## Tests

```bash
npm test
npm run build
npm run verify:audio
```

The audio verification command requires the local MP3 files. For browser testing, run `npm run dev` in one terminal and `npm run check:browser` in another.

## Notes

- **No scraping.** The prototype does not scrape Pixabay or bulk-download music.
- **No Spotify playback integration.** Spotify is shown as a future option only; see `docs/spotify-feasibility.md`.
- **Uploaded videos stay local.** The prototype keeps user-selected videos in the browser.
- **One music player.** The app uses one audio element so playback can continue smoothly between clips.

## Project documentation

- `docs/licensing-and-sourcing.md` — licensing policy, source evidence and track review process.
- `docs/platform-compatibility.md` — browser compatibility notes and mobile work items.
- `docs/integration-guide.md` — Glassnik metadata integration and Category / Place / Location grouping.
- `docs/library-expansion-plan.md` — plan for expanding the music library.
- `docs/playback-architecture.md` — playback design.
- `docs/spotify-feasibility.md` — Spotify feasibility notes.
