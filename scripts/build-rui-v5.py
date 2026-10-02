"""Empacota os 156 quadros ImageGen do Rui usando o alinhamento da Yafa."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('six_frame_atlases', Path(__file__).with_name('build-yafa.py'))
atlases = importlib.util.module_from_spec(spec)
spec.loader.exec_module(atlases)

if __name__ == '__main__':
    atlases.main('rui', 'v5', 'v5-sources', export_portrait=False)
    walk_source = atlases.ROOT / 'art-source/characters/rui/walk-v6/sources/walk-12frames-final.png'
    if walk_source.exists():
        walk_spec = importlib.util.spec_from_file_location('rui_walk', Path(__file__).with_name('build-rui-walk-v6.py'))
        walk = importlib.util.module_from_spec(walk_spec)
        walk_spec.loader.exec_module(walk)
        walk.main()
        if (walk.COLLECTION / 'sources/walk-back-12frames.png').exists():
            walk.main(backward=True)
