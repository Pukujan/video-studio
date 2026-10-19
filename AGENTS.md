# AGENTS.md — how to drive this repo

This repo turns a brief into a finished narrated video with zero manual steps.
Two capabilities, one durable session:

1. **Browser automation against the real signed-in Chrome** (Google Drive
   uploads, screen capture of live web apps, any logged-in flow).
2. **Video assembly**: screenshot scenes + Kokoro voiceover + ffmpeg, or
   deterministic HTML motion graphics.

Read this file top to bottom before doing anything. Every command here has been
run successfully on this machine; the Gotchas section lists exactly what breaks
if you skip steps.

---

## 0. One-time environment facts

| Thing | Value |
|---|---|
| ffmpeg / ffprobe | `C:\Users\pujan\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe` (override with `FFMPEG` env var) |
| Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` |
| Real Chrome profile | `%LOCALAPPDATA%\Google\Chrome\User Data`, profile `Default`, signed in as pujan3645@gmail.com, cookies valid to 2027-11-05 |
| CDP port | `9223` (9222 is a dead throwaway — do not use) |
| Node deps | `npm install` (kokoro-js, playwright-core) |
| Python deps | Pillow (system python) |

`.env` contains a Wan AccessKey — never print it, never commit it.

---

## 1. The durable browser (read this before ANY browser work)

**Never launch a fresh browser for a signed-in flow.** The signed-in session is
Chrome on the real profile with remote debugging. Ensure it is up:

```powershell
.\scripts\chrome-cdp.ps1        # reuses if running, else starts on 9223
```

Attach from Node — always through the shared helper, never your own copy:

```js
const { context, done } = require('./scripts/cdp.js');
const { browser, ctx } = await context();          // port 9223
const page = ctx.pages().find(p => p.url().includes('google.com')) || await ctx.newPage();
// ... work ...
done(browser);                                     // detaches, Chrome stays open
```

Verify auth in one line when unsure:

```powershell
node scripts\cdp-auth-check.js 9223     # expect 7 auth cookies, all with values
node scripts\cdp-gemini-state.js 9223   # expect signedIn: true
```

If `chrome-cdp.ps1` reports a normal Chrome holds the profile, tell the user —
do not kill their browser without asking (`-Force` does that).

---

## 2. Screenshot-video pipeline (scenes + narration)

Edit **`script/narration.json`** — it is the single source of truth. Each scene:

```json
{ "id": "s1", "capture": "slide01.png", "crop": [560,300,1840,1020], "line": "narration text" }
```

- `capture` — file in `output/captures/` (from step 2a) or any PNG you place there
- `crop` — `null` = full frame, or `[x0,y0,x1,y1]` in source pixels
- `line` — exactly what the voice says; scene duration = TTS length + hold

Full rebuild (captures → scenes → voice → video):

```powershell
.\scripts\chrome-cdp.ps1                          # 0. session up
node scripts\capture-app.js                       # 2a. live app screens (edit BASE/Q inside)
node scripts\capture-slides-all.js                #     or all 9 slides of the deck
python scripts\prep-scenes.py                     # 2b. crop → output/scenes/
node scripts\make-voiceover.mjs script/narration.json output/vo 1.12   # 2c. TTS
node scripts\assemble-video.mjs script/narration.json output/vo   # 2d. final mp4
```

Tuning knobs: `voice`/`speed`/`hold_seconds`/`zoom` in narration.json. Speed
1.12 ≈ 13% faster than default. Total runtime for 8 scenes ≈ 2 min.

### Screenshots over CDP (the reliable way)

`page.screenshot()` hangs on font loading in attached pages. Always:

```js
const cdp = await ctx.newCDPSession(page);
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
require('node:fs').writeFileSync(out, Buffer.from(data, 'base64'));
```

---

## 3. Motion graphics pipeline (deterministic HTML → mp4)

No external video API needed. Write an HTML scene that exposes three globals,
then render frame-exact video:

```html
<script>
  window.__ready = true;                    // assets loaded
  window.__duration = 8;                    // seconds
  window.__renderAt = (t) => {              // pure function of time
    el.style.transform = `translateY(${(1 - Math.min(t / 1.2, 1)) * 60}px)`;
    el.style.opacity = Math.min(t / 1.2, 1);
  };
