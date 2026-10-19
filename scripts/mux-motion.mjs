import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const FFMPEG = process.env.FFMPEG ||
  "C:\\Users\\pujan\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe";
const FFPROBE = FFMPEG.replace("ffmpeg.exe", "ffprobe.exe");

const VIDEO = process.argv[2];
const VO = process.argv[3] || "output/vo-prd";
const OUT = process.argv[4];
if (!VIDEO || !OUT) {
  console.error("usage: node scripts/mux-motion.mjs <video.mp4> <vo-dir> <out.mp4> [gap]");
  process.exit(1);
}

const gap = Number(process.argv[5] ?? 0.35);
const timings = JSON.parse(readFileSync(`${VO}/timings.json`, "utf8"));
const dur = parseFloat(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", resolve(VIDEO)]).toString().trim());

const inputs = [];
const filter = [];
let t = 0;
timings.forEach((tm, i) => {
  inputs.push("-i", resolve(tm.out));
  const ms = Math.round(t * 1000);
  // Input 0 is the video, so narration inputs start at 1.
  filter.push(`[${i + 1}:a]adelay=${ms}|${ms}[a${i}]`);
  t += tm.secs + gap;
});
filter.push(`${timings.map((_, i) => `[a${i}]`).join("")}amix=inputs=${timings.length}:normalize=0[mixed]`);
filter.push(`[mixed]apad=whole_dur=${dur},afade=t=out:st=${(dur - 0.45).toFixed(2)}:d=0.45,aresample=48000[aout]`);

execFileSync(FFMPEG, [
  "-y", "-i", resolve(VIDEO), ...inputs,
  "-filter_complex", filter.join(";"),
  "-map", "0:v", "-map", "[aout]",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
  "-shortest", "-movflags", "+faststart", resolve(OUT),
], { stdio: "pipe" });

console.log(JSON.stringify({ out: OUT, duration: dur, narration: Number(t.toFixed(2)), gap }));
