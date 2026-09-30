import { describe, expect, it } from 'vitest';
import { canCrouch, canGuard, canJump, canMove, canStartAction, canTurn, isLocked, resolveGroundIdleState } from '../src/fsm';

describe('fsm: travas de movimento (regra 1 e 2)', () => {
  it('só permite andar em idle ou walk', () => {
    expect(canMove('idle')).toBe(true);
    expect(canMove('walk')).toBe(true);
    expect(canMove('crouch')).toBe(false);
    expect(canMove('attack')).toBe(false);
    expect(canMove('hurt')).toBe(false);
    expect(canMove('blockstun')).toBe(false);
    expect(canMove('guard')).toBe(false);
    expect(canMove('jump')).toBe(false);
  });

  it('só permite pular no chão e em idle/walk', () => {
    expect(canJump('idle', true)).toBe(true);
    expect(canJump('walk', true)).toBe(true);
    expect(canJump('idle', false)).toBe(false);
    expect(canJump('crouch', true)).toBe(false);
    expect(canJump('attack', true)).toBe(false);
  });

  it('attack/hurt/blockstun travam completamente (regra 2)', () => {
    for (const state of ['attack', 'kick', 'special', 'super', 'hurt', 'blockstun'] as const) {
      expect(isLocked(state)).toBe(true);
      expect(canMove(state)).toBe(false);
      expect(canJump(state, true)).toBe(false);
      expect(canTurn(state, true)).toBe(false);
    }
  });

  it('estados livres não são travados', () => {
    for (const state of ['idle', 'walk', 'crouch', 'jump', 'guard'] as const) {
      expect(isLocked(state)).toBe(false);
    }
  });
});

describe('fsm: orientação (regra 3)', () => {
  it('só vira no chão e em idle/walk', () => {
    expect(canTurn('idle', true)).toBe(true);
    expect(canTurn('walk', true)).toBe(true);
    expect(canTurn('idle', false)).toBe(false);
    expect(canTurn('crouch', true)).toBe(false);
    expect(canTurn('jump', true)).toBe(false);
    expect(canTurn('attack', true)).toBe(false);
  });
});

describe('fsm: crouch e guard', () => {
  it('crouch entra a partir de estados livres no chão', () => {
    expect(canCrouch('idle', true)).toBe(true);
    expect(canCrouch('walk', true)).toBe(true);
    expect(canCrouch('crouch', true)).toBe(true);
    expect(canCrouch('idle', false)).toBe(false);
    expect(canCrouch('attack', true)).toBe(false);
  });

  it('guard entra a partir de idle/walk/crouch/guard no chão', () => {
    expect(canGuard('idle', true)).toBe(true);
    expect(canGuard('crouch', true)).toBe(true);
    expect(canGuard('jump', true)).toBe(false);
    expect(canGuard('idle', false)).toBe(false);
    expect(canGuard('attack', true)).toBe(false);
  });

  it('resolveGroundIdleState prioriza down sobre movimento', () => {
    expect(resolveGroundIdleState(true, true)).toBe('crouch');
    expect(resolveGroundIdleState(true, false)).toBe('crouch');
    expect(resolveGroundIdleState(false, true)).toBe('walk');
    expect(resolveGroundIdleState(false, false)).toBe('idle');
  });
});

describe('fsm: início de ações', () => {
  it('não pode iniciar ação durante outra ação travada ou guard', () => {
    for (const state of ['attack', 'kick', 'special', 'super', 'hurt', 'blockstun', 'guard'] as const) {
      expect(canStartAction(state)).toBe(false);
    }
  });

  it('pode iniciar ação em idle/walk/crouch/jump', () => {
    for (const state of ['idle', 'walk', 'crouch', 'jump'] as const) {
      expect(canStartAction(state)).toBe(true);
    }
  });
});
