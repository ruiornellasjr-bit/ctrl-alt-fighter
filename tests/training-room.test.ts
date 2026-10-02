import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {
  Scene: class {},
  Math: { Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)) },
} }));

import { ArenaScene } from '../src/arena';
import { createMobility } from '../src/agility';

function setup() {
  const scene = new ArenaScene() as any;
  const unit = (id: string, x: number, facing: number) => ({
    id, x, facing, elevation: 0, velocityY: 0, health: 100, meter: 0,
    state: 'idle', stateUntil: 0, attack: null, cooldown: 0, specialCooldown: 0,
    shieldUntil: 0, comboCount: 0, comboAttacker: null, mobility: createMobility(),
    sprite: { anims: { pause: vi.fn(), resume: vi.fn() } },
  });
  scene.player = unit('kalliane', 300, 1);
  scene.enemy = unit('caio', 420, -1);
  scene.mode = 'training';
  scene.trainingStep = 'free';
  scene.spark = vi.fn();
  scene.updateHud = vi.fn();
  scene.cameras = { main: { shake: vi.fn() } };
  return scene;
}

describe('sala de treinamento livre', () => {
  it('permite alternar o dummy entre defesa e ataque sem iniciar uma luta', () => {
    const scene = setup();
    scene.setDummyMode('guard');
    scene.handleEnemy(1 / 60);
    expect(scene.enemy.state).toBe('guard');
    scene.hit(scene.enemy, scene.player, 12);
    expect(scene.enemy.health).toBeGreaterThan(88);
    expect(scene.mode).toBe('training');

    scene.enemy.state = 'idle';
    scene.setDummyMode('attack');
    scene.elapsed = scene.enemy.aiAt + 0.01;
    scene.handleEnemy(1 / 60);
    expect(scene.enemy.attack?.move).toBe('weakPunch');
  });

  it('recupera vida no treino e reinicia posições e barras sem trocar de cenário', () => {
    const scene = setup();
    scene.player.health = 50;
    scene.enemy.health = 40;
    scene.tickUnit = vi.fn();
    scene.handlePlayer = vi.fn();
    scene.handleEnemy = vi.fn();
    scene.tickAttacks = vi.fn();
    scene.tickShots = vi.fn();
    scene.stepCombat(1);
    expect(scene.player.health).toBe(58);
    expect(scene.enemy.health).toBe(54);

    scene.player.x = 640;
    scene.enemy.x = 700;
    scene.player.meter = 100;
    scene.resetTraining();
    expect([scene.player.x, scene.enemy.x]).toEqual([235, 725]);
    expect([scene.player.health, scene.enemy.health]).toEqual([100, 100]);
    expect(scene.player.meter).toBe(0);
    expect(scene.mode).toBe('training');
    expect(scene.trainingStep).toBe('free');
  });
});
