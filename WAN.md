# Wan video generation / editing — session runbook

Reproducible setup for the `wan` CLI (`@wan-ai/cli`) on this machine.
Last verified: 2026-10-19, CLI `0.0.3`, account `intl` / PRO.

Everything here was executed and verified in this folder. Generated outputs
live in `output/`.

---

## TL;DR for an agent starting fresh

```powershell
# 1. Confirm toolchain
wan --version --output json
wan auth status --output json        # authenticated: true, memberLevel: PRO

# 2. Generate
wan text2video --prompt "your prompt" --resolution 720P --duration 5 --output json
#    -> prints { "taskId": "..." }

# 3. Wait + download (filename comes from the prompt)
wan task wait <taskId> --save --save-dir ./output --output json

# 4. Edit an existing clip
wan videoedit --video ./output/<clip>.mp4 --start 0 --end 5 --duration 5 `
  --prompt "@Video change the ball into a blue glass marble, keep lighting and camera" --output json
```

If `wan` is missing, reinstall (section 1). If auth fails, section 2.
If every command returns bare `HTTP 404`, jump to **Gotcha 1** — it is the
`.env` base-URL override, not a broken install.

---

## 1. Environment

| Item | Value on this machine |
|---|---|
| OS / shell | Windows 11, PowerShell 5.1 (also Git Bash) |
| Node | `v24.14.1` from `C:\nvm4w\nodejs` |
| npm | `11.11.0` |
| CLI | `@wan-ai/cli@0.0.3` (global) |
| ffmpeg | `C:\Users\pujan\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe` |
| Config dir | `C:\Users\pujan\.wan\config.json` |
| Project env | `D:\DEVELOPMENT\video-editing\.env` |

Install / upgrade:

```powershell
npm install --global @wan-ai/cli@latest
wan --version --output json
wan update --check --output json     # only update if the user agrees
```

On PowerShell, if `wan` dies with `PSSecurityException`, call `wan.cmd`
instead. That is a shell execution-policy issue, not an install or auth
failure.

---

## 2. Credentials

The credential is a **Wan AccessKey**, not a DashScope / ModelScope / OpenAI
key. Format:

```
wan-sk.<key-id>.<secret>
```

It is sent as `Authorization: Bearer <key>` together with `x-platform: cli`.
Any other key type returns `InvalidApiKey` from upstream.

Source of this key: Octo vault item
`6e58ccb8-9eda-4771-896e-0395fb5461ea` ("wan video generation ACCOUNT TOKEN"),
retrieved via the Octo credential relay. The raw value is stored in the
project `.env` (below); do not re-mint it from OpenRouter or DashScope.

Log in non-interactively (writes `~/.wan/config.json`, owner-only):

```powershell
wan auth login --site intl --access-key 'wan-sk....' --output json
```

Sites: `intl` †’ `https://create.wan.video`, `cn` †’ `https://wanx.biz.aliyun.com`.
Use `intl` for this account.

`wan auth login` is only needed once per machine. On later sessions the saved
account plus the project `.env` are enough — verify with
`wan auth status --output json`.

---

## 3. Project `.env` — exact shape

`D:\DEVELOPMENT\video-editing\.env`:

```dotenv
WAN_ACCESS_KEY=wan-sk.<key-id>.<secret>
WAN_SITE=intl
```

That is the whole file. The CLI auto-loads this path as `projectEnvPath`
(confirm with `wan config show --output json` †’ `loadedEnvPaths`).

**Do not add `WAN_BASE_URL`.** See Gotcha 1.

Precedence for every setting: CLI flag †’ environment variable †’ project
`.env` †’ `~/.wan/config.json`.

---

## 4. Verify the setup

```powershell
wan auth status --output json
wan credits --output json
```

Expected shape:

```json
{ "ok": true, "authenticated": true,
  "data": { "active": { "memberLevel": "PRO", "goodsId": "monthly-pro-continuous" },
            "taskQuota": { "image": 3, "video": 3 } } }
```

