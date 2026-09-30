import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {
  Scene: class {},
  Math: { Clamp: (n: number, min: number, max: number) => Math.min(max, Math.max(min, n)) },
} }));
import { ArenaScene } from '../src/arena';
import { COMBAT_STEP, MOVES, createAttack } from '../src/combat';
import { canStartSuper } from '../src/fsm';

// Use the real scene's combat methods with only rendering/audio replaced.
function setup() {
  const scene = new ArenaScene() as any;
  const unit = (id: string, x: number, facing: number) => ({
    id, x, facing, elevation: 0, velocityY: 0, health: 100, meter: 0,
    state: 'idle', stateUntil: 0, attack: null, cooldown: 0, specialCooldown: 0,
    shieldUntil: 0, flashUntil: 0, visualLunge: 0, comboCount: 0, comboAttacker: null,
  });
  scene.player = unit('kalliane', 300, 1);
  scene.enemy = unit('laura', 420, -1);
  scene.mode = 'training';
  scene.spark = vi.fn();
  scene.comboPopup = vi.fn();
  scene.updateHud = vi.fn();
  scene.renderUnit = vi.fn();
  scene.cameras = { main: { shake: vi.fn(), flash: vi.fn() } };
  scene.debugGraphics = Object.fromEntries(['clear', 'fillStyle', 'fillRect', 'lineStyle', 'strokeRect'].map(key => [key, vi.fn().mockReturnThis()]));
  return scene;
}
afterEach(() => vi.restoreAllMocks());

describe('arena attack integration', () => {
  it('punch has startup, hits once during activity, then disappears on contact', () => {
    const s = setup();
    s.punch(s.player, s.enemy);
    expect(s.enemy.health).toBe(100);
    s.elapsed = 3 * COMBAT_STEP;
    s.tickAttacks();
    expect(s.enemy.health).toBe(100);
    s.elapsed = 4 * COMBAT_STEP;
    s.tickAttacks();
    expect(s.enemy.health).toBe(90);
    expect(s.player.attack.consumed).toBe(true);
    s.tickAttacks();
    expect(s.enemy.health).toBe(90);
  });
  it('interruption cancels a pending attack and its hitbox', () => {
    const s = setup();
    s.punch(s.enemy, s.player);
    s.hit(s.enemy, s.player, 10);
    expect(s.enemy.attack).toBeNull();
    s.elapsed = 4 * COMBAT_STEP;
    s.tickAttacks();
    expect(s.player.health).toBe(100);
  });
  it('simultaneously active attacks trade once', () => {
    const s = setup();
    s.punch(s.player, s.enemy);
    s.punch(s.enemy, s.player);
    s.elapsed = 4 * COMBAT_STEP;
    s.tickAttacks();
    expect([s.player.health, s.enemy.health]).toEqual([90, 90]);
    expect([s.player.attack, s.enemy.attack]).toEqual([null, null]);
    expect([s.player.x, s.enemy.x]).toEqual([300, 420]);
    for (let i = 0; i < 3; i++) s.hitstop.step();
    expect([s.player.x, s.enemy.x]).toEqual([279, 441]);
  });
  it('projectile appears once at activation, persists after recovery, and is removed on contact', () => {
    const s = setup();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const node = { x: 380, y: 346, angle: 0, setX: vi.fn(), destroy: vi.fn() };
    s.makeProjectile = vi.fn(() => node);
    s.special(s.player, s.enemy);
    s.tickAttacks();
    expect(s.shots).toHaveLength(0);
    s.elapsed = MOVES.projectile.startup * COMBAT_STEP;
    s.tickAttacks();
    s.tickAttacks();
    expect(s.makeProjectile).toHaveBeenCalledTimes(1);
    s.elapsed = s.player.stateUntil;
    s.tickUnit(s.player, 0);
    expect(s.player.attack).toBeNull();
    expect(s.shots).toHaveLength(1);
    s.tickShots(COMBAT_STEP);
    expect(s.enemy.health).toBe(84);
    expect(s.shots).toHaveLength(0);
    expect(node.destroy).toHaveBeenCalledTimes(1);
    s.tickShots(COMBAT_STEP);
    expect(s.enemy.health).toBe(84);
  });
  it('full-arena super uses simulation time and can be interrupted during startup', () => {
    const s = setup();
    s.enemy.x = 100; // behind the attacker
    s.beginAttack(s.player, 'super');
    s.elapsed = 15 * COMBAT_STEP;
    s.tickAttacks();
    expect(s.enemy.health).toBe(100);
    s.elapsed = 16 * COMBAT_STEP;
    s.tickAttacks();
    expect(s.enemy.health).toBe(69);
    s.beginAttack(s.player, 'super');
    s.enterState(s.player, 'hurt', 0.5);
    s.elapsed += 16 * COMBAT_STEP;
    s.tickAttacks();
    expect(s.enemy.health).toBe(69);
  });
});

