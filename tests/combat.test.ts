import { describe, expect, it } from 'vitest';
import { COMBAT_STEP, HITSTOP_FRAMES, MOVES, Hitstop, attackBox, attackPhase, consumeHit, createAttack, hurtbox, moveDuration, overlaps, projectileBox, type CombatBody, type MoveId } from '../src/combat';

const body: CombatBody = { x: 300, elevation: 0, facing: 1, state: 'attack' };
describe('attack windows and collision geometry', () => {
  for (const move of Object.keys(MOVES) as MoveId[]) {
    it(`${move}: startup, active and recovery have exact frame boundaries`, () => {
      const attack = createAttack(move, 10);
      const data = MOVES[move];
      for (let frame = 0; frame < data.startup + data.active + data.recovery; frame++) {
        const now = 10 + frame * COMBAT_STEP;
        const active = frame >= data.startup && frame < data.startup + data.active;
        expect(attackPhase(attack, now)).toBe(frame < data.startup ? 'startup' : active ? 'active' : 'recovery');
        expect(attackBox(body, attack, now) !== null).toBe(active && move !== 'projectile');
      }
      expect(attackPhase(attack, 10 + moveDuration(move))).toBe('done');
    });
  }
  it('a whiff can connect later in the active window but can only hit once', () => {
    const attack = createAttack('punch', 0);
    const target = { ...body, x: 650 };
    expect(consumeHit(body, attack, target, 4 * COMBAT_STEP)).toBe(false);
    target.x = 420;
    expect(consumeHit(body, attack, target, 5 * COMBAT_STEP)).toBe(true);
    expect(attackBox(body, attack, 5 * COMBAT_STEP)).toBeNull();
    expect(consumeHit(body, attack, target, 6 * COMBAT_STEP)).toBe(false);
  });
  it('mirrors attacks with facing and does not hit behind the fighter', () => {
    const target = { ...body, x: 180 };
    expect(consumeHit(body, createAttack('kick', 0), target, 0.1)).toBe(false);
    expect(consumeHit({ ...body, facing: -1 }, createAttack('kick', 0), target, 0.1)).toBe(true);
  });
  it('uses elevation for airborne attacks and projectiles, and a lower crouch hurtbox', () => {
    const attack = createAttack('punch', 0);
    const airborne = { ...body, elevation: 250 };
    const target = { ...body, x: 420 };
    expect(consumeHit(airborne, attack, target, 4 * COMBAT_STEP)).toBe(false);
    expect(consumeHit(airborne, attack, { ...target, elevation: 250 }, 4 * COMBAT_STEP)).toBe(true);
    expect(hurtbox({ ...body, state: 'crouch' }).height).toBeLessThan(hurtbox(body).height);
    expect(overlaps(projectileBox(420, 346), hurtbox(target))).toBe(true);
    expect(overlaps(projectileBox(420, 96), hurtbox(target))).toBe(false);
  });
});

describe('hitstop', () => {
  it('freezes exactly three simulation frames and delays knockback until the end', () => {
    const stop = new Hitstop();
    let x = 0;
    stop.start(() => x += 21);
    for (let frame = 1; frame <= HITSTOP_FRAMES; frame++) {
      expect(x).toBe(0);
      expect(stop.step()).toBe(true);
    }
    expect(x).toBe(21);
    expect(stop.active).toBe(false);
    expect(stop.step()).toBe(false);
    expect(x).toBe(21);
  });
  it('keeps both effects for simultaneous hits and clears them on a round reset', () => {
    const stop = new Hitstop();
    const impacts: number[] = [];
    stop.start(() => impacts.push(1));
    stop.start(() => impacts.push(2));
    for (let i = 0; i < HITSTOP_FRAMES; i++) stop.step();
    expect(impacts).toEqual([1, 2]);
    stop.start(() => impacts.push(3));
    stop.reset();
    expect(stop.step()).toBe(false);
    expect(impacts).toEqual([1, 2]);
  });
});

describe('Firewall Punch', () => {
  it('mantém a janela ativa alinhada aos quadros de impacto da arte', () => {
    // A animação roda a 12fps, ou seja 5 frames de simulação por quadro
    // desenhado. A arte tem carga (1-3), impacto (4-5) e recuperação (6):
    // se o startup deixar de ser múltiplo de 5, a hitbox passa a aparecer no
    // meio de um quadro de carga e o golpe "acerta antes de socar".
    const frames = 60 / 12;
    expect(MOVES.firewall.startup).toBe(3 * frames);
    expect(MOVES.firewall.active).toBe(2 * frames);
  });

  it('compensa o dano acima do normal com recuperação punitiva', () => {
    // É o único especial que exige comando; o risco é o que o equilibra.
    expect(MOVES.firewall.damage).toBeGreaterThan(MOVES.punch.damage);
    expect(MOVES.firewall.recovery).toBeGreaterThan(MOVES.punch.recovery);
  });

  it('alcança mais que o soco e menos que o cabo', () => {
    expect(MOVES.firewall.reach).toBeGreaterThan(MOVES.punch.reach);
    expect(MOVES.firewall.reach).toBeLessThan(MOVES.cable.reach);
  });

  it('gera hitbox de verdade, diferente do projétil', () => {
    // Regressão: o especial anterior do Rui era `barrier` (defensivo). Se o
    // roteamento cair em 'projectile' por engano, attackBox devolve null e o
    // golpe atravessa o adversário sem acertar.
    const attacker: CombatBody = { x: 300, elevation: 0, facing: 1, state: 'special' };
    const attack = createAttack('firewall', 0);
    const active = MOVES.firewall.startup * COMBAT_STEP;
    const box = attackBox(attacker, attack, active);
    expect(box).not.toBeNull();
    expect(box!.width).toBe(MOVES.firewall.reach);
  });
});