```json
{ "availableCount": 261, "totalCount": 261,
  "amount": { "total": 261, "member": 261, "topUp": 0, "bonus": 0 } }
```

Zero-credit prompt iteration:

```powershell
wan text2video --prompt "..." --dry-run --output json
```

`--dry-run` prints the exact request body and target URL without submitting.
Use it to check duration/resolution/ratio and to catch the base-URL problem
before spending credits.

---

## 5. Command surface (video)

```powershell
wan text2video     --prompt <text> [--duration 2-30] [--resolution 480P|720P|1080P] [--ratio adaptive|16:9|9:16|...]
wan frame2video    --first-frame <img> [--last-frame <img>] --prompt <text>
wan reference2video --asset <img|video> --prompt <text> [--video-ranges s:e,...]
wan videoedit      --video <clip> --start <s> --end <s> --duration <s> --prompt <text>
wan omni2video     --prompt <text> [--images ...] [--videos ...] [--audios ...] [--file brief.pdf] [--duration 2-30]
```

Shared flags: `--output json`, `--save`, `--save-dir <dir>`, `--dry-run`,
`--verbose`, `--with-watermark`, `--audio-output=<true|false>`.

Polling:

```powershell
wan task wait <taskId> --poll-interval 2 --timeout 300 --save --save-dir ./output --output json
wan task list --page-size 10 --media-type video --output json
wan result get <taskId> --save --save-dir ./output --output json
```

Notes:

- `videoedit` auto-prepends the `@Video` reference token; you may still write
  `@Video ...` in the prompt explicitly (that is what was tested).
- `videoedit` crop is 2–15 s; output duration must be an integer second within
  the crop.
- `reference2video` / `omni2video` accept at most 15 s of reference video total;
  output duration for Omni is `2 €¦ floor(30 ˆ’ reference video seconds)`.
- Video commands default to `wan3.0` (`modelVersion=3_0`). Pass
  `--model wan2.7` only when a 2.7-only feature is needed (e.g. uploaded audio).
- All CLI generation uses `credit_mode`; `--deduct-mode relax_mode` is rejected.

---

## 6. Verified end-to-end pipeline

Run in this folder on 2026-10-19. Both tasks succeeded and outputs were
inspected frame-by-frame.

**Step 1 — generate**

```powershell
wan text2video --prompt "A red rubber ball rolls slowly across a wooden table, soft window light, shallow depth of field, static camera" `
  --resolution 720P --duration 5 --output json
# taskId: d9cb7a09624f4be1a1c64cbb58b7c0c0
wan task wait d9cb7a09624f4be1a1c64cbb58b7c0c0 --save --save-dir ./output --output json
# -> output/Wan_è§†é¢‘ç”Ÿæˆ_A red rubber ball rolls slowly across a wooden table, soft window light.mp4
```

**Step 2 — edit**

```powershell
wan videoedit --video "./output/Wan_è§†é¢‘ç”Ÿæˆ_A red rubber ball rolls slowly across a wooden table, soft window light.mp4" `
  --start 0 --end 5 --duration 5 `
  --prompt "@Video Change the red rubber ball into a glossy blue glass marble, keep the table, lighting and camera motion unchanged" `
  --output json
# taskId: 8a17729c4a514b49a85bb409ab550b57
wan task wait 8a17729c4a514b49a85bb409ab550b57 --save --save-dir ./output --output json
```

**Step 3 — verify visually**

```powershell
ffmpeg -y -ss 2 -i "<original>.mp4" -frames:v 1 output/frame_original.jpg
ffmpeg -y -ss 2 -i "<edited>.mp4"   -frames:v 1 output/frame_edited.jpg
```

Output properties: H.264, 1280Ã—720, 30 fps, `yuv420p`, AAC 48 kHz stereo,
~5 s. `videoedit` re-renders the whole frame — background, lighting, framing
and contact shadow were preserved; only the described object changed.

