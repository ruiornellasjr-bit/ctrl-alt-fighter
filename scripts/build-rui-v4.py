#!/usr/bin/env python3
"""Monta a sprite sheet v4 do Rui (grade de 6 colunas).

Por que este script existe, separado do repack-spritesheets.py:

  - O repack trata folhas ja no formato final do jogo (4 colunas x 8 linhas).
    A v4 do Rui e um caso hibrido: a arte nova de caminhada chegou como um
    arquivo proprio, com 6 quadros numa grade 3x2 e resolucao totalmente
    diferente, enquanto idle/soco/chute vieram numa folha 4x8 e as quatro
    acoes restantes ainda vem da v3.
  - A saida tem 6 colunas para caber a caminhada de 6 quadros. As linhas de
    4 quadros deixam as duas ultimas celulas vazias; o codigo le quantos
    quadros cada linha usa, entao celula vazia nunca e exibida.

Correcoes que este script aplica (todas medidas antes de escrever):

  1. Escala. A folha v4 chegou com idle de 240px, enquanto as outras oito
     folhas estao normalizadas em 218px. Como o jogo escala pela altura da
     CELULA e nao do conteudo, o Rui aparecia ~10% maior que o resto do
     elenco. Um unico fator por personagem (derivado do idle) corrige isso
     sem fazer o tamanho oscilar entre quadros.
  2. Fragmentos e vazamento. Os quadros 1 e 2 do soco tinham uma banda
     residual de 13px na ultima linha da celula (sangramento para o quadro
     de baixo) e o chute encostava no topo. A limpeza por faixa/componente
     do repack remove isso.
  3. Deriva lateral da caminhada. Na arte nova o ponto medio entre os pes
     vai de x=360 no quadro 1 a x=203 no quadro 6. Como o jogo ancora todo
     quadro no centro da celula, essa deriva vira deslizamento do tronco.
     Centralizar pela ancora dos pes remove o avanco desenhado e deixa o
     deslocamento por conta do codigo -- que e como o genero faz.

Linha 8 (agachamento), acrescentada depois:

  A arte de crouch chegou com 8 quadros numa grade 4x2, mas a medicao
  mostrou que as duas fileiras sao a MESMA sequencia de 4 poses, apenas
  reenquadrada. Ficamos com a fileira de baixo porque a deriva do ponto
  medio dos pes e de 12px contra 38px da de cima (a mesma metrica que
  causou o tronco deslizante da caminhada).

  Dos 4 quadros usamos apenas os 3 primeiros: a sequencia desce e o quarto
  quadro ja e o personagem se LEVANTANDO. Como o agachamento e um estado
  sustentado (fica ativo enquanto a tecla estiver pressionada), animar os
  quatro em loop faria o Rui subir e descer sozinho enquanto agachado. Com
  3 quadros e `holdsLastFrame`, a animacao toca a descida uma vez e segura
  na pose agachada -- que e o comportamento do genero.

Linha 6 (especial / Firewall Punch), acrescentada depois:

  Substitui a linha `special` herdada da v3. A arte tem 6 quadros numa grade
  3x2: carga (1-3), impacto (4-5) e recuperacao (6).

  O cuidado especifico desta arte e o EFEITO DE FOGO, que estende a silhueta
  muito alem do corpo -- a largura vai de 395px no quadro 1 a 572px no
  quadro 5, e um dos quadros encosta nas duas bordas laterais. Duas
  consequencias:

    - A escala nao pode vir da altura total da silhueta, senao o fogo acima
      da cabeca encolheria o personagem justamente nos quadros de impacto.
      Vem do quadro 1, que e a pose neutra (altura 436px estavel medindo em
      qualquer largura de faixa).
    - A ancora tem que ser o meio dos pes, nunca o centro da caixa. Ancorar
      pela caixa faria o Rui deslizar para tras conforme o fogo cresce a
      frente dele. `body_metrics` ja faz isso.

Linha 5 (pulo), acrescentada depois:

  Antes esta linha era uma copia crua da v3 (arte generica reusada por todo
  o elenco antigo). A arte nova tem 6 quadros numa grade 3x2 lida em Z:
  agachamento/preparacao (1), impulso (2), subida (3), apice (4), descida
  (5) e aterrissagem/agachamento (6).

  Usamos so os quadros 2-5. Os quadros 1 e 6 sao a MESMA pose de agachamento
  (preparacao e pouso, quase identicas entre si) e o estado de pulo do jogo
  so comeca depois que o personagem ja deixou o chao -- replay-la no ar
  seria redundante, o mesmo raciocinio que descartou o 4o quadro do
  agachamento. Alem disso `jump` usa `holdsLastFrame`: a animacao toca uma
  vez e CONGELA no ultimo quadro pelo resto do tempo no ar (o pulo dura
  ~0,95s de fisica contra 0,4s de animacao a 10fps). Terminar no quadro 6
  faria o personagem parecer ja ter aterrissado enquanto ainda esta
  visivelmente no ar; terminar no quadro 5 (caindo, pernas afastadas) e um
  congelamento plausivel durante a queda.

  A escala vem do primeiro quadro do subconjunto usado (o impulso, quadro
  2), a pose mais "em pe" entre as escolhidas -- mesmo raciocinio do
  agachamento (medir pela mais parecida com ficar em pe, nao pela media da
  linha, que encolheria a animacao por causa dos quadros aereos). Ao
  contrario do especial, esta arte nao tem efeito estendendo a silhueta,
  entao a altura de silhueta inteira basta.

Linha 9 (Gauncho), acrescentada depois:

  Visual exclusivo do Rui para o golpe de gancho universal (agachar + soco,
  `MOVES.hook` em src/combat.ts) -- o golpe em si nao muda para ninguem, so
  a arte do Rui. A fonte tem 14 quadros numa unica tira, 2000x667px.

  Deteccao dos quadros: a tecnica de `split_walk_frames` (coluna tem ALGUM
  pixel opaco) nao funciona aqui -- o rastro do golpe e a explosao do
  impacto conectam os quadros 3 a 14 num unico bloco continuo de alpha, e
  aquela tecnica acha uns 4 blocos em vez de 14 figuras. `split_gauncho_frames`
  conta QUANTOS pixels opacos cada coluna tem (densidade, nao presenca),
  suaviza com uma media movel curta e procura o minimo local dentro de uma
  janela ao redor de cada uma das 14 posicoes esperadas. Os vales resultantes
  separam as figuras mesmo com o rastro conectando-as.

  Selecao dos 6 quadros (de 14): a folha larga tem 6 colunas, entao sobra
  so uma fracao da arte-fonte -- mesma situacao ja resolvida para pulo (6->4)
  e agachamento (8->3). `GAUNCHO_KEEP_INDICES = [0, 3, 6, 7, 9, 13]`,
  conferido visualmente quadro a quadro (nao adivinhado por posicao igual):
  agachado pronto (0), carga com o braco ja recuado (3), subida do golpe com
  rastro (6), o IMPACTO -- o pico da explosao (7), retracao logo apos o
  impacto (9) e a recuperacao final, ja quase de volta a guarda (13). A
  primeira tentativa (descartar o quadro de impacto e usar dois quadros de
  braco-no-alto quase identicos logo depois dele) deixava o golpe sem o
  frame do soco em si e criava um salto perceptivel entre a carga e o braco
  ja erguido; a inspecao visual dos 14 recortes foi o que revelou o problema.

  Escala: NAO vem do primeiro quadro mantido (indice-fonte 0), que e um
  agachamento bem fechado (altura de corpo ~157px na faixa sobre os pes,
  bem abaixo dos outros quadros) -- usa-lo inflaria a escala e faria o
  Gauncho inteiro parecer maior que o resto da animacao de Rui. Em vez
  disso usa o indice-fonte 3 (carga, ~220px), que fica na mesma faixa dos
  quadros de recuperacao (9 e 13, ~223-251px) e representa melhor a altura
  tipica do corpo nesta pose. A medicao usa `body_height_over_feet` (faixa
  estreita sobre os pes), mesmo cuidado do Firewall Punch: a explosao do
  quadro de impacto se estende bem alem do corpo e distorceria a silhueta
  inteira.

  Quadro de impacto (indice-fonte 7): na escala de referencia (~0,99, quase
  1:1 -- bem diferente da escala ~0,5 do Firewall Punch, que comprime o
  fogo o bastante para caber), a caixa cheia deste quadro (corpo + explosao,
  371px) estoura os 256px da celula. Diferente do fogo do especial, a
  explosao aqui NAO e so pontas finas acima do corpo: uma medicao de
  densidade de pixel por linha (`_measure_burst.py`, descartavel) mostrou
  massa solida (75-141px por linha) da metade para cima de toda a caixa.
  Um corte por cima (tentado primeiro) apagava a maior parte da explosao em
  vez de aparar sobra. A solucao final e por quadro: quadros que cabem na
  escala de referencia usam ela normalmente; o (s) que nao cabem usam a
  MENOR escala necessaria para caber inteiros na celula (corpo + explosao
  preservados, so um pouco menores). Essa reducao so acontece no quadro de
  impacto e la a explosao domina a leitura do frame de qualquer forma, entao
  a mudanca de proporcao e pouco perceptivel; os outros 5 quadros usam a
  escala de referencia sem alteracao.

Uso:
    python3 scripts/build-rui-v4.py ARTE_CAMINHADA.png [ARTE_CROUCH.png]
                                    [ARTE_SPECIAL.png] [ARTE_PULO.png]
                                    [ARTE_GAUNCHO.png]

Os argumentos 2 a 5 sao opcionais e caem nos arquivos de sources/.
"""

