# Demo script — recording the live walkthrough (prepared 9 November 2026)

This script turns the checklist's live-demo items (A2, C1–C6) into a
mechanical 12–15 minute screen recording. The automated battery already
proves the same behaviours headlessly on Chromium and WebKit (67/67); the
recording is the human-witnessed version. Nothing here claims a track is
licensed — production mode is empty by design until the licence pass is
signed.

## Before you press record

1. Open Terminal in the project folder and run `npm install` (first time
   only), then `npm run dev`.
2. Open http://localhost:5173 in Chrome. Use a clean window (no other tabs,
   bookmarks bar hidden, notifications off).
3. Set the browser window to about 1440×900 and the system volume to a
   comfortable level (the app starts at 42%).
4. In the app: Music menu = **Glassnik Music**, volume ≈ 42, trip context =
   the default Kuala Lumpur / shopping sequence. Reload once so the recording
   starts from a clean state.
5. Check the player status reads **Ready — press Play to start** and nothing
   is playing. If music starts by itself, stop and report it — that would be
   a bug.
6. Start the screen recorder (QuickTime: File → New Screen Recording, or
   macOS ⌘⇧5). Record the whole browser window, not the desktop.

## Shot list

| # | Time | Do this | What should be on screen | Say (short) |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:30 | Show the app window, do not click Play yet. | Header "Glassnik", viewer bar status "Ready — press Play to start", no sound. | "This is the music prototype. It starts silent — the browser will not let audio play before a click, and the app respects that." |
| 2 | 0:30–1:00 | Click **▶ Play**. | Status "Playing"; the track's waveform/timer moves (viewer shows no track name). | "One click starts the music. From here the app owns playback." |
| 3 | 1:00–2:30 | In the Video tab, click **Next clip** several times through the Kuala Lumpur sequence. | Same song keeps playing; status stays "Playing"; no restart between clips. | "Within one Experience sequence the soundtrack continues — it does not restart on every clip." |
| 4 | 2:30–3:15 | Open **Music credits**, point at the highlighted current track. | Credits page lists all 59 tracks with titles and creators; the current one is marked. | "Track names live here, not in the viewer — a deliberate product rule." |
| 5 | 3:15–4:15 | Back to Video; change the trip context (e.g. category from shopping to beaches). | Exactly one song change; status stays "Playing". | "A real context change changes the music once — not once per render." |
| 6 | 4:15–6:15 | Open **Experiences**; set grouping = **Location: Tokyo**; press Play if needed; open two or three different Experiences inside the grouping. | The same song continues across every Experience in the grouping. | "One grouping, one soundtrack — opening another Experience inside it does not restart the music." |
| 7 | 6:15–7:15 | Switch grouping to **Location: Lisbon**, then to **Category: Shopping**. | One song change per grouping switch. | "Switching the grouping is a new music decision — one change each time." |
| 8 | 7:15–8:15 | Upload a short video of your own in the Video tab (any small mp4). Upload a second one. | The recommendation updates to the uploaded clips' context; music continues or changes once. | "Uploads work like real Glassnik clips — the same metadata path drives the decision." |
| 9 | 8:15–9:15 | Drag the volume slider to ~66; switch Music menu to **No Music**; wait two seconds; switch back to **Glassnik Music**. | Music pauses on No Music and resumes on Glassnik Music; volume stays at the new level. | "The menu is a real mute-and-resume, and the volume is remembered." |
| 10 | 9:15–10:15 | Reload the page (⌘R). Do not click Play for a moment. | Nothing autoplays; status "Ready — press Play"; volume slider still 66; menu still Glassnik Music. | "A reload never autoplays — the gesture gate holds — and the preferences survive." |
| 11 | 10:15–10:45 | Click **▶ Play** again, then click **Next track** once. | Music resumes; next track starts automatically. | "After reload, one click brings it back; Next track moves on." |
| 12 | 10:45–11:30 | Let the current track play to its end (or skip to a short one and wait). | The next track starts by itself; status stays "Playing". | "When a song ends, the next recommended song starts without input." |
| 13 | 11:30–12:30 | Open **Diagnostics**; point at library size, unique checksums, confirmed source URLs, production-mode count. | 59 files, 59 unique checksums, 0 confirmed source URLs, 0 eligible in production mode. | "The app tells the truth: the library is complete, but no track has been licence-verified, so production mode plays nothing." |
| 14 | 12:30–13:00 | Stop recording. | — | "That is the full walkthrough." |

## After recording

- Save as `Glassnik_Music_Walkthrough_<date>.mov` (or mp4) outside the repo,
  and note the date and duration in `TODAY.txt`.
- The file is evidence for the human-witnessed demo items; it does not
  change any licence register row.
- If any step misbehaves, stop, note the exact step and the timecode, and
  report it — do not re-record over a failure without keeping the note.

## What this recording deliberately does not show

- **Spotify**: the menu slot is reserved, not connected.
- **Real Glassnik videos**: the prototype uses a faithful sample dataset;
  the integration point is documented in `docs/integration-guide.md`.
- **Licence verification**: the credits page names creators, but every row
  in `data/licence-review.csv` is still unverified. Production mode is empty
  until a human completes the 59-row pass (quick guide in
  `docs/licensing-and-sourcing.md`).
- **Failed-network recovery**: covered by the automated battery (blocked
  audio → clear error state → recovery), not practical to stage live.