</script>
```

```powershell
node scripts\render-motion.mjs --html scenes\my-scene.html --out output\motion.mp4
```

**`__renderAt` must be pure** — no CSS transitions, no rAF accumulation. The
renderer calls it once per frame with `t = i/fps`, so output is byte-stable
across runs and machines. This is what makes title cards, kinetic type, logo
stings and chart builds look intentional instead of janky.

**Renders headless, NOT over CDP.** The signed-in Chrome is a maximized headed
window; capturing it runs at ~0.7 fps. `render-motion.mjs` launches its own
headless Chrome and hits **~16.5 fps** (58s of 1080p video in ~105s). Motion
rendering needs no auth, so never attach it to the durable session.

### Adding narration to a motion piece

The scene's scene-boundary table must match the narration, or picture and voice
drift apart. Derive boundaries from the TTS output, don't guess:

```powershell
node scripts\make-voiceover.mjs script\prd-agent-hype.json output/vo-prd am_michael 1.16
# read output/vo-prd/timings.json, then set S[] and window.__duration in the HTML:
#   boundary[i+1] = boundary[i] + secs[i] + gap   (gap = 0.35)
node scripts\render-motion.mjs --html scenes\prd-agent.html --out output\prd-agent-motion.mp4
node scripts\mux-motion.mjs output\prd-agent-motion.mp4 output/vo-prd output\prd-agent-hype.mp4 0.35
```

`mux-motion.mjs` takes the video as input 0, so narration inputs start at index
1 — using `[0:a]` in the filtergraph will silently misalign everything. It also
applies `apad` + `afade` inside the filtergraph; `-af` cannot be combined with
`-filter_complex` on the same stream.

Voice choice: `af_heart` (warm, measured) for product demos, `am_michael`
(forward, punchy) for hype/marketing. Both are Kokoro voices.

---

## 4. Delivering to the user

User is frequently on their iPhone. **Do not serve over LAN** — Windows Firewall
blocks `node.exe` inbound and the user may not approve a UAC prompt. Upload to
Google Drive instead (session is already signed in):

```powershell
node scripts\upload-drive.js     # uploads output/precedent-demo.mp4 via Drive UI
node scripts\drive-link.js       # prints the file id → shareable link
```

How upload works (for writing new variants): Drive has **no `input[type=file]`
in the DOM** and Playwright's `filechooser` event does not fire from CDP-attached
pages. The working sequence is: click the real New `button` (top-left,
~(66, 99) at 1400×900), then `page.getByRole('menuitem', { name: /file upload/i }).click()`
wrapped in `waitForEvent('filechooser')` — it DOES fire from the menu item —
then `chooser.setFiles(path)`. Completion toast text: `1 upload complete`.
File link comes from `[data-id]` on the row.

If a local server is genuinely required: `node scripts\serve-video.mjs 8899`
sends byte ranges (iOS Safari requires Range; python http.server does not and
will fail on iPhone).

---

## 5. Gotchas (each of these cost real time once — don't repeat them)

- **Concat paths must be absolute** in the ffmpeg list file; relative resolves
  against the list file's own directory.
- **Prep scenes must leave margin**: scenes are scaled to `1/(1+zoom)` before
  pasting on a `#f7f9fc` canvas, so a max-1.06 Ken Burns zoom never crops UI text.
- **Overlapping same-position elements** in Drive screenshots = stale capture;
  re-run capture fresh per session.
- **Audio tail**: `afade=t=out:st=(dur-0.45):d=0.45` avoids a clipped last word.
- **`LANCZOS` warning from Pyright is cosmetic**; PIL supports it. Ignore.
- **Do not add `WAN_BASE_URL` to `.env`** (breaks all `wan` CLI calls).
- ** kokoro first run downloads ~80MB ONNX weights** to npm cache; later runs
  are ~2s per scene.

---

## 6. Where to iterate (prompt-engineering surface)

Everything a brief can change lives in two places:

- `script/narration.json` — scenes, crop, narration text, voice, speed
- scene HTML files (motion pipeline) — any visual a brief asks for

A new video = new/edited narration.json (or new scene HTML) + rerun steps 2c→2d.
Never fork the scripts to change content; the scripts are stable on purpose.
