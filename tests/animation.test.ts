import { describe, expect, it } from 'vitest';
import { fighterAnimation, resolvePose, spriteSheetLayout, visualPose } from '../src/animation';

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
    expect(spriteSheetLayout('cliente')).toEqual({ frameWidth: 320, frameHeight: 256 });
  });
});
