"""Empacota atlas v1 para lutadores de negócio que receberam novas artes."""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('caio_v1_tools', Path(__file__).with_name('build-caio-v1.py'))
tools = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tools)
atlases = tools.atlases
atlases.LABELS = ['Parado', 'Caminhada', 'Corrida', 'Salto para trás', 'Pulo', 'Pulo duplo', 'Chute aéreo', 'Pouso',
                  'Soco fraco', 'Gancho', 'Chute fraco', 'Rasteira', 'Dano fraco', 'Dano forte', 'Dano baixo', 'Dano alto',
                  'Agachamento', 'Defesa', 'Queda', 'Levantada', 'Poder especial', 'Super', 'Defesa atingida', 'Vitória',
                  'Soco forte', 'Chute forte']
CHARACTERS = {
    'kalliane': ('Proposta irresistível', 'Contrato Assinado!'),
    'laura': ('Investimento certo', 'Fechamento do Mês'),
    'vinicius': ('Processador voador', 'Modo Turbo do Datacenter'),
}


def main(character: str) -> None:
    if character not in CHARACTERS:
        raise SystemExit(f'Personagem não permitido: {character}')
    here = ROOT / 'art-source/characters' / character
    sources = here / 'v1-sources'
    prepared = here / 'v1-prepared'
    for group, poses in atlases.GROUPS.items():
        rows = len(poses)
        source = sources / f'{group}.png'
        if group == 'strong':
            from PIL import Image
            with Image.open(source) as sheet:
                if sheet.width / sheet.height < 2:  # crop 6x4 sources; keep native 6x2 sheets intact
                    source = prepared / '_strong-first-two-rows.png'
                    source.parent.mkdir(parents=True, exist_ok=True)
                    sheet.crop((0, 0, sheet.width, round(sheet.height / 2))).save(source)
            rows = 2
        tools.isolate_cells(source, rows, 6, prepared / f'{group}.png')
    atlases.main(character, 'v1', 'v1-prepared', export_portrait=False)
    manifest_path = here / 'manifest-v1.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['power'] = {'special': CHARACTERS[character][0], 'super': CHARACTERS[character][1]}
    manifest['generationPrompts'] = '../_shared/generation-prompts-v1.json'
    manifest['animationCount'] = 26
    manifest['uniqueFrameCount'] = 156
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (here / 'README-v1.txt').write_text(
        f"Coleção de animações v1 para {character}. Contém 156 quadros em 26 animações, "
        f"mais os golpes fortes; poderes preservados: {CHARACTERS[character][0]} e {CHARACTERS[character][1]}.\n"
        "As folhas ImageGen originais ficam em v1-sources/ e os prompts completos em "
        "../_shared/generation-prompts-v1.json. Para reconstruir: python scripts/build-roster-fighter-v1.py "
        f"{character}.\n", encoding='utf-8')
    print(f'{character}: 156 quadros em 26 animações.')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Uso: python scripts/build-roster-fighter-v1.py <kalliane|laura|vinicius>')
    main(sys.argv[1])