import os
import sys

import numpy as np
from PIL import Image

# Reusa a logica ja calibrada do repack (clean_cell/body_metrics/constantes).
# O nome do arquivo tem hifen, entao o import e por caminho explicito.
import importlib.util
_spec = importlib.util.spec_from_file_location(
    'repack', os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           'repack-spritesheets.py'))
repack = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(repack)

FRAME_W, FRAME_H = repack.FRAME_W, repack.FRAME_H
BASELINE = repack.BASELINE
TARGET_IDLE_H = repack.TARGET_IDLE_H

# A saida da v4 tem 6 colunas para caber a caminhada nova e 10 linhas desde
# que o Gauncho ganhou linha propria (antes a folha tinha 9).
OUT_COLS, OUT_ROWS = 6, 10
# Quantos quadros cada linha realmente usa. O codigo do jogo le estes mesmos
# numeros do manifest; celulas alem disso ficam vazias e nunca sao exibidas.
ROW_FRAMES = {0: 4, 1: 6, 2: 4, 3: 4, 4: 4, 5: 4, 6: 6, 7: 4, 8: 3, 9: 6}
POSES = ['idle', 'walk', 'punch', 'kick', 'guard', 'jump', 'special', 'hurt',
         'crouch', 'gauncho']

# Quadros da fileira escolhida que entram na animacao de agachar. O quarto
# quadro da arte e o personagem se levantando: incluido, faria o agachamento
# oscilar sozinho enquanto sustentado. Ver docstring.
CROUCH_FRAMES = 3
# Fileira da arte de crouch (0 = superior, 1 = inferior). A inferior tem
# deriva de pes de 12px contra 38px da superior.
CROUCH_ROW = 1

