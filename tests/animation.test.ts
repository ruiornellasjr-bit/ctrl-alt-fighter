import { describe, expect, it } from 'vitest';
import { resolvePose } from '../src/animation';

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
});
