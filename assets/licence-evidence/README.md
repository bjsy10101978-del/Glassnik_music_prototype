# Licence evidence folder

This folder holds the evidence for rights verification, one sub-folder per
track, named after the row it evidences:

```
assets/licence-evidence/glassnik-001/
  item-page.pdf      <- provider's item page for this recording (saved/screenshot)
  licence-page.pdf   <- the licence text or summary that applied
  record.md          <- verified-by, date, URLs, per-column answers, correspondence
  certificate.pdf    <- ONLY when the page shows the Content ID shield icon
                        (Pixabay's "Download certificate" receipt)
```

For tracks without the shield icon there is no certificate — Pixabay's FAQ
(captured 28 October 2026) names the official proof instead: "keep the
download link, file name, and the Pixabay Content License summary". That is
exactly the three basic files above. Excerpt rows (glassnik-056…059) may
simply point `record.md` at their parent recording's folder. The downloads
were made without a Pixabay account, so the macOS "downloaded from" stamp
on each original file is part of the evidence too — the decoded stamps for
all 59 recordings are kept in `download-stamps.md` in this folder (and in
`data/download-stamps.json`).

Until a `glassnik-NNN` folder exists with all three files, that row in
`data/licence-review.csv` stays `UNKNOWN`/`UNVERIFIED`. The convention is
described in `docs/licensing-and-sourcing.md` ("Evidence retention").

Currently this folder contains **no** evidence sub-folders: no licence has
been verified by a human yet. That is deliberate — nothing here may be
guessed or fabricated.
