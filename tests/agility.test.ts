import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {
  Scene: class {}, Math: { Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)) },
} }));
import { ArenaScene } from '../src/arena';
import { createMobility, tapDirection, canDoubleJump, DOUBLE_JUMP_CEILING, RUN_SPEED } from '../src/agility';
import { monteiroAnimation, monteiroAnimationGroups, monteiroV6Groups } from '../src/animation';
import { COMBAT_STEP, MOVES, createAttack, attackVisualFrame, consumeHit } from '../src/combat';
import { fighters } from '../src/fighters';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const scene = new ArenaScene() as any;
  const unit = (id: string, x: number, facing: number) => ({
    id, x, facing, elevation: 0, velocityY: 0, health: 100, meter: 0,
    state: 'idle', stateUntil: 0, attack: null, cooldown: 0, specialCooldown: 0,
    shieldUntil: 0, flashUntil: 0, visualLunge: 0, comboCount: 0, comboAttacker: null,
    mobility: createMobility(), hurtPose: 'hurt', hurtStarted: 0, knockedDown: false,
    sprite: { anims: { pause: vi.fn(), resume: vi.fn() } },
  });
  scene.player = unit('monteiro', 300, 1);
  scene.enemy = unit('caio', 700, -1);
  scene.mode = 'training';
  scene.dust = vi.fn();
  scene.spark = vi.fn();
  scene.updateHud = vi.fn();
  scene.cameras = { main: { shake: vi.fn() } };
  return scene;
}

describe('dois toques relativos ao oponente', () => {
  it('corre para frente olhando para qualquer lado', () => {
    for (const facing of [-1, 1] as const) {
      const mobility = createMobility();
      tapDirection(mobility, facing, facing, 1);
      tapDirection(mobility, facing, facing, 1.2);
      expect(mobility.pending).toBe('run');
    }
  });
  it('reconhece recuo e rejeita toques tardios, alternados ou após trocar de lado', () => {
    const mobility = createMobility();
    tapDirection(mobility, -1, 1, 1);
    tapDirection(mobility, -1, 1, 1.1);
    expect(mobility.pending).toBe('backhop');
    for (const [first, second, face, gap] of [[1, 1, 1, 0.5], [1, -1, 1, 0.1], [1, 1, -1, 0.1]]) {
      const state = createMobility();
      tapDirection(state, first as -1 | 1, 1, 1);
      tapDirection(state, second as -1 | 1, face as -1 | 1, 1 + gap);
      expect(state.pending).toBeNull();
    }
  });
  it('não transforma um terceiro toque em outro comando', () => {
    const mobility = createMobility();
    tapDirection(mobility, 1, 1, 1);
    tapDirection(mobility, 1, 1, 1.1);
    mobility.pending = null;
    tapDirection(mobility, 1, 1, 1.2);
    expect(mobility.pending).toBeNull();
  });
});

