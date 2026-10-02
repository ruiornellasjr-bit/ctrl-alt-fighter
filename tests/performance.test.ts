import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Scene: class {} } }));
import { ArenaScene } from '../src/arena';
import { ArcadeAudio } from '../src/audio';
import { COMBAT_STEP } from '../src/combat';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('arena resource lifetime', () => {
  it('reuses expired particles and bounds objects during continuous effects', () => {
    const scene = new ArenaScene() as any;
    const rectangle = () => {
      const node: any = { x: 0, y: 0 };
      for (const key of ['setPosition', 'setSize', 'setFillStyle', 'setAlpha', 'setScale', 'setDepth', 'setVisible']) node[key] = vi.fn().mockReturnValue(node);
      return node;
    };
    scene.add = { rectangle: vi.fn(rectangle) };
    const emit = () => scene.emitParticle(0, 0, 5, 5, 0xffffff, 1, 1, 10, 20, 0.25, true);
    emit();
    scene.updateParticles(0.1);
    expect(scene.particles[0].node.x).toBe(1);
    expect(scene.particles[0].node.y).toBe(2);
    scene.updateParticles(0.2);
    expect(scene.particles[0].node.setVisible).toHaveBeenLastCalledWith(false);
    emit();
    expect(scene.add.rectangle).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 500; i++) emit();
    expect(scene.add.rectangle).toHaveBeenCalledTimes(48);
    scene.updateParticles(1);
    expect(scene.particles.every((entry: any) => entry.age >= entry.duration)).toBe(true);
  });

  it('removes consecutive expired projectiles without skipping the next one', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const scene = new ArenaScene() as any;
    const player = { x: 200, facing: 1, elevation: 0, state: 'idle' };
    scene.player = player;
    scene.enemy = { x: 700, facing: -1, elevation: 0, state: 'idle' };
    const shot = () => ({ x: -200, y: 100, velocity: 0, owner: player, born: 0, boomerang: false, node: { angle: 0, setX: vi.fn(), destroy: vi.fn() } });
    const expired = [shot(), shot(), shot()];
    scene.shots = [...expired];
    scene.emitParticle = vi.fn();
    scene.tickShots(COMBAT_STEP);
    expect(scene.shots).toHaveLength(0);
    for (const entry of expired) expect(entry.node.destroy).toHaveBeenCalledOnce();
  });

  it('sends changed HUD values and forces updates even after a round reset', () => {
    const scene = new ArenaScene() as any;
    scene.player = { health: 100, meter: 0, state: 'idle' };
    scene.enemy = { health: 100, meter: 0, state: 'idle' };
    scene.callbacks = { hud: vi.fn() };
    scene.updateHud(true);
    scene.elapsed = 0.1;
    scene.updateHud();
    expect(scene.callbacks.hud).toHaveBeenCalledTimes(1);
    scene.player.health = 90;
    scene.elapsed = 0.2;
    scene.updateHud();
    expect(scene.callbacks.hud).toHaveBeenLastCalledWith(expect.objectContaining({ player: 90 }));
    scene.elapsed = 0;
    scene.updateHud(true);
    expect(scene.callbacks.hud).toHaveBeenCalledTimes(3);
  });
});

describe('audio scheduling', () => {
  it('resumes with future notes without recreating a backlog from a suspended tab', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const audio = new ArcadeAudio() as any;
    audio.context = { currentTime: 120 };
    audio.track = 'battle';
    audio.nextBeat = 0;
    audio.tone = vi.fn();
    audio.noise = vi.fn();
    audio.schedule();
    expect(audio.nextBeat).toBeGreaterThan(120);
    expect(audio.tone.mock.calls.length).toBeLessThan(20);
    expect(audio.tone.mock.calls.every((call: number[]) => call[1] >= 120)).toBe(true);
  });
});
