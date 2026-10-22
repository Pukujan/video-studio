# jubaku — full-song cut

Builds the 248 s 呪縛 (JUBAKU) music video from the clip library in the octo
`music-video` workspace. The creative spec is the workspace's `story_bible.md`;
the Flow runbook is `../FLOW.md`.

## Inputs

| env var | default | what |
|---|---|---|
| `JUB_CLIPS` | `../video` | directory of source `.mp4` clips |
| `JUB_SONG` | `../audio/track.mp3` | the song |
| `JUB_WORK` | `../../tmp/shots` | scratch dir for normalised shots |
| `JUB_OUT` | `../../exports_full` | output dir |

Point them at the local mirror:

```powershell
$env:JUB_CLIPS = "C:\Users\pujan\octo-mv\jubaku\video"
$env:JUB_SONG  = "C:\Users\pujan\octo-mv\jubaku\audio\track.mp3"
```

## Run

```powershell
python build_full.py                     # plan_full.json — 282 shots
python render_full.py out.mp4            # full song
python render_full.py out.mp4 intro build  # only those sections
```

`build_full.py` re-probes every clip's duration with ffprobe, so `plan_full.json`
is regenerated, not trusted. `render_full.py` trims each shot to a normalised
1280×720/30 fps temp clip before concatenating — one filtergraph for 282 shots
is not viable.

## Notes

- Every cut lands on the 144 BPM grid (beat 0.4167 s, anchor 62.183 s).
- The approved chorus render is spliced in verbatim, not re-cut.
- Eleven source clips have content-hash filenames; the name map lives in
  `../FLOW.md` §11.
