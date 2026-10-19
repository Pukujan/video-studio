import { KokoroTTS } from "kokoro-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SCRIPT = process.argv[2] || "script/narration.json";
const OUTDIR = process.argv[3] || "output/vo";

const spec = JSON.parse(readFileSync(SCRIPT, "utf8"));
const voice = process.argv[4] || spec.voice || "af_heart";
const speed = Number(process.argv[5] || spec.speed || 1.0);

mkdirSync(OUTDIR, { recursive: true });

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: "q8",
  device: "cpu",
});

const report = [];
for (let i = 0; i < spec.scenes.length; i++) {
  const scene = spec.scenes[i];
  const audio = await tts.generate(scene.line, { voice, speed });
  const out = `${OUTDIR}/vo${String(i + 1).padStart(2, "0")}.wav`;
  audio.save(out);
  const secs = Number((audio.audio.length / audio.sampling_rate).toFixed(2));
  report.push({ index: i + 1, id: scene.id, out, secs, words: scene.line.split(/\s+/).length });
  console.log(JSON.stringify(report[report.length - 1]));
}

const total = report.reduce((a, r) => a + r.secs, 0);
console.log(JSON.stringify({ total: Number(total.toFixed(2)), scenes: report.length, voice, speed }));
writeFileSync(`${OUTDIR}/timings.json`, JSON.stringify(report, null, 2), "utf8");
