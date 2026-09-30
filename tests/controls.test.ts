import { describe, expect, it } from 'vitest';
import {
  ACTION_LABELS,
  CONTROL_ACTIONS,
  GUEST_CONTROLS,
  MOVE_SUMMARY,
  PLAYER_ONE_CONTROLS,
  PLAYER_TWO_CONTROLS,
  actionForCode,
  codeFor,
  labelFor,
} from '../src/config/controls';

describe('controls config', () => {
  it('maps Player 1 to WASD movement and JKLUI actions', () => {
    expect(codeFor(PLAYER_ONE_CONTROLS, 'jump')).toBe('KeyW');
    expect(codeFor(PLAYER_ONE_CONTROLS, 'left')).toBe('KeyA');
    expect(codeFor(PLAYER_ONE_CONTROLS, 'down')).toBe('KeyS');
    expect(codeFor(PLAYER_ONE_CONTROLS, 'right')).toBe('KeyD');
    expect(codeFor(PLAYER_ONE_CONTROLS, 'attack')).toBe('KeyJ');
    expect(codeFor(PLAYER_ONE_CONTROLS, 'kick')).toBe('KeyK');
    expect(codeFor(PLAYER_ONE_CONTROLS, 'special')).toBe('KeyL');
    expect(codeFor(PLAYER_ONE_CONTROLS, 'super')).toBe('KeyU');
    expect(codeFor(PLAYER_ONE_CONTROLS, 'block')).toBe('KeyI');
  });

  it('maps Player 2 to arrow movement and numpad actions', () => {
    expect(codeFor(PLAYER_TWO_CONTROLS, 'jump')).toBe('ArrowUp');
    expect(codeFor(PLAYER_TWO_CONTROLS, 'left')).toBe('ArrowLeft');
    expect(codeFor(PLAYER_TWO_CONTROLS, 'down')).toBe('ArrowDown');
    expect(codeFor(PLAYER_TWO_CONTROLS, 'right')).toBe('ArrowRight');
    expect(codeFor(PLAYER_TWO_CONTROLS, 'attack')).toBe('Numpad4');
    expect(codeFor(PLAYER_TWO_CONTROLS, 'kick')).toBe('Numpad5');
    expect(codeFor(PLAYER_TWO_CONTROLS, 'special')).toBe('Numpad6');
    expect(codeFor(PLAYER_TWO_CONTROLS, 'super')).toBe('Numpad1');
    expect(codeFor(PLAYER_TWO_CONTROLS, 'block')).toBe('Numpad2');
  });

  it('resolves the action bound to a given key code, or null if unbound in that scheme', () => {
    expect(actionForCode(PLAYER_ONE_CONTROLS, 'KeyJ')).toBe('attack');
    expect(actionForCode(PLAYER_ONE_CONTROLS, 'KeyU')).toBe('super');
    expect(actionForCode(PLAYER_ONE_CONTROLS, 'Numpad4')).toBeNull();
    expect(actionForCode(PLAYER_TWO_CONTROLS, 'Numpad4')).toBe('attack');
  });

  it('every control action has a readable label in both schemes and in ACTION_LABELS', () => {
    for (const action of CONTROL_ACTIONS) {
      expect(labelFor(PLAYER_ONE_CONTROLS, action)).toBeTruthy();
      expect(labelFor(PLAYER_TWO_CONTROLS, action)).toBeTruthy();
      expect(ACTION_LABELS[action]).toBeTruthy();
    }
  });

  it('guest scheme reuses the Player 1 bindings for the online guest keyboard', () => {
    expect(GUEST_CONTROLS).toBe(PLAYER_ONE_CONTROLS);
  });

  it('move summary only references known control actions and has content', () => {
    expect(MOVE_SUMMARY.length).toBeGreaterThan(0);
    for (const entry of MOVE_SUMMARY) {
      expect(entry.actions.length).toBeGreaterThan(0);
      for (const action of entry.actions) expect(CONTROL_ACTIONS).toContain(action);
    }
  });

  it('no two actions share the same key within a single scheme', () => {
    for (const scheme of [PLAYER_ONE_CONTROLS, PLAYER_TWO_CONTROLS]) {
      const codes = CONTROL_ACTIONS.map(action => codeFor(scheme, action));
      expect(new Set(codes).size).toBe(codes.length);
    }
  });
});
