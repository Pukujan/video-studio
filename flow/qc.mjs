// Automatic checks for one clip. Catches what a program can catch reliably; makes a timestamped
// frame sheet for the visual review that catches the rest (objects popping in/out, hair changes).
//
//   node flow/qc.mjs <clip.mp4> [start_image] [--id <ledger id>]
//
// Checks:
//   first_frame  mean abs difference (0-255) between the clip's first frame and the start image.
//                < 8 means the clip really starts from that image (same person, same room).
//   cuts         ffmpeg scdet scene changes above threshold 8: jump cuts inside one shot.
//   jumps        large frame-to-frame changes that scdet misses (camera snaps, sudden zooms).
//   duration, size and fps, parsed from ffmpeg's banner (no ffprobe needed).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg } from './lib.mjs';
import { update } from './ledger.mjs';

const FF = ffmpeg();
const FONT = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf', 'C:/Windows/Fonts/arial.ttf'].find(f => fs.existsSync(f));

// Decode frames as 64x36 grayscale bytes.
function gray(input, extra = []) {
  return execFileSync(FF, ['-loglevel', 'error', '-i', input, ...extra, '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
}
const W = 64 * 36;
const mad = (a, b) => { let s = 0; for (let i = 0; i < W; i++) s += Math.abs(a[i] - b[i]); return s / W; };

export function qc(clip, startImage) {
  const info = spawnSync(FF, ['-hide_banner', '-i', clip], { encoding: 'utf8' }).stderr;
  const dur = (info.match(/Duration: (\d+):(\d+):([\d.]+)/) || []).slice(1).map(Number);
  const duration = dur.length ? dur[0] * 3600 + dur[1] * 60 + dur[2] : null;
  const vs = info.match(/Video: .*?, (\d+)x(\d+).*?, ([\d.]+) fps/);

  const res = { clip, duration, width: vs ? +vs[1] : null, height: vs ? +vs[2] : null, fps: vs ? +vs[3] : null };

  if (startImage) res.first_frame = +mad(gray(clip, ['-frames:v', '1']), gray(startImage)).toFixed(1);

  const sc = spawnSync(FF, ['-hide_banner', '-i', clip, '-vf', 'scdet=threshold=8', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  res.cuts = [...sc.matchAll(/lavfi\.scd\.score: ([\d.]+), lavfi\.scd\.time: ([\d.]+)/g)].map(m => ({ t: +(+m[2]).toFixed(2), score: +m[1] }));

  // frame-to-frame jumps at 12 fps: flag a step > 3x the clip's median step and > 6
  const steps = [];
  const f12 = execFileSync(FF, ['-loglevel', 'error', '-i', clip, '-vf', 'fps=12,scale=64:36,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const seq = []; for (let o = 0; o + W <= f12.length; o += W) seq.push(f12.subarray(o, o + W));
  for (let i = 1; i < seq.length; i++) steps.push(mad(seq[i - 1], seq[i]));
  const med = [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)] || 0;
  res.jumps = steps.map((d, i) => ({ t: +((i + 1) / 12).toFixed(2), d: +d.toFixed(1) }))
    .filter(s => s.d > Math.max(6, med * 3) && !res.cuts.some(c => Math.abs(c.t - s.t) < 0.2));

  const sheet = clip.replace(/\.mp4$/i, '') + '.sheet.jpg';
  const text = FONT ? `,drawtext=fontfile='${FONT}':text='%{pts\\:hms}':x=8:y=8:fontsize=22:fontcolor=yellow:box=1:boxcolor=black` : '';
  execFileSync(FF, ['-loglevel', 'error', '-y', '-i', clip, '-vf', `fps=2,scale=320:-1${text},tile=4x4`, '-frames:v', '1', sheet]);
  res.sheet = sheet;

  const fails = [];
  if (res.first_frame != null && res.first_frame > 8) fails.push(`first frame differs from start image (${res.first_frame})`);
  if (res.cuts.length) fails.push(`hard cut at ${res.cuts.map(c => c.t + 's').join(', ')}`);
  if (res.jumps.length) fails.push(`sudden jump at ${res.jumps.map(c => c.t + 's').join(', ')}`);
  res.auto = fails.length ? 'fail' : 'pass';
  res.fails = fails;
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const idI = args.indexOf('--id');
  const id = idI >= 0 ? +args.splice(idI, 2)[1] : null;
  const [clip, start] = args;
  if (!clip) { console.log('usage: node flow/qc.mjs <clip.mp4> [start_image] [--id N]'); process.exit(2); }
  const r = qc(path.resolve(clip), start && path.resolve(start));
  if (id) update(id, { qc: r, status: r.auto === 'pass' ? 'qc_pass' : 'qc_fail' });
  console.log(JSON.stringify(r, null, 1));
}
