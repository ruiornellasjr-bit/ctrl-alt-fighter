// Máquina de estados finita (FSM) rígida para o personagem.
// Um único campo `state` é a fonte da verdade — nada mais decide se o
// personagem pode se mover, virar ou agir. Isso elimina bugs de sobreposição
// em que, por exemplo, um soco em andamento não impedia o movimento.
export type FighterState =
  | 'idle'
  | 'walk'
  | 'crouch'
  | 'jump'
  | 'attack'
  | 'kick'
  | 'special'
  | 'super'
  | 'guard'
  | 'hurt'
  | 'blockstun';

// Estados "travados": duram um tempo fixo (stateUntil) e, enquanto ativos,
// bloqueiam movimento, troca de estado por input e virada de direção.
const LOCKED_STATES: ReadonlySet<FighterState> = new Set(['attack', 'kick', 'special', 'super', 'hurt', 'blockstun']);

// Estados a partir dos quais NÃO se pode iniciar uma nova ação ofensiva
// (além dos travados, GUARD também bloqueia ataques, como no jogo original).
const NON_ACTIONABLE_STATES: ReadonlySet<FighterState> = new Set([...LOCKED_STATES, 'guard']);

export function isLocked(state: FighterState): boolean {
  return LOCKED_STATES.has(state);
}

// Regra 1 (Esquerda/Direita): anda apenas se estiver em IDLE ou WALK.
export function canMove(state: FighterState): boolean {
  return state === 'idle' || state === 'walk';
}

// Regra 1 (Cima): pula apenas se estiver no chão E em IDLE ou WALK.
export function canJump(state: FighterState, grounded: boolean): boolean {
  return grounded && (state === 'idle' || state === 'walk');
}

// Regra 3: só vira para o oponente se estiver no chão e em estado livre (IDLE ou WALK).
export function canTurn(state: FighterState, grounded: boolean): boolean {
  return grounded && (state === 'idle' || state === 'walk');
}

// Pode entrar em CROUCH a partir de IDLE/WALK (ou permanecer em CROUCH) quando no chão.
export function canCrouch(state: FighterState, grounded: boolean): boolean {
  return grounded && (state === 'idle' || state === 'walk' || state === 'crouch');
}

// Pode assumir GUARD a partir de qualquer estado livre no chão.
export function canGuard(state: FighterState, grounded: boolean): boolean {
  return grounded && (state === 'idle' || state === 'walk' || state === 'crouch' || state === 'guard');
}

// Ações (soco/chute/especial/super) não podem ser iniciadas durante outra
// ação travada nem durante GUARD — mas podem ser iniciadas do ar (jump) ou
// agachado (crouch), preservando golpes aéreos e o gancho (crouch + ataque)
// que já existiam no jogo.
export function canStartAction(state: FighterState): boolean {
  return !NON_ACTIONABLE_STATES.has(state);
}

// Super can cancel guard, but never an attack, hitstun or blockstun.
export function canStartSuper(state: FighterState, meter: number): boolean {
  return meter >= 100 && !isLocked(state);
}

// Estado "livre" de solo resultante do input corrente, usado para recompor
// IDLE/WALK/CROUCH continuamente enquanto o personagem não está travado.
export function resolveGroundIdleState(down: boolean, moving: boolean): 'idle' | 'walk' | 'crouch' {
  if (down) return 'crouch';
  return moving ? 'walk' : 'idle';
}