describe('arena hitstop integration', () => {
  for (const guarded of [false, true]) {
    it(`freezes both fighters, inputs, cooldowns and projectiles on ${guarded ? 'block' : 'hit'}`, () => {
      const s = setup();
      s.handlePlayer = vi.fn();
      s.handleEnemy = vi.fn();
      s.tickShots = vi.fn();
      s.player.elevation = 100;
      s.player.velocityY = 200;
      s.player.cooldown = 0.3;
      s.enemy.state = guarded ? 'guard' : 'idle';
      s.hit(s.enemy, s.player, 10);
      const until = s.enemy.stateUntil;
      expect(s.enemy.state).toBe(guarded ? 'blockstun' : 'hurt');
      for (let i = 0; i < 2; i++) s.update(0, 1000 / 60);
      expect(s.enemy.x).toBe(420);
      expect(s.player.elevation).toBe(100);
      expect(s.player.cooldown).toBe(0.3);
      expect(s.elapsed).toBe(0);
      expect(s.enemy.stateUntil).toBe(until);
      expect(s.handlePlayer).not.toHaveBeenCalled();
      expect(s.handleEnemy).not.toHaveBeenCalled();
      expect(s.tickShots).not.toHaveBeenCalled();
      s.update(0, 1000 / 60);
      expect(s.enemy.x).toBe(guarded ? 420 : 441);
      s.update(0, 1000 / 60);
      expect(s.elapsed).toBeCloseTo(COMBAT_STEP);
      expect(s.player.elevation).toBeGreaterThan(100);
      expect(s.tickShots).toHaveBeenCalledOnce();
    });
  }
  for (const fps of [30, 60, 120]) {
    it(`keeps the same 50 ms freeze at ${fps} rendering FPS`, () => {
      const s = setup();
      s.handlePlayer = vi.fn();
      s.handleEnemy = vi.fn();
      s.hit(s.enemy, s.player, 10);
      for (let frame = 0; frame < fps / 10; frame++) s.update(0, 1000 / fps);
      expect(s.elapsed).toBeCloseTo(0.05);
      expect(s.enemy.x).toBe(441);
    });
  }
  it('waits for freeze before declaring KO', () => {
    const s = setup();
    s.mode = 'versus';
    s.enemy.health = 5;
    s.finish = vi.fn();
    s.hit(s.enemy, s.player, 10);
    expect(s.finish).not.toHaveBeenCalled();
    for (let i = 0; i < 3; i++) s.hitstop.step();
    expect(s.finish).toHaveBeenCalledWith('player');
  });
});

describe('debug and approved controls', () => {
  it('draws actual active boxes only in training and clears consumed boxes', () => {
    const s = setup();
    s.debugHitboxes = true;
    s.player.attack = createAttack('punch', 0);
    s.elapsed = 4 * COMBAT_STEP;
    s.drawDebugBoxes();
    expect(s.debugGraphics.strokeRect).toHaveBeenCalledTimes(3);
    s.debugGraphics.strokeRect.mockClear();
    s.player.attack.consumed = true;
    s.drawDebugBoxes();
    expect(s.debugGraphics.strokeRect).toHaveBeenCalledTimes(2);
    s.debugGraphics.strokeRect.mockClear();
    s.mode = 'versus';
    s.drawDebugBoxes();
    expect(s.debugGraphics.strokeRect).not.toHaveBeenCalled();
  });
  it('preserves air control and crouching/airborne attack initiation', () => {
    const s = setup();
    s.keys = Object.fromEntries(['left', 'right', 'up', 'down', 'block', 'attack', 'kick', 'special'].map(key => [key, { isDown: key === 'right' }]));
    s.player.state = 'jump';
    s.player.elevation = 150;
    s.handlePlayer(COMBAT_STEP);
    expect(s.player.x).toBeGreaterThan(300);
    s.punch(s.player, s.enemy);
    expect(s.player.attack.move).toBe('punch');
    s.player.cooldown = 0;
    s.player.state = 'crouch';
    s.punch(s.player, s.enemy, true);
    expect(s.player.attack.move).toBe('hook');
  });
  it('allows a full-meter super to cancel guard but not blockstun', () => {
    expect(canStartSuper('guard', 100)).toBe(true);
    expect(canStartSuper('guard', 99)).toBe(false);
    expect(canStartSuper('blockstun', 100)).toBe(false);
    expect(canStartSuper('hurt', 100)).toBe(false);
    expect(canStartSuper('attack', 100)).toBe(false);
  });
  it('the special action never triggers super on its own — only the dedicated super key does', () => {
    const s = setup();
    s.keys = Object.fromEntries(['left', 'right', 'down', 'block'].map(key => [key, { isDown: false }]));
    s.player.meter = 100;
    s.superAttack = vi.fn();
    s.special = vi.fn();
    s.queuedSpecial = true;
    s.handlePlayer(COMBAT_STEP);
    expect(s.superAttack).not.toHaveBeenCalled();
    expect(s.special).toHaveBeenCalledOnce();
  });
  it('the dedicated super key triggers the super attack once the meter is full', () => {
    const s = setup();
    s.keys = Object.fromEntries(['left', 'right', 'down', 'block'].map(key => [key, { isDown: false }]));
    s.player.meter = 100;
    s.superAttack = vi.fn();
    s.special = vi.fn();
    s.queuedSuper = true;
    s.handlePlayer(COMBAT_STEP);
    expect(s.superAttack).toHaveBeenCalledWith(s.player, s.enemy);
    expect(s.special).not.toHaveBeenCalled();
  });
  it('the dedicated super key falls back to a special move when the meter is not full', () => {
    const s = setup();
    s.keys = Object.fromEntries(['left', 'right', 'down', 'block'].map(key => [key, { isDown: false }]));
    s.player.meter = 40;
    s.superAttack = vi.fn();
    s.special = vi.fn();
    s.queuedSuper = true;
    s.handlePlayer(COMBAT_STEP);
    expect(s.superAttack).not.toHaveBeenCalled();
    expect(s.special).toHaveBeenCalledWith(s.player, s.enemy, false);
  });
});
