import { describe, expect, it } from 'vitest';
import { applyDamage, comboReady, pickOpponents, roundWinner } from '../src/rules';

describe('regras da luta', () => {
  it('reconhece baixo, frente e especial para os dois lados', () => {
    expect(comboReady(['down', 'right'], 1)).toBe(true);
    expect(comboReady(['down', 'left'], -1)).toBe(true);
    expect(comboReady(['down', 'right'], -1)).toBe(false);
  });

  it('bloqueio reduz dano sem curar a barra', () => {
    expect(applyDamage(100, 20, true)).toBe(95);
    expect(applyDamage(4, 20, false)).toBe(0);
  });

  it('seleciona três adversários diferentes sem repetir o escolhido', () => {
    const selection = pickOpponents('kalliane', () => 0);
    expect(selection).toHaveLength(3);
    expect(new Set(selection).size).toBe(3);
    expect(selection).not.toContain('kalliane');
  });

  it('desempata tempo por vida e repete empate exato', () => {
    expect(roundWinner(60, 40)).toBe('player');
    expect(roundWinner(40, 60)).toBe('enemy');
    expect(roundWinner(40, 40)).toBe('draw');
  });
});
