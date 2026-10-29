# FLOW.md — Google Flow (Veo) runbook

Verified 2026-10-22 against `flow.google.com` on the durable Chrome profile.
Everything here was observed live, not inferred. Read this before touching Flow.

## TL;DR for an agent starting fresh

```powershell
.\scripts\chrome-cdp.ps1                 # durable signed-in Chrome
node scripts\flow-probe.js               # read-only: home + project + composer dump
node scripts\flow-settings.js 16:9 x1 "Veo 3.1 - Fast"
node scripts\flow-gen.js "<prompt>"      # fills composer, clicks generate
node scripts\flow-grab.js output/flow/clip.mp4   # download newest tile at 720p
```

The Approve step is manual-ish: after `flow-gen.js`, the agent asks
`"Would you like me to kick off this 1 video generation, costing 20 credits?"`
and you click `Approve` (a radio, not a button — see §5).

Budget: **20 credits per clip, 50 credits/day** on this account. That is **2 clips
per day**. Plan generations accordingly — never fire a batch expecting more.

## 1. Session

- URL: `https://flow.google.com/` (the old `labs.google/fx/tools/flow` redirects here).
- Reachable only on the signed-in real profile. Attach with
  `chromium.connectOverCDP('http://127.0.0.1:9222')` via `scripts/cdp.js`.
- **Port caveat:** `CLAUDE.md` says 9223 is the signed-in session and 9222 is a
  dead throwaway. On 2026-10-22 the live signed-in session was on **9222** and
  9223 was closed. Check both before concluding you have no session:

```bash
curl -s --max-time 5 http://127.0.0.1:9222/json/version
curl -s --max-time 5 http://127.0.0.1:9223/json/version
```

- Account: PRO tier, banner reads "Your Google AI plan now comes with 50
  additional Flow credits daily."

## 2. Navigation

- Home `https://flow.google.com/` shows a "New project" button (`add | New project`).
- Clicking it creates a project and routes to
  `https://flow.google.com/project/<uuid>`.
- Project page is a **chat/agent** interface, not a timeline. Left rail:
  `All media`, `Characters`, `Scenes`, `Library`, `Tools`, `Trash`.
- There is a composer at the bottom and a **settings panel** behind the `tune`
  icon. The project page is an Angular app (`flow-*` custom elements).

## 3. Composer DOM (stable selectors)

```
flow-base-prompt-box
  flow-rich-text-editor.prompt-input
    div.prosemirror-editor
      div.ProseMirror[contenteditable=true][role=textbox]
        aria-label = "What do you want to create?"
```

Buttons inside `flow-base-prompt-box`:

| aria-label | glyph | what it does |
|---|---|---|
| `Add ingredients to the prompt box` | `add` | attach image/video/frame references |
| `Settings trigger` | — | opens the agent settings panel (same as `tune`) |
| `Agent instructions` | `article_spark` | system-prompt for the project agent |
| `Settings` | `tune` | same panel as Settings trigger |
| `Start generation` | `arrow_forward` | submits; disabled while the editor is empty |

Typing: focus the `.ProseMirror` div, then `keyboard.insertText(prompt)`.
`keyboard.type()` is slow and mangles punctuation; `insertText` is correct.

## 4. Settings panel

Opened by the `tune` / `Settings trigger` button. Element: `flow-settings-view`.

Three `.settings-section` blocks, **in this order**:

| idx | section | controls |
|---|---|---|
| 0 | Confirm before generating | `Always` / `Never` |
| 1 | Image generation default | 16:9, 4:3, 1:1, 3:4, 9:16 · x1–x4 · model |
| 2 | Video generation default | **16:9, 9:16 only** · x1–x4 · model |

- Ratio and variant controls are `button[role="radio"]` inside a toggle group.
  Index order in section 2: `0=16:9, 1=9:16, 2=x1, 3=x2, 4=x3, 5=x4`.
- Model picker: `button[aria-label="Video generation default model"]`, opens a
  menu of `role="menuitem"`.
- Must click **Save** at the bottom; changes are not live until saved.

**Video models available on this account (2026-10-22):**