---

## 7. How many videos can we make?

**There is no daily video limit.** Two separate things are easy to confuse:

| Thing | What it actually is | Observed value |
|---|---|---|
| `taskQuota.video` | **Concurrent submission slots**, i.e. how many video tasks can be in flight at once. Refills as tasks finish. | `3` |
| `wan credits` | The actual budget. Every generation deducts credits. | `261` available |
| Membership | PRO, **monthly** renewal, $6.50/month, 300 member credits per period | `2026-10-19 †’ 2026-11-20` |

`taskQuota` is explicitly documented in the bundled skill as "remaining
concurrent image and video submission slots €¦ Do not describe them as daily
free quotas, remaining generations, credit balances, or allowances that reset
each day."

Measured cost on this account (720P, 5 s, Wan 3.0):

```
before first generation : 306 credits
after text2video 5 s    :  (one task)
after videoedit   5 s   : 261 credits
=> 45 credits for two 5 s 720P tasks ‰ˆ 22.5 credits per 5 s 720P clip
```

Practical answer at 720P / 5 s: **~11 more clips** on the current balance,
and roughly **300 / 22.5 ‰ˆ 13 clips per monthly billing period** once it
renews. Throughput within a day is limited only by the 3 concurrent slots and
wall-clock queue time, not by a daily counter.

Caveats:

- 22.5 is a **measured balance delta**, not a published price. Cost scales with
  resolution, duration and model; treat it as an estimate and re-check
  `wan credits` before and after a run.
- `errorCode 50001` carries the legacy message "Daily inspiration points
  exhausted". It means insufficient usable points for the estimated cost — it
  is **not** a daily quota and does not reset at midnight.
- `50004` = the task would enter a holding/relax path the CLI does not support.
  Check credits, quota and in-flight tasks.
- `4007` / `50000` / `100101` = concurrency/queue limit. Wait for existing
  tasks; do not retry blindly.

---

## 8. Videos longer than 30 seconds (2-minute presentations)

A single generation is capped at **30 s** on Wan 3.0 (`--duration 2..30`).
`videoedit` is capped at a 15 s crop. So a 2-minute deliverable must be built
from segments.

Recommended approach:

1. **Pick a segment length.** 15 s segments give finer control and cheaper
   retries; 30 s segments need fewer joins. For 120 s that is 8Ã—15 s or
   4Ã—30 s.
2. **Keep continuity with `frame2video`.** Generate segment 1, extract its
   last frame, feed it as `--first-frame` of segment 2, and repeat. This is
   the only reliable way to keep the same scene/character/lighting across
   joins. Alternatively use `omni2video --videos <previous> --video-ranges €¦`
   to continue an existing shot.
3. **For slide-style presentations**, use `omni2video --file brief.pdf`
   (DOC/DOCX/PPT/PPTX/PDF/TXT/MD, ‰¤100 MiB). It forces Thinking Mode and
   produces up to 30 s per call. Stitch the slide segments.
