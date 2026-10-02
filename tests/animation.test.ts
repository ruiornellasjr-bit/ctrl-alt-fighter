import { describe, expect, it } from 'vitest';
import {
  LEGACY_GRID,
  WIDE_GRID,
  fighterAnimation,
  resolvePose,
  sheetGrid,
  spriteSheetLayout,
  visualPose,
  walkFrameRate,
} from '../src/animation';

describe('poses de combate', () => {
  it('mostra o golpe durante sua janela e depois volta ao estado apropriado', () => {
    expect(resolvePose('punch', 2, 1.9, false, 0, false)).toBe('punch');
    expect(resolvePose('punch', 2, 2.1, false, 0, false)).toBe('idle');
  });

  it('prioriza defesa e salto sobre caminhada', () => {
    expect(resolvePose(null, 0, 2, true, 0, true)).toBe('guard');
    expect(resolvePose(null, 0, 2, false, 70, true)).toBe('jump');
    expect(resolvePose(null, 0, 2, false, 0, true)).toBe('walk');
  });

  it('usa linhas diferentes para soco, chute e especial', () => {
    expect(visualPose('attack')).toBe('punch');
    expect(visualPose('kick')).toBe('kick');
    expect(fighterAnimation('punch').frames).toEqual([8, 9, 10, 11]);
    expect(fighterAnimation('kick').frames).toEqual([12, 13, 14, 15]);
    expect(fighterAnimation('special').frames).toEqual([24, 25, 26, 27]);
  });

  it('mantém loops contínuos apenas nas poses sustentadas', () => {
    expect(fighterAnimation('idle').repeat).toBe(-1);
    expect(fighterAnimation('walk').repeat).toBe(-1);
    expect(fighterAnimation('guard').repeat).toBe(-1);
    expect(fighterAnimation('punch').repeat).toBe(0);
  });

  it('carrega todas as folhas com células normalizadas', () => {
    expect(spriteSheetLayout('caio')).toEqual({ frameWidth: 320, frameHeight: 256 });
    expect(spriteSheetLayout('yafa')).toEqual({ frameWidth: 320, frameHeight: 256 });
  });
});

describe('grade da folha', () => {
  it('mantém a indexação de 4 colunas quando nenhuma grade é informada', () => {
    // Regressão: as oito folhas v3 dependem deste comportamento.
    expect(fighterAnimation('punch').frames).toEqual([8, 9, 10, 11]);
    expect(fighterAnimation('punch', LEGACY_GRID).frames).toEqual([8, 9, 10, 11]);
  });

  it('desloca o índice das linhas seguintes numa folha de 6 colunas', () => {
    // O índice do Phaser é linha * colunas + coluna, então o número de
    // colunas muda o início de TODAS as linhas abaixo da primeira.
    expect(fighterAnimation('idle', WIDE_GRID).frames).toEqual([0, 1, 2, 3]);
    expect(fighterAnimation('punch', WIDE_GRID).frames).toEqual([12, 13, 14, 15]);
    expect(fighterAnimation('hurt', WIDE_GRID).frames).toEqual([42, 43, 44, 45]);
  });

  it('usa os seis quadros só na caminhada da folha larga', () => {
    expect(fighterAnimation('walk', WIDE_GRID).frames).toEqual([6, 7, 8, 9, 10, 11]);
    expect(fighterAnimation('walk', LEGACY_GRID).frames).toEqual([4, 5, 6, 7]);
  });

  it('nunca gera mais quadros do que a folha tem colunas', () => {
    const frames = fighterAnimation('walk', {
      columns: 4,
      defaultFrames: 4,
      frameCount: { walk: 6 },
    }).frames;
    expect(frames).toEqual([4, 5, 6, 7]);
  });

  it('não anima as células vazias das linhas curtas numa folha larga', () => {
    // Regressão do bug pego por este arquivo: com 6 colunas, o idle chegou a
    // gerar [0..5] e animava duas células transparentes.
    for (const pose of ['idle', 'punch', 'kick', 'guard', 'jump', 'hurt'] as const) {
      expect(fighterAnimation(pose, WIDE_GRID).frames).toHaveLength(4);
    }
  });

  it('acelera a caminhada longa para manter a duração do ciclo', () => {
    // 6 quadros a 12fps levariam 0,5s por ciclo contra 0,33s dos 4 quadros.
    expect(walkFrameRate(4)).toBe(12);
    expect(walkFrameRate(6)).toBe(18);
    expect(fighterAnimation('walk', WIDE_GRID).frameRate).toBe(18);
    expect(fighterAnimation('walk').frameRate).toBe(12);
  });

  it('associa a versão da folha à grade correta', () => {
    expect(sheetGrid('v3')).toBe(LEGACY_GRID);
    expect(sheetGrid('v4')).toBe(WIDE_GRID);
  });

  it('preserva o loop contínuo da caminhada de seis quadros', () => {
    expect(fighterAnimation('walk', WIDE_GRID).repeat).toBe(-1);
  });
});