| model | note |
|---|---|
| `Omni 1.1 Flash` | default |
| `Veo 3.1 - Lite` | cheapest, lowest fidelity |
| `Veo 3.1 - Fast` | **use this** — best quality/time balance |
| `Veo 3.1 - Quality` | slowest, most expensive |

Image models include `🍌 Nano Banana 2.1`.

## 5. Generating

1. Fill the composer.
2. Click `flow-generate-icon-button button` (aria `Start generation`).
3. The agent replies with a **permission prompt**:
   `"Would you like me to kick off this 1 video generation, costing 20 credits?"`
   with three options: `Approve`, `Always approve`, `Reject`.
4. **These are not buttons.** They are `div[role="radio"].option-row` inside a
   `flow-permission-message`. `getByRole('button', {name:'Approve'})` times out.
   Click by text instead:

```js
await page.getByText('Approve', { exact: true }).last().click();
```

   `Always approve` flips the setting to `Never` confirm — do not use it if you
   want to review each spend.
5. After approval the agent says it started generating and the job **queues**
   ("currently in the queue due to high demand"). Video generation is
   asynchronous and takes minutes; there is no progress bar in the DOM.
6. When done, a `flow-video-tile` element appears in the chat containing an
   `<img class="thumbnail">` from `flow-content.google`. **The `<video>` element
   is not in the DOM until you click the tile**, which routes to
   `/project/<id>/edit/<sceneId>` and mounts a real player.

**Measured timing (2026-10-22, Veo 3.1 Fast, PRO):** queued at 03:21:59 UTC,
tile present by 03:37 — roughly **15 minutes**, most of it queue. Do not poll
tightly; check back on the order of minutes.

## 6. Downloading

Click the tile, then `button[aria-label="Download media"]`, which opens a menu:

| option | note |
|---|---|
| `270p | Animated GIF` | tiny, for previews |
| `720p | Original size` | **use this** — matches the source render |
| `1080p | Upscaled` | interpolation, no new detail |
| `4K | Upscaled` | interpolation, no new detail |

Clicking an option fires a normal browser `download` event — capture it with
`page.waitForEvent('download')` and `download.saveAs()`. `scripts/flow-grab.js`
does the whole sequence.

**Verified output of one 20-credit generation (2026-10-22):**

| property | value |
|---|---|
| duration | **8.000 s** |
| resolution | 1280×720 |
| frame rate | 24 fps |
| codecs | h264 video + aac audio |
| size | 3.9 MB at 720p |

Note the frame rate: Flow renders **24 fps** while the existing JUBAKU clips are
also 24 fps, so they intercut cleanly. The render pipeline outputs 30 fps, so
Flow clips get conformed on ingest.

An 8 s clip covers roughly **19 beats** at 144 BPM — about 4.8 bars. Plan shot
lengths around that: one generation can supply a 4-bar shot with handles, but
not a 8-bar one.

## 7. Cost model

- **20 credits per generated clip.**
- **50 credits/day** on PRO → **2 clips/day**, 10 credits left over.
- Aspect ratio and variant count do not change the per-clip price shown.
- There is no cheap "preview" tier in the agent flow. Budget by clip count.
- The agent confirms the exact price in the permission prompt — read it rather
  than assuming.

## 8. Prompt patterns that match this project

Flow's agent takes plain language. These are the JUBAKU-verified phrasings.

**Live-action performance (LA — the anchor style):**

```
Photoreal cinematic 16:9 shot: a pale young man with long silver-white hair,
black high-collared coat with crimson lining, standing alone in a flat crimson
room. Symmetric framing, cold hard key light, subtle film grain, no text, no
logos. He looks directly into the lens and sings.
```

**Rules that keep shots on-style:**
- Open with `Photoreal cinematic 16:9 shot:` — it steers away from illustration.
- Name the **flat one-colour room** explicitly; the style system depends on it.
- Say `no text, no logos` — otherwise Flow adds captions and watermarks.
- Put the **camera/framing** clause before the action clause.
- For singing shots, say `looks directly into the lens and sings` — mouth
  movement is the thing that reads as performance.
