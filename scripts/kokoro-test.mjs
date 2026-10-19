import { KokoroTTS } from "kokoro-js";
import { writeFileSync } from "node:fs";

const VOICE = process.argv[2] || "af_heart";
const OUT = process.argv[3] || "output/voice.wav";
const TEXT = process.argv[4] || "Test.";

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: "q8",
  device: "cpu",
});

const audio = await tts.generate(TEXT, { voice: VOICE, speed: 1.0 });
audio.save(OUT);
console.log(JSON.stringify({ out: OUT, voice: VOICE, samples: audio.audio.length, sampleRate: audio.sampling_rate }));
