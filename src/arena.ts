import Phaser from 'phaser';
import { fighters } from './fighters';
import { applyDamage, comboReady, fighterIds, roundWinner, type Direction, type FighterId } from './rules';
import type { ArcadeAudio } from './audio';
import { resolvePose, type FighterPose } from './animation';
import { facingOpponent, moveHorizontal, separateOnLanding } from './movement';
import { stages, type StageId } from './stages';

const W = 960;
const H = 540;
const GROUND = 500;

type TrainingStep = 'move' | 'jump' | 'attack' | 'hook' | 'block' | 'special' | 'alternate' | 'super' | null;
type Unit = {
  id: FighterId;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  guardAura: Phaser.GameObjects.Ellipse;
  x: number;
  elevation: number;
  velocityY: number;
  facing: -1 | 1;
  health: number;
  meter: number;
  guard: boolean;
  cooldown: number;
  specialCooldown: number;
  shieldUntil: number;
  aiAt: number;
  aiSpecialAt: number;
  walking: boolean;
  visualLunge: number;
  actionPose: FighterPose | null;
  actionUntil: number;
  currentPose: FighterPose;
};
type Shot = { node: Phaser.GameObjects.Container; x: number; y: number; velocity: number; owner: Unit; damage: number; born: number; boomerang: boolean; returning: boolean };

export type Hud = { player: number; enemy: number; playerMeter: number; enemyMeter: number; seconds: number; round: number; tutorial: boolean; bossPhase: number; versus: boolean };
export type ArenaControl = 'left' | 'right' | 'down' | 'block' | 'jump' | 'attack' | 'kick' | 'special' | 'super';
export type ArenaCallbacks = { hud: (state: Hud) => void; result: (result: 'player' | 'enemy' | 'draw') => void; training: (action: Exclude<TrainingStep, null>) => void; toast: () => void; phase: (phase: number) => void };

export class ArenaScene extends Phaser.Scene {
  audio: ArcadeAudio | null = null;
  callbacks: ArenaCallbacks | null = null;
  private background!: Phaser.GameObjects.Image;
  private player: Unit | null = null;
  private enemy: Unit | null = null;
  private shots: Shot[] = [];
  private keys!: Record<'left' | 'right' | 'up' | 'down' | 'attack' | 'block' | 'special', Phaser.Input.Keyboard.Key>;
  private keys2!: Record<'left' | 'right' | 'up' | 'down' | 'attack' | 'block' | 'special', Phaser.Input.Keyboard.Key>;
  private virtual = { left: false, right: false, down: false, block: false };
  private remoteVirtual = { left: false, right: false, down: false, block: false };
  private onlineRemote = false;
  private directionHistory: { direction: Direction; at: number }[] = [];
  private mode: 'idle' | 'fight' | 'training' | 'versus' = 'idle';
  private trainingStep: TrainingStep = null;
  private elapsed = 0;
  private timeLimit = 60;
  private round = 1;
  private bossPhase = 0;
  private difficulty = 1;
  private nextToast = 0;
  private selectedStage: StageId = 'office';
  private stopped = false;
  private pausedByUi = false;
  private lastHud = 0;
  private queuedAttack = false;
  private queuedKick = false;
  private queuedSpecial = false;
  private queuedSuper = false;
  private queuedJump = false;
  private queuedAttack2 = false;
  private queuedKick2 = false;
  private queuedSpecial2 = false;
  private queuedSuper2 = false;
  private queuedJump2 = false;

  constructor() { super('Arena'); }

  preload(): void {
    for (const stage of stages) this.load.image(stage.id, stage.art);
    for (const id of Object.keys(fighters) as FighterId[]) {
      this.load.image(id, fighters[id].art);
      if (fighters[id].poses) this.load.spritesheet(`${id}-poses`, `/assets/${id}-poses.png`, {
        frameWidth: id === 'rui' ? 505 : 512,
        frameHeight: id === 'rui' ? 518 : 512,
      });
    }
    this.load.image('monteiro-victory', '/assets/monteiro-victory.png');
  }