- For the Nous girl, describe the **blue-lit room** and hair-tendrils; that is
  the shot that matches the existing clip set.
- Villains are brand *motifs* as shapes and colours (whale, knot, star,
  crescent, cube, lattice, sailboat, void) — never literal trademarks.

**References:** `Add ingredients to the prompt box` accepts an existing image or
video as a frame reference. This is how you keep a character consistent across
shots — attach the approved still, then describe only the change.

## 9. Failure modes seen

| symptom | cause | fix |
|---|---|---|
| `flow-base-prompt-box` resolves but is **hidden** | stale page after navigation | `page.reload()` then wait ~9 s |
| `Start generation` stays disabled | editor is empty | click the `.ProseMirror` div first |
| `getByRole('button', {name:'Approve'})` times out | Approve is a radio, not a button | `getByText('Approve', {exact:true}).last().click()` |
| Prompt text has wrong characters | used `keyboard.type()` | use `keyboard.insertText()` |
| `getByLabel('Download media')` blocked by a backdrop | the menu is already open | click the item inside `.cdk-overlay-pane` instead |
| no `<video>` in the DOM after generation | the tile only holds a thumbnail | click the `flow-video-tile` to open it |
| Project page shows zero-state greeting | project has no generations yet | normal; just fill the composer |

## 10. Scripts

| script | purpose |
|---|---|
| `scripts/flow-probe.js` | read-only dump of home + a new project + composer |
| `scripts/flow-probe-composer.js` | opens Settings, reports the control set |
| `scripts/flow-probe-toolbar.js` | dumps the composer's button tree |
| `scripts/flow-probe-models.js` | lists the model menu options |
| `scripts/flow-settings.js` | sets ratio / variants / model and saves |
| `scripts/flow-gen.js` | fills the composer and clicks generate (`--dry` to stop short) |
| `scripts/flow-grab.js` | downloads the newest tile at 720p (or `--res 1080p`) |

All take an optional port as the first arg (default `9222` via `CDP_PORT`).
All are safe to re-run; none of them spend credits except `flow-gen.js` without
`--dry`, and even then only after you click Approve.

## 11. Building the JUBAKU music video

The full 248 s cut is assembled from clips that already exist. Flow is only
needed for shots the clip library does not cover.

