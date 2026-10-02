"""Empacota coleções de seis quadros por pose; extrai silhuetas completas."""
from pathlib import Path
import importlib.util
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
GROUPS = {
    'locomotion': ['idle', 'walk', 'run', 'backhop'],
    'flight': ['jump', 'doublejump', 'airkick', 'land'],
    'attacks': ['punch', 'gauncho', 'kick', 'sweep'],
    'damage': ['hurt', 'hurtStrong', 'hurtLow', 'hurtHigh'],
    'defense': ['crouch', 'guard', 'knockdown', 'getup'],
    'special': ['special', 'super', 'blockHit', 'victory'],
    'strong': ['punchStrong', 'kickStrong'],
}
LABELS = ['Parado', 'Caminhada', 'Corrida', 'Recuo', 'Pulo', 'Pulo duplo', 'Chute aéreo', 'Pouso',
          'Soco fraco', 'Gancho', 'Chute fraco', 'Rasteira', 'Dano fraco', 'Dano forte', 'Dano baixo', 'Dano alto',
          'Agachamento', 'Guarda', 'Queda', 'Recuperação', 'Escudo da Apólice', 'Cláusula Final', 'Bloqueio atingido', 'Vitória', 'Soco forte', 'Chute forte']
WIDTH, HEIGHT, BASELINE = 320, 256, 248
spec = importlib.util.spec_from_file_location('components', ROOT / 'scripts/build-monteiro-v5.py')
components = importlib.util.module_from_spec(spec)
spec.loader.exec_module(components)


def extract(path, rows, columns=6):
    with Image.open(path) as source:
        pixels = np.array(source.convert('RGBA'))
    assert pixels[:, :, 3].min() == 0, f'Sem transparência: {path}'
    groups = components.components(pixels[:, :, 3])
    bodies = [g for g in groups if g['area'] > 2500]
    assert len(bodies) == rows * columns, (path, len(bodies))
    bodies.sort(key=lambda g: (g['box'][1] + g['box'][3]) / 2)
    ordered = []
    for row in range(rows):
        ordered.extend(sorted(bodies[row*columns:(row+1)*columns], key=lambda g: g['box'][0]))
    # Cada fragmento pertence somente à silhueta mais próxima.
    selected = [[body] for body in ordered]
    for g in groups:
        if any(g is b for b in bodies) or g['area'] < 8:
            continue
        x0, y0, x1, y1 = g['box']
        def distance(body):
            bx0, by0, bx1, by1 = body['box']
            return max(bx0-x1, x0-bx1, 0)**2 + max(by0-y1, y0-by1, 0)**2
        closest = min(range(len(ordered)), key=lambda i: distance(ordered[i]))
        if distance(ordered[closest]) <= 36**2:
            selected[closest].append(g)
    cells = []
    for fragments in selected:
        x0 = min(g['box'][0] for g in fragments); y0 = min(g['box'][1] for g in fragments)
        x1 = max(g['box'][2] for g in fragments); y1 = max(g['box'][3] for g in fragments)
        cut = np.zeros((y1-y0, x1-x0, 4), dtype=np.uint8)
        for g in fragments:
            for y, left, right in g['spans']:
                cut[y-y0, left-x0:right-x0] = pixels[y, left:right]
        cells.append(Image.fromarray(cut))
    return cells, 1536 / pixels.shape[1]