describe('Firewall Punch', () => {
  it('usa os seis quadros da folha larga', () => {
    // A arte é uma sequência completa: carga (1-3), impacto (4-5) e
    // recuperação (6). Cortar em quatro removeria a recuperação e o golpe
    // congelaria no meio do impacto.
    expect(fighterAnimation('special', WIDE_GRID).frames).toEqual([36, 37, 38, 39, 40, 41]);
  });

  it('mantém quatro quadros nas folhas de quatro colunas', () => {
    // Regressão: os oito personagens v3 seguem com o especial antigo. Pedir
    // seis quadros numa grade de 4 colunas invadiria a linha de baixo.
    expect(fighterAnimation('special', LEGACY_GRID).frames).toEqual([24, 25, 26, 27]);
  });

  it('segura no último quadro em vez de repetir o golpe', () => {
    expect(fighterAnimation('special', WIDE_GRID).repeat).toBe(0);
  });

  it('roda a 12fps para casar com o frame data do golpe', () => {
    // O startup (15 frames de simulação) equivale aos 3 quadros de carga
    // exatamente nesta cadência. Mudar aqui desalinha a hitbox da arte.
    expect(fighterAnimation('special', WIDE_GRID).frameRate).toBe(12);
  });
});

describe('agachamento', () => {
  it('pede a própria pose em vez de reusar a defesa', () => {
    // Antes da arte existir, agachar e defender eram visualmente idênticos.
    expect(visualPose('crouch')).toBe('crouch');
    expect(visualPose('guard')).toBe('guard');
  });

  it('usa a nona linha da folha larga', () => {
    // Linha 8 numa grade de 6 colunas começa no quadro 48.
    expect(fighterAnimation('crouch', WIDE_GRID).frames).toEqual([48, 49, 50]);
  });

  it('usa três quadros, não quatro', () => {
    // O quarto quadro da arte é o personagem se LEVANTANDO. Incluí-lo faria
    // o personagem subir e descer sozinho enquanto estivesse agachado.
    expect(fighterAnimation('crouch', WIDE_GRID).frames).toHaveLength(3);
  });

  it('segura no último quadro em vez de repetir a descida', () => {
    // Agachar é um estado sustentado: a descida toca uma vez e para.
    expect(fighterAnimation('crouch', WIDE_GRID).repeat).toBe(0);
  });

  it('cai de volta na linha de guarda nas folhas de oito linhas', () => {
    // Regressão: as oito folhas v3 não têm linha de agachamento. Sem o
    // alias, o jogo pediria a linha 8 de um arquivo que só tem 8 linhas
    // (índices 0-7) e o sprite ficaria em branco.
    expect(fighterAnimation('crouch', LEGACY_GRID).frames).toEqual([16, 17, 18, 19]);
    expect(fighterAnimation('crouch').frames).toEqual(
      fighterAnimation('guard').frames,
    );
  });

  it('herda a cadência e o loop da guarda quando usa o alias', () => {
    // O alias precisa redirecionar TUDO, não só a linha: uma pose que
    // segura no último quadro apontando para uma linha em loop congelaria
    // a defesa dos personagens que ainda estão na v3.
    const aliased = fighterAnimation('crouch', LEGACY_GRID);
    const guard = fighterAnimation('guard', LEGACY_GRID);
    expect(aliased.repeat).toBe(guard.repeat);
    expect(aliased.frameRate).toBe(guard.frameRate);
  });
});

describe('gancho visual (Gauncho)', () => {
  it('só troca de pose quando o golpe agachado é o gancho', () => {
    // Regressão: soco reto e outros golpes no estado `attack` continuam
    // mostrando o soco comum, inclusive sem informar `move`.
    expect(visualPose('attack')).toBe('punch');
    expect(visualPose('attack', 'punch')).toBe('punch');
    expect(visualPose('attack', 'hook')).toBe('gauncho');
  });

  it('usa a décima linha da folha larga', () => {
    // Linha 9 numa grade de 6 colunas começa no quadro 54.
    expect(fighterAnimation('gauncho', WIDE_GRID).frames).toEqual([54, 55, 56, 57, 58, 59]);
  });

  it('segura no último quadro em vez de repetir o golpe', () => {
    expect(fighterAnimation('gauncho', WIDE_GRID).repeat).toBe(0);
  });

  it('roda mais devagar que o frame data do golpe, sustentada fora da FSM', () => {
    // MOVES.hook soma 15 frames de simulação a 60fps = 0,25s -- essa janela
    // não muda (gameplay idêntica para todo mundo). A 24fps (cadência que
    // encaixaria os 6 quadros exatos nos 0,25s) a explosão do impacto
    // passava rápido demais para ser vista. Por isso a cadência é bem mais
    // lenta e a arena.ts sustenta a pose além dos 0,25s enquanto o
    // personagem ficar parado (ver `gaunchoVisualUntil`) -- sem atrasar a
    // recuperação de ninguém, só esticando o quanto o golpe fica visível.
    expect(fighterAnimation('gauncho', WIDE_GRID).frameRate).toBe(10);
  });

  it('cai de volta no soco comum nas folhas de oito linhas', () => {
    // Regressão: os personagens v3 não têm arte de Gauncho. Sem o alias, o
    // jogo pediria a linha 9 de um arquivo que só tem 8 linhas (índices
    // 0-7) e o sprite ficaria em branco.
    expect(fighterAnimation('gauncho', LEGACY_GRID).frames).toEqual([8, 9, 10, 11]);
    expect(fighterAnimation('gauncho').frames).toEqual(
      fighterAnimation('punch').frames,
    );
  });

  it('herda a cadência e o loop do soco quando usa o alias', () => {
    // O alias precisa redirecionar TUDO: uma pose com cadência diferente
    // apontando para a linha do soco desalinharia a hitbox nos personagens
    // que ainda estão na v3.
    const aliased = fighterAnimation('gauncho', LEGACY_GRID);
    const punch = fighterAnimation('punch', LEGACY_GRID);
    expect(aliased.repeat).toBe(punch.repeat);
    expect(aliased.frameRate).toBe(punch.frameRate);
  });
});
