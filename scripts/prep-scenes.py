"""Crop captures per script/narration.json and scale to 1080p scenes."""
import json
import os
import sys
from PIL import Image

SPEC = sys.argv[1] if len(sys.argv) > 1 else "script/narration.json"
SRC = "output/captures"
DST = "output/scenes"
W, H = 1920, 1080

spec = json.load(open(SPEC, encoding="utf-8"))
zoom = float(spec.get("zoom", 0.06))
os.makedirs(DST, exist_ok=True)

# Leave a margin so the Ken Burns zoom never crops UI text.
inner_w = int(W / (1 + zoom))
inner_h = int(H / (1 + zoom))

for scene in spec["scenes"]:
    src = f"{SRC}/{scene['capture']}"
    im = Image.open(src).convert("RGB")
    if scene.get("crop"):
        im = im.crop(tuple(scene["crop"]))
    im = im.resize((inner_w, inner_h), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H), (247, 249, 252))
    canvas.paste(im, ((W - inner_w) // 2, (H - inner_h) // 2))
    canvas.save(f"{DST}/{scene['id']}.png")
    print(f"{scene['id']}.png <- {scene['capture']}")
