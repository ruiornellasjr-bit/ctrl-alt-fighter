import type { FighterState } from './fsm';

export const COMBAT_STEP = 1 / 60;
export const HITSTOP_FRAMES = 3; // 50 ms at 60 Hz, independent of rendering FPS.
export type Rect = { x: number; y: number; width: number; height: number };
export type CombatBody = { x: number; elevation: number; facing: -1 | 1; state: FighterState };
export type MoveId = 'punch' | 'hook' | 'kick' | 'weakPunch' | 'strongPunch' | 'weakKick' | 'strongKick' | 'sweep' | 'barrier' | 'shield' | 'cable' | 'firewall' | 'projectile' | 'super';
export type HitStyle = 'basic' | 'hook' | 'low' | 'high' | 'special' | 'super';
type Move = { startup: number; active: number; recovery: number; reach: number; height: number; centerY: number; damage: number; style: HitStyle };

// Durations are simulation frames. Geometry is relative to the fighter's feet.
export const MOVES: Record<MoveId, Move> = {
  punch: { startup: 4, active: 3, recovery: 8, reach: 128, height: 76, centerY: 150, damage: 10, style: 'basic' },
  hook: { startup: 5, active: 4, recovery: 6, reach: 143, height: 110, centerY: 190, damage: 14, style: 'hook' },
  kick: { startup: 6, active: 4, recovery: 11, reach: 150, height: 72, centerY: 130, damage: 13, style: 'basic' },
  weakPunch: { startup: 4, active: 2, recovery: 8, reach: 108, height: 68, centerY: 150, damage: 8, style: 'basic' },
  strongPunch: { startup: 10, active: 4, recovery: 20, reach: 158, height: 82, centerY: 150, damage: 20, style: 'basic' },
  weakKick: { startup: 5, active: 3, recovery: 12, reach: 132, height: 65, centerY: 90, damage: 10, style: 'basic' },
  strongKick: { startup: 12, active: 4, recovery: 24, reach: 196, height: 68, centerY: 200, damage: 18, style: 'high' },
  sweep: { startup: 7, active: 4, recovery: 16, reach: 156, height: 44, centerY: 25, damage: 12, style: 'low' },
  barrier: { startup: 7, active: 6, recovery: 13, reach: 148, height: 220, centerY: 149, damage: 16, style: 'special' },
  shield: { startup: 12, active: 6, recovery: 20, reach: 196, height: 150, centerY: 155, damage: 18, style: 'special' },
  cable: { startup: 7, active: 6, recovery: 13, reach: 288, height: 48, centerY: 151, damage: 16, style: 'special' },
  // Firewall Punch: ↓→ + soco ou especial. A arte v5 acompanha as fases:
  // três quadros de carga, quarto quadro durante o impacto e dois de retorno.
  // Preserva 15 frames de preparação, 10 ativos, 20 de recuperação e 20 de dano.
  firewall: { startup: 15, active: 10, recovery: 20, reach: 196, height: 104, centerY: 158, damage: 20, style: 'special' },
  projectile: { startup: 7, active: 1, recovery: 18, reach: 0, height: 0, centerY: 154, damage: 16, style: 'special' },
  super: { startup: 16, active: 3, recovery: 32, reach: 960, height: 540, centerY: 150, damage: 31, style: 'super' },
};

export type Attack = { move: MoveId; started: number; consumed: boolean; emitted: boolean; damage: number; boomerang: boolean };
export function createAttack(move: MoveId, now: number, damage = MOVES[move].damage, boomerang = false): Attack {
  return { move, started: now, consumed: false, emitted: false, damage, boomerang };
}
export function moveDuration(move: MoveId): number {
  const data = MOVES[move];
  return (data.startup + data.active + data.recovery) * COMBAT_STEP;
}
export function attackPhase(attack: Attack, now: number): 'startup' | 'active' | 'recovery' | 'done' {
  const frame = Math.floor((now - attack.started) / COMBAT_STEP + 1e-7);
  const data = MOVES[attack.move];
  if (frame < data.startup) return 'startup';
  if (frame < data.startup + data.active) return 'active';
  if (frame < data.startup + data.active + data.recovery) return 'recovery';
  return 'done';
}

// Os quadros de extensão (3) coincidem com a hitbox, independentemente do FPS.
export function attackVisualFrame(attack: Attack, now: number, frameCount = 6): number {
  const frame = Math.max(0, (now - attack.started) / COMBAT_STEP);
  const data = MOVES[attack.move];
  const impact = frameCount === 8 ? 4 : 3;
  if (frame < data.startup) return Math.min(impact - 1, Math.floor(frame / data.startup * impact));
  if (frame < data.startup + data.active) return impact;
  return Math.min(frameCount - 1, impact + 1 + Math.floor((frame - data.startup - data.active) / data.recovery * (frameCount - impact - 1)));
}
export function hurtbox(body: CombatBody, ground = 500): Rect {
  const height = body.state === 'crouch' ? 164 : 220;
  return { x: body.x - 42, y: ground - body.elevation - height, width: 84, height };
}
export function attackBox(body: CombatBody, attack: Attack | null, now: number, ground = 500): Rect | null {
  if (!attack || attack.consumed || attack.move === 'projectile' || attackPhase(attack, now) !== 'active') return null;
  const data = MOVES[attack.move];
  // Preserve the existing full-arena super, including targets behind the user.
  if (attack.move === 'super') return { x: 0, y: ground - 540, width: 960, height: 540 };
  return { x: body.facing === 1 ? body.x : body.x - data.reach, y: ground - body.elevation - data.centerY - data.height / 2, width: data.reach, height: data.height };
}
export function projectileBox(x: number, y: number): Rect {
  return { x: x - 24, y: y - 28, width: 48, height: 56 };
}
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
export function consumeHit(body: CombatBody, attack: Attack, target: CombatBody, now: number): boolean {
  const box = attackBox(body, attack, now);
  if (!box || !overlaps(box, hurtbox(target))) return false;
  attack.consumed = true;
  return true;
}

// Both fighters, projectiles and combat timers share this pause. Effects are
// queued so knockback (including a KO) happens only after the final frozen frame.
export class Hitstop {
  private remaining = 0;
  private pending: (() => void)[] = [];
  get active(): boolean { return this.remaining > 0; }
  start(afterFreeze: () => void): void {
    this.remaining = HITSTOP_FRAMES;
    this.pending.push(afterFreeze);
  }
  step(): boolean {
    if (!this.active) return false;
    this.remaining--;
    if (!this.active) {
      const effects = this.pending;
      this.pending = [];
      effects.forEach(effect => effect());
    }
    return true;
  }
  reset(): void { this.remaining = 0; this.pending = []; }
}