describe('movimentos reais da arena', () => {
  it('aumenta a velocidade ao correr e para ao soltar ou defender', () => {
    const s = setup();
    s.player.mobility.pending = 'run';
    s.advancedMovement(s.player, s.enemy, 1, false, false, false, COMBAT_STEP);
    expect(s.player.x).toBeCloseTo(300 + RUN_SPEED * COMBAT_STEP);
    s.advancedMovement(s.player, s.enemy, 0, false, false, false, COMBAT_STEP);
    expect(s.player.mobility.runDirection).toBe(0);
    s.player.mobility.pending = 'run';
    s.advancedMovement(s.player, s.enemy, 1, false, true, false, COMBAT_STEP);
    expect(s.player.state).toBe('guard');
    expect(s.player.mobility.runDirection).toBe(0);
  });
  it('executa exatamente dois saltos curtos de recuo sem repetir indefinidamente', () => {
    const s = setup();
    s.player.mobility.pending = 'backhop';
    s.advancedMovement(s.player, s.enemy, 0, false, false, false, COMBAT_STEP);
    let hops = 1;
    for (let i = 0; i < 80; i++) {
      const velocity = s.player.velocityY;
      s.elapsed += COMBAT_STEP;
      s.tickUnit(s.player, COMBAT_STEP);
      s.advancedMovement(s.player, s.enemy, 0, false, false, false, COMBAT_STEP);
      if (velocity <= 0 && s.player.velocityY > 0) hops++;
    }
    expect(hops).toBe(2);
    expect(s.player.x).toBeLessThan(150);
    expect(s.player.x).toBeGreaterThanOrEqual(68);
    expect(s.player.mobility.evading).toBe(false);
    expect(s.player.mobility.hopsLeft).toBe(0);
    expect(s.player.state).toBe('idle');
  });
  it('permite um segundo pulo no ar, impede o terceiro e recarrega no pouso', () => {
    const s = setup();
    s.advancedMovement(s.player, s.enemy, 0, false, false, true, COMBAT_STEP);
    expect(s.player.mobility.jumps).toBe(1);
    s.player.elevation = 100;
    s.advancedMovement(s.player, s.enemy, 0, false, false, true, COMBAT_STEP);
    expect(s.player.mobility.jumps).toBe(2);
    s.player.velocityY = 100;
    s.advancedMovement(s.player, s.enemy, 0, false, false, true, COMBAT_STEP);
    expect(s.player.velocityY).toBe(100);
    s.player.elevation = 1;
    s.player.velocityY = -100;
    s.tickUnit(s.player, COMBAT_STEP);
    expect(s.player.mobility.jumps).toBe(0);
    expect(canDoubleJump(1, true, false)).toBe(false);
  });
  it('permite passar pelo rival no ar e troca o lado ao pousar sem sobreposição', () => {
    const s = setup();
    s.player.x = 690;
    s.player.state = 'jump';
    s.player.elevation = 100;
    s.player.mobility.jumps = 1;
    for (let i = 0; i < 8; i++) s.advancedMovement(s.player, s.enemy, 1, false, false, false, COMBAT_STEP);
    expect(s.player.x).toBeGreaterThan(s.enemy.x);
    expect(s.player.facing).toBe(1);
    s.player.elevation = 1;
    s.player.velocityY = -100;
    s.tickUnit(s.player, COMBAT_STEP);
    s.advancedMovement(s.player, s.enemy, 0, false, false, false, COMBAT_STEP);
    expect(s.player.x - s.enemy.x).toBeGreaterThanOrEqual(92);
    expect(s.player.facing).toBe(-1);
  });
  it('mantém o pulo duplo dentro da altura visível da arena mesmo usado no ápice', () => {
    const s = setup();
    s.player.state = 'jump';
    s.player.elevation = 165;
    s.player.mobility.jumps = 1;
    s.advancedMovement(s.player, s.enemy, 0, false, false, true, COMBAT_STEP);
    for (let i = 0; i < 80; i++) {
      s.elapsed += COMBAT_STEP;
      s.tickUnit(s.player, COMBAT_STEP);
      expect(s.player.elevation).toBeLessThanOrEqual(DOUBLE_JUMP_CEILING);
    }
    expect(s.player.elevation).toBe(0);
  });
  it('interrompe recuos ao sofrer rasteira e seleciona reação baixa com queda', () => {
    const s = setup();
    s.player.mobility.evading = true;
    s.player.mobility.hopsLeft = 1;
    s.hit(s.player, s.enemy, 12, 'low');
    expect(s.player.state).toBe('hurt');
    expect(s.player.hurtPose).toBe('hurtLow');
    expect(s.player.knockedDown).toBe(true);
    expect(s.player.mobility.evading).toBe(false);
    expect(s.player.mobility.hopsLeft).toBe(0);
  });
  it('distingue impacto leve, forte e alto', () => {
    for (const [damage, style, pose] of [[10, 'basic', 'hurt'], [20, 'special', 'hurtStrong'], [14, 'hook', 'hurtHigh']] as const) {
      const s = setup();
      s.hit(s.player, s.enemy, damage, style);
      expect(s.player.hurtPose).toBe(pose);
    }
  });
  it('libera os movimentos ao elenco atual e rejeita personagens removidos', () => {
    const s = setup();
    for (const id of Object.keys(fighters)) {
      const unit = { ...s.enemy, id, mobility: createMobility() };
      expect(s.advancedMovement(unit, s.player, -1, false, false, true, COMBAT_STEP)).toBe(true);
    }
    s.enemy.id = 'removed-fighter';
    expect(s.advancedMovement(s.enemy, s.player, -1, false, false, true, COMBAT_STEP)).toBe(false);
  });
});

describe('novos quadros e colisões', () => {
  it('mantém as poses antigas e os quatro golpes v6 dentro dos respectivos atlas', () => {
    const poses = new Set([...Object.values(monteiroAnimationGroups).flat(), ...Object.values(monteiroV6Groups)]);
    expect(poses.size).toBe(26);
    for (const pose of poses) {
      const animation = monteiroAnimation(pose);
      expect(animation.frames).toHaveLength(animation.sheet === 'v6' ? 8 : 6);
      expect(animation.frames.every(frame => frame >= 0 && frame < (animation.sheet === 'v6' ? 8 : 24))).toBe(true);
      if (['run', 'walk', 'idle'].includes(pose)) expect(animation.repeat).toBe(-1);
      else expect(animation.repeat).toBe(0);
    }
  });
  it('mostra a extensão do golpe exatamente durante a janela de acerto', () => {
    for (const move of ['punch', 'hook', 'kick', 'sweep', 'cable', 'super'] as const) {
      const attack = createAttack(move, 0);
      expect(attackVisualFrame(attack, 0)).toBe(0);
      for (let frame = MOVES[move].startup; frame < MOVES[move].startup + MOVES[move].active; frame++) {
        expect(attackVisualFrame(attack, frame * COMBAT_STEP)).toBe(3);
      }
    }
  });
  it('a rasteira acerta no chão e não alcança um adversário alto no ar', () => {
    const body = { x: 300, facing: 1 as const, elevation: 0, state: 'kick' as const };
    const target = { x: 400, facing: -1 as const, elevation: 0, state: 'idle' as const };
    const time = MOVES.sweep.startup * COMBAT_STEP;
    expect(consumeHit(body, createAttack('sweep', 0), target, time)).toBe(true);
    expect(consumeHit(body, createAttack('sweep', 0), { ...target, elevation: 100, state: 'jump' }, time)).toBe(false);
  });
});
