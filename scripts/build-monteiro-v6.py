"""Exporta os quatro golpes v6 em WebP sem perda. Pillow/NumPy.

Mantém o tamanho corporal da v5, quadros completos e pivôs constantes.
As fontes PNG e prévias continuam separadas em art-source/.
"""
from pathlib import Path
import importlib.util
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CONCEPTS = ROOT / 'art-source/characters/monteiro/concepts-v6'
OUTPUT = ROOT / 'public/assets/characters/monteiro'
spec = importlib.util.spec_from_file_location('monteiro_concepts', CONCEPTS / 'prepare-previews.py')
concepts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(concepts)
NAMES = {'weak-punch': 'soco-fraco', 'strong-punch': 'soco-forte',
         'weak-kick': 'chute-fraco', 'strong-kick': 'chute-forte'}


def main():
    extracted = {key: concepts.extract(source)[0] for key, source in NAMES.items()}
    scale = 212 / max(extracted[key][0].height for key in list(NAMES)[:4])
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = {}
    for key, frames in extracted.items():
        victory = key == 'victory-cable'
        width, height, columns = (640, 512, 3) if victory else (512, 512, 4)
        atlas = Image.new('RGBA', (width * columns, height * 2))
        for i, frame in enumerate(frames):
            resized = frame.resize((round(frame.width * scale), round(frame.height * scale)), Image.Resampling.LANCZOS)
            x = round((width - resized.width) / 2) if victory else round(190 - concepts.contact_pivot(frame) * scale)
            y = 480 - resized.height
            assert x >= 16 and y >= 16 and x + resized.width <= width - 16, (key, i)
            atlas.alpha_composite(resized, (i % columns * width + x, i // columns * height + y))
        target = OUTPUT / f'monteiro-v6-{key}.webp'
        atlas.save(target, 'WEBP', lossless=True, method=6, exact=True)
        with Image.open(target) as check:
            assert np.array_equal(np.array(check.convert('RGBA')), np.array(atlas)), target
        records[key] = {'file': target.name, 'frameWidth': width, 'frameHeight': height,
                        'frames': len(frames), 'columns': columns, 'baseline': 480,
                        'pivotX': width / 2 if victory else 190, 'scale': scale}
        print(f'{key}: {len(frames)} quadros completos, {target.stat().st_size/1e6:.2f} MB')
    (CONCEPTS / 'runtime-manifest.json').write_text(json.dumps({'implemented': True, 'groups': records}, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
