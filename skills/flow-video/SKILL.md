---
name: flow-video
description: Generate video clips with Google Flow (Veo) through the user's paid Google AI plan, by driving the signed-in Claude Chromium. Covers the credit-free health check, image-to-video generation with logged prompt templates, waiting, downloading, automatic QC (start-frame match, jump cuts), the mandatory frame-by-frame visual review, and the SQLite ledger that tracks pass rates per prompt template. Use whenever a task needs AI video clips from Flow/Veo, or asks to regenerate, check or download Flow clips.
---

# Flow video generation

Repo: `~/Documents/projects/video-studio` (GitHub `Pukujan/video-studio`). All commands below run
from there. Deep reference for Flow's UI: `FLOW.md`. This file is the procedure.

## 0. Before anything

1. Browser: `~/bin/claude-chrome https://flow.google.com/` (idempotent, port 9222, permanent
   profile). If Flow shows a Google sign-in, ask the user to sign in in that window. Never type
   their password.
   **Account:** the kit only uses the Google account in `FLOW_ACCOUNT` (default
   `needfsw02@gmail.com`, "Chaos"), never the browser's default one. The scripts find that
   account's `/u/<N>/` index themselves, open every Flow page under it, and exit with an error
   (nothing generated or approved) if a page is on another account. Don't open `flow.google.com`
   URLs by hand in scripts; use `gotoFlow()` from `flow/lib.mjs`. Projects belong to one account,
   so a project URL from the other account is replaced by one of the pinned account's own.
2. Health check (no credits): `node flow/doctor.mjs`. It prints the account it is on and fails if
   that is not the pinned one. Every line must be ✓. A ✗ names the control
   that moved and saves a screenshot under `output/flow/failures/`. Fix the selector in `SEL` in
   `flow/lib.mjs` (one place) and re-run before spending anything.
3. Spending: every generation costs credits (2026-11-11: Flow asks 24 for 8 s and 30 for 10 s with
   Omni 1.2 Flash; `gen.mjs` refuses anything above `--max-credits`, default 30). Get the user's OK
   for the batch and its total before running `gen.mjs --yes`.
   `gen.mjs` without `--yes` stops at Flow's price prompt and approves nothing.

## 1. Generate

Use a template from `flow/templates.mjs`; check which one wins first:

```bash
node flow/ledger.mjs stats
node flow/gen.mjs --image path/start.jpg --label mom --template still-relief \
  --vars '{"action":"She looks at the phone and her worried face relaxes into a smile.","keep":"She keeps holding the same phone."}' --yes
```

- One session per clip (the script does this) so the agent never mixes up references.
- For continuity with an earlier shot, use that shot's **last frame** as `--image`.
- Prompt rules that raised the clean rate from 1/5 to 3/3 on 2026-10-29:
  locked-off static camera; one continuous shot, no cuts or zoom; same person, face, hairstyle and
  clothing; "nothing appears, disappears, moves on its own or changes shape"; small motions only;
  name any held object that must stay put. Big actions (picking up paper, cleaning a filter) are
  where Veo invents objects and jump-cuts.
- New idea for a prompt? Add a new template with a comment saying why. Don't edit an old one, or
  its ledger history stops meaning anything.

## 2. Wait and download

```bash
node flow/grab.mjs --wait
```

Waits for renders (~15 min, mostly queue), downloads every clip not yet in the ledger at 720p into
`output/flow/<edit id>.mp4`, links each to its ledger row by matching the first frame to the start
image, and runs automatic QC. It prints any Flow **Failed** cards. "Audio generation failed ... You
will be refunded" is Flow's fault: mark it with `node flow/ledger.mjs error <id> "msg"` (not counted
against the prompt) and run `gen.mjs` again.

## 3. QC: automatic, then visual (both required)

Automatic (`flow/qc.mjs`, run by grab):
- `first_frame` < 8 means the clip really starts on the start image (same person and room).
- `cuts`: ffmpeg scene changes, i.e. jump cuts inside what should be one shot.
- `jumps`: sudden frame-to-frame changes that scdet misses.

Automatic QC passing is **not** enough. It missed a paper appearing from nowhere, a hairstyle
change and a laptop screen morphing. Open every `<edit id>.sheet.jpg` (16 frames, 0.5 s apart,
timestamped) and check:

1. Does any object appear, disappear, duplicate or change shape?
2. Does hair, clothing, jewellery or the face change?
3. Does the camera jump, zoom or cut?
4. Do hands or held objects merge, teleport or change?
5. Does the clip stay usable for the length you need (often only the first N seconds are used)?

When unsure about a moment, make a 4 fps sheet of that range:
`ffmpeg -ss 2 -t 4 -i clip.mp4 -vf "fps=4,scale=320:-1,tile=4x4" -frames:v 1 zoom.jpg`.

Record every verdict, with timestamps for failures, so the pass rates stay true:

```bash
node flow/ledger.mjs verdict <id> pass "clean"
node flow/ledger.mjs verdict <id> fail "paper appears at 3.3s, vanishes at 6.2s"
```

## 4. Hand off

Copy passing clips to the project that needs them. Tell the user the per-clip verdicts, the credits
spent (`node flow/ledger.mjs stats`), and anything regenerated.

## 5. Mirror to Octo (shared record)

After a batch, copy the ledger and clips into the user's Octo workspace "Music video" so other
machines and agents see the same pass rates and can fetch the files:

```bash
node flow/octo.mjs push                       # ledger -> table flow_gens, new clips -> files
node flow/octo.mjs upload out/video.mp4 "note"   # any finished video
node flow/octo.mjs stats                      # pass rates read back from Octo
```

Keys are `octo_db_music_video` and `octo_db_music_video_workspace` in `~/Documents/projects/.env`;
never print them. The script only touches the tables `flow_gens` and `flow_files`. That workspace
also holds the user's music-video project tables (`projects`, `prompts`, `assets`, `shots`...):
read them if useful, but don't change them without asking. Files stay private; making a public
link (`POST /api/files/<id>/publish`) needs the user's OK each time.

## Regression without burning credits

Don't run test suites against Flow; each run costs real credits. Instead:
- `doctor.mjs` is the regression test for the UI. Run it before every batch.
- The ledger is the regression record for prompts: every real generation is checked and logged, so
  `stats` shows each template's pass rate building up for free.
