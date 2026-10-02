"""Empacota as vitórias geradas no ImageGen, sem desenhar ou alterar a arte.

Extração das silhuetas completas, alinhamento e exportação WebP/GIF.
Os quadros compactos preservam o tamanho corporal do Monteiro v5/v6.
"""
from pathlib import Path
import importlib.util
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'art-source/characters/monteiro/victory-roster'
OUTPUT = HERE / 'sources/atlases'
IDS = ['kalliane', 'laura', 'caio', 'rui', 'monteiro', 'vinicius', 'yafa']
LABELS = ['Kalliane', 'Laura', 'Caio', 'Rui', 'Monteiro', 'Vinicius', 'Yafa']
WIDTH, HEIGHT, BASELINE = 384, 320, 300
spec = importlib.util.spec_from_file_location('victory_components', ROOT / 'scripts/build-monteiro-v5.py')
components = importlib.util.module_from_spec(spec)
spec.loader.exec_module(components)


def extract(path):
    with Image.open(path) as source:
        pixels = np.array(source.convert('RGBA'))
    assert pixels[:, :, 3].min() == 0, f'Fundo sem transparência: {path}'
    groups = components.components(pixels[:, :, 3])
    bodies = [g for g in groups if g['area'] > 2500]
    slots = [[] for _ in range(6)]
    cell_width = pixels.shape[1] / 3
    for g in bodies:
        x0, y0, x1, y1 = g['box']
        row = 0 if y1 < pixels.shape[0] * .65 else 1
        col = min(2, int((x0+x1)/2 / cell_width))
        slots[row*3+col].append(g)
    assert all(slots), f'Sequência incompleta: {path}'
    cuts, boxes = [], []
    for slot in slots:
        near = list(slot)
        for g in groups:
            if g['area'] < 8 or any(g is body for body in bodies):
                continue
            fx0, fy0, fx1, fy1 = g['box']
            if any(fx1 >= b['box'][0]-12 and fx0 <= b['box'][2]+12 and fy1 >= b['box'][1]-12 and fy0 <= b['box'][3]+12 for b in slot):
                near.append(g)
        x0, y0 = min(g['box'][0] for g in near), min(g['box'][1] for g in near)
        x1, y1 = max(g['box'][2] for g in near), max(g['box'][3] for g in near)
        cut = np.zeros((y1-y0, x1-x0, 4), dtype=np.uint8)
        for g in near:
            for y, left, right in g['spans']:
                cut[y-y0, left-x0:right-x0] = pixels[y, left:right]
        cuts.append(Image.fromarray(cut))
        boxes.append([x0, y0, x1, y1])
    return cuts, boxes, cell_width


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records, animations = {}, {}
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 15)
    except OSError:
        font = ImageFont.load_default()
    for opponent, label in zip(IDS, LABELS):
        cuts, boxes, source_cell = extract(HERE / 'sources' / f'{opponent}.png')
        scale = 212 / cuts[0].height
        atlas = Image.new('RGBA', (WIDTH*3, HEIGHT*2))
        frames, previews = [], []
        folder = HERE / 'sources/frames' / opponent
        folder.mkdir(parents=True, exist_ok=True)
        for i, (cut, box) in enumerate(zip(cuts, boxes)):
            resized = cut.resize((round(cut.width*scale), round(cut.height*scale)), Image.Resampling.LANCZOS)
            # Usa a coluna de origem como referência fixa: o rival e o cabo
            # não deslocam o Monteiro quando a silhueta muda de largura.
            x = round((WIDTH-source_cell*scale)/2 + (box[0] - i%3*source_cell)*scale)
            y = BASELINE-resized.height
            assert x >= 16 and y >= 16 and x+resized.width <= WIDTH-16, (opponent, i, x, y)
            frame = Image.new('RGBA', (WIDTH, HEIGHT))
            frame.alpha_composite(resized, (x, y))
            frame.save(folder / f'{i+1:02d}.png')
            atlas.alpha_composite(frame, (i%3*WIDTH, i//3*HEIGHT))
            frames.append(frame)
            preview = Image.new('RGB', (WIDTH, HEIGHT+30), '#101b2a')
            ImageDraw.Draw(preview).text((12, 8), label, font=font, fill='#c2ef98')
            preview.paste(frame, (0, 30), frame)
            previews.append(preview)
        target = OUTPUT / f'monteiro-victory-{opponent}.webp'
        atlas.save(target, 'WEBP', lossless=True, method=6, exact=True)
        with Image.open(target) as verified:
            assert np.array_equal(np.array(verified.convert('RGBA')), np.array(atlas)), target
        runtime = ROOT / 'public/assets/characters/monteiro/victories' / target.name
        runtime.parent.mkdir(parents=True, exist_ok=True)
        runtime.write_bytes(target.read_bytes())
        previews[0].save(HERE / f'{opponent}.gif', save_all=True, append_images=previews[1:], duration=[250]*5+[1150], loop=0)
        records[opponent] = {'file': target.name, 'frames': 6, 'frameWidth': WIDTH, 'frameHeight': HEIGHT,
                             'columns': 3, 'baseline': BASELINE, 'originY': 308/320,
                             'scale': scale, 'sourceBounds': boxes, 'bytes': target.stat().st_size}
        animations[opponent] = previews
        print(f'{opponent}: 6 quadros completos; {target.stat().st_size/1e3:.0f} KB')
    montage_frames = []
    for i in range(6):
        montage = Image.new('RGB', (WIDTH*3, (HEIGHT+30)*3), '#101b2a')
        for j, opponent in enumerate(IDS):
            montage.paste(animations[opponent][i], (j%3*WIDTH, j//3*(HEIGHT+30)))
        montage_frames.append(montage)
    montage_frames[-1].save(HERE / 'all-opponents.png')
    montage_frames[0].save(HERE / 'all-opponents.gif', save_all=True, append_images=montage_frames[1:], duration=[250]*5+[1150], loop=0)
    (HERE / 'manifest.json').write_text(json.dumps({'implemented': True, 'tool': 'Built-in ImageGen', 'opponents': records}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Total: {sum(r["bytes"] for r in records.values())/1e6:.2f} MB, {len(IDS)*6} quadros')


if __name__ == '__main__':
    main()
