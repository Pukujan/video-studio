# Precedent demo video

`output/precedent-demo.mp4` — 1920×1080, 30fps, H.264 + AAC, 66.8s.

## Rebuild

```powershell
# 1. Signed-in Chrome must be up (reuses the live session if already running)
.\scripts\chrome-cdp.ps1

# 2. Capture app screens + all 9 slides from the live product
node .\scripts\capture-app.js
node .\scripts\capture-slides-all.js

# 3. Crop scenes to 16:9 with a safe margin for the zoom
python .\scripts\prep-scenes.py

# 4. Narrate each scene (voice, outdir, speed)
node .\scripts\make-voiceover.mjs af_heart output/vo 1.12

# 5. Ken Burns each scene to its narration length, concat, mux voiceover
node .\scripts\assemble-video.mjs
```

## Script (8 scenes, 63.6s of narration)

| # | Source | Line |
|---|--------|------|
| 1 | slide 1 | Every legal answer starts with research. Every research answer has to be checked. Precedent writes the memo, and shows you why it's right. |
| 2 | slide 2 | Multi-agent systems fail four ways. Agents collide. Output goes unverified. Side effects escape. And nothing leaves a trace. Precedent answers all four. |
| 3 | live memo | Ask in plain language. You get a short answer, the authorities behind it, and a caveat when the sources don't support one. |
| 4 | live map | Every citation resolves to a real jurisdiction, pinned on the map — so you can see whether a claim rests on one line of cases, or on many. |
| 5 | observability | Four agents run every question. Planner, retriever, writer, safeguard. Every step traced, timed, and scored in Arize Phoenix. |
| 6 | slide 5 | The safeguard rejects any authority that was never retrieved. Quotes are copied verbatim. Nothing is beyond inspection. |
| 7 | slide 8 | Seven partners, one pipeline. Daytona, SurrealDB, Octo, Arize, ElevenLabs, Anthropic, and ACS. |
| 8 | slide 9 | Precedent. Verified research memos for legal teams. Ask your own question. |

Edit `LINES` in `scripts/make-voiceover.mjs` to change narration; timings flow
through to `assemble-video.mjs` automatically via `output/vo/timings.json`.

## Notes

- Kokoro `af_heart` at speed 1.12 reads ~13% faster than default and lands the
  script at 63.6s. Speed 1.0 gives 73s.
- `prep-scenes.py` scales each image to 1/1.06 of frame size before pasting on a
  `#f7f9fc` canvas. The zoom never exceeds 1.06, so UI text is never cropped.
- Each scene is held 0.4s past the end of its narration.
- Concat list uses absolute paths — relative paths resolve against the list
  file's directory and break.
