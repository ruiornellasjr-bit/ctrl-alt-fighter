"""Empacota as seis folhas geradas em atlas limpos. Requer Pillow e NumPy.

Extrai silhuetas inteiras por componentes conectados, em vez de cortar a
imagem em uma grade que pode atravessar cabelos ou botas. Usa uma escala
única para toda a coleção e linha de contato constante. Não cria arte nem interpola poses.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source/characters/monteiro/v5-sources'
OUTPUT = ROOT / 'public/assets/characters/monteiro'
GROUPS = {
    'locomotion': ['idle', 'walk', 'run', 'backhop'],
    'flight': ['jump', 'doublejump', 'airkick', 'land'],
    'attacks': ['punch', 'gauncho', 'kick', 'sweep'],
    'damage': ['hurt', 'hurtStrong', 'hurtLow', 'hurtHigh'],
    'defense': ['crouch', 'guard', 'knockdown', 'getup'],
    'special': ['special', 'super', 'blockHit', 'victory'],
}
WIDTH, HEIGHT, BASELINE = 320, 256, 248


def components(alpha):
    # Componentes por intervalos de pixels: dispensa SciPy e não altera a arte.
    parent, spans, previous = [], [], []

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for y, pixels in enumerate(alpha > 24):
        edges = np.flatnonzero(np.diff(np.pad(pixels.astype(np.int8), (1, 1))))
        current = []
        for start, end in zip(edges[::2], edges[1::2]):
            index = len(parent)
            parent.append(index)
            for old_start, old_end, old_index in previous:
                if old_start > end:
                    break
                if old_end >= start:
                    a, b = find(index), find(old_index)
                    if a != b:
                        parent[a] = b
            current.append((int(start), int(end), index))
            spans.append((y, int(start), int(end), index))
        previous = current
    groups = {}
    for y, start, end, index in spans:
        root = find(index)
        group = groups.setdefault(root, {'area': 0, 'box': [start, y, end, y + 1], 'spans': []})
        group['area'] += end - start
        group['spans'].append((y, start, end))
        box = group['box']
        box[:] = [min(box[0], start), min(box[1], y), max(box[2], end), max(box[3], y + 1)]
    return sorted(groups.values(), key=lambda item: item['area'], reverse=True)


def extract(image):
    pixels = np.array(image.convert('RGBA'))
    groups = components(pixels[:, :, 3])
    bodies = [group for group in groups if group['area'] > 2500]
    if len(bodies) != 24:
        raise ValueError(f'Esperadas 24 silhuetas separadas; encontradas {len(bodies)}')
    # Seis silhuetas por linha, ordenadas por centro e depois por posição X.
    bodies.sort(key=lambda item: (item['box'][1] + item['box'][3]) / 2)
    ordered = []
    for row in range(4):
        ordered.extend(sorted(bodies[row * 6:row * 6 + 6], key=lambda item: item['box'][0]))
    cells = []
    for body in ordered:
        x0, y0, x1, y1 = body['box']
        selected = [body]
        for fragment in groups:
            if fragment in bodies or fragment['area'] < 8:
                continue
            fx0, fy0, fx1, fy1 = fragment['box']
            if fx1 >= x0 - 12 and fx0 <= x1 + 12 and fy1 >= y0 - 12 and fy0 <= y1 + 12:
                selected.append(fragment)
        x0 = min(item['box'][0] for item in selected)
        y0 = min(item['box'][1] for item in selected)
        x1 = max(item['box'][2] for item in selected)
        y1 = max(item['box'][3] for item in selected)
        cutout = np.zeros((y1 - y0, x1 - x0, 4), dtype=np.uint8)
        for item in selected:
            for y, start, end in item['spans']:
                cutout[y - y0, start - x0:end - x0] = pixels[y, start:end]
        cells.append(Image.fromarray(cutout))
    return cells


def build(name, poses, cells, scale):
    # Uma única escala para todas as poses evita pulsação nas transições.
    atlas = Image.new('RGBA', (6 * WIDTH, 4 * HEIGHT))
    records = []
    for index, cell in enumerate(cells):
        resized = cell.resize((round(cell.width * scale), round(cell.height * scale)), Image.Resampling.LANCZOS)
        # O contato dos pés é centralizado; todas as silhuetas têm folga dos
        # quatro lados. O jogo posiciona o salto pela física, não pela folha.
        alpha = np.array(cell)[:, :, 3]
        contact = np.flatnonzero(np.any(alpha[int(cell.height * 0.88):] > 24, axis=0))
        pivot = (int(contact[0]) + int(contact[-1])) / 2 if len(contact) else cell.width / 2
        x = round(WIDTH / 2 - pivot * scale)
        x = max(8, min(WIDTH - 8 - resized.width, x))
        y = BASELINE - resized.height
        assert x >= 8 and y >= 8 and x + resized.width <= WIDTH - 8
        atlas.alpha_composite(resized, (index % 6 * WIDTH + x, index // 6 * HEIGHT + y))
        records.append({'pose': poses[index // 6], 'frame': index % 6, 'width': resized.width, 'height': resized.height})
    OUTPUT.mkdir(parents=True, exist_ok=True)
    target = OUTPUT / f'monteiro-v5-{name}.webp'
    atlas.save(target, 'WEBP', lossless=True, method=6, exact=True)
    with Image.open(target) as verified:
        assert verified.convert('RGBA').tobytes() == atlas.tobytes(), target
    print(f'{name}: 24 quadros inteiros, escala {scale:.3f}, {target.stat().st_size / 1e6:.2f} MB')
    return {'file': target.name, 'poses': poses, 'scale': scale, 'frames': records}


def preview():
    examples = [('locomotion', 1, 'Caminhada'), ('locomotion', 2, 'Corrida'),
                ('flight', 1, 'Pulo duplo'), ('attacks', 2, 'Chute alto'),
                ('attacks', 3, 'Rasteira'), ('damage', 1, 'Impacto forte')]
    atlases = {group: Image.open(OUTPUT / f'monteiro-v5-{group}.webp').convert('RGBA') for group, _, _ in examples}
    frames = []
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18)
    except OSError:
        font = ImageFont.load_default()
    for frame in range(6):
        canvas = Image.new('RGB', (3 * WIDTH, 2 * (HEIGHT + 32)), '#101b2a')
        draw = ImageDraw.Draw(canvas)
        for index, (group, row, label) in enumerate(examples):
            x, y = index % 3 * WIDTH, index // 3 * (HEIGHT + 32)
            draw.text((x + 14, y + 8), label, fill='#c2ef98', font=font)
            cell = atlases[group].crop((frame * WIDTH, row * HEIGHT, (frame + 1) * WIDTH, (row + 1) * HEIGHT))
            canvas.paste(cell, (x, y + 32), cell)
        frames.append(canvas)
    frames[0].save(SOURCE.parent / 'monteiro-v5-preview.gif', save_all=True, append_images=frames[1:], duration=100, loop=0)
    for atlas in atlases.values():
        atlas.close()


def main():
    extracted = {}
    for name in GROUPS:
        with Image.open(SOURCE / f'{name}.png') as image:
            extracted[name] = extract(image)
    all_cells = [cell for cells in extracted.values() for cell in cells]
    scale = min(218 / extracted['locomotion'][0].height, 302 / max(cell.width for cell in all_cells), 238 / max(cell.height for cell in all_cells))
    manifest = {'version': 5, 'frameWidth': WIDTH, 'frameHeight': HEIGHT, 'columns': 6, 'framesPerPose': 6, 'baseline': BASELINE,
                'groups': {name: build(name, poses, extracted[name], scale) for name, poses in GROUPS.items()}}
    (SOURCE.parent / 'manifest-v5.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    preview()


if __name__ == '__main__':
    main()
