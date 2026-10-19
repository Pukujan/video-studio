# video-studio

Agent-driven video studio. Point an agent at this repo and it can produce a
finished, narrated video without guessing.

Two production paths, one runbook:

| Path | Use it for | Entry point |
|---|---|---|
| **Screen capture** | Demoing a live web app or slide deck | `script/narration.json` |
| **Motion graphics** | Title cards, kinetic type, charts, logo stings, hype cuts | `scenes/*.html` |

Both share the same voiceover and mux machinery.

## What makes this fast

- **The signed-in browser is durable.** Chrome on the real profile with CDP on
  port 9223 stays logged in (cookies valid to 2027-11-05). Agents attach to it
  instead of spawning throwaway browsers and hitting login walls.
- **Narration drives timing.** Kokoro TTS generates per-scene audio; scene
  duration comes from the audio length, so nothing drifts.
- **Motion renders deterministically.** Scenes expose `__renderAt(t)`, so frames
  are a pure function of time. Renders headless at ~16.5 fps, byte-stable.

## Start here

```powershell
npm install
.\scripts\chrome-cdp.ps1          # bring up / reuse the signed-in browser
```

Then read **[AGENTS.md](AGENTS.md)** — it is the complete runbook: commands,
invariants, delivery, and the gotchas that cost real time to discover.

For the `wan` CLI (text-to-video / video edit, auth, quotas, cost math) read
**[WAN.md](WAN.md)**.

## Layout

```
AGENTS.md            agent runbook (read this)
WAN.md               wan CLI runbook: auth, text2video, videoedit, quotas
README.md            this file
script/              narration.json, prd-agent-hype.json — the edit surface
scenes/              HTML motion scenes
scripts/             capture, render, voice, mux, upload
output/              generated media (gitignored)
```

## Examples

```powershell
# 1-minute app demo: live captures + narration
python scripts\prep-scenes.py
node scripts\make-voiceover.mjs script\narration.json output\vo 1.12
node scripts\assemble-video.mjs script\narration.json output\vo

# 58-second hype cut: motion graphics + narration
node scripts\make-voiceover.mjs script\prd-agent-hype.json output\vo-prd am_michael 1.16
node scripts\render-motion.mjs --html scenes\prd-agent.html --out output\prd-agent-motion.mp4
node scripts\mux-motion.mjs output\prd-agent-motion.mp4 output\vo-prd output\prd-agent-hype.mp4 0.35
```

## Iterating with prompt engineering

A brief only ever changes two things: the narration text and the visuals.
Edit `script/*.json` or `scenes/*.html`, rerun the pipeline, compare. The
scripts stay stable on purpose — don't fork them to change content.
