"""Extrai quadros e monta prévias das artes v6. Não altera arquivos do jogo.

Os PNGs gerados ficam preservados em sources/. Pillow/NumPy são usados
somente para separação das silhuetas, alinhamento e exportação dos GIFs.
"""
from pathlib import Path
import importlib.util
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
spec = importlib.util.spec_from_file_location('sprite_components', ROOT / 'scripts/build-monteiro-v5.py')
packer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packer)
NAMES = ['soco-fraco', 'soco-forte', 'chute-fraco', 'chute-forte', 'vitoria-cabo']
LABELS = ['Soco fraco', 'Soco forte', 'Chute fraco', 'Chute forte', 'Vitória com cabo de rede']
DURATIONS = [[100, 50, 40, 40, 50, 40, 50, 200], [180, 100, 80, 60, 120, 90, 90, 300],
             [110, 60, 60, 40, 70, 50, 70, 220], [180, 110, 100, 80, 140, 100, 100, 320],
             [450, 400, 450, 400, 400, 1600]]


def isolate(pixels, selected):
    x0 = min(g['box'][0] for g in selected)
    y0 = min(g['box'][1] for g in selected)
    x1 = max(g['box'][2] for g in selected)
    y1 = max(g['box'][3] for g in selected)
    output = np.zeros((y1-y0, x1-x0, 4), dtype=np.uint8)
    for g in selected:
        for y, left, right in g['spans']:
            output[y-y0, left-x0:right-x0] = pixels[y, left:right]
    return Image.fromarray(output), (x0, y0, x1, y1)


def extract(name):
    with Image.open(HERE / 'sources' / f'{name}.png') as source:
        pixels = np.array(source.convert('RGBA'))
    assert pixels[:, :, 3].min() == 0, 'Fundo sem transparência'
    groups = packer.components(pixels[:, :, 3])
    bodies = [g for g in groups if g['area'] > 2500]
    slots = []
    if name != 'vitoria-cabo':
        assert len(bodies) == 8, (name, len(bodies))
        bodies.sort(key=lambda g: (g['box'][1] + g['box'][3])/2)
        for row in range(2):
            slots.extend([[g] for g in sorted(bodies[row*4:(row+1)*4], key=lambda g: g['box'][0])])
    else:
        slots = [[] for _ in range(6)]
        for g in bodies:
            # A mão erguida ultrapassa a divisão horizontal da grade original.
            # A linha de contato, e não o topo do corpo, identifica a linha.
            x0, y0, x1, y1 = g['box']
            row = 0 if y1 < pixels.shape[0] * 0.65 else 1
            col = min(2, int((x0+x1)/2 / (pixels.shape[1]/3)))
            slots[row*3+col].append(g)
        assert all(slots), 'Vitória incompleta'
    cuts, boxes = [], []
    for slot in slots:
        near = list(slot)
        for g in groups:
            if g['area'] < 8 or any(g is body for body in bodies):
                continue
            fx0, fy0, fx1, fy1 = g['box']
            for body in slot:
                x0, y0, x1, y1 = body['box']
                if fx1 >= x0-12 and fx0 <= x1+12 and fy1 >= y0-12 and fy0 <= y1+12:
                    near.append(g)
                    break
        cut, box = isolate(pixels, near)
        cuts.append(cut)
        boxes.append(box)
    return cuts, boxes


def contact_pivot(image):
    alpha = np.array(image)[:, :, 3]
    contact = np.flatnonzero(np.any(alpha[int(image.height*0.88):] > 24, axis=0))
    return (int(contact[0])+int(contact[-1]))/2


def main():
    extracted = {name: extract(name) for name in NAMES}
    combat = [cut for name in NAMES[:4] for cut in extracted[name][0]]
    # Um pivô comum deixa espaço para o alcance à direita sem mudar a escala.
    scale = min(350/max(c.height for c in combat),
                166/max(contact_pivot(c) for c in combat),
                298/max(c.width-contact_pivot(c) for c in combat))
    records = []
    normalized = {}
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18)
    except OSError:
        font = ImageFont.load_default()
    for i, name in enumerate(NAMES):
        cuts, boxes = extracted[name]
        width, height = (640, 512) if i == 4 else (512, 512)
        columns = 3 if i == 4 else 4
        atlas = Image.new('RGBA', (columns*width, 2*height))
        folder = HERE / 'sources' / 'frames' / name
        folder.mkdir(parents=True, exist_ok=True)
        frames, previews = [], []
        for j, cut in enumerate(cuts):
            scaled = cut.resize((round(cut.width*scale), round(cut.height*scale)), Image.Resampling.LANCZOS)
            x = round(width/2 - scaled.width/2) if i == 4 else round(190-contact_pivot(cut)*scale)
            y = 480-scaled.height
            assert x >= 20 and x+scaled.width <= width-20 and y >= 20, (name, j, x, y)
            frame = Image.new('RGBA', (width, height))
            frame.alpha_composite(scaled, (x, y))
            frame.save(folder / f'{j+1:02d}.png')
            atlas.alpha_composite(frame, (j%columns*width, j//columns*height))
            frames.append(frame)
            preview = Image.new('RGB', (width, height+32), '#101b2a')
            ImageDraw.Draw(preview).text((16, 9), LABELS[i], font=font, fill='#c2ef98')
            preview.paste(frame, (0, 32), frame)
            previews.append(preview)
        atlas.save(HERE / 'sources' / f'{name}-atlas.png')
        previews[0].save(HERE / f'{name}.gif', save_all=True, append_images=previews[1:], duration=DURATIONS[i], loop=0)
        normalized[name] = frames
        records.append({'name': name, 'title': LABELS[i], 'frames': len(frames), 'frameWidth': width,
                        'frameHeight': height, 'columns': columns, 'baseline': 480,
                        'scale': scale, 'previewDurationsMs': DURATIONS[i], 'sourceBounds': boxes,
                        'atlas': f'sources/{name}-atlas.png', 'preview': f'{name}.gif'})
        print(f'{name}: {len(frames)} quadros íntegros, PNG transparente + GIF')
    combined = []
    for j in range(8):
        image = Image.new('RGB', (512, 576), '#101b2a')
        draw = ImageDraw.Draw(image)
        for i, name in enumerate(NAMES[:4]):
            x, y = i%2*256, i//2*288
            draw.text((x+10, y+8), LABELS[i], font=font, fill='#c2ef98')
            cell = normalized[name][j].resize((256, 256), Image.Resampling.LANCZOS)
            image.paste(cell, (x, y+32), cell)
        combined.append(image)
    combined[0].save(HERE / 'combate-preview.gif', save_all=True, append_images=combined[1:], duration=140, loop=0)
    (HERE / 'manifest.json').write_text(json.dumps({'implemented': True, 'animations': records}, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
