"""Empacota as novas folhas do Caio nos atlas transparentes usados pelo jogo."""
import importlib.util
from pathlib import Path
import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'art-source/characters/caio'
spec = importlib.util.spec_from_file_location('six_frame_atlases', Path(__file__).with_name('build-yafa.py'))
atlases = importlib.util.module_from_spec(spec)
spec.loader.exec_module(atlases)


LABELS = ['Parado', 'Caminhada', 'Corrida', 'Salto para trás', 'Pulo', 'Pulo duplo', 'Chute aéreo', 'Pouso',
          'Soco fraco', 'Gancho', 'Chute fraco', 'Rasteira', 'Dano fraco', 'Dano forte', 'Dano baixo', 'Dano alto',
          'Agachamento', 'Defesa', 'Queda', 'Levantada', 'Ticket Bumerangue', 'Reinício Forçado', 'Defesa atingida', 'Vitória',
          'Soco forte', 'Chute forte']
atlases.LABELS = LABELS
SOURCE_SPRITE_SCALE = 0.87


def isolate_cells(source: Path, rows: int, columns: int, target: Path) -> int:
    """Remove fragmentos soltos entre células mantendo a maior silhueta de cada pose."""
    with Image.open(source) as opened:
        pixels = np.array(opened.convert('RGBA'))
    height, width = pixels.shape[:2]
    cell_width = math.ceil(width / columns)
    cell_height = math.ceil(height / rows)
    result = Image.new('RGBA', (cell_width * columns, cell_height * rows))
    accepted = 0
    for row in range(rows):
        y0, y1 = round(row * height / rows), round((row + 1) * height / rows)
        for col in range(columns):
            x0, x1 = round(col * width / columns), round((col + 1) * width / columns)
            tile = pixels[y0:y1, x0:x1]
            groups = atlases.components.components(tile[:, :, 3])
            bodies = [item for item in groups if item['area'] > 8000]
            if not bodies:
                raise ValueError(f'Quadro vazio em {source.name}, linha {row + 1}, coluna {col + 1}')
            body = max(bodies, key=lambda item: item['area'])
            bx0, by0, bx1, by1 = body['box']
            fragments = [body]
            for part in groups:
                if part is body or part['area'] < 8:
                    continue
                px0, py0, px1, py1 = part['box']
                # Alpha haze and clipped halos meet cell boundaries; they're not anatomy.
                if px0 < 8 or py0 < 8 or px1 > tile.shape[1]-8 or py1 >= tile.shape[0]-1:
                    continue
                distance = math.hypot(max(bx0-px1, px0-bx1, 0), max(by0-py1, py0-by1, 0))
                if distance <= 12 and part['area'] <= 5000:
                    fragments.append(part)
            ax0 = min(part['box'][0] for part in fragments)
            ay0 = min(part['box'][1] for part in fragments)
            ax1 = max(part['box'][2] for part in fragments)
            ay1 = max(part['box'][3] for part in fragments)
            if ax1-ax0 > tile.shape[1] or ay1-ay0 > tile.shape[0]:
                raise ValueError(f'Pose encostada na borda em {source.name}, linha {row + 1}, coluna {col + 1}: {(ax0, ay0, ax1, ay1)}')
            cut = np.zeros((ay1-ay0, ax1-ax0, 4), dtype=np.uint8)
            for part in fragments:
                for y, left, right in part['spans']:
                    cut[y-ay0, left-ax0:right-ax0] = tile[y, left:right]
            frame = Image.fromarray(cut)
            # ImageGen poses sometimes touch neighboring cell edges. Apply one
            # shared scale to every pose, creating a clean transparent gutter.
            frame = frame.resize((round(frame.width * SOURCE_SPRITE_SCALE),
                                  round(frame.height * SOURCE_SPRITE_SCALE)), Image.Resampling.LANCZOS)
            canvas = Image.new('RGBA', (cell_width, cell_height))
            canvas.alpha_composite(frame, ((cell_width-frame.width)//2, cell_height-6-frame.height))
            result.alpha_composite(canvas, (col*cell_width, row*cell_height))
            accepted += 1
    target.parent.mkdir(parents=True, exist_ok=True)
    result.save(target)
    count = sum(item['area'] > 2500 for item in atlases.components.components(np.array(result)[:, :, 3]))
    if count != rows * columns:
        raise ValueError(f'{source.name}: extração encontrou {count} poses; esperado {rows * columns}')
    return count


def prepare_collection() -> Path:
    output = HERE / 'v1-prepared'
    for group, poses in atlases.GROUPS.items():
        source = HERE / 'v1-sources' / f'{group}.png'
        rows = len(poses)
        with Image.open(source) as original:
            width, height = original.size
        if group == 'strong':
            # A fonte contém quatro linhas; as duas primeiras são os golpes fortes pedidos.
            rows = 2
            with Image.open(source) as original:
                usable = original.crop((0, 0, width, round(height/2)))
                temp = output / '_strong-first-two-rows.png'
                temp.parent.mkdir(parents=True, exist_ok=True)
                usable.save(temp)
            source = temp
        isolate_cells(source, rows, 6, output / f'{group}.png')
    return output


def build_walk(backward: bool, idle: Image.Image) -> dict:
    from PIL import Image as PILImage
    pose = 'walkBack' if backward else 'walk'
    collection = HERE / 'walk-v6'
    filename = 'walk-back-12frames.png' if backward else 'walk-12frames-final.png'
    source = collection / 'sources' / filename
    prepared = collection / 'sources' / 'prepared' / filename
    isolate_cells(source, 4, 3, prepared)
    cells, _ = atlases.extract(prepared, rows=4, columns=3)
    target_height = idle.getbbox()[3] - idle.getbbox()[1] + 4
    scale = target_height / cells[0].height

    def head_center(image):
        array = np.array(image.convert('RGBA'))
        y0, y1 = image.getbbox()[1], image.getbbox()[3]
        strip = array[y0:y0+max(1, (y1-y0)//10)]
        yy, xx = np.nonzero(strip[:, :, 3] > 128)
        if not len(xx):
            raise ValueError('Pose de caminhada sem pixels na região da cabeça')
        return float(xx.mean())

    anchor = head_center(idle)
    atlas = Image.new('RGBA', (320*6, 256*2))
    rendered = []
    frame_directory = HERE / 'sources/frames' / pose
    frame_directory.mkdir(parents=True, exist_ok=True)
    for index, source_cell in enumerate(cells):
        width, height = round(source_cell.width*scale), round(source_cell.height*scale)
        sprite = source_cell.resize((width, height), PILImage.Resampling.LANCZOS)
        x, y = round(anchor-head_center(source_cell)*scale), 248-height
        if x < 8 or x+width > 312 or y < 8:
            raise ValueError(f'Passada fora da célula {index+1}: {(x, y, width, height)}')
        frame = Image.new('RGBA', (320, 256))
        frame.alpha_composite(sprite, (x, y))
        frame.save(frame_directory / f'{index+1:02d}.png')
        atlas.alpha_composite(frame, (index % 6 * 320, index // 6 * 256))
        preview = Image.new('RGB', (320, 288), '#101b2a')
        font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 17)
        ImageDraw.Draw(preview).text((12, 8), f'{"Recuo andando" if backward else "Caminhada"} · 12 quadros', font=font, fill='#c2ef98')
        preview.paste(frame, (0, 32), frame)
        rendered.append(preview)
    runtime_name = f'caio-v6-walk{"-back" if backward else ""}.webp'
    runtime = ROOT / 'public/assets/characters/caio' / runtime_name
    atlas.save(runtime, 'WEBP', lossless=True, method=6, exact=True)
    if PILImage.open(runtime).convert('RGBA').tobytes() != atlas.tobytes():
        raise ValueError(f'Atlas WebP perdeu pixels: {runtime}')
    (HERE / 'sources/atlases').mkdir(parents=True, exist_ok=True)
    (HERE / 'sources/atlases' / runtime_name).write_bytes(runtime.read_bytes())
    durations = [60, 50] * 6
    target_preview = collection / ('back-preview.gif' if backward else 'preview.gif')
    rendered[0].save(target_preview, save_all=True, append_images=rendered[1:], duration=durations, loop=0)
    rendered[0].save(HERE / 'previews' / f'{pose}.gif', save_all=True, append_images=rendered[1:], duration=durations, loop=0)
    manifest = {'implemented': True, 'tool': 'Built-in ImageGen', 'pose': pose, 'file': runtime_name, 'frames': 12,
                'columns': 6, 'rows': 2, 'frameWidth': 320, 'frameHeight': 256, 'baseline': 248,
                'frameRate': 18, 'repeat': -1, 'scale': scale, 'alignment': 'fixed head anchor and boot baseline'}
    (collection / ('back-manifest.json' if backward else 'manifest.json')).write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return manifest


if __name__ == '__main__':
    source_folder = prepare_collection()
    atlases.main('caio', 'v1', 'v1-prepared', export_portrait=False)
    manifest = ROOT / 'art-source/characters/caio/manifest-v1.json'
    data = json.loads(manifest.read_text(encoding='utf-8'))
    data['power'] = {'special': 'Ticket Bumerangue', 'alternate': 'Tela Azul', 'super': 'Reinício Forçado'}
    manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    idle = Image.open(HERE / 'sources/frames/idle/01.png').convert('RGBA')
    overrides = {}
    for backward in (False, True):
        overrides['walkBack' if backward else 'walk'] = build_walk(backward, idle)
    data = json.loads(manifest.read_text(encoding='utf-8'))
    data['overrides'] = overrides
    data['uniqueFrameCount'] = 174
    data['animationCount'] = 27
    manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (HERE / 'v1-sources' / 'generation-prompts-v1.json').write_text(json.dumps({
        'tool': 'Built-in ImageGen', 'implemented': True,
        'references': ['../portrait.png', '../spritesheet-v3.png', 'Monteiro/Rui collections for style only'],
        'animations': json.loads((HERE / 'v1-sources/generation-prompts-v1.json').read_text(encoding='utf-8'))['animations'],
        'walkPrompts': {
            'walk': 'Use os retratos e a folha de combate de Caio como referência de identidade. Gere uma folha de sprites RGBA transparente de um lutador arcade 2D, grade exata 3 colunas × 4 linhas, 12 quadros únicos em leitura da esquerda para a direita e de cima para baixo. Caio mantém o rosto, cabelo, óculos, jaqueta branca com capuz azul, calça preta com faixas azuis e tênis azul e branco. Câmera lateral em três quartos, de frente para a direita. Ciclo contínuo de caminhada para a frente com contatos alternados dos pés esquerdo e direito, quadros de passagem e balanço natural dos braços; não repetir a mesma pose. Um personagem completo por célula, sem recortar cabeça, mãos ou sapatos, silhueta com margem transparente uniforme, tamanho e linha dos pés coerentes entre quadros. Sem fundo, sombra projetada, grade, texto ou outros personagens.',
            'walkBack': 'Use os retratos e a folha de combate de Caio como referência de identidade. Gere uma folha de sprites RGBA transparente de um lutador arcade 2D, grade exata 3 colunas × 4 linhas, 12 quadros únicos em leitura da esquerda para a direita e de cima para baixo. Caio recua caminhando para a esquerda enquanto mantém o rosto, peito e guarda voltados para a direita, olhando o rival. Pés alternados em contatos e passagens naturais, joelhos flexionados, braços em guarda e deslocamento claro para trás; manter perfil lateral em três quartos, sem virar de costas. Preservar exatamente os mesmos traços e uniforme em todos os quadros. Um corpo inteiro por célula, margem transparente uniforme, sem cortes nem sobreposição; tamanho do corpo e chão consistentes. Sem fundo, grade, texto ou outros personagens.',
        },
        'manifest': '../manifest-v1.json'
    }, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('Caio: 174 quadros integrados em 27 animações.')