def main(character='yafa', version='v1', source_folder='sources', export_portrait=True):
    HERE = ROOT / 'art-source/characters' / character
    OUTPUT = ROOT / 'public/assets/characters' / character
    labels = LABELS.copy()
    if character == 'rui':
        labels[20:22] = ['Firewall Punch', 'Sincronia Total']
    extracted = {group: extract(HERE / source_folder / f'{group}.png', len(poses)) for group, poses in GROUPS.items()}
    scale = min(212 / extracted['locomotion'][0][0].height,
                min(302/(cell.width*factor) for cells, factor in extracted.values() for cell in cells),
                min(238/(cell.height*factor) for cells, factor in extracted.values() for cell in cells))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    atlas_sources = HERE / 'sources/atlases'; atlas_sources.mkdir(parents=True, exist_ok=True)
    preview_dir = HERE / 'previews'; preview_dir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 17)
    records, previews = {}, {}
    label_index = 0
    for group, poses in GROUPS.items():
        cells, factor = extracted[group]
        atlas = Image.new('RGBA', (WIDTH*6, HEIGHT*len(poses)))
        pose_records = []
        for row, pose in enumerate(poses):
            frames = []; frame_dir = HERE / 'sources/frames' / pose; frame_dir.mkdir(parents=True, exist_ok=True)
            for i in range(6):
                cell = cells[row*6+i]
                resized = cell.resize((round(cell.width*scale*factor), round(cell.height*scale*factor)), Image.Resampling.LANCZOS)
                alpha = np.array(cell)[:, :, 3]
                contact = np.flatnonzero(np.any(alpha[int(cell.height*.88):] > 24, axis=0))
                pivot = (int(contact[0])+int(contact[-1])) / 2
                x = max(8, min(WIDTH-8-resized.width, round(WIDTH/2-pivot*scale*factor)))
                y = BASELINE-resized.height
                assert x >= 8 and y >= 8 and x+resized.width <= WIDTH-8
                frame = Image.new('RGBA', (WIDTH, HEIGHT)); frame.alpha_composite(resized, (x, y))
                frame.save(frame_dir / f'{i+1:02d}.png')
                atlas.alpha_composite(frame, (i*WIDTH, row*HEIGHT))
                preview = Image.new('RGB', (WIDTH, HEIGHT+32), '#101b2a')
                ImageDraw.Draw(preview).text((12, 8), labels[label_index], font=font, fill='#c2ef98')
                preview.paste(frame, (0, 32), frame); frames.append(preview)
            rate = 100 if pose in ('walk', 'run') else 130
            frames[0].save(preview_dir / f'{pose}.gif', save_all=True, append_images=frames[1:], duration=[rate]*5+[rate if pose in ('idle','walk','run') else 550], loop=0)
            previews[pose] = frames
            pose_records.append({'pose': pose, 'row': row, 'frames': 6, 'preview': f'previews/{pose}.gif', 'label': labels[label_index]})
            label_index += 1
        target = OUTPUT / f'{character}-{version}-{group}.webp'
        atlas.save(target, 'WEBP', lossless=True, method=6, exact=True)
        with Image.open(target) as verified:
            assert verified.convert('RGBA').tobytes() == atlas.tobytes(), target
        (atlas_sources / target.name).write_bytes(target.read_bytes())
        records[group] = {'file': target.name, 'poses': pose_records, 'scale': scale*factor, 'bytes': target.stat().st_size}
        print(f'{group}: {len(cells)} quadros inteiros; {target.stat().st_size/1e3:.0f} KB')
    examples = ['walk','run','doublejump','backhop','punch','punchStrong','kickStrong','sweep','special']
    montage_frames = []
    for i in range(6):
        montage = Image.new('RGB', (WIDTH*3, (HEIGHT+32)*3), '#101b2a')
        for j, pose in enumerate(examples):
            montage.paste(previews[pose][i], (j%3*WIDTH, j//3*(HEIGHT+32)))
        montage_frames.append(montage)
    montage_frames[3].save(HERE / 'preview.png')
    montage_frames[0].save(HERE / 'preview.gif', save_all=True, append_images=montage_frames[1:], duration=[130]*5+[550], loop=0)
    if export_portrait:
        with Image.open(HERE / 'portrait.png') as original:
            portrait = original.convert('RGBA'); portrait.thumbnail((600, 900), Image.Resampling.LANCZOS)
            portrait.save(OUTPUT / 'portrait.webp', 'WEBP', quality=88, method=6, exact=True)
    manifest = {'implemented': True, 'tool': 'Built-in ImageGen', 'frameWidth': WIDTH, 'frameHeight': HEIGHT,
                'columns': 6, 'framesPerPose': 6, 'baseline': BASELINE, 'groups': records,
                'power': {'name': labels[20], 'super': labels[21]}}
    manifest_file = 'manifest.json' if character == 'yafa' else f'manifest-{version}.json'
    (HERE / manifest_file).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print('156 quadros, 26 animações; WebP e transparência conferidos.')


if __name__ == '__main__':
    main()
