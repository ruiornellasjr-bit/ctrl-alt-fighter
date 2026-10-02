"""Gera as imagens leves do jogo a partir de art-source/. Requer Pillow.

Sprites preservam grade, dimensões, transparência e pixels visíveis (WebP
sem perda). Imagens estáticas usam a resolução de exibição e qualidade 88.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source'
OUTPUT = ROOT / 'public' / 'assets'


def optimize(path: Path) -> tuple[int, int]:
    relative = path.relative_to(SOURCE)
    destination = OUTPUT / relative.with_suffix('.webp')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(path) as original:
        image = original.convert('RGBA')
        sprite = path.stem.startswith('spritesheet-')
        if not sprite:
            if relative.parts[0] == 'stages':
                bounds = (960, 540)
            elif path.stem == 'portrait':
                bounds = (600, 900)
            elif path.stem == 'logo':
                bounds = (1086, 362)
            elif path.stem == 'victory':
                bounds = (480, 640)
            else:
                bounds = (1280, 900)
            image.thumbnail(bounds, Image.Resampling.LANCZOS)
        image.save(destination, 'WEBP', lossless=sprite, quality=88, method=6, exact=True)
        with Image.open(destination) as verified:
            assert verified.size == image.size, destination
            if sprite:
                assert verified.convert('RGBA').tobytes() == image.tobytes(), destination
    return path.stat().st_size, destination.stat().st_size


def main():
    total_before = total_after = count = 0
    for path in sorted(SOURCE.rglob('*.png')):
        relative = path.relative_to(SOURCE)
        if 'sources' in relative.parts or 'legacy' in relative.parts or 'v5-sources' in relative.parts or 'victory-roster' in relative.parts or 'walk-v6' in relative.parts or any(part.endswith('-prepared') for part in relative.parts):
            continue
        if path.stem in ('preview', 'game-proof'):
            continue
        if path.stem == 'adalberto-toast-cutout':
            # A foto foi retirada do jogo; preservar somente a arte original.
            continue
        if relative.parent.as_posix() in ('characters/cliente', 'characters/homologacao', 'characters/prazo', 'characters/yafa'):
            # Yafa tem empacotador próprio; os três personagens foram arquivados.
            continue
        if relative.parent.as_posix() == 'characters/monteiro' and path.stem in ('spritesheet-v3', 'victory'):
            continue
        if relative.parent.as_posix() == 'characters/caio' and path.stem == 'spritesheet-v3':
            # Caio usa os atlas v1 dedicados; manter a folha antiga só em art-source/.
            continue
        if relative.parent.as_posix() in ('characters/kalliane', 'characters/laura', 'characters/vinicius') and path.stem == 'spritesheet-v3':
            # Lutadores com atlas v1 não precisam carregar suas folhas antigas no jogo.
            continue
        if relative.parent.as_posix() == 'characters/rui' and path.stem != 'portrait':
            # A coleção v5 tem empacotador próprio; folhas antigas e prévias ficam na origem.
            continue
        before, after = optimize(path)
        total_before += before
        total_after += after
        count += 1
    if not count:
        raise SystemExit('Nenhuma imagem encontrada em art-source/.')
    print(f'{count} imagens: {total_before / 1e6:.2f} MB -> {total_after / 1e6:.2f} MB '
          f'({100 * (1 - total_after / total_before):.1f}% menos).')


if __name__ == '__main__':
    main()