  create(): void {
    this.background = this.add.image(W / 2, H / 2, 'office').setDisplaySize(W, H).setDepth(-5);
    this.add.rectangle(W / 2, H - 9, W, 18, 0x07101e, 0.72).setDepth(-1);
    this.keys = this.input.keyboard!.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      attack: Phaser.Input.Keyboard.KeyCodes.J,
      block: Phaser.Input.Keyboard.KeyCodes.K,
      special: Phaser.Input.Keyboard.KeyCodes.L,
    }) as typeof this.keys;
    this.keys2 = this.input.keyboard!.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      attack: Phaser.Input.Keyboard.KeyCodes.F,
      block: Phaser.Input.Keyboard.KeyCodes.G,
      special: Phaser.Input.Keyboard.KeyCodes.H,
    }) as typeof this.keys2;
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
      if (event.repeat) return;
      if (event.code === 'KeyJ') this.queuedAttack = true;
      if (event.code === 'KeyL') this.queuedSpecial = true;
      if (event.code === 'ArrowUp') this.queuedJump = true;
      if (!this.onlineRemote) {
        if (event.code === 'KeyF') this.queuedAttack2 = true;
        if (event.code === 'KeyH') this.queuedSpecial2 = true;
        if (event.code === 'KeyW') this.queuedJump2 = true;
      }
      const direction = event.code === 'ArrowDown' ? 'down' : event.code === 'ArrowLeft' ? 'left' : event.code === 'ArrowRight' ? 'right' : null;
      if (direction) {
        this.directionHistory.push({ direction, at: performance.now() });
        this.directionHistory = this.directionHistory.slice(-5);
        if (this.mode === 'training' && this.trainingStep === 'move' && direction !== 'down') this.callbacks?.training('move');
      }
    });
    window.dispatchEvent(new Event('ctrl-alt-fighter-ready'));
  }

  setDifficulty(level: number): void { this.difficulty = Phaser.Math.Clamp(level, 0, 2); }
  setStage(stage: StageId): void { this.selectedStage = stage; }

  setVirtualControl(control: ArenaControl, pressed: boolean): void {
    if (control === 'jump' && pressed) this.queuedJump = true;
    else if (control === 'attack' && pressed) this.queuedAttack = true;
    else if (control === 'kick' && pressed) this.queuedKick = true;
    else if (control === 'special' && pressed) this.queuedSpecial = true;
    else if (control === 'super' && pressed) this.queuedSuper = true;
    else if (control in this.virtual) this.virtual[control as keyof typeof this.virtual] = pressed;
    if (pressed && (control === 'left' || control === 'right')) this.callbacks?.training('move');
  }

  setOnlineRemote(enabled: boolean): void {
    this.onlineRemote = enabled;
    this.remoteVirtual = { left: false, right: false, down: false, block: false };
    this.queuedAttack2 = this.queuedKick2 = this.queuedSpecial2 = this.queuedSuper2 = this.queuedJump2 = false;
  }

  setRemoteControl(control: ArenaControl, pressed: boolean): void {
    if (!this.onlineRemote || this.mode !== 'versus') return;
    if (control === 'jump' && pressed) this.queuedJump2 = true;
    else if (control === 'attack' && pressed) this.queuedAttack2 = true;
    else if (control === 'kick' && pressed) this.queuedKick2 = true;
    else if (control === 'special' && pressed) this.queuedSpecial2 = true;
    else if (control === 'super' && pressed) this.queuedSuper2 = true;
    else if (control in this.remoteVirtual) this.remoteVirtual[control as keyof typeof this.remoteVirtual] = pressed;
  }

  audioContext(): AudioContext | null {
    return (this.sound as Phaser.Sound.WebAudioSoundManager).context ?? null;
  }

  private makeUnit(id: FighterId, x: number, facing: -1 | 1): Unit {
    const shadow = this.add.ellipse(x, GROUND - 5, 146, 23, 0x020916, 0.5).setDepth(1);
    const guardColor = Phaser.Display.Color.HexStringToColor(fighters[id].accent).color;
    const guardAura = this.add.ellipse(x, GROUND - 142, 170, 278, guardColor, 0.08).setStrokeStyle(5, guardColor, 0.8).setDepth(3).setVisible(false);
    const sprite = this.add.image(x, GROUND, id).setOrigin(0.5, 1).setDepth(2);
    sprite.setScale(282 / sprite.height);
    sprite.setFlipX(facing === -1);
    return { id, sprite, shadow, guardAura, x, elevation: 0, velocityY: 0, facing, health: 100, meter: 0, guard: false, cooldown: 0, specialCooldown: 0, shieldUntil: 0, aiAt: 0, aiSpecialAt: 3.5, walking: false, visualLunge: 0, actionPose: null, actionUntil: 0, currentPose: 'idle' };
  }

  startRound(playerId: FighterId, enemyId: FighterId, round: number, tutorial: boolean, versus = false): void {
    this.clearCombat();
    this.mode = tutorial ? 'training' : versus ? 'versus' : 'fight';
    this.round = round;
    this.bossPhase = enemyId === 'cliente' ? 1 : 0;
    this.elapsed = 0;
    this.timeLimit = 60;
    this.nextToast = 0;
    this.stopped = false;
    this.pausedByUi = false;
    this.trainingStep = tutorial ? 'move' : null;
    this.directionHistory = [];
    this.queuedAttack = false;
    this.queuedKick = false;
    this.queuedSpecial = false;
    this.queuedSuper = false;
    this.queuedJump = false;
    this.queuedAttack2 = false;
    this.queuedKick2 = false;
    this.queuedSpecial2 = false;
    this.queuedSuper2 = false;
    this.queuedJump2 = false;
    this.virtual = { left: false, right: false, down: false, block: false };
    this.remoteVirtual = { left: false, right: false, down: false, block: false };
    this.background.setTexture(enemyId === 'cliente' ? 'datacenter' : this.selectedStage);
    this.background.setDisplaySize(W, H);
    this.player = this.makeUnit(playerId, 235, 1);
    this.enemy = this.makeUnit(enemyId, 725, -1);
    if (enemyId === 'cliente') this.enemy.health = 100;
    if (tutorial) this.enemy.x = 465;
    this.updateHud(true);
    if (!tutorial) this.audio?.sound('count');
  }

  setTrainingStep(step: TrainingStep): void {
    this.trainingStep = step;
    if (!this.player || !this.enemy) return;
    this.player.specialCooldown = 0;
    this.player.cooldown = 0;
    this.enemy.health = 100;
    if (step === 'attack' || step === 'hook') this.enemy.x = Phaser.Math.Clamp(this.player.x + (this.player.x < W / 2 ? 120 : -120), 100, W - 100);
    if (step === 'block') {
      this.enemy.x = Math.min(W - 160, this.player.x + (this.player.x < 500 ? 140 : -140));
      this.enemy.aiAt = this.elapsed + 1.2;
    }
    if (step === 'super') this.player.meter = 100;
    this.updateHud(true);
  }

  setUiPaused(value: boolean): void { this.pausedByUi = value; }

  showMenuBackground(): void {
    this.clearCombat();
    this.mode = 'idle';
    this.trainingStep = null;
    this.pausedByUi = false;
    this.background.setTexture('office').setDisplaySize(W, H);
  }

  private clearCombat(): void {
    this.player?.sprite.destroy();
    this.player?.shadow.destroy();
    this.player?.guardAura.destroy();
    this.enemy?.sprite.destroy();
    this.enemy?.shadow.destroy();
    this.enemy?.guardAura.destroy();
    this.player = null;
    this.enemy = null;
    this.shots.forEach(s => s.node.destroy());
    this.shots = [];
  }

  update(_time: number, delta: number): void {
    if (!this.player || !this.enemy || this.mode === 'idle' || this.stopped || this.pausedByUi) return;
    const dt = Math.min(delta / 1000, 0.05);
    this.elapsed += dt;
    if ((this.mode === 'fight' || this.mode === 'versus') && this.elapsed >= this.timeLimit) { this.finish(roundWinner(this.player.health, this.enemy.health)); return; }
    this.tickUnit(this.player, dt);
    this.tickUnit(this.enemy, dt);
    this.player.walking = false;
    this.enemy.walking = false;
    this.syncFacing();
    this.player.guard = (this.keys.block.isDown || this.virtual.block) && this.player.elevation === 0;
    this.player.sprite.setTint(this.player.guard ? 0x9ddcff : 0xffffff);
    this.player.sprite.setFlipX(this.player.facing === -1);
    this.enemy.sprite.setFlipX(this.enemy.facing === -1);
    this.handlePlayer(dt);
    this.syncFacing();
    if (this.mode === 'versus') this.handleSecondPlayer(dt);
    else this.handleEnemy(dt);
    this.syncFacing();
    this.tickShots(dt);
    this.renderUnit(this.player, 0);
    this.renderUnit(this.enemy, 2);
    this.updateHud();
  }

  private syncFacing(): void {
    if (!this.player || !this.enemy) return;
    this.player.facing = facingOpponent(this.player.x, this.enemy.x);
    this.enemy.facing = this.player.facing === 1 ? -1 : 1;
  }

  private tickUnit(unit: Unit, dt: number): void {
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    unit.specialCooldown = Math.max(0, unit.specialCooldown - dt);
    unit.visualLunge *= Math.max(0, 1 - dt * 17);
    if (unit.elevation > 0 || unit.velocityY > 0) {
      unit.elevation += unit.velocityY * dt;
      unit.velocityY -= 1450 * dt;
      if (unit.elevation <= 0) {
        unit.elevation = 0;
        unit.velocityY = 0;
        const opponent = unit === this.player ? this.enemy : this.player;
        if (opponent && opponent.elevation === 0) unit.x = separateOnLanding(unit.x, opponent.x);
        this.dust(unit.x, GROUND - 9, unit.id);
        if (unit === this.player) this.audio?.sound('land');
      }
    }
  }

  private handlePlayer(dt: number): void {
    const p = this.player!;
    if (!p.guard) {
      let direction = 0;
      if (this.keys.left.isDown || this.virtual.left) direction -= 1;
      if (this.keys.right.isDown || this.virtual.right) direction += 1;
      if (direction) {
        p.x = moveHorizontal(p.x, direction * (p.elevation > 0 ? 390 : 285) * dt, this.enemy!.x, p.elevation > 0, this.enemy!.elevation > 0, 68, W - 68);
        p.walking = true;
      }
    }
    this.syncFacing();
    if (this.queuedJump && p.elevation === 0) {
      p.velocityY = 690;
      this.dust(p.x, GROUND - 9, p.id);
      this.audio?.sound('jump');
      if (this.mode === 'training' && this.trainingStep === 'jump') this.callbacks?.training('jump');
    }
    this.queuedJump = false;
    if (this.queuedAttack) this.punch(p, this.enemy!, this.keys.down.isDown || this.virtual.down);
    this.queuedAttack = false;
    if (this.queuedKick) this.kick(p, this.enemy!);
    this.queuedKick = false;
    if (this.queuedSpecial) {
      const now = performance.now();
      const recent = this.directionHistory.filter(entry => now - entry.at < 800).map(entry => entry.direction);
      const forward = p.facing === 1 ? this.keys.right.isDown || this.virtual.right : this.keys.left.isDown || this.virtual.left;
      if (p.meter >= 100 && (this.keys.down.isDown || this.virtual.down || comboReady(recent, p.facing))) this.superAttack(p, this.enemy!);
      else this.special(p, this.enemy!, forward);
      this.directionHistory = [];
    }
    this.queuedSpecial = false;
    if (this.queuedSuper) {
      if (p.meter >= 100) this.superAttack(p, this.enemy!);
      else this.special(p, this.enemy!, false);
    }
    this.queuedSuper = false;
  }

  private handleSecondPlayer(dt: number): void {
    const p = this.enemy!;
    const left = this.onlineRemote ? this.remoteVirtual.left : this.keys2.left.isDown;
    const right = this.onlineRemote ? this.remoteVirtual.right : this.keys2.right.isDown;
    const down = this.onlineRemote ? this.remoteVirtual.down : this.keys2.down.isDown;
    const block = this.onlineRemote ? this.remoteVirtual.block : this.keys2.block.isDown;
    p.guard = block && p.elevation === 0;
    p.sprite.setTint(p.guard ? 0x9ddcff : 0xffffff);
    if (!p.guard) {
      const direction = Number(right) - Number(left);
      if (direction) {
        p.x = moveHorizontal(p.x, direction * (p.elevation > 0 ? 390 : 285) * dt, this.player!.x, p.elevation > 0, this.player!.elevation > 0, 68, W - 68);
        p.walking = true;
      }
    }
    this.syncFacing();
    if (this.queuedJump2 && p.elevation === 0) { p.velocityY = 690; this.dust(p.x, GROUND - 9, p.id); this.audio?.sound('jump'); }
    this.queuedJump2 = false;
    if (this.queuedAttack2) this.punch(p, this.player!, down);
    this.queuedAttack2 = false;
    if (this.queuedKick2) this.kick(p, this.player!);
    this.queuedKick2 = false;
    if (this.queuedSpecial2) {
      const forward = p.facing === 1 ? right : left;
      if (p.meter >= 100 && down) this.superAttack(p, this.player!);
      else this.special(p, this.player!, forward);
    }
    this.queuedSpecial2 = false;
    if (this.queuedSuper2) {
      if (p.meter >= 100) this.superAttack(p, this.player!);
      else this.special(p, this.player!, false);
    }
    this.queuedSuper2 = false;
  }

  private handleEnemy(dt: number): void {
    const e = this.enemy!;
    const p = this.player!;
    if (this.mode === 'training') {
      if (this.trainingStep === 'block' && this.elapsed >= e.aiAt) { e.aiAt = this.elapsed + 1.8; this.punch(e, p, false, true); }
      return;
    }
    const distance = Math.abs(p.x - e.x);
    const level = this.round + this.difficulty - 1;
    if (distance > 140) { e.x = Phaser.Math.Clamp(e.x + Math.sign(p.x - e.x) * (95 + level * 18) * dt, 70, W - 70); e.walking = true; }
    if (distance < 175 && this.elapsed >= e.aiAt) {
      e.aiAt = this.elapsed + (1.55 - level * 0.16) + Math.random() * 0.5;
      this.punch(e, p, this.bossPhase === 2 && Math.random() < 0.22);
    }
    if (this.elapsed >= e.aiSpecialAt && distance < 370) {
      e.aiSpecialAt = this.elapsed + 4.5 + Math.random() * 2;
      this.special(e, p, e.id === 'cliente' ? this.bossPhase === 2 && Math.random() < 0.22 : Math.random() < 0.3);
    }
    e.guard = distance < 175 && Math.sin(this.elapsed * 2.3 + level) > 0.78;
    e.sprite.setTint(e.guard ? 0x9ddcff : 0xffffff);
  }

  private renderUnit(unit: Unit, bobOffset: number): void {
    const pose = resolvePose(unit.actionPose, unit.actionUntil, this.elapsed, unit.guard, unit.elevation, unit.walking);
    if (pose !== unit.currentPose) {
      if (fighters[unit.id].poses) unit.sprite.setTexture(pose === 'idle' ? unit.id : `${unit.id}-poses`, pose === 'idle' ? undefined : { walk: 0, punch: 1, guard: 2, jump: 3, special: 4, hurt: 5 }[pose]);
      unit.sprite.setScale(282 / unit.sprite.height);
      unit.currentPose = pose;
    }
    const visualX = unit.x + unit.facing * unit.visualLunge;
    const walkingBob = unit.walking && unit.elevation === 0 ? Math.sin(this.elapsed * 34 + bobOffset) * 3 : 0;
    unit.sprite.setPosition(visualX, GROUND - unit.elevation + walkingBob);
    unit.sprite.setFlipX(unit.facing === -1);
    unit.sprite.setAngle(pose === 'hurt' ? -unit.facing * 8 : pose === 'punch' ? -unit.facing * 3 : pose === 'special' ? unit.facing * 4 : 0);
    unit.shadow.setPosition(unit.x, GROUND - 5).setScale(Math.max(0.5, 1 - unit.elevation / 390), 1).setAlpha(Math.max(0.12, 0.52 - unit.elevation / 600));
    unit.guardAura.setPosition(unit.x, GROUND - 142 - unit.elevation).setVisible(unit.guard || unit.shieldUntil > this.elapsed);
    if (unit.elevation > 25 && Math.random() < 0.19) {
      const color = Phaser.Display.Color.HexStringToColor(fighters[unit.id].accent).color;
      const trail = this.add.rectangle(unit.x + Phaser.Math.Between(-20, 20), GROUND - unit.elevation - 12, 5, 19, color, 0.6).setDepth(1);
      this.tweens.add({ targets: trail, y: trail.y + 42, alpha: 0, duration: 210, onComplete: () => trail.destroy() });
    }
  }

  private pose(unit: Unit, action: FighterPose, duration: number): void {
    unit.actionPose = action;
    unit.actionUntil = this.elapsed + duration;
  }

  private dust(x: number, y: number, id: FighterId): void {
    const color = Phaser.Display.Color.HexStringToColor(fighters[id].accent).color;
    for (let i = 0; i < 6; i++) {
      const particle = this.add.rectangle(x + Phaser.Math.Between(-27, 27), y, Phaser.Math.Between(4, 9), 4, color, 0.75).setDepth(3);
      this.tweens.add({ targets: particle, x: particle.x + Phaser.Math.Between(-40, 40), y: y - Phaser.Math.Between(5, 24), alpha: 0, duration: 270, onComplete: () => particle.destroy() });
    }
  }

  private punch(attacker: Unit, target: Unit, hook = false, trainingDummy = false): void {
    if (attacker.cooldown > 0 || attacker.guard) return;
    attacker.cooldown = hook ? 0.68 : 0.44;
    this.pose(attacker, 'punch', 0.24);
    attacker.visualLunge = hook ? 37 : 22;
    this.audio?.sound(hook ? 'hook' : 'punch');
    this.spark(attacker.x + attacker.facing * 76, GROUND - (hook ? 190 : 150), fighters[attacker.id].accent, hook ? 78 : 50);
    if (Math.abs(attacker.x - target.x) < (hook ? 185 : 170) && Math.abs(attacker.elevation - target.elevation) < 105) this.hit(target, attacker, trainingDummy ? 6 : hook ? 14 : 10, hook ? 'hook' : 'basic');
    if (this.mode === 'training' && attacker === this.player && this.trainingStep === 'attack') this.callbacks?.training('attack');
    if (this.mode === 'training' && attacker === this.player && this.trainingStep === 'hook' && hook) this.callbacks?.training('hook');
  }

  private kick(attacker: Unit, target: Unit): void {
    if (attacker.cooldown > 0 || attacker.guard) return;
    attacker.cooldown = 0.58;
    this.pose(attacker, 'punch', 0.34);
    attacker.visualLunge = 31;
    this.audio?.sound('kick');
    this.spark(attacker.x + attacker.facing * 84, GROUND - 130, fighters[attacker.id].accent, 64);
    if (Math.abs(attacker.x - target.x) < 192 && Math.abs(attacker.elevation - target.elevation) < 105) this.hit(target, attacker, 13, 'basic');
  }

  private special(attacker: Unit, target: Unit, alternate = false): void {
    if (attacker.specialCooldown > 0 || attacker.guard) return;
    attacker.specialCooldown = 2.6;
    this.pose(attacker, 'special', 0.42);
    attacker.visualLunge = 14;
    const def = fighters[attacker.id];
    const kind = alternate ? def.alternateKind : def.specialKind;
    this.audio?.sound(attacker.id);
    const wasReady = attacker.meter >= 100;
    attacker.meter = Math.min(100, attacker.meter + 8);
    if (attacker === this.player && !wasReady && attacker.meter >= 100) this.audio?.sound('ready');
    if (kind === 'barrier') {
      const finalBoss = attacker.id === 'cliente';
      attacker.shieldUntil = this.elapsed + (finalBoss ? 0.85 : 1.55);
      this.firewall(attacker, alternate ? def.alternate.toUpperCase() : def.special.toUpperCase());
      if (Math.abs(attacker.x - target.x) < 190) this.hit(target, attacker, finalBoss ? 12 : 16, 'special');
    } else if (kind === 'cable') {
      this.cable(attacker);
      if ((target.x - attacker.x) * attacker.facing > 0 && Math.abs(target.x - attacker.x) < 330) this.hit(target, attacker, 16, 'special');
    } else {
      const projectile = this.makeProjectile(attacker);
      this.shots.push({ node: projectile, x: projectile.x, y: projectile.y, velocity: attacker.facing * 565, owner: attacker, damage: 16, born: this.elapsed, boomerang: kind === 'boomerang', returning: false });
    }
    if (this.mode === 'training' && attacker === this.player && this.trainingStep === 'special') this.callbacks?.training('special');
    if (this.mode === 'training' && attacker === this.player && this.trainingStep === 'alternate' && alternate) this.callbacks?.training('alternate');
    this.updateHud(true);
  }

  private makeProjectile(attacker: Unit): Phaser.GameObjects.Container {
    const id = attacker.id;
    const color = Phaser.Display.Color.HexStringToColor(fighters[id].accent).color;
    const container = this.add.container(attacker.x + attacker.facing * 84, GROUND - 154).setDepth(5).setScale(attacker.facing, 1);
    const g = this.add.graphics();
    g.fillStyle(color, 0.2).fillCircle(0, 0, 49);
    g.lineStyle(4, color, 0.72).strokeCircle(0, 0, 43);
    if (id === 'vinicius') {
      g.fillStyle(0x102b65).fillRoundedRect(-31, -31, 62, 62, 5);
      g.lineStyle(4, 0x77d6ff).strokeRoundedRect(-31, -31, 62, 62, 5);
      g.fillStyle(0x28b7ff).fillRect(-17, -17, 34, 34);
      g.lineStyle(2, 0xe6fbff).strokeRect(-17, -17, 34, 34);
      for (let p = -22; p <= 22; p += 11) {
        g.lineStyle(4, 0xffd56b).lineBetween(p, -38, p, -31).lineBetween(p, 31, p, 38);
        g.lineBetween(-38, p, -31, p).lineBetween(31, p, 38, p);
      }
    } else if (id === 'caio') {
      g.fillStyle(0x0e70b1).fillRoundedRect(-39, -25, 78, 50, 7);
      g.lineStyle(3, 0x98efff).strokeRoundedRect(-39, -25, 78, 50, 7);
      g.fillStyle(0xf0ffff).fillRect(-25, -13, 50, 26);
      g.lineStyle(3, 0x0c5d9e).lineBetween(-18, -4, 16, -4).lineBetween(-18, 5, 6, 5);
      g.lineStyle(4, 0x7ae9ff).strokeCircle(0, 0, 32);
    } else {
      const border = color;
      g.fillStyle(0xf5faff).fillRoundedRect(-37, -30, 74, 60, 4);
      g.lineStyle(4, border).strokeRoundedRect(-37, -30, 74, 60, 4);
      if (id === 'laura') {
        g.fillStyle(0x77d599).fillRect(-27, -19, 54, 11);
        g.lineStyle(2, 0x7294a1);
        for (let x = -9; x <= 10; x += 18) g.lineBetween(x, -8, x, 21);
        for (let y = 2; y <= 19; y += 9) g.lineBetween(-27, y, 27, y);
      } else {
        g.fillStyle(0xff5fbf).fillCircle(22, 15, 8);
        g.lineStyle(2, 0x54728d).lineBetween(-25, -14, 18, -14).lineBetween(-25, -4, 11, -4).lineBetween(-25, 7, 2, 7);
      }
    }
    container.add(g);
    return container;
  }

  private firewall(attacker: Unit, text = 'ACESSO NEGADO'): void {
    const x = attacker.x + attacker.facing * 57;
    const y = GROUND - 149;
    const shield = this.add.graphics({ x, y }).setDepth(5);
    for (const radius of [52, 76, 95]) {
      shield.lineStyle(radius === 76 ? 7 : 3, radius === 76 ? 0xffe277 : 0xffc52d, radius === 76 ? 0.95 : 0.55);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const b = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6;
        shield.lineBetween(Math.cos(a) * radius, Math.sin(a) * radius * 1.34, Math.cos(b) * radius, Math.sin(b) * radius * 1.34);
      }
    }
    shield.fillStyle(0xffd449, 0.17).fillEllipse(0, 0, 140, 220);
    this.tweens.add({ targets: shield, scaleX: 1.25, scaleY: 1.12, alpha: 0, duration: 900, onComplete: () => shield.destroy() });
    const label = this.add.text(x, y - 140, text, { fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: '#fff2ae', stroke: '#2e2102', strokeThickness: 5 }).setOrigin(0.5).setDepth(6);
    this.tweens.add({ targets: label, y: label.y - 21, alpha: 0, duration: 800, onComplete: () => label.destroy() });
  }

  private cable(attacker: Unit): void {
    const graphics = this.add.graphics().setDepth(5);
    const fromX = attacker.x + attacker.facing * 37;
    const fromY = GROUND - 151;
    this.tweens.addCounter({ from: 0, to: 1, duration: 350, ease: 'Cubic.Out', onUpdate: tween => {
      const reach = 300 * Number(tween.getValue());
      graphics.clear();
      let lastX = fromX;
      let lastY = fromY;
      for (let i = 1; i <= 12; i++) {
        const progress = i / 12;
        const x = fromX + attacker.facing * reach * progress;
        const y = fromY - Math.sin(progress * Math.PI * 2) * 19;
        graphics.lineStyle(19, 0x25ff82, 0.2).lineBetween(lastX, lastY, x, y);
        graphics.lineStyle(8, 0x27f873).lineBetween(lastX, lastY, x, y);
        graphics.lineStyle(3, 0xeaffed).lineBetween(lastX, lastY, x, y);
        lastX = x; lastY = y;
      }
      graphics.fillStyle(0xeaffed).fillRoundedRect(lastX - 10, lastY - 10, 20, 20, 3);
      graphics.lineStyle(3, 0x18b35c).strokeRoundedRect(lastX - 10, lastY - 10, 20, 20, 3);
    }, onComplete: () => graphics.destroy() });
  }

  private superAttack(attacker: Unit, target: Unit): void {
    attacker.meter = 0;
    attacker.specialCooldown = 2.6;
    this.pose(attacker, 'special', 0.85);
    this.audio?.sound('super');
    this.audio?.sound(attacker.id);
    const def = fighters[attacker.id];
    const color = Phaser.Display.Color.HexStringToColor(def.accent).color;
    const flash = this.add.rectangle(W / 2, H / 2, W, H, color, 0.68).setDepth(7);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x061126, 0.76).setDepth(8);
    const streaks = this.add.graphics().setDepth(9);
    for (let i = 0; i < 24; i++) {
      const y = 28 + i * 22;
      const length = 170 + (i * 83) % 510;
      streaks.lineStyle(i % 3 === 0 ? 5 : 2, i % 3 === 0 ? 0xffffff : color, 0.65);
      streaks.lineBetween(i % 2 === 0 ? 0 : W - length, y, i % 2 === 0 ? length : W, y - 24);
    }
    const cutIn = this.add.image(attacker === this.player ? 180 : 780, H + 30, attacker.id).setOrigin(0.5, 1).setDepth(10).setAlpha(0.95);
    cutIn.setScale(470 / cutIn.height).setFlipX(attacker.facing === -1);
    const allyId = fighterIds.includes(attacker.id) ? fighterIds[(fighterIds.indexOf(attacker.id) + 1) % fighterIds.length] : null;
    const ally = allyId ? this.add.image(attacker === this.player ? 810 : 150, H + 20, allyId).setOrigin(0.5, 1).setDepth(10).setAlpha(0.85) : null;
    if (ally) ally.setScale(310 / ally.height).setFlipX(attacker.facing === 1);
    const title = this.add.text(W / 2, H / 2 - 38, def.superName.toUpperCase(), { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '43px', fontStyle: 'bold', color: '#ffffff', stroke: '#071020', strokeThickness: 11, align: 'center', wordWrap: { width: 580 } }).setOrigin(0.5).setDepth(11);
    const caption = this.add.text(W / 2, H / 2 + 20, `${def.codename}  //  ${allyId ? 'BARRA DE COLABORAÇÃO' : 'GOLPE FORTE'}`, { fontFamily: 'monospace', fontSize: '18px', color: def.accent, stroke: '#071020', strokeThickness: 6 }).setOrigin(0.5).setDepth(11);
    this.cameras.main.shake(260, 0.008);
    for (const node of [flash, shade, streaks, cutIn, ally, title, caption]) if (node) this.tweens.add({ targets: node, alpha: 0, duration: 720, delay: 250, onComplete: () => node.destroy() });
    this.time.delayedCall(260, () => {
      if (!this.stopped && (attacker === this.player || attacker === this.enemy)) {
        this.spark(target.x, GROUND - target.elevation - 150, def.accent, 150);
        this.hit(target, attacker, 31, 'super');
      }
    });
    if (this.mode === 'training' && attacker === this.player && this.trainingStep === 'super') this.callbacks?.training('super');
    this.updateHud(true);
  }

  private tickShots(dt: number): void {
    for (const shot of [...this.shots]) {
      if (shot.boomerang && !shot.returning && this.elapsed - shot.born > 0.55) { shot.returning = true; shot.velocity *= -1; }
      shot.x += shot.velocity * dt;
      shot.node.setX(shot.x);
      shot.node.angle += dt * (shot.boomerang ? 410 : 160);
      if (Math.random() < 0.65) {
        const color = Phaser.Display.Color.HexStringToColor(fighters[shot.owner.id].accent).color;
        const particle = this.add.rectangle(shot.x - Math.sign(shot.velocity) * Phaser.Math.Between(25, 45), shot.y + Phaser.Math.Between(-23, 23), Phaser.Math.Between(4, 9), Phaser.Math.Between(4, 9), color, 0.85).setDepth(4);
        this.tweens.add({ targets: particle, x: particle.x - Math.sign(shot.velocity) * 35, alpha: 0, scale: 0.2, duration: 250, onComplete: () => particle.destroy() });
      }
      const target = shot.owner === this.player ? this.enemy! : this.player!;
      if (Math.abs(shot.x - target.x) < 66 && Math.abs(shot.y - (GROUND - target.elevation - 150)) < 90) {
        this.hit(target, shot.owner, shot.damage, 'special');
        this.removeShot(shot);
      } else if (shot.x < -100 || shot.x > W + 100 || this.elapsed - shot.born > 1.9) this.removeShot(shot);
    }
  }

  private removeShot(shot: Shot): void { shot.node.destroy(); this.shots = this.shots.filter(s => s !== shot); }

  private hit(target: Unit, attacker: Unit, damage: number, style: 'basic' | 'hook' | 'special' | 'super' = 'basic'): void {
    if (this.stopped) return;
    const guarded = target.guard || target.shieldUntil > this.elapsed;
    const playerMeterBefore = this.player?.meter ?? 0;
    target.health = applyDamage(target.health, damage, guarded);
    attacker.meter = Math.min(100, attacker.meter + (guarded ? 5 : 17));
    target.meter = Math.min(100, target.meter + (guarded ? 5 : 9));
    this.audio?.sound(guarded ? 'block' : 'hit');
    if (!guarded && style !== 'basic' && this.mode !== 'training' && this.elapsed >= this.nextToast) {
      this.nextToast = this.elapsed + 6;
      this.callbacks?.toast();
      this.audio?.sound('toast');
    }
    this.spark(target.x, GROUND - target.elevation - 155, guarded ? '#7be1ff' : '#ffe166', guarded ? 62 : 95);
    this.cameras.main.shake(guarded ? 80 : 120, guarded ? 0.0015 : 0.003);
    if (!guarded) {
      target.x = Phaser.Math.Clamp(target.x + attacker.facing * 21, 70, W - 70);
      target.visualLunge = -16;
      this.pose(target, 'hurt', 0.28);
      target.sprite.setTint(0xffa4a4);
      this.time.delayedCall(100, () => { if (target.sprite.active) target.sprite.setTint(target.guard ? 0x9ddcff : 0xffffff); });
    }
    if (this.mode === 'training' && target === this.player && guarded && this.trainingStep === 'block') this.callbacks?.training('block');
    if (this.mode === 'training') target.health = Math.max(30, target.health);
    if (target === this.enemy && target.id === 'cliente' && this.bossPhase === 1 && target.health > 0 && target.health <= 50) {
      this.bossPhase = 2;
      this.cameras.main.flash(400, 255, 107, 46);
      this.callbacks?.phase(2);
      this.audio?.sound('phase');
    }
    if (target.health <= 0) this.finish(target === this.enemy ? 'player' : 'enemy');
    if (playerMeterBefore < 100 && (this.player?.meter ?? 0) >= 100) this.audio?.sound('ready');
    this.updateHud(true);
  }

  private spark(x: number, y: number, color: string, size: number): void {
    const hex = Phaser.Display.Color.HexStringToColor(color).color;
    const halo = this.add.circle(x, y, size / 2, hex, 0.18).setStrokeStyle(5, 0xffffff).setDepth(6);
    this.tweens.add({ targets: halo, scale: 1.9, alpha: 0, duration: 280, onComplete: () => halo.destroy() });
    const burst = this.add.graphics({ x, y }).setDepth(6);
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const inner = size * 0.22;
      const outer = size * (i % 2 ? 0.63 : 0.82);
      burst.lineStyle(i % 2 ? 3 : 5, i % 2 ? 0xffffff : hex, 0.95);
      burst.lineBetween(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer);
    }
    this.tweens.add({ targets: burst, scaleX: 1.35, scaleY: 1.35, alpha: 0, duration: 220, onComplete: () => burst.destroy() });
  }

  private updateHud(force = false): void {
    if (!this.player || !this.enemy) return;
    if (!force && this.elapsed - this.lastHud < 0.09) return;
    this.lastHud = this.elapsed;
    this.callbacks?.hud({ player: this.player.health, enemy: this.enemy.health, playerMeter: this.player.meter, enemyMeter: this.enemy.meter, seconds: Math.max(0, Math.ceil(this.timeLimit - this.elapsed)), round: this.round, tutorial: this.mode === 'training', bossPhase: this.bossPhase, versus: this.mode === 'versus' });
  }

  private finish(result: 'player' | 'enemy' | 'draw'): void {
    if (this.stopped) return;
    this.stopped = true;
    this.audio?.sound('ko');
    if (result === 'player' && this.player?.id === 'monteiro') this.player.sprite.setTexture('monteiro-victory');
    this.updateHud(true);
    this.callbacks?.result(result);
  }
}
