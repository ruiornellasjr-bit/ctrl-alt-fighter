"""Empacota as 12 passadas ImageGen; mantém escala, cabeça e chão alinhados."""
import importlib.util
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'art-source/characters/rui'
COLLECTION = HERE / 'walk-v6'
WIDTH, HEIGHT, BASELINE, RATE = 320, 256, 248, 18
spec = importlib.util.spec_from_file_location('atlases', ROOT / 'scripts/build-yafa.py')
atlases = importlib.util.module_from_spec(spec)
spec.loader.exec_module(atlases)


def head_center(image):
    """Âncora do topo da cabeça; evita centrar ora num pé, ora no outro."""
    pixels = np.array(image.convert('RGBA'))
    y0 = image.getbbox()[1]
    strip = pixels[y0:y0+round(image.getbbox()[3]-y0)//10]
    ys, xs = np.nonzero(strip[:, :, 3] > 128)
    assert len(xs), 'Cabeça sem pixels visíveis'
    return float(xs.mean())


def main(backward=False):
    pose = 'walkBack' if backward else 'walk'
    label = 'Recuo andando' if backward else 'Caminhada'
    source = 'walk-back-12frames.png' if backward else 'walk-12frames-final.png'
    cells, _ = atlases.extract(COLLECTION / 'sources' / source, rows=4, columns=3)
    idle = Image.open(HERE / 'sources/frames/idle/01.png').convert('RGBA')
    # A escala depende da altura da coleção já integrada e do primeiro contato.
    # Não redimensiona cada pose de forma independente nem interpola movimentos.
    target_height = idle.getbbox()[3]-idle.getbbox()[1]+4
    scale = target_height / cells[0].height
    anchor = head_center(idle)
    atlas = Image.new('RGBA', (WIDTH*6, HEIGHT*2))
    frames = []
    frame_dir = HERE / 'sources/frames' / pose
    font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 17)
    for i, cell in enumerate(cells):
        resized = cell.resize((round(cell.width*scale), round(cell.height*scale)), Image.Resampling.LANCZOS)
        x = round(anchor-head_center(cell)*scale)
        y = BASELINE-resized.height
        assert x >= 8 and x+resized.width <= WIDTH-8 and y >= 8, (i, x, y)
        frame = Image.new('RGBA', (WIDTH, HEIGHT))
        frame.alpha_composite(resized, (x, y))
        frame_dir.mkdir(parents=True, exist_ok=True)
        frame.save(frame_dir / f'{i+1:02d}.png')
        atlas.alpha_composite(frame, (i%6*WIDTH, i//6*HEIGHT))
        preview = Image.new('RGB', (WIDTH, HEIGHT+32), '#101b2a')
        ImageDraw.Draw(preview).text((12, 8), f'{label} · 12 quadros', font=font, fill='#c2ef98')
        preview.paste(frame, (0, 32), frame)
        frames.append(preview)
    runtime = ROOT / 'public/assets/characters/rui' / ('rui-v6-walk-back.webp' if backward else 'rui-v6-walk.webp')
    atlas.save(runtime, 'WEBP', lossless=True, method=6, exact=True)
    assert Image.open(runtime).convert('RGBA').tobytes() == atlas.tobytes()
    (HERE / 'sources/atlases' / runtime.name).write_bytes(runtime.read_bytes())
    durations = [60, 50]*6
    for target in (COLLECTION / ('back-preview.gif' if backward else 'preview.gif'), HERE / 'previews' / f'{pose}.gif'):
        frames[0].save(target, save_all=True, append_images=frames[1:], duration=durations, loop=0)
    # Atualiza a prévia geral para que ela também mostre todas as novas passadas.
    if not backward:
        poses = ['walk', 'run', 'doublejump', 'backhop', 'punch', 'punchStrong', 'kickStrong', 'sweep', 'special']
        montage = []
        for i in range(12):
            page = Image.new('RGB', (WIDTH*3, (HEIGHT+32)*3), '#101b2a')
            for j, example in enumerate(poses):
                with Image.open(HERE / 'previews' / f'{example}.gif') as gif:
                    gif.seek(i if example == 'walk' else i//2)
                    page.paste(gif.convert('RGB'), (j%3*WIDTH, j//3*(HEIGHT+32)))
            montage.append(page)
        montage[6].save(HERE / 'preview.png')
        montage[0].save(HERE / 'preview.gif', save_all=True, append_images=montage[1:], duration=durations, loop=0)
    else:
        pair = []
        for i, frame in enumerate(frames):
            page = Image.new('RGB', (WIDTH*2, HEIGHT+32), '#101b2a')
            with Image.open(COLLECTION / 'preview.gif') as forward:
                forward.seek(i)
                page.paste(forward.convert('RGB'), (0, 0))
            page.paste(frame, (WIDTH, 0))
            pair.append(page)
        pair[0].save(COLLECTION / 'forward-back.gif', save_all=True, append_images=pair[1:], duration=durations, loop=0)
    # Folha de revisão numerada com as doze passadas em ordem.
    sheet = Image.new('RGB', (WIDTH*6, (HEIGHT+32)*2), '#101b2a')
    for i, frame in enumerate(frames):
        tile = frame.copy()
        ImageDraw.Draw(tile).text((WIDTH-34, 8), str(i+1), font=font, fill='#c2ef98')
        sheet.paste(tile, (i%6*WIDTH, i//6*(HEIGHT+32)))
    sheet.save(COLLECTION / ('back-preview.png' if backward else 'preview.png'))
    record = {'implemented': True, 'tool': 'Built-in ImageGen', 'pose': pose, 'file': runtime.name,
              'frames': 12, 'columns': 6, 'rows': 2, 'frameWidth': WIDTH, 'frameHeight': HEIGHT,
              'baseline': BASELINE, 'frameRate': RATE, 'repeat': -1, 'scale': scale,
              'alignment': 'fixed head anchor; boot baseline', 'bytes': runtime.stat().st_size}
    (COLLECTION / ('back-manifest.json' if backward else 'manifest.json')).write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
    manifest_file = HERE / 'manifest-v5.json'
    manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
    manifest.setdefault('overrides', {})[pose] = record
    manifest['uniqueFrameCount'] = 156 + sum(item['frames'] - (6 if name == 'walk' else 0) for name, item in manifest['overrides'].items())
    manifest['animationCount'] = 26 + int('walkBack' in manifest['overrides'])
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{label} Rui: 12 quadros a {RATE} FPS, WebP sem perda {runtime.stat().st_size/1e3:.0f} KB; prévias atualizadas.')


if __name__ == '__main__':
    main()
    if (COLLECTION / 'sources/walk-back-12frames.png').exists():
        main(backward=True)