**Source material (local mirror, `C:\Users\pujan\octo-mv\`):**

| path | what |
|---|---|
| `jubaku/audio/track.mp3` | the song, 248.48 s |
| `jubaku/video/*.mp4` | 30 clips, 1280×720 @ 24 fps |
| `jubaku/other/plan_v2b.json` | the approved chorus-1 cut, 37 shots |
| `jubaku/story/story_bible.md` | authoritative creative spec |
| `jubaku/beatmap/vocal_phrases.json` | vocal phrase + onset times |

**Clip-name resolution.** Eleven clips are content-hash filenames with no
logical name in the DB. Identified from contact sheets on 2026-10-22:

| plan name | hash prefix | what it shows |
|---|---|---|
| `grok_eyes` | `093e4fbb` | black latex figure, grinning void head (26.8 s) |
| `castle` | `0c1d460d` | Builder in a gothic cathedral, red halo |
| `knot_green` | `15d2aebc` | white knot-mask figure in a mint-green room |
| `boardroom` | `3192ccd4` | Builder at a red table with faceless execs |
| `ritual` | `3b462469` | empty red cathedral aisle |
| `builder_walk` | `b663d05f` | Builder walking through a subway station |
| `claude` | `79f6c02d` | sunburst-headed robed figure |
| `ritual2` | `c1f78e21` | Builder holding two red light-tendrils |
| `nous_neck` | `c3c29b63` | Nous girl, blue light, second face on her neck |
| `schoolroom` | `269a85fa` | Builder in a yellow room, bloodied school desks |
| `grok_void` | `281e6e2b` | black latex figure, single wide grin (white room) |

Named-clip aliases used by the plan:
`nous_btb`→`nous_backtoback`, `nous_turn`→`nous_headturn`,
`nous_hermes`→`nous_hermes_caduceus`, `headbang`→`builder_headbang`.

**Build and render:**

```powershell
$env:JUB_CLIPS = "C:\Users\pujan\octo-mv\jubaku\video"
$env:JUB_SONG  = "C:\Users\pujan\octo-mv\jubaku\audio\track.mp3"
$env:JUB_WORK  = "C:\Users\pujan\octo-mv\tmp\shots"
$env:JUB_OUT   = "C:\Users\pujan\octo-mv\exports_full"

python jubaku\build_full.py                       # writes plan_full.json
python jubaku\render_full.py <out.mp4>            # full song
python jubaku\render_full.py <out.mp4> intro build # subset by section name
```

`render_full.py` trims each shot to a normalised temp clip first, then concats
and muxes the song — a 282-shot timeline in one filtergraph is not viable.

**Verified output (2026-10-22):** 248.03 s video + 248.06 s audio, 1280×720,
30 fps, h264/aac, 196 MB. Audio-vs-song envelope correlation **0.9990** at an
offset of exactly **0.418 s** (the first downbeat), i.e. the cut is frame-locked
to the grid.

**The approved chorus.** `jubaku_test_v2_720p.mp4` is the already-approved
chorus-1 render: 26.80 s, 30 fps, h264+aac, and its audio is the real song
segment — envelope correlation 0.9008 at **58.839 s**. The full-song plan
splices it in verbatim rather than re-cutting those 37 shots.

**Budget reality.** The existing clip library covers every section, so the
full cut costs **zero credits**. Flow is for *new* shots: at 20 credits and 50
credits/day, that is **2 clips per day**. Prioritise the gaps the story bible
flags — Copilot and Perplexity stills, and INK/CEL versions of the cast.

## 12. Reliability kit (Mac, 2026-10-29)

`flow/` holds the maintained driver; `skills/flow-video/SKILL.md` is the procedure. Older
`scripts/flow-*.js` stay for reference (Windows, port 9223 era).

| file | what |
|---|---|
| `flow/lib.mjs` | every selector in `SEL`, plus attach / openProject / newSession / attachImage / submitPrompt / approve / listVideoIds / download |
| `flow/doctor.mjs` | credit-free check that every control still exists |
| `flow/gen.mjs` | one image-to-video generation, logged; `--yes` to approve |
| `flow/grab.mjs` | wait, download new clips, link to ledger rows by first frame, auto-QC |
| `flow/qc.mjs` | start-frame match, jump cuts, sudden jumps, timestamped frame sheet |
| `flow/ledger.mjs` | SQLite ledger (`flow/ledger.db`): stats / list / show / verdict / error |
| `flow/templates.mjs` | prompt templates with the reason each exists |

**New UI facts learned while building it:**

- Flow keeps hidden duplicates of many controls (`Upload media`, `Add to prompt`, `Approve`).
  Text and role lookups must filter to visible elements (`loc()` does this).
- Two visible `Settings` buttons: the top bar's opens grid-view options
  (`flow-tile-view-settings`); only `flow-base-prompt-box button[aria-label="Settings"]` opens
  `flow-settings-view`.
- The asset picker sometimes ignores one Escape; `closeOverlays()` presses until no
  `.cdk-overlay-pane` is visible. Without that, every later click lands on the picker.
- The project page lazily mounts video tiles. `listVideoIds()` scrolls each into view in the
  Videos view; downloading goes straight to `/project/<id>/edit/<editId>`.
- Clicking a tile routes to `/edit/<editId>`; that id is the stable clip key used in the ledger.
- A render can fail with a **Failed** card ("Audio generation failed ... You will be refunded").
  The credits come back; regenerate.
- Coordinate clicks broke twice in one day. The kit has none.

**Quality findings (Veo 3.1 Fast, image-to-video from a previous clip's last frame):**

| template | result |
|---|---|
| `loose-v1` (describe the action) | 1/5 clean: paper popping in/out, hair loose→ponytail, jump cuts to a different close-up, laptop screen morphing |
| `still-relief` (locked camera, nothing appears/disappears, same hair/clothes, small motion) | 3/3 clean so far |

The first frame always matched the start image (difference < 1 on 0-255), so starting from the
previous clip's last frame is a reliable way to keep the same person across shots.