# Quadros do Firewall Punch (especial do Rui), numa grade 3x2 lida em Z.
SPECIAL_FRAMES = 6

# Quadros do pulo, numa grade 3x2 lida em Z (mesmo formato do especial).
# A arte tem 6 poses (agachar, impulso, subida, apice, descida, aterrissar);
# usamos so as 4 do meio. Ver docstring do modulo.
JUMP_FRAMES = 4
JUMP_SKIP_FIRST = 1

# Proporcao entre altura da caminhada e do idle, medida nas oito folhas ja
# normalizadas (v3: idle 218px, walk 224px). Manter a mesma proporcao faz o
# Rui novo ficar coerente com o elenco existente.
WALK_TO_IDLE = 224 / 218

# Quadros do Gauncho, escolhidos entre os 14 da arte-fonte (ver docstring do
# modulo). Indices no espaco da arte-fonte (0-13), nao no espaco da folha.
GAUNCHO_FRAMES = 6
GAUNCHO_KEEP_INDICES = [0, 3, 6, 7, 9, 13]
# Quadro usado para medir a escala. NAO e o primeiro quadro mantido (indice
# 0 e um agachamento bem fechado que inflaria a escala) -- ver docstring.
GAUNCHO_SCALE_SOURCE_INDEX = 3


def split_walk_frames(path):
    """Extrai os 6 quadros da arte de caminhada.

    A arte vem numa grade 3x2 mas sem alinhamento exato de celula, entao em
    vez de cortar em tercos (que arrisca cortar um quadro largo) localizamos
    cada figura pelas colunas vazias que as separam. Medicao confirmou 3
    figuras bem destacadas em cada metade.
    """
    sheet = np.array(Image.open(path).convert('RGBA'))
    height, width = sheet.shape[:2]
    frames = []
    for half in range(2):
        band = sheet[half * (height // 2):(half + 1) * (height // 2)]
        filled = (band[:, :, 3] > repack.ALPHA_CUTOFF).any(axis=0)
        runs, start = [], None
        for x, has_pixel in enumerate(filled):
            if has_pixel and start is None:
                start = x
            elif not has_pixel and start is not None:
                runs.append((start, x))
                start = None
        if start is not None:
            runs.append((start, width))
        # Ignora respingos estreitos; queremos as 3 figuras reais.
        runs = [r for r in runs if r[1] - r[0] > 60]
        if len(runs) != 3:
            raise SystemExit(
                f'esperava 3 figuras na metade {half + 1}, achei {len(runs)}')
        for x0, x1 in runs:
            frames.append(band[:, x0:x1])
    return frames


def split_crouch_frames(path):
    """Extrai os quadros de agachamento da fileira escolhida.

    Diferente da caminhada, esta arte tem grade regular (4 colunas x 2
    fileiras) e as figuras nao encostam, entao cortar por fracao e seguro --
    a medicao confirmou uma unica figura por celula, sem fragmento solto.
    """
    sheet = np.array(Image.open(path).convert('RGBA'))
    height, width = sheet.shape[:2]
    cell_w, cell_h = width / 4, height / 2
    top = int(CROUCH_ROW * cell_h)
    bottom = int((CROUCH_ROW + 1) * cell_h)
    frames = []
    for col in range(CROUCH_FRAMES):
        frames.append(sheet[top:bottom,
                            int(col * cell_w):int((col + 1) * cell_w)])
    return frames

def split_special_frames(path):
    """Extrai os 6 quadros do Firewall Punch (grade 3x2, lida em Z)."""
    sheet = np.array(Image.open(path).convert('RGBA'))
    height, width = sheet.shape[:2]
    cell_w, cell_h = width / 3, height / 2
    frames = []
    for row in range(2):
        for col in range(3):
            frames.append(sheet[int(row * cell_h):int((row + 1) * cell_h),
                                int(col * cell_w):int((col + 1) * cell_w)])
    return frames


def split_jump_frames(path):
    """Extrai os 6 quadros de pulo (grade 3x2, lida em Z).

    Mesmo formato do especial: grade regular e sem encoste entre figuras
    (confirmado por medicao), entao o corte fracionario e seguro.
    """
    sheet = np.array(Image.open(path).convert('RGBA'))
    height, width = sheet.shape[:2]
    cell_w, cell_h = width / 3, height / 2
    frames = []
    for row in range(2):
        for col in range(3):
            frames.append(sheet[int(row * cell_h):int((row + 1) * cell_h),
                                int(col * cell_w):int((col + 1) * cell_w)])
    return frames


def split_gauncho_frames(path, expected=14):
    """Extrai os quadros do Gauncho por densidade de coluna, nao por presenca.

    O rastro do golpe e a explosao do impacto conectam os quadros 3 a 14 num
    unico bloco continuo de alpha; a tecnica de "alguma coluna com pixel
    opaco" usada em split_walk_frames NAO separa nada aqui (acha uns 4
    blocos em vez de 14 figuras). Contar QUANTOS pixels opacos cada coluna
    tem, suavizar com uma media movel curta (para ignorar ruido de coluna
    unica do traco do rastro) e procurar o minimo local dentro de uma janela
    em torno de cada posicao esperada revela os `expected` vales mesmo com o
    rastro conectando as figuras.
    """
    sheet = np.array(Image.open(path).convert('RGBA'))
    height, width = sheet.shape[:2]
    alpha = sheet[:, :, 3]
    density = (alpha > repack.ALPHA_CUTOFF).sum(axis=0).astype(float)

    win = 9
    kernel = np.ones(win) / win
    smooth = np.convolve(density, kernel, mode='same')

    approx_width = width / expected
    boundaries = [0]
    for k in range(1, expected):
        center = k * approx_width
        lo = int(center - approx_width * 0.4)
        hi = int(center + approx_width * 0.4)
        lo = max(lo, boundaries[-1] + 20)
        hi = min(hi, width)
        valley = lo + int(np.argmin(smooth[lo:hi]))
        boundaries.append(valley)
    boundaries.append(width)

    if len(boundaries) != expected + 1:
        raise SystemExit(
            f'esperava {expected} quadros no gauncho, achei '
            f'{len(boundaries) - 1}')

    return [sheet[:, boundaries[i]:boundaries[i + 1]] for i in range(expected)]


def body_height_over_feet(keep, half_width=40):
    """Altura do corpo medida numa faixa estreita sobre os pes.

    Existe por causa do fogo do Firewall Punch: a silhueta inteira inclui
    chamas bem acima da cabeca e muito a frente do corpo, entao a altura da
    caixa completa nao mede o personagem. Restringindo a uma coluna sobre a
    ancora dos pes, o que sobra e o corpo.
    """
    _, _, _, y1, anchor_x = repack.body_metrics(keep)
    ax = int(round(anchor_x))
    band = keep[:, max(0, ax - half_width):ax + half_width]
    rows_with_pixel = np.where(band.any(axis=1))[0]
    if rows_with_pixel.size == 0:
        _, y0, _, _, _ = repack.body_metrics(keep)
        return y1 - y0
    return y1 - int(rows_with_pixel.min())


def place(out, row, col, cleaned, keep, scale):
    """Escala um quadro e o ancora pelos pes no centro da celula."""
    x0, y0, x1, y1, anchor_x = repack.body_metrics(keep)
    crop = Image.fromarray(cleaned[y0:y1, x0:x1])
    new_w = max(1, int(round((x1 - x0) * scale)))
    new_h = max(1, int(round((y1 - y0) * scale)))
    crop = crop.resize((new_w, new_h), Image.LANCZOS)

    anchor_in_crop = (anchor_x - x0) * scale
    dest_x = int(round(FRAME_W / 2 - anchor_in_crop))
    dest_y = BASELINE - new_h
    dest_x = max(0, min(dest_x, FRAME_W - new_w))
    dest_y = max(0, min(dest_y, FRAME_H - new_h))

    out[row * FRAME_H + dest_y:row * FRAME_H + dest_y + new_h,
        col * FRAME_W + dest_x:col * FRAME_W + dest_x + new_w] = np.array(crop)
    return new_h


def main():
    if len(sys.argv) < 2:
        raise SystemExit(
            'uso: build-rui-v4.py ARTE_CAMINHADA.png [ARTE_CROUCH.png] '
            '[ARTE_SPECIAL.png] [ARTE_PULO.png] [ARTE_GAUNCHO.png]')
    walk_art = sys.argv[1]
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # Artes de edição ficam fora da pasta publicada.
    v4_dir = os.path.join(here, 'art-source', 'characters', 'rui')
    crouch_art = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        v4_dir, 'sources', 'rui-crouch-8frames.png')
    special_art = sys.argv[3] if len(sys.argv) > 3 else os.path.join(
        v4_dir, 'sources', 'rui-firewall-punch-6frames.png')
    jump_art = sys.argv[4] if len(sys.argv) > 4 else os.path.join(
        v4_dir, 'sources', 'rui-jump-6frames.png')
    gauncho_art = sys.argv[5] if len(sys.argv) > 5 else os.path.join(
        v4_dir, 'sources', 'rui-gauncho-14frames.png')
    # Folha v3 antiga do Rui (guard/jump/special/hurt de origem) guardada em legacy/,
    # já que o Rui não usa mais a v3 (spriteSheetVersion: 'v4' em fighters.ts).
    v3_sheet = os.path.join(v4_dir, 'legacy', 'spritesheet-v3.png')
    src_sheet = os.path.join(v4_dir, 'sources', 'rui-4row.png')
    out_path = os.path.join(v4_dir, 'spritesheet-v4.png')

    # --- 1. Linhas que vem da folha v4 de 4 colunas (idle/punch/kick) -------
    src = np.array(Image.open(src_sheet).convert('RGBA'))
    src_cells = {}
    for row in range(8):
        for col in range(4):
            cell = src[row * FRAME_H:(row + 1) * FRAME_H,
                       col * FRAME_W:(col + 1) * FRAME_W]
            cleaned, keep = repack.clean_cell(cell)
            src_cells[(row, col)] = None if cleaned is None else (cleaned, keep)

    idle_heights = []
    for col in range(4):
        entry = src_cells[(0, col)]
        if entry:
            _, y0, _, y1, _ = repack.body_metrics(entry[1])
            idle_heights.append(y1 - y0)
    idle_h = sum(idle_heights) / len(idle_heights)
    scale = TARGET_IDLE_H / idle_h

    # --- 2. Linhas que ainda vem da v3 (guard/hurt) -------------------------
    v3 = np.array(Image.open(v3_sheet).convert('RGBA'))

    # --- 3. Caminhada nova --------------------------------------------------
    walk_frames = []
    for raw in split_walk_frames(walk_art):
        cleaned, keep = repack.clean_cell(raw)
        if cleaned is None:
            raise SystemExit('quadro de caminhada vazio apos limpeza')
        walk_frames.append((cleaned, keep))
    walk_src_h = np.mean([repack.body_metrics(k)[3] - repack.body_metrics(k)[1]
                          for _, k in walk_frames])
    walk_scale = (TARGET_IDLE_H * WALK_TO_IDLE) / walk_src_h

    # --- 3b. Agachamento novo ----------------------------------------------
    # A escala vem do PRIMEIRO quadro, nao da media da linha: o quadro 1 e
    # praticamente a pose em pe, entao ancorar nele faz a transicao
    # idle -> crouch ficar continua em tamanho. Usar a media encolheria todo
    # o movimento, porque os quadros agachados sao naturalmente mais baixos.
    crouch_frames = []
    for raw in split_crouch_frames(crouch_art):
        cleaned, keep = repack.clean_cell(raw)
        if cleaned is None:
            raise SystemExit('quadro de agachamento vazio apos limpeza')
        crouch_frames.append((cleaned, keep))
    first = repack.body_metrics(crouch_frames[0][1])
    crouch_scale = TARGET_IDLE_H / (first[3] - first[1])

    # --- 3c. Firewall Punch (especial) -------------------------------------
    # A escala vem do quadro 1, que e a pose neutra antes do fogo aparecer, e
    # e medida numa faixa estreita sobre os pes. Usar a silhueta inteira faria
    # os quadros de impacto (onde a chama sobe acima da cabeca e avanca meia
    # tela) encolherem o personagem justamente no momento do golpe.
    special_frames = []
    for raw in split_special_frames(special_art):
        cleaned, keep = repack.clean_cell(raw)
        if cleaned is None:
            raise SystemExit('quadro do especial vazio apos limpeza')
        special_frames.append((cleaned, keep))
    special_scale = TARGET_IDLE_H / body_height_over_feet(special_frames[0][1])

    # --- 3d. Pulo novo -------------------------------------------------------
    # A escala vem do PRIMEIRO quadro do subconjunto usado (o impulso, quadro
    # 2 da arte-fonte): e a pose mais proxima de "em pe" entre as escolhidas,
    # mesmo raciocinio do agachamento. Ao contrario do especial, esta arte
    # nao tem efeito (fogo) estendendo a silhueta, entao a altura de silhueta
    # inteira basta -- nao precisa da faixa estreita sobre os pes.
    jump_frames = []
    for raw in split_jump_frames(jump_art)[JUMP_SKIP_FIRST:
                                            JUMP_SKIP_FIRST + JUMP_FRAMES]:
        cleaned, keep = repack.clean_cell(raw)
        if cleaned is None:
            raise SystemExit('quadro de pulo vazio apos limpeza')
        jump_frames.append((cleaned, keep))
    first = repack.body_metrics(jump_frames[0][1])
    jump_scale = TARGET_IDLE_H / (first[3] - first[1])

    # --- 3e. Gauncho (visual exclusivo do gancho) ---------------------------
    # A escala vem do indice-fonte 3 (carga), nao do primeiro quadro mantido
    # (indice 0, um agachamento bem fechado que inflaria a escala inteira).
    # Ver docstring do modulo.
    gauncho_all = []
    for raw in split_gauncho_frames(gauncho_art):
        cleaned, keep = repack.clean_cell(raw)
        if cleaned is None:
            raise SystemExit('quadro do gauncho vazio apos limpeza')
        gauncho_all.append((cleaned, keep))
    gauncho_frames = [gauncho_all[i] for i in GAUNCHO_KEEP_INDICES]
    _, ref_keep = gauncho_all[GAUNCHO_SCALE_SOURCE_INDEX]
    gauncho_scale = TARGET_IDLE_H / body_height_over_feet(ref_keep)

    # O quadro de impacto (explosao) e alto o bastante para estourar os
    # 256px da celula na escala do quadro de referencia: diferente do fogo
    # do Firewall Punch (que so estica a silhueta, comprimido por uma
    # escala baixa de ~0,5), a explosao do Gauncho ocupa boa parte da
    # altura do proprio quadro (medicao: densidade de pixel forte da metade
    # para cima da caixa, nao so pontas finas) -- cortar por cima apagaria
    # o efeito em vez de so aparar sobras. Por isso, so para os quadros que
    # nao cabem, a escala e reduzida o minimo necessario para caber
    # inteiros; os demais mantem a escala do restante da linha. A variacao
    # de tamanho cai bem no quadro do impacto (a explosao domina a leitura
    # do frame) e e bem menor nos outros dois quadros afetados.
    gauncho_max_h = BASELINE - 2
    gauncho_scales = []
    for cleaned, keep in gauncho_frames:
        _, y0, _, y1, _ = repack.body_metrics(keep)
        raw_h = y1 - y0
        gauncho_scales.append(min(gauncho_scale, gauncho_max_h / raw_h))

    # --- 4. Composicao ------------------------------------------------------
    out = np.zeros((FRAME_H * OUT_ROWS, FRAME_W * OUT_COLS, 4), np.uint8)
    report = []

    for row in range(OUT_ROWS):
        pose = POSES[row]
        if pose == 'walk':
            heights = [place(out, row, col, walk_frames[col][0],
                             walk_frames[col][1], walk_scale)
                       for col in range(6)]
            report.append(f'  walk  : 6 quadros (arte nova), '
                          f'altura {min(heights)}-{max(heights)}px, '
                          f'escala {walk_scale:.3f}')
        elif pose == 'special':
            heights = [place(out, row, col, special_frames[col][0],
                             special_frames[col][1], special_scale)
                       for col in range(SPECIAL_FRAMES)]
            report.append(f'  special: {SPECIAL_FRAMES} quadros (arte nova), '
                          f'altura {min(heights)}-{max(heights)}px, '
                          f'escala {special_scale:.3f}')
        elif pose == 'crouch':
            heights = [place(out, row, col, crouch_frames[col][0],
                             crouch_frames[col][1], crouch_scale)
                       for col in range(CROUCH_FRAMES)]
            report.append(f'  crouch: {CROUCH_FRAMES} quadros (arte nova), '
                          f'altura {min(heights)}-{max(heights)}px, '
                          f'escala {crouch_scale:.3f}')
        elif pose == 'jump':
            heights = [place(out, row, col, jump_frames[col][0],
                             jump_frames[col][1], jump_scale)
                       for col in range(JUMP_FRAMES)]
            report.append(f'  jump  : {JUMP_FRAMES} quadros (arte nova), '
                          f'altura {min(heights)}-{max(heights)}px, '
                          f'escala {jump_scale:.3f}')
        elif pose == 'gauncho':
            heights = [place(out, row, col, gauncho_frames[col][0],
                             gauncho_frames[col][1], gauncho_scales[col])
                       for col in range(GAUNCHO_FRAMES)]
            report.append(f'  gauncho: {GAUNCHO_FRAMES} quadros (arte nova), '
                          f'altura {min(heights)}-{max(heights)}px, '
                          f'escala {min(gauncho_scales):.3f}-'
                          f'{max(gauncho_scales):.3f}')
        elif pose in ('idle', 'punch', 'kick'):
            heights = []
            for col in range(4):
                entry = src_cells[(row, col)]
                if entry:
                    heights.append(place(out, row, col, entry[0], entry[1],
                                         scale))
            report.append(f'  {pose:6s}: 4 quadros (arte v4), '
                          f'altura {min(heights)}-{max(heights)}px')
        else:
            # Copia direta das celulas ja normalizadas da v3.
            for col in range(4):
                cell = v3[row * FRAME_H:(row + 1) * FRAME_H,
                          col * FRAME_W:(col + 1) * FRAME_W]
                out[row * FRAME_H:(row + 1) * FRAME_H,
                    col * FRAME_W:(col + 1) * FRAME_W] = cell
            report.append(f'  {pose:6s}: 4 quadros (herdados da v3)')

    image = Image.fromarray(out)
    image.save(out_path)
    runtime_path = os.path.join(here, 'public', 'assets', 'characters', 'rui', 'spritesheet-v4.webp')
    os.makedirs(os.path.dirname(runtime_path), exist_ok=True)
    image.save(runtime_path, 'WEBP', lossless=True, method=6, exact=True)
    print(f'{out_path}  ({FRAME_W * OUT_COLS}x{FRAME_H * OUT_ROWS}, '
          f'{OUT_COLS} colunas)')
    print(f'  escala base={scale:.3f} (idle origem {idle_h:.0f}px '
          f'-> {TARGET_IDLE_H}px)')
    print('\n'.join(report))


if __name__ == '__main__':
    main()
