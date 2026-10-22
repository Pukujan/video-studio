# Wan video project — agent instructions

Read `AGENTS.md` before running anything — it is the complete, verified runbook
for browser automation and video production. `WAN.md` is the `wan` CLI runbook
(install, auth, commands, quotas, gotchas). `FLOW.md` is the Google Flow / Veo
runbook (UI selectors, models, credit cost, prompt patterns).

## Hard invariants

- Credential is a **Wan AccessKey** (`wan-sk.<id>.<secret>`), loaded from
  `.env` as `WAN_ACCESS_KEY`, site `intl`. Never print it in output or logs.
- **Never add `WAN_BASE_URL` to `.env`.** The CLI auto-loads this file and the
  variable silently redirects every request, producing bare `HTTP 404`s on all
  commands. Diagnose with `wan config show --output json`.
- Use `--output json` on every `wan` command.
- `taskQuota.video` is the number of **concurrent** submission slots (3), not a
  daily limit. Budget is measured with `wan credits`.
- A single generation is capped at **30 s** (Wan 3.0). Longer deliverables are
  built from segments and stitched with ffmpeg.
- `--dry-run` costs nothing — use it to validate prompts and payloads.

## Standard flow

```powershell
wan auth status --output json
wan text2video --prompt "<prompt>" --resolution 720P --duration 5 --output json
wan task wait <taskId> --save --save-dir ./output --output json
wan videoedit --video ./output/<clip>.mp4 --start 0 --end 5 --duration 5 --prompt "@Video <edit>" --output json
wan credits --output json
```

ffmpeg is at
`C:\Users\pujan\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe`.

## Browser automation — use the durable session

Never launch a fresh/throwaway browser for anything needing a Google login. The
signed-in session is Chrome on the **real profile** with CDP:

```powershell
.\scripts\chrome-cdp.ps1          # reuses it if already up, else starts it
```

Then attach with `chromium.connectOverCDP('http://127.0.0.1:9223')`. Cookies are
valid to 2027-11-05. Port 9222 is a dead throwaway and is not signed in.

`scripts/capture-app.js` and `scripts/capture-slides-all.js` both use this.
See `AGENTS.md` §2–3 for the screen-capture and motion-graphics pipelines.
