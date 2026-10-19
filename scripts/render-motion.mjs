import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const FFMPEG = process.env.FFMPEG ||
  "C:\\Users\\pujan\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe";
const CDP_PORT = process.env.CDP_PORT || "9223";

const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith("--")) continue;
  const key = args[i].slice(2);
  const next = args[i + 1];
  opt[key] = next && !next.startsWith("--") ? (i++, next) : true;
}

if (!opt.html) {
  console.error("usage: node scripts/render-motion.mjs --html scenes/scene.html --out output/motion.mp4 [--fps 30] [--width 1920] [--height 1080] [--crf 18]");
  process.exit(1);
}

const FPS = Number(opt.fps || 30);
const WIDTH = Number(opt.width || 1920);
const HEIGHT = Number(opt.height || 1080);
const CRF = String(opt.crf || 18);
const OUT = resolve(opt.out || "output/motion.mp4");
const FRAMES = resolve(opt.frames || "output/work/motion-frames");

const browser = await chromium.launch({
  channel: opt.channel || "chrome",
  headless: true,
  args: ["--force-device-scale-factor=1", "--hide-scrollbars", "--disable-lcd-text"],
});
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});

const page = await ctx.newPage();
await page.goto(pathToFileURL(resolve(opt.html)).href, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });

const duration = await page.evaluate(() => window.__duration);
if (!duration) throw new Error("scene did not set window.__duration");

const total = Math.ceil(duration * FPS);
console.log(JSON.stringify({ html: opt.html, duration, fps: FPS, frames: total, size: `${WIDTH}x${HEIGHT}` }));

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const t0 = Date.now();
for (let i = 0; i < total; i++) {
  await page.evaluate((time) => window.__renderAt(time), i / FPS);
  await page.screenshot({
    path: `${FRAMES}/f${String(i).padStart(5, "0")}.jpg`,
    type: "jpeg",
    quality: 92,
    animations: "disabled",
    caret: "hide",
  });
  if (i % 60 === 0) {
    console.log(`frame ${i + 1}/${total} (${((i + 1) / ((Date.now() - t0) / 1000)).toFixed(1)} fps)`);
  }
}

console.log(`rendered ${total} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

mkdirSync(resolve(OUT, ".."), { recursive: true });
execFileSync(FFMPEG, [
  "-y", "-framerate", String(FPS), "-i", `${FRAMES}/f%05d.jpg`,
  "-c:v", "libx264", "-preset", "medium", "-crf", CRF,
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT,
], { stdio: "pipe" });

console.log("OUT:", OUT);

await browser.close();
