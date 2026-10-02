"""Replace clipped guard sprites for Kalliane, Laura, and Vinicius."""
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ("kalliane", "laura", "vinicius")
WIDTH, HEIGHT, BASELINE = 320, 256, 248
TARGET_HEIGHT, TARGET_WIDTH = 212, 288

spec = importlib.util.spec_from_file_location("fighter_components", ROOT / "scripts/build-monteiro-v5.py")
components = importlib.util.module_from_spec(spec)
spec.loader.exec_module(components)


def main(character: str):
    here = ROOT / "art-source/characters" / character
    source = here / "v1-sources/guard-safe.png"
    with Image.open(source) as src:
        pixels = np.array(src.convert("RGBA"))
    bodies = [g for g in components.components(pixels[:, :, 3]) if g["area"] > 2500]
    if len(bodies) != 6:
        raise ValueError(f"{source}: esperadas 6 poses completas, encontradas {len(bodies)}")
    bodies.sort(key=lambda body: body["box"][0])
    max_height = max(body["box"][3] - body["box"][1] for body in bodies)
    max_width = max(body["box"][2] - body["box"][0] for body in bodies)
    scale = min(TARGET_HEIGHT / max_height, TARGET_WIDTH / max_width)

    defense_path = here / "sources/atlases" / f"{character}-v1-defense.webp"
    with Image.open(defense_path) as src:
        atlas = src.convert("RGBA")
    if atlas.size != (WIDTH * 6, HEIGHT * 4):
        raise ValueError(f"Atlas de defesa inesperado: {atlas.size}")
    frames_dir = here / "sources/frames/guard"
    frames_dir.mkdir(parents=True, exist_ok=True)
    previews = []
    for index, body in enumerate(bodies):
        x0, y0, x1, y1 = body["box"]
        cut = Image.fromarray(pixels[y0:y1, x0:x1])
        resized = cut.resize((round(cut.width * scale), round(cut.height * scale)), Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", (WIDTH, HEIGHT))
        frame.alpha_composite(resized, ((WIDTH - resized.width) // 2, BASELINE - resized.height))
        frame.save(frames_dir / f"{index + 1:02d}.png")
        atlas.paste(frame, (index * WIDTH, HEIGHT))
        preview = Image.new("RGB", (WIDTH, HEIGHT + 32), "#101b2a")
        ImageDraw.Draw(preview).text((12, 8), "Defesa", font=ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 17), fill="#c2ef98")
        preview.paste(frame, (0, 32), frame)
        previews.append(preview)

    preview_dir = here / "previews"
    previews[0].save(preview_dir / "guard.gif", save_all=True, append_images=previews[1:], duration=[130] * 5 + [550], loop=0)
    atlas.save(defense_path, "WEBP", lossless=True, method=6, exact=True)
    target = ROOT / "public/assets/characters" / character / f"{character}-v1-defense.webp"
    target.write_bytes(defense_path.read_bytes())
    manifest_path = here / "manifest-v1.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["groups"]["defense"]["guardSource"] = "v1-sources/guard-safe.png"
    manifest["groups"]["defense"]["guardScale"] = round(scale, 4)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{character}: guarda atualizada, escala {scale:.3f}")


if __name__ == "__main__":
    for fighter in CHARACTERS:
        main(fighter)
