"""Cria somente o WebP de runtime da nova arena, sem reprocessar outros cenários."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('image_optimizer', Path(__file__).with_name('optimize-assets.py'))
optimizer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(optimizer)

if __name__ == '__main__':
    source = ROOT / 'art-source/stages/ultima-conexao-arena.png'
    before, after = optimizer.optimize(source)
print(f'Ultima Conexao: {before/1e6:.2f} MB -> {after/1e6:.2f} MB WebP')