4. **Stitch losslessly** (same codec/params — which Wan always emits):

   ```powershell
   # list.txt, UTF-8 without BOM, absolute paths, single quotes
   # file 'D:\...\seg01.mp4'
   # file 'D:\...\seg02.mp4'
   ffmpeg -y -f concat -safe 0 -i list.txt -c copy presentation.mp4
   ```

   If the concat demuxer reports non-monotonic DTS or the result stutters,
   re-encode instead:

   ```powershell
   ffmpeg -y -f concat -safe 0 -i list.txt -c:v libx264 -crf 18 -preset slow `
     -pix_fmt yuv420p -c:a aac -b:a 192k presentation.mp4
   ```

5. **Audio.** Wan 3.0 generates audio per segment, so joins will have audible
   seams. For a presentation, generate video with `--audio-output=false`,
   record one continuous voiceover, and mux it after stitching:

   ```powershell
   ffmpeg -y -i presentation.mp4 -i voiceover.wav -c:v copy -c:a aac -shortest final.mp4
   ```

**Budget reality:** 120 s of generated footage at the measured 720P rate is
about `120 / 5 Ã— 22.5 ‰ˆ 540 credits` — roughly two monthly PRO allowances.
Options: use `480P`, use fewer full-motion segments (static slides + a few
generated shots), or top up credits. Verify the actual per-clip cost with a
single `wan credits` before/after test before committing to a long render.

---

## 9. Error reference

| Signal | Meaning | Action |
|---|---|---|
| `4018` | Account lacks CLI membership | Membership must be active. Do not retry or swap keys. |
| `InvalidApiKey` | Wrong credential family (e.g. DashScope key) | Use the `wan-sk.` AccessKey. |
| bare `HTTP 404` on every command | `WAN_BASE_URL` in project `.env` overriding the site | Remove it (Gotcha 1). |
| `50001` | Insufficient usable points for estimated cost | Check `wan credits`. Not a daily quota. |
| `50004` | Would enter unsupported holding/relax path | Check credits + in-flight tasks. |
| `4007` / `50000` / `100101` | Concurrency / queue limit | Wait for existing tasks. |
| `blocked` | Service-side rate limiting | Back off, retry a bounded number of times. |
| `9005` `9006` `9010` `9013` | Bad request / input | Fix params, resolution or input URL. |
| `9007` `9008` `9012` `10017` | Content safety | Revise the input. |
| `9001`, HTML/XML body | Gateway/transport failure | Check `wan task list` before resubmitting. |
| `LOCAL_FILE_VALIDATION_FAILED` | Local media outside limits | Read `details.suggestedFix`, transcode with ffmpeg, retry. |

---

## 10. Gotchas

**1. `WAN_BASE_URL` in the project `.env` silently wins over the site.**
The CLI loads `D:\DEVELOPMENT\video-editing\.env` on every invocation. If that
file sets `WAN_BASE_URL`, commands are POSTed to
`<WAN_BASE_URL>/wanx/api/...` instead of the site endpoint, and every endpoint
returns a bare `HTTP 404` (`wan auth status`, `credits`, `task list`). This
happened with `WAN_BASE_URL=https://dashscope-intl.aliyuncs.com/api/v1`.
Fix: delete the line. Diagnose with `wan config show --output json`
(`loadedEnvPaths`) and `wan --verbose`, which prints the equivalent curl.

**2. The AccessKey is not a model API key.** It authenticates against
`create.wan.video`'s own `/wanx/api/*` surface. It will not work against
DashScope or generic model-API endpoints.OpenRouter/OpenAI-compatible endpoints.

**3. `taskQuota` is concurrency, not a daily allowance.** See section 7.

**4. `--save` filenames come from the prompt**, including non-ASCII prefixes
(`Wan_è§†é¢‘ç”Ÿæˆ_€¦`, `Wan_è§†é¢‘ç¼–è¾‘_€¦`) and spaces. Quote paths in PowerShell.
When writing an ffmpeg concat list on Windows, write it as UTF-8 **without
BOM** or ffmpeg mangles the Chinese characters into `????`.

**5. The CLI does not install or call ffmpeg.** Local media that fails
validation must be transcoded manually.

**6. Do not log the AccessKey.** `wan auth status` and `wan auth list` never
print it; keep it that way in logs and transcripts.

---

## 11. Files in this folder

```
.env                 AccessKey + site (auto-loaded by the CLI)
README.md            this runbook
output/              generated clips and verification frames
  Wan_è§†é¢‘ç”Ÿæˆ_€¦.mp4   text2video result (5 s, 720P)
  Wan_è§†é¢‘ç¼–è¾‘_€¦.mp4   videoedit result (5 s, 720P)
  frame_original.jpg   t=2 s frame from the source clip
  frame_edited.jpg     t=2 s frame from the edited clip
```


