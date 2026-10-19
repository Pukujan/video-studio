import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const SCRIPT = process.argv[2] || "script/narration.json";
const VO = process.argv[3] || "output/vo";
const WORK = "output/work";

const FFMPEG = process.env.FFMPEG ||
  "C:\\Users\\pujan\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe";
const FFPROBE = FFMPEG.replace("ffmpeg.exe", "ffprobe.exe");

const spec = JSON.parse(readFileSync(SCRIPT, "utf8"));
const FINAL = resolve(spec.output || "output/video.mp4");
const HOLD = Number(spec.hold_seconds ?? 0.4);
const ZOOM = Number(spec.zoom ?? 0.06);

mkdirSync(WORK, { recursive: true });
const timings = JSON.parse(readFileSync(`${VO}/timings.json`, "utf8"));
if (timings.length !== spec.scenes.length) {
  throw new Error(`timings.json has ${timings.length} scenes, script has ${spec.scenes.length} — rerun make-voiceover`);
}

const segs = [];
for (let i = 0; i < timings.length; i++) {
  const dur = (timings[i].secs + HOLD).toFixed(2);
  const out = `${WORK}/seg${String(i + 1).padStart(2, "0")}.mp4`;
  const zoomIn = i % 2 === 0;
  const z = zoomIn
    ? `min(1+${ZOOM}*on/(30*${dur}),${1 + ZOOM})`
    : `max(${1 + ZOOM}-${ZOOM}*on/(30*${dur}),1.0)`;
  const vf = `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(parseFloat(dur) * 30)}:s=1920x1080:fps=30,format=yuv420p`;

  execFileSync(FFMPEG, [
    "-y", "-loop", "1", "-i", `output/scenes/${spec.scenes[i].id}.png`,
    "-vf", vf, "-t", dur,
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-an", out,
  ], { stdio: "pipe" });
  segs.push(out);
  console.log("segment", i + 1, dur + "s");
}

// Absolute paths: concat resolves relative entries against the list's directory.
const listTxt = segs.map(s => `file '${resolve(s).replace(/\\/g, "/")}'`).join("\n");
writeFileSync(`${WORK}/list.txt`, listTxt, "utf8");
execFileSync(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", `${WORK}/list.txt`, "-c", "copy", `${WORK}/video.mp4`], { stdio: "pipe" });

const dur = parseFloat(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${WORK}/video.mp4`]).toString().trim());
console.log("video duration:", dur.toFixed(2));

const inputs = [];
const filter = [];
let t = 0;
timings.forEach((tm, i) => {
  inputs.push("-i", resolve(tm.out));
  const ms = Math.round(t * 1000);
  filter.push(`[${i}:a]adelay=${ms}|${ms}[a${i}]`);
  t += tm.secs + HOLD;
});
filter.push(`${timings.map((_, i) => `[a${i}]`).join("")}amix=inputs=${timings.length}:normalize=0[aout]`);

execFileSync(FFMPEG, [
  "-y", ...inputs,
  "-filter_complex", filter.join(";"),
  "-map", "[aout]", "-ar", "48000", `${WORK}/vo-timeline.wav`,
], { stdio: "pipe" });

execFileSync(FFMPEG, [
  "-y", "-i", `${WORK}/video.mp4`, "-i", `${WORK}/vo-timeline.wav`,
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
  "-af", `apad=whole_dur=${dur},afade=t=out:st=${(dur - 0.45).toFixed(2)}:d=0.45`,
  "-shortest", "-movflags", "+faststart", FINAL,
], { stdio: "pipe" });

console.log("FINAL:", FINAL, dur.toFixed(2) + "s");
