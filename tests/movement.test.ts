import { describe, expect, it } from 'vitest';
import { facingOpponent, moveHorizontal, separateOnLanding } from '../src/movement';

describe('travessia dos lutadores', () => {
  it('segura a caminhada no chão antes do rival', () => {
    expect(moveHorizontal(300, 200, 400, false, false)).toBe(308);
    expect(moveHorizontal(500, -200, 400, false, false)).toBe(492);
  });

  it('permite cruzar no ar e inverte a direção ao ultrapassar', () => {
    expect(moveHorizontal(300, 200, 400, true, false)).toBe(500);
    expect(facingOpponent(300, 400)).toBe(1);
    expect(facingOpponent(500, 400)).toBe(-1);
    expect(moveHorizontal(500, -200, 400, true, false)).toBe(300);
    expect(facingOpponent(300, 400)).toBe(1);
  });

  it('separa os lutadores quando o salto termina sobre o rival', () => {
    expect(separateOnLanding(430, 400)).toBe(492);
    expect(separateOnLanding(370, 400)).toBe(308);
  });
});
