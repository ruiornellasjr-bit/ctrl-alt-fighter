import { describe, expect, it } from 'vitest';
import { gamepadTransitions, readGamepadActions, readGamepadMenuButtons } from '../src/gamepad';

function pad(buttons: number[] = [], axes: number[] = [0, 0]): Gamepad {
  const values = Array.from({ length: 16 }, (_, index) => ({ pressed: buttons.includes(index), value: buttons.includes(index) ? 1 : 0 }));
  return { buttons: values, axes, connected: true, id: 'test-pad', index: 0, mapping: 'standard', timestamp: 0, hapticActuators: [], vibrationActuator: null } as unknown as Gamepad;
}

describe('controles de joystick padrão', () => {
  it('mapeia direção, pulo, golpes e defesa nos botões Xbox/USB', () => {
    expect([...readGamepadActions(pad([0, 2, 4, 7, 12, 14]))]).toEqual(['left', 'jump', 'attack', 'heavyAttack', 'special', 'block']);
  });

  it('lê o analógico com zona morta para evitar movimento involuntário', () => {
    expect([...readGamepadActions(pad([], [0.2, -0.2]))]).toEqual([]);
    expect([...readGamepadActions(pad([], [-0.8, 0.8]))]).toEqual(['left', 'down']);
  });

  it('separa confirmação, voltar e pausa nos botões de sistema', () => {
    expect(readGamepadMenuButtons(pad([0, 1, 9]))).toEqual({ confirm: true, back: true, start: true });
  });

  it('não transforma o botão A usado no menu em um soco ao entrar ou voltar à luta', () => {
    const heldA = new Set(['attack'] as const);
    expect(gamepadTransitions(heldA, heldA, new Set(), true)).toEqual({ pressed: [], released: [] });
    expect(gamepadTransitions(new Set(), heldA, new Set(), true).pressed).toEqual(['attack']);
  });

  it('sincroniza movimento ao entrar na luta e solta todos os controles ao pausar', () => {
    const held = new Set(['left', 'block'] as const);
    expect(gamepadTransitions(held, held, new Set(), true).pressed).toEqual(['left', 'block']);
    expect(gamepadTransitions(held, held, held, false).released).toEqual(['left', 'block']);
  });
});
