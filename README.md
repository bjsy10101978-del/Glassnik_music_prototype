# Glassnik Music Prototype

A small app to show how music can follow Glassnik's Eye-POV Experiences. You can pick sample Experiences, upload your own video clips, or look at the data. Glassnik organises its videos by Categories, Places and Locations - the music follows those, not the word "trip". When music is playing, it moves to the next song by itself when a track ends. It won't play the same song twice in a row.

Open it in your browser at **http://localhost:5173/** when the dev server is running.

## What it does

- **Plays music for each Experience.** All clips of one Experience share the same music. If you step from clip to clip, the song keeps playing without restarting.
- **Picks music for you.** It looks at the place, category, mood and energy of your Experience and picks a track that fits. It always shows you why it picked that track.
- **Moves on by itself.** When a track ends, it picks the next one and keeps playing. If a file is broken, it skips it. It never repeats the same song back to back.
- **Works with your own videos.** Upload video clips from your computer. They stay in your browser — nothing gets sent to a server. You can change the Experience's place or category and the music will change too.
- **No track names in the viewer.** The player bar shows only music controls, never track or artist names — the video is the focus, not the music.
- **Music credits live on their own page.** The **Music credits** tab lists every track in the library, what is playing now, and the honest licence status. This is where any licence-required attribution will go once the licences are verified.
- **A three-option music menu.** The bar's music source menu already mirrors the planned Glassnik menu: **Glassnik Music**, **Spotify** (a future integration — visible but switched off) and **No Music**.
- **Comes with sample Experiences.** There are 15 sample Eye-POV Experiences, including a five-video walk through a shopping area.
- **Shows you the details.** The Diagnostics tab shows which tracks are loaded, whether their files exist, how many are different, and whether any sources have been checked.
- **Saves your settings.** It remembers if music is on or off and how loud it is.

## Getting started

You need Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/) in your browser.

To build it for real:

```bash
npm run build
npm run preview
```

## How to use it

1. Go to the **Video & experiences** tab (this is the first tab).
2. Upload two or more video clips, or use the sample Experiences on the **Sample experiences** tab.
3. Press **Play** in the player bar at the bottom.
4. Move between clips with **Next clip** or **Previous clip**. The music stays the same.
5. Change the category or place type for your Experience to hear the music change.
6. Let a track finish — it will move to the next track by itself.

## The music library

- There are **59** tracks and **59** audio files. All of them are different from each other, and all of them are real music.
- **55** are full recordings from a local pool of human-sourced files (`assets/audio-pool/`, 59 files scanned with none skipped).
- **4** are real excerpts cut from those recordings locally.
- There are **no** generated placeholder songs any more.
- All **59** tracks are marked as production-approved in the pool-backed convention, but none of the licences have been checked by a human yet.
- Four pool files were byte-identical duplicates of other pool files, so the library uses them as the source of the four excerpts instead of as extra full copies.
- EVERY one of the 21 upload categories now has its own disjoint pool: **6** shopping, **3** markets, **3** beaches, **4** walking, **3** cafes, **4** waterfronts, **2** museums, **3** parks, **3** nightlife, **3** dining, **2** cycling, **2** hiking, **2** road trips, **2** nature, **3** architecture, **2** family, **1** adventure, **2** festivals, **2** wellness, **1** historic sites, **1** rainy day - plus **5** versatile general songs for Experiences without a category. No song is ever shared between two pools. (Several of these were not new downloads: five of the team's Pixabay picks turned out to be recordings the library already held, so those tracks moved instead of being copied; museums dropped to 2 and owes one song to return to its 3-4 range.)
- The player remembers the last **15** songs it played and rotates the pool instead of repeating one track.
- You can run `npm run verify:audio` to check that all files are real MP3s, different from each other, and matched by the catalogue.

## Tests

```bash
npm test           # run all unit tests
npm run verify:audio  # check the audio files
npm run build      # check the code and build the app
```

There is also a browser test that opens the app in a real browser:

```bash
npm run dev        # in one terminal
npm run check:browser  # in another terminal
```

## Notes

- **No scraping.** Pixabay has no music API, so this app doesn't scrape anything.
- **No Spotify.** Spotify needs a paid account, can't be used anonymously, and you can't use Spotify music as a video soundtrack without extra rights. See `docs/spotify-feasibility.md` for more details.
- **Your files stay local.** Uploaded videos never leave your computer.
- **Only one music player.** The app uses one audio element so playback stays smooth and doesn't restart by mistake.

## Where to read more

- `docs/licensing-and-sourcing.md` — the full licensing policy, the captured Pixabay/Mixkit licence terms (dated), the evidence convention and `data/licence-review.csv` (59 rows, all verification columns still `UNKNOWN`).
- `docs/platform-compatibility.md` — what is verified on which browser engine (Chromium + Safari engine), and the work items for the Android and iPhone apps.
- `docs/integration-guide.md` — how this connects to real Glassnik metadata, the Category / Place / Location grouping rule, and direct answers about the architecture.
- `docs/library-expansion-plan.md` — the plan to reach ~100 verified tracks across the 21 categories, starting with the six that have no dedicated pool.
