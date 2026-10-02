import Phaser from 'phaser';
import { fighters, hasAdvancedCombat } from './fighters';
import { applyDamage, fighterIds, roundWinner, type FighterId } from './rules';
import type { ArcadeAudio } from './audio';
import { advancedAnimation, caioAnimationGroups, kallianeAnimationGroups, yafaAnimationGroups, ruiAnimationGroups, fighterAnimation, fighterPoses, monteiroAnimation, monteiroAnimationGroups, monteiroV6Groups, poseHoldsLastFrame, sheetGrid, spriteSheetLayout, visualPose, type FighterPose } from './animation';
import { BACKHOP_LIFT, BACKHOP_SPEED, DOUBLE_JUMP_CEILING, RUN_SPEED, canDoubleJump, createMobility, tapDirection, type Mobility } from './agility';
import { facingOpponent, moveHorizontal, separateOnLanding } from './movement';
import { stages, type StageId } from './stages';
import { canGuard, canMove, canStartAction, canStartSuper, canTurn, canJump as fsmCanJump, isLocked, resolveGroundIdleState, type FighterState } from './fsm';
import { PLAYER_ONE_CONTROLS, PLAYER_TWO_CONTROLS, DEBUG_HITBOX_TOGGLE, ACTION_LABELS, actionForCode, labelFor } from './config/controls';
import { pushMotion, quarterCircleForward, type MotionDirection, type MotionInput } from './motion';

import { COMBAT_STEP, MOVES, Hitstop, attackBox, attackPhase, attackVisualFrame, consumeHit, createAttack, hurtbox, moveDuration, overlaps, projectileBox, type Attack, type HitStyle, type MoveId, type Rect } from './combat';

// Traduz um KeyboardEvent.code (string nativa do navegador, usada na config
// desacoplada em ./config/controls) para o enum numérico exigido pela API de
// teclado do Phaser. Esta é a única camada que conhece o Phaser — a config
// permanece livre de qualquer dependência da engine.
function phaserKeyCode(code: string): number {
  const K = Phaser.Input.Keyboard.KeyCodes as unknown as Record<string, number>;
  const named: Record<string, string> = {
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
    Numpad0: 'NUMPAD_ZERO', Numpad1: 'NUMPAD_ONE', Numpad2: 'NUMPAD_TWO', Numpad3: 'NUMPAD_THREE',
    Numpad4: 'NUMPAD_FOUR', Numpad5: 'NUMPAD_FIVE', Numpad6: 'NUMPAD_SIX', Numpad7: 'NUMPAD_SEVEN',
    Numpad8: 'NUMPAD_EIGHT', Numpad9: 'NUMPAD_NINE',
  };
  if (named[code]) return K[named[code]] ?? 0;
  if (code.startsWith('Key') && code.length === 4) return K[code.slice(3)] ?? 0;
  return K[code] ?? 0;
}

const W = 960;
const H = 540;
const GROUND = 500;

// Duracao VISUAL do Gauncho (so Rui), descolada da duracao de GAMEPLAY do
// gancho (MOVES.hook, igual para todo personagem: 0,25s). A pose 'gauncho'
// roda a 10fps/6 quadros (ver animation.ts) = 0,6s -- mais que o dobro da
// janela de 0,25s em que `unit.state` fica travado em 'attack'. Sem este
// campo a troca de pose aconteceria no instante em que o estado destrava
// (ver tickUnit), cortando a animacao no meio. Como a pose so se sustenta
// enquanto `unit.state === 'idle'` (ver renderUnit), qualquer acao nova --
// andar, atacar de novo, apanhar -- cancela a sustentacao imediatamente,
// entao o controle do jogador nunca fica mais lento por causa disto.
const GAUNCHO_VISUAL_HOLD = 0.6;

type TrainingStep = 'move' | 'crouch' | 'jump' | 'weakAttack' | 'strongAttack' | 'kick' | 'sweep' | 'block' | 'special' | 'alternate' | 'combo' | 'super' | 'free' | null;
export type TrainingDummyMode = 'idle' | 'guard' | 'attack';
type Unit = {
  id: FighterId;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  guardAura: Phaser.GameObjects.Ellipse;
  x: number;
  elevation: number;
  velocityY: number;
  facing: -1 | 1;
  health: number;
  meter: number;
  state: FighterState;
  stateUntil: number;
  currentVisual: FighterPose;
  lastAnimState: FighterState;
  flashUntil: number;
  cooldown: number;
  specialCooldown: number;
  shieldUntil: number;
  aiAt: number;
  aiSpecialAt: number;
  visualLunge: number;
  attack: Attack | null;
  comboCount: number;
  comboAttacker: FighterId | null;
  // Ate quando a pose 'gauncho' deve continuar sendo mostrada depois que
  // `unit.state` ja saiu de 'attack'. Ver GAUNCHO_VISUAL_HOLD.
  gaunchoVisualUntil: number;
  mobility: Mobility;
  hurtPose: FighterPose;
  hurtStarted: number;
  knockedDown: boolean;
};
type Shot = { node: Phaser.GameObjects.Container; x: number; y: number; velocity: number; owner: Unit; damage: number; born: number; boomerang: boolean; returning: boolean };
type Particle = { node: Phaser.GameObjects.Rectangle; age: number; duration: number; vx: number; vy: number; alpha: number; shrink: boolean };
const PARTICLE_LIMIT = 48;

export type Hud = { player: number; enemy: number; playerMeter: number; enemyMeter: number; seconds: number; round: number; tutorial: boolean; bossPhase: number; versus: boolean; playerState: FighterState; enemyState: FighterState; inputLog: string[] };
export type ArenaControl = 'left' | 'right' | 'down' | 'block' | 'jump' | 'attack' | 'kick' | 'heavyAttack' | 'heavyKick' | 'special' | 'super';
export type ArenaCallbacks = { hud: (state: Hud) => void; result: (result: 'player' | 'enemy' | 'draw') => void; training: (action: Exclude<TrainingStep, null>) => void; toast: () => void; phase: (phase: number) => void };

export class ArenaScene extends Phaser.Scene {
  audio: ArcadeAudio | null = null;
  callbacks: ArenaCallbacks | null = null;
  private background!: Phaser.GameObjects.Image;
  private player: Unit | null = null;
  private enemy: Unit | null = null;
  private shots: Shot[] = [];
  private particles: Particle[] = [];
  private particleCursor = 0;
  private lastHudState: Hud | null = null;
  private debugBoxesVisible = false;
  private keys!: Record<'left' | 'right' | 'down' | 'block', Phaser.Input.Keyboard.Key>;
  private keys2!: Record<'left' | 'right' | 'down' | 'block', Phaser.Input.Keyboard.Key>;
  private virtual = { left: false, right: false, down: false, block: false };
  private remoteVirtual = { left: false, right: false, down: false, block: false };
  private onlineRemote = false;
  private inputLog: string[] = [];
  private mode: 'idle' | 'fight' | 'training' | 'versus' = 'idle';
  private trainingStep: TrainingStep = null;
  private dummyMode: TrainingDummyMode = 'idle';
  private elapsed = 0;
  private accumulator = 0;
  private hitstop = new Hitstop();
  debugHitboxes = false;
  private debugGraphics!: Phaser.GameObjects.Graphics;
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
  private queuedHeavyAttack = false;
  private queuedHeavyKick = false;
  private queuedSpecial = false;
  private queuedSuper = false;
  private queuedJump = false;
  private queuedAttack2 = false;
  private queuedKick2 = false;
  private queuedHeavyAttack2 = false;
  private queuedHeavyKick2 = false;
  private queuedSpecial2 = false;
  private queuedSuper2 = false;
  private queuedJump2 = false;
  // Buffer de direcoes do Jogador 1 para o comando ↓→ do Firewall Punch.
  // Guarda apenas as TRANSICOES (tecla que acabou de ser pressionada), nunca
  // o estado continuo: o polling roda a cada quadro e encheria o buffer com
  // dezenas de `down` identicos, fazendo qualquer ↓ segurado casar com
  // qualquer → posterior.
  private motionLog: MotionInput[] = [];
  private motionHeld = { down: false, left: false, right: false };
  private victorySprite: Phaser.GameObjects.Sprite | null = null;
  private victoryTimer: Phaser.Time.TimerEvent | null = null;

  constructor() { super('Arena'); }

  preload(): void {
    for (const stage of stages) this.load.image(stage.id, stage.art);
    for (const id of Object.keys(fighters) as FighterId[]) {
      this.load.image(id, fighters[id].art);
      if (fighters[id].poses) {
        const layout = spriteSheetLayout(id);
        if (id === 'yafa' || id === 'rui' || id === 'caio' || id === 'kalliane' || id === 'laura' || id === 'vinicius') {
          const groups = id === 'rui' ? ruiAnimationGroups : id === 'caio' ? caioAnimationGroups : id === 'kalliane' ? kallianeAnimationGroups : yafaAnimationGroups;
          const version = id === 'rui' ? 'v5' : id === 'kalliane' ? 'v2' : 'v1';
          for (const group of Object.keys(groups)) {
            if (group === 'backward') continue;
            const key = `${id}-${version}-${group}`;
            const assetFix = group === 'flight' && ['laura', 'vinicius'].includes(id)
              ? '?jumpfix=2'
              : group === 'defense' && ['laura', 'vinicius'].includes(id)
                ? '?guardfix=2'
                : '';
            this.load.spritesheet(key, `${import.meta.env.BASE_URL}assets/characters/${id}/${key}.webp${assetFix}`, layout);
          }
          if (id === 'rui' || id === 'caio') {
            this.load.spritesheet(`${id}-v6-walk`, `${import.meta.env.BASE_URL}assets/characters/${id}/${id}-v6-walk.webp`, layout);
            this.load.spritesheet(`${id}-v6-walk-back`, `${import.meta.env.BASE_URL}assets/characters/${id}/${id}-v6-walk-back.webp`, layout);
          }
          if (id === 'kalliane') {
            for (const variant of ['walk12', 'walkBack12']) {
              const key = `${id}-v2-${variant}`;
              this.load.spritesheet(key, `${import.meta.env.BASE_URL}assets/characters/${id}/${key}.webp`, layout);
            }
          }
          continue;
        }
        if (fighters[id].animationSet === 'monteiro-v5') {
          for (const group of Object.keys(monteiroAnimationGroups)) {
            this.load.spritesheet(`monteiro-v5-${group}`, `${import.meta.env.BASE_URL}assets/characters/monteiro/monteiro-v5-${group}.webp`, layout);
          }
          for (const group of Object.keys(monteiroV6Groups)) {
            this.load.spritesheet(`monteiro-v6-${group}`, `${import.meta.env.BASE_URL}assets/characters/monteiro/monteiro-v6-${group}.webp`, { frameWidth: 512, frameHeight: 512 });
          }
          for (const opponent of Object.keys(fighters)) {
            this.load.spritesheet(`monteiro-victory-${opponent}`, `${import.meta.env.BASE_URL}assets/characters/monteiro/victories/monteiro-victory-${opponent}.webp`, { frameWidth: 384, frameHeight: 320 });
          }
          continue;
        }
        const version = fighters[id].spriteSheetVersion ?? 'v3';
        this.load.spritesheet(`${id}-spritesheet`, `${import.meta.env.BASE_URL}assets/characters/${id}/spritesheet-${version}.webp`, layout);
      }
    }
  }

  create(): void {
    this.debugGraphics = this.add.graphics().setDepth(20);
    this.background = this.add.image(W / 2, H / 2, 'office').setDisplaySize(W, H).setDepth(-5);
    this.createFighterAnimations();
    this.add.rectangle(W / 2, H - 9, W, 18, 0x07101e, 0.72).setDepth(-1);
    this.keys = this.input.keyboard!.addKeys({
      left: phaserKeyCode(PLAYER_ONE_CONTROLS.left.code),
      right: phaserKeyCode(PLAYER_ONE_CONTROLS.right.code),
      down: phaserKeyCode(PLAYER_ONE_CONTROLS.down.code),
      block: phaserKeyCode(PLAYER_ONE_CONTROLS.block.code),
    }) as typeof this.keys;
    this.keys2 = this.input.keyboard!.addKeys({
      left: phaserKeyCode(PLAYER_TWO_CONTROLS.left.code),
      right: phaserKeyCode(PLAYER_TWO_CONTROLS.right.code),
      down: phaserKeyCode(PLAYER_TWO_CONTROLS.down.code),
      block: phaserKeyCode(PLAYER_TWO_CONTROLS.block.code),
    }) as typeof this.keys2;
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
      if (event.repeat) return;
      if (event.code === DEBUG_HITBOX_TOGGLE.code && this.mode === 'training') {
        this.debugHitboxes = !this.debugHitboxes;
        this.drawDebugBoxes();
      }
      const p1Action = actionForCode(PLAYER_ONE_CONTROLS, event.code);
      if (p1Action === 'left' || p1Action === 'right') this.queueMobilityTap(this.player, p1Action);
      if (p1Action === 'attack') this.queuedAttack = true;
      if (p1Action === 'kick') this.queuedKick = true;
      if (p1Action === 'heavyAttack') this.queuedHeavyAttack = true;
      if (p1Action === 'heavyKick') this.queuedHeavyKick = true;
      if (p1Action === 'special') this.queuedSpecial = true;
      if (p1Action === 'super') this.queuedSuper = true;
      if (p1Action === 'jump') this.queuedJump = true;
      if (!this.onlineRemote) {
        const p2Action = actionForCode(PLAYER_TWO_CONTROLS, event.code);
        if (p2Action === 'left' || p2Action === 'right') this.queueMobilityTap(this.enemy, p2Action);
        if (p2Action === 'attack') this.queuedAttack2 = true;
        if (p2Action === 'kick') this.queuedKick2 = true;
        if (p2Action === 'heavyAttack') this.queuedHeavyAttack2 = true;
        if (p2Action === 'heavyKick') this.queuedHeavyKick2 = true;
        if (p2Action === 'special') this.queuedSpecial2 = true;
        if (p2Action === 'super') this.queuedSuper2 = true;
        if (p2Action === 'jump') this.queuedJump2 = true;
      }
      if (p1Action && this.mode === 'training') {
        this.inputLog = [...this.inputLog, labelFor(PLAYER_ONE_CONTROLS, p1Action)].slice(-6);
        if (this.trainingStep === 'move' && (p1Action === 'left' || p1Action === 'right')) this.callbacks?.training('move');
        if (this.trainingStep === 'crouch' && p1Action === 'down') this.callbacks?.training('crouch');
      }
    });
    window.dispatchEvent(new Event('ctrl-alt-fighter-ready'));
  }

  private createFighterAnimations(): void {
    for (const id of Object.keys(fighters) as FighterId[]) {
      if (!fighters[id].poses) continue;
      if (id === 'yafa' || id === 'rui' || id === 'caio' || id === 'kalliane' || id === 'laura' || id === 'vinicius') {
        const groups = id === 'rui' ? ruiAnimationGroups : id === 'caio' ? caioAnimationGroups : id === 'kalliane' ? kallianeAnimationGroups : yafaAnimationGroups;
        for (const pose of Object.values(groups).flat()) {
          const animation = advancedAnimation(id, pose);
          this.anims.create({ key: `${id}-${pose}`, frames: this.anims.generateFrameNumbers(animation.texture, { frames: [...animation.frames] }), frameRate: animation.frameRate, repeat: animation.repeat });
        }
        continue;
      }
      if (fighters[id].animationSet === 'monteiro-v5') {
        const poses = new Set<FighterPose>([...Object.values(monteiroAnimationGroups).flat(), ...Object.values(monteiroV6Groups)]);
        for (const pose of poses) {
            const animation = monteiroAnimation(pose);
            this.anims.create({ key: `${id}-${pose}`,
              frames: this.anims.generateFrameNumbers(`monteiro-${animation.sheet}-${animation.group}`, { frames: [...animation.frames] }),
              frameRate: animation.frameRate, repeat: animation.repeat });
        }
        for (const opponent of Object.keys(fighters)) {
          const key = `monteiro-victory-${opponent}`;
          this.anims.create({ key, frames: this.anims.generateFrameNumbers(key, { start: 0, end: 5 }), frameRate: 4, repeat: 0 });
        }
        continue;
      }
      const grid = sheetGrid(fighters[id].spriteSheetVersion ?? 'v3');
      for (const pose of fighterPoses) {
        const animation = fighterAnimation(pose, grid);
        const key = `${id}-${pose}`;
        if (this.anims.exists(key)) continue;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(`${id}-spritesheet`, {
            frames: [...animation.frames],
          }),
          frameRate: animation.frameRate,
          repeat: animation.repeat,
        });
      }
    }
  }

  setDifficulty(level: number): void { this.difficulty = Phaser.Math.Clamp(level, 0, 2); }
  setStage(stage: StageId): void { this.selectedStage = stage; }

  setVirtualControl(control: ArenaControl, pressed: boolean): void {
    if (pressed && this.mode === 'training') this.inputLog = [...this.inputLog, ACTION_LABELS[control].toUpperCase()].slice(-6);
    if (pressed && (control === 'left' || control === 'right') && !this.virtual[control]) this.queueMobilityTap(this.player, control);
    if (control === 'jump' && pressed) this.queuedJump = true;
    else if (control === 'attack' && pressed) this.queuedAttack = true;
    else if (control === 'kick' && pressed) this.queuedKick = true;
    else if (control === 'heavyAttack' && pressed) this.queuedHeavyAttack = true;
    else if (control === 'heavyKick' && pressed) this.queuedHeavyKick = true;
    else if (control === 'special' && pressed) this.queuedSpecial = true;
    else if (control === 'super' && pressed) this.queuedSuper = true;
    else if (control in this.virtual) this.virtual[control as keyof typeof this.virtual] = pressed;
    if (pressed && (control === 'left' || control === 'right')) this.callbacks?.training('move');
    if (pressed && control === 'down' && this.mode === 'training' && this.trainingStep === 'crouch') this.callbacks?.training('crouch');
  }

  setOnlineRemote(enabled: boolean): void {
    this.onlineRemote = enabled;
    this.remoteVirtual = { left: false, right: false, down: false, block: false };
    this.queuedAttack2 = this.queuedKick2 = this.queuedSpecial2 = this.queuedSuper2 = this.queuedJump2 = false;
    this.queuedHeavyAttack2 = this.queuedHeavyKick2 = false;
  }

  setRemoteControl(control: ArenaControl, pressed: boolean): void {
    if (!this.onlineRemote || this.mode !== 'versus') return;
    if (pressed && (control === 'left' || control === 'right') && !this.remoteVirtual[control]) this.queueMobilityTap(this.enemy, control);
    if (control === 'jump' && pressed) this.queuedJump2 = true;
    else if (control === 'attack' && pressed) this.queuedAttack2 = true;
    else if (control === 'kick' && pressed) this.queuedKick2 = true;
    else if (control === 'heavyAttack' && pressed) this.queuedHeavyAttack2 = true;
    else if (control === 'heavyKick' && pressed) this.queuedHeavyKick2 = true;
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
    const sprite = this.add.sprite(x, GROUND, fighters[id].animationSet ? `${id}-${id === 'rui' ? 'v5' : 'v1'}-locomotion` : `${id}-spritesheet`, 0).setOrigin(0.5, 1).setDepth(2);
    sprite.setScale((fighters[id].animationSet ? 312 : 282) / sprite.height);
    sprite.setFlipX(facing === -1);
    sprite.play(`${id}-idle`);
    return {
      id, sprite, shadow, guardAura, x, elevation: 0, velocityY: 0, facing, health: 100, meter: 0,
      state: 'idle', stateUntil: 0, currentVisual: 'idle', lastAnimState: 'idle', flashUntil: 0,
      cooldown: 0, specialCooldown: 0, shieldUntil: 0, aiAt: 0, aiSpecialAt: 3.5, visualLunge: 0,
      attack: null, comboCount: 0, comboAttacker: null, gaunchoVisualUntil: 0,
      mobility: createMobility(), hurtPose: 'hurt', hurtStarted: 0, knockedDown: false,
    };
  }

  startRound(playerId: FighterId, enemyId: FighterId, round: number, tutorial: boolean, versus = false): void {
    this.clearCombat();
    this.mode = tutorial ? 'training' : versus ? 'versus' : 'fight';
    this.round = round;
    this.bossPhase = enemyId === 'yafa' && !tutorial && !versus ? 1 : 0;
    this.elapsed = 0;
    this.timeLimit = 60;
    this.nextToast = 0;
    this.stopped = false;
    this.pausedByUi = false;
    this.trainingStep = tutorial ? 'move' : null;
    this.dummyMode = 'idle';
    this.inputLog = [];
    this.queuedAttack = false;
    this.queuedKick = false;
    this.queuedHeavyAttack = this.queuedHeavyKick = false;
    this.queuedSpecial = false;
    this.queuedSuper = false;
    this.queuedJump = false;
    this.queuedAttack2 = false;
    this.queuedKick2 = false;
    this.queuedHeavyAttack2 = this.queuedHeavyKick2 = false;
    this.queuedSpecial2 = false;
    this.queuedSuper2 = false;
    this.queuedJump2 = false;
    this.motionLog = [];
    this.motionHeld = { down: false, left: false, right: false };
    this.virtual = { left: false, right: false, down: false, block: false };
    this.remoteVirtual = { left: false, right: false, down: false, block: false };
    this.background.setTexture(this.bossPhase ? 'datacenter' : this.selectedStage);
    this.background.setDisplaySize(W, H);
    this.player = this.makeUnit(playerId, 235, 1);
    this.enemy = this.makeUnit(enemyId, 725, -1);
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
    if (step !== null && ['weakAttack', 'strongAttack', 'kick', 'sweep', 'combo'].includes(step)) this.enemy.x = Phaser.Math.Clamp(this.player.x + (this.player.x < W / 2 ? 120 : -120), 100, W - 100);
    if (step === 'block') {
      this.enemy.x = Math.min(W - 160, this.player.x + (this.player.x < 500 ? 140 : -140));
      this.enemy.aiAt = this.elapsed + 1.2;
    }
    if (step === 'super') this.player.meter = 100;
    if (step === 'free') {
      this.enemy.x = Phaser.Math.Clamp(this.player.x + (this.player.x < W / 2 ? 170 : -170), 110, W - 110);
      this.player.meter = 0;
      this.enemy.meter = 0;
    }
    this.updateHud(true);
  }

  setDummyMode(mode: TrainingDummyMode): void {
    if (this.mode !== 'training' || this.trainingStep !== 'free' || !this.enemy) return;
    this.dummyMode = mode;
    this.enemy.aiAt = this.elapsed + 1.1;
    if (this.enemy.state === 'guard') this.enemy.state = 'idle';
    this.updateHud(true);
  }

  resetTraining(): void {
    if (this.mode !== 'training' || this.trainingStep !== 'free' || !this.player || !this.enemy) return;
    this.hitstop.reset();
    this.player.sprite.anims.resume();
    this.enemy.sprite.anims.resume();
    for (const shot of [...this.shots]) this.removeShot(shot);
    for (const [unit, x, facing] of [[this.player, 235, 1], [this.enemy, 725, -1]] as const) {
      unit.x = x;
      unit.facing = facing;
      unit.health = 100;
      unit.meter = 0;
      unit.elevation = 0;
      unit.velocityY = 0;
      unit.state = 'idle';
      unit.stateUntil = 0;
      unit.attack = null;
      unit.cooldown = 0;
      unit.specialCooldown = 0;
      unit.shieldUntil = 0;
      unit.comboCount = 0;
      unit.comboAttacker = null;
      unit.mobility = createMobility();
      unit.aiAt = this.elapsed + 1.1;
    }
    this.inputLog = [];
    this.motionLog = [];
    this.queuedAttack = this.queuedKick = this.queuedHeavyAttack = this.queuedHeavyKick = false;
    this.queuedSpecial = this.queuedSuper = this.queuedJump = false;
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
    this.victoryTimer?.remove(false);
    this.victoryTimer = null;
    this.victorySprite?.destroy();
    this.victorySprite = null;
    this.hitstop.reset();
    this.accumulator = 0;
    this.debugGraphics?.clear();
    this.debugBoxesVisible = false;
    this.lastHudState = null;
    for (const particle of this.particles) {
      particle.age = particle.duration;
      particle.node.setVisible(false);
    }
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
    if (!this.pausedByUi) this.updateParticles(Math.min(delta / 1000, 0.05));
    if (!this.player || !this.enemy || this.mode === 'idle' || this.stopped || this.pausedByUi) return;
    this.accumulator += Math.min(delta / 1000, 0.05);
    while (this.accumulator + 1e-9 >= COMBAT_STEP) {
      this.accumulator = Math.max(0, this.accumulator - COMBAT_STEP);
      if (this.hitstop.step()) {
        if (this.stopped) break;
        continue;
      }
      this.stepCombat(COMBAT_STEP);
      if (this.stopped) break;
    }
    if (!this.stopped) {
      this.renderUnit(this.player, 0);
      this.renderUnit(this.enemy, 2);
    }
    this.drawDebugBoxes();
    this.updateHud();
  }

  private stepCombat(dt: number): void {
    this.elapsed += dt;
    if ((this.mode === 'fight' || this.mode === 'versus') && this.elapsed >= this.timeLimit) { this.finish(roundWinner(this.player!.health, this.enemy!.health)); return; }
    this.tickUnit(this.player!, dt);
    this.tickUnit(this.enemy!, dt);
    this.handlePlayer(dt);
    if (this.mode === 'versus') this.handleSecondPlayer(dt);
    else this.handleEnemy(dt);
    this.tickAttacks();
    if (!this.hitstop.active) this.tickShots(dt);
    if (this.mode === 'training' && this.trainingStep === 'free') {
      this.player!.health = Math.min(100, this.player!.health + 8 * dt);
      this.enemy!.health = Math.min(100, this.enemy!.health + 14 * dt);
    }
  }

  private beginAttack(unit: Unit, move: MoveId, damage = MOVES[move].damage, boomerang = false): void {
    const state = ['punch', 'hook', 'weakPunch', 'strongPunch'].includes(move) ? 'attack' : ['kick', 'sweep', 'weakKick', 'strongKick'].includes(move) ? 'kick' : move === 'super' ? 'super' : 'special';
    if (unit.mobility) {
      unit.mobility.evading = false;
      unit.mobility.hopsLeft = 0;
      unit.mobility.runDirection = 0;
    }
    this.enterState(unit, state, moveDuration(move));
    unit.attack = createAttack(move, this.elapsed, damage, boomerang);
    // So o Rui tem arte propria de gancho (ver aliases em animation.ts); nos
    // demais personagens a pose 'gauncho' ja cai no soco comum, que roda na
    // cadencia normal e nao precisa de sustentacao. Ver GAUNCHO_VISUAL_HOLD.
    if (move === 'hook' && unit.id === 'rui' && !hasAdvancedCombat(unit.id)) unit.gaunchoVisualUntil = this.elapsed + GAUNCHO_VISUAL_HOLD;
  }

  private tickAttacks(): void {
    const contacts: { attacker: Unit; target: Unit; attack: Attack }[] = [];
    for (const attacker of [this.player!, this.enemy!]) {
      const attack = attacker.attack;
      if (!attack || attackPhase(attack, this.elapsed) !== 'active') continue;
      if (!attack.emitted) {
        attack.emitted = true;
        if (attack.move === 'projectile') {
          const node = this.makeProjectile(attacker);
          this.shots.push({ node, x: node.x, y: node.y, velocity: attacker.facing * 565, owner: attacker, damage: attack.damage, born: this.elapsed, boomerang: attack.boomerang, returning: false });
        } else if (attack.move === 'cable') this.cable(attacker);
        else if (attack.move === 'firewall') this.firewallPunch(attacker);
        else if (attack.move === 'shield') {
          attacker.shieldUntil = this.elapsed + MOVES.shield.active * COMBAT_STEP;
          this.spark(attacker.x + attacker.facing * 140, GROUND - attacker.elevation - 155, '#4ecbff', 62);
        } else if (attack.move === 'barrier') {
          attacker.shieldUntil = this.elapsed + (attacker.id === 'yafa' ? 0.85 : 1.55);
          this.firewall(attacker);
        }
      }
      const target = attacker === this.player ? this.enemy! : this.player!;
      if (consumeHit(attacker, attack, target, this.elapsed)) contacts.push({ attacker, target, attack });
    }
    // Collect first so two attacks active on the same frame can trade.
    for (const { attacker, target, attack } of contacts) this.hit(target, attacker, attack.damage, MOVES[attack.move].style);
  }

  private drawDebugBoxes(): void {
    const graphics = this.debugGraphics;
    if (!this.debugHitboxes || this.mode !== 'training' || !this.player || !this.enemy) {
      if (this.debugBoxesVisible) graphics.clear();
      this.debugBoxesVisible = false;
      return;
    }
    graphics.clear();
    this.debugBoxesVisible = true;
    const draw = (box: Rect, color: number): void => {
      graphics.fillStyle(color, 0.14).fillRect(box.x, box.y, box.width, box.height);
      graphics.lineStyle(2, color, 1).strokeRect(box.x, box.y, box.width, box.height);
    };
    for (const unit of [this.player, this.enemy]) {
      draw(hurtbox(unit), unit === this.player ? 0x32ff79 : 0x42baff);
      const box = attackBox(unit, unit.attack, this.elapsed);
      if (box) draw(box, 0xff3344);
    }
    for (const shot of this.shots) draw(projectileBox(shot.x, shot.y), 0xff3344);
  }

  // Libera um estado travado (attack/kick/special/super/hurt/blockstun) quando
  // seu tempo expira, e reconcilia o estado ao aterrissar. É o único lugar que
  // decide "a ação terminou" — daqui em diante o handler do frame pode voltar
  // a mover/virar o personagem.
  private tickUnit(unit: Unit, dt: number): void {
    if (isLocked(unit.state) && this.elapsed + 1e-9 >= unit.stateUntil) {
      unit.state = unit.elevation > 0 ? 'jump' : 'idle';
      unit.attack = null;
    }
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    unit.specialCooldown = Math.max(0, unit.specialCooldown - dt);
    unit.visualLunge *= Math.max(0, 1 - dt * 17);
    if (unit.elevation > 0 || unit.velocityY > 0) {
      unit.elevation += unit.velocityY * dt;
      unit.velocityY -= 1450 * dt;
      if (hasAdvancedCombat(unit.id) && unit.elevation > DOUBLE_JUMP_CEILING) {
        unit.elevation = DOUBLE_JUMP_CEILING;
        unit.velocityY = Math.min(0, unit.velocityY);
      }
      if (unit.elevation <= 0) {
        unit.elevation = 0;
        unit.velocityY = 0;
        const opponent = unit === this.player ? this.enemy : this.player;
        if (opponent && opponent.elevation === 0) unit.x = separateOnLanding(unit.x, opponent.x);
        this.dust(unit.x, GROUND - 9, unit.id);
        if (unit === this.player) this.audio?.sound('land');
        if (unit.mobility) {
          unit.mobility.jumps = 0;
          unit.mobility.landUntil = this.elapsed + 0.16;
          if (unit.mobility.evading && unit.mobility.hopsLeft > 0 && !isLocked(unit.state)) {
            unit.mobility.hopsLeft--;
            unit.mobility.hopStarted = this.elapsed;
            unit.mobility.jumpStarted = this.elapsed;
            unit.mobility.jumps = 1;
            unit.velocityY = BACKHOP_LIFT;
            unit.state = 'jump';
          } else {
            unit.mobility.evading = false;
            if (!isLocked(unit.state)) unit.state = 'idle';
          }
        } else if (!isLocked(unit.state)) unit.state = 'idle';
      }
    }
  }

  private enterState(unit: Unit, state: FighterState, duration: number): void {
    unit.attack = null;
    unit.state = state;
    unit.stateUntil = this.elapsed + duration;
  }

  private queueMobilityTap(unit: Unit | null, control: 'left' | 'right'): void {
    if (!unit || !hasAdvancedCombat(unit.id) || this.pausedByUi || this.stopped || this.mode === 'idle' || unit.elevation > 0 || !canMove(unit.state)) return;
    tapDirection(unit.mobility, control === 'left' ? -1 : 1, unit.facing, this.elapsed);
  }

  private advancedMovement(unit: Unit, opponent: Unit, direction: number, down: boolean, block: boolean, jump: boolean, dt: number): boolean {
    if (!hasAdvancedCombat(unit.id) || !unit.mobility) return false;
    const mobility = unit.mobility;
    mobility.walkDirection = direction;
    const grounded = unit.elevation === 0 && unit.velocityY <= 0;
    if (isLocked(unit.state)) {
      mobility.pending = null;
      mobility.runDirection = 0;
      return true;
    }
    if (grounded && mobility.pending && !down && !block && canMove(unit.state)) {
      if (mobility.pending === 'run') mobility.runDirection = unit.facing;
      else {
        mobility.evading = true;
        mobility.hopDirection = -unit.facing;
        mobility.hopsLeft = 1; // Dois saltos curtos por um comando de dois toques.
        mobility.hopStarted = mobility.jumpStarted = this.elapsed;
        mobility.jumps = 1;
        unit.velocityY = BACKHOP_LIFT;
        unit.state = 'jump';
      }
    }
    mobility.pending = null;
    if (jump && ((grounded && fsmCanJump(unit.state, true)) || canDoubleJump(mobility.jumps, !grounded, unit.state === 'jump'))) {
      mobility.jumps = grounded ? 1 : 2;
      mobility.jumpStarted = this.elapsed;
      mobility.evading = false;
      mobility.hopsLeft = 0;
      mobility.runDirection = 0;
      unit.state = 'jump';
      // Limita o impulso pela altura disponível para manter o corpo na arena.
      unit.velocityY = grounded ? 690 : Math.min(620, Math.sqrt(2 * 1450 * Math.max(0, DOUBLE_JUMP_CEILING - unit.elevation)));
      this.audio?.sound('jump');
      if (unit === this.player && this.mode === 'training' && this.trainingStep === 'jump') this.callbacks?.training('jump');
    }
    if (mobility.evading) {
      unit.x = moveHorizontal(unit.x, mobility.hopDirection * BACKHOP_SPEED * dt, opponent.x, true, opponent.elevation > 0, 68, W - 68);
      unit.state = 'jump';
    } else if (unit.elevation > 0 || unit.velocityY > 0) {
      unit.state = 'jump';
      if (direction) unit.x = moveHorizontal(unit.x, direction * 390 * dt, opponent.x, true, opponent.elevation > 0, 68, W - 68);
    } else {
      if (block && canGuard(unit.state, true)) unit.state = 'guard';
      else {
        unit.state = resolveGroundIdleState(down, direction !== 0);
        if (canMove(unit.state) && direction) {
          const running = mobility.runDirection === direction && direction === unit.facing;
          unit.x = moveHorizontal(unit.x, direction * (running ? RUN_SPEED : 285) * dt, opponent.x, false, opponent.elevation > 0, 68, W - 68);
        }
      }
      if (canTurn(unit.state, true)) unit.facing = facingOpponent(unit.x, opponent.x);
      if (direction !== mobility.runDirection || down || block) mobility.runDirection = 0;
    }
    return true;
  }

  // Regras 1-3 para o Jogador 1 (setas). Só mexe em movimento/estado/direção
  // quando o estado atual não está travado (isLocked) — se estiver em ATTACK,
  // KICK, SPECIAL, SUPER, HURT ou BLOCKSTUN, este bloco inteiro é ignorado.
  private handlePlayer(dt: number): void {
    const p = this.player!;
    const e = this.enemy!;
    const grounded = p.elevation === 0;
    const down = this.keys.down.isDown || this.virtual.down;
    const block = this.keys.block.isDown || this.virtual.block;
    this.trackMotion(p, down);
    const advanced = this.advancedMovement(p, e, Number(this.keys.right.isDown || this.virtual.right) - Number(this.keys.left.isDown || this.virtual.left), down, block, this.queuedJump, dt);
    if (!advanced && !isLocked(p.state)) {
      if (grounded) {
        if (block && canGuard(p.state, true)) {
          p.state = 'guard';
        } else {
          let direction = 0;
          if (this.keys.left.isDown || this.virtual.left) direction -= 1;
          if (this.keys.right.isDown || this.virtual.right) direction += 1;
          p.state = resolveGroundIdleState(down, direction !== 0);
          if (canMove(p.state) && direction) {
            p.x = moveHorizontal(p.x, direction * 285 * dt, e.x, false, e.elevation > 0, 68, W - 68);
          }
        }
      } else {
        p.state = 'jump';
        let direction = 0;
        if (this.keys.left.isDown || this.virtual.left) direction -= 1;
        if (this.keys.right.isDown || this.virtual.right) direction += 1;
        if (direction) p.x = moveHorizontal(p.x, direction * 390 * dt, e.x, true, e.elevation > 0, 68, W - 68);
      }
    }
    if (!advanced && canTurn(p.state, grounded)) p.facing = facingOpponent(p.x, e.x);
    if (!advanced && this.queuedJump && fsmCanJump(p.state, grounded)) {
      p.state = 'jump';
      p.velocityY = 690;
      this.dust(p.x, GROUND - 9, p.id);
      this.audio?.sound('jump');
      if (this.mode === 'training' && this.trainingStep === 'jump') this.callbacks?.training('jump');
    }
    this.queuedJump = false;
    if (this.queuedHeavyAttack) this.strongAttack(p, 'strongPunch');
    if (this.queuedHeavyKick) this.strongAttack(p, 'strongKick');
    const strongQueued = hasAdvancedCombat(p.id) && (this.queuedHeavyAttack || this.queuedHeavyKick);
    this.queuedHeavyAttack = this.queuedHeavyKick = false;
    if (this.queuedAttack && !strongQueued) {
      // O comando ↓→ tem precedencia sobre o soco normal E sobre o gancho
      // (↓ + soco): quem executou o movimento inteiro claramente queria o
      // especial. Sem esta ordem o ↓ do proprio comando faria sair um
      // gancho, e o golpe de comando seria impossivel de acertar.
      if (this.firewallReady(p) && fighters[p.id].specialKind === 'firewall') {
        this.special(p, e, false);
        this.motionLog = [];
      } else this.punch(p, e, down);
    }
    this.queuedAttack = false;
    if (this.queuedKick && !strongQueued) {
      if (hasAdvancedCombat(p.id) && down && p.elevation === 0 && p.velocityY <= 0) this.sweep(p);
      else this.kick(p, e);
    }
    this.queuedKick = false;
    if (this.queuedSpecial) {
      const forward = p.facing === 1 ? this.keys.right.isDown || this.virtual.right : this.keys.left.isDown || this.virtual.left;
      this.special(p, e, forward);
    }
    this.queuedSpecial = false;
    if (this.queuedSuper) {
      if (p.meter >= 100) this.superAttack(p, e);
      else this.special(p, e, false);
    }
    this.queuedSuper = false;
  }

  // Idêntico em espírito ao handlePlayer, para o Jogador 2 local/online (WASD).
  private handleSecondPlayer(dt: number): void {
    const p = this.enemy!;
    const o = this.player!;
    const left = this.onlineRemote ? this.remoteVirtual.left : this.keys2.left.isDown;
    const right = this.onlineRemote ? this.remoteVirtual.right : this.keys2.right.isDown;
    const down = this.onlineRemote ? this.remoteVirtual.down : this.keys2.down.isDown;
    const block = this.onlineRemote ? this.remoteVirtual.block : this.keys2.block.isDown;
    const grounded = p.elevation === 0;
    const advanced = this.advancedMovement(p, o, Number(right) - Number(left), down, block, this.queuedJump2, dt);
    if (!advanced && !isLocked(p.state)) {
      if (grounded) {
        if (block && canGuard(p.state, true)) {
          p.state = 'guard';
        } else {
          const direction = Number(right) - Number(left);
          p.state = resolveGroundIdleState(down, direction !== 0);
          if (canMove(p.state) && direction) {
            p.x = moveHorizontal(p.x, direction * 285 * dt, o.x, false, o.elevation > 0, 68, W - 68);
          }
        }
      } else {
        p.state = 'jump';
        const direction = Number(right) - Number(left);
        if (direction) p.x = moveHorizontal(p.x, direction * 390 * dt, o.x, true, o.elevation > 0, 68, W - 68);
      }
    }
    if (!advanced && canTurn(p.state, grounded)) p.facing = facingOpponent(p.x, o.x);
    if (!advanced && this.queuedJump2 && fsmCanJump(p.state, grounded)) {
      p.state = 'jump';
      p.velocityY = 690;
      this.dust(p.x, GROUND - 9, p.id);
      this.audio?.sound('jump');
    }
    this.queuedJump2 = false;
    if (this.queuedHeavyAttack2) this.strongAttack(p, 'strongPunch');
    if (this.queuedHeavyKick2) this.strongAttack(p, 'strongKick');
    const strongQueued = hasAdvancedCombat(p.id) && (this.queuedHeavyAttack2 || this.queuedHeavyKick2);
    this.queuedHeavyAttack2 = this.queuedHeavyKick2 = false;
    if (this.queuedAttack2 && !strongQueued) this.punch(p, o, down);
    this.queuedAttack2 = false;
    if (this.queuedKick2 && !strongQueued) {
      if (hasAdvancedCombat(p.id) && down && p.elevation === 0 && p.velocityY <= 0) this.sweep(p);
      else this.kick(p, o);
    }
    this.queuedKick2 = false;
    if (this.queuedSpecial2) {
      const forward = p.facing === 1 ? right : left;
      this.special(p, o, forward);
    }
    this.queuedSpecial2 = false;
    if (this.queuedSuper2) {
      if (p.meter >= 100) this.superAttack(p, o);
      else this.special(p, o, false);
    }
    this.queuedSuper2 = false;
  }

  // IA do oponente — mesma FSM, sem pulo (a IA nunca pulou neste jogo).
  private handleEnemy(dt: number): void {
    const e = this.enemy!;
    const p = this.player!;
    if (this.mode === 'training') {
      if (this.trainingStep === 'block' && this.elapsed >= e.aiAt) { e.aiAt = this.elapsed + 1.8; this.punch(e, p, false, true); }
      if (this.trainingStep === 'free') {
        if (canTurn(e.state, e.elevation === 0)) e.facing = facingOpponent(e.x, p.x);
        if (this.dummyMode === 'guard' && e.elevation === 0 && canGuard(e.state, true)) e.state = 'guard';
        else if (this.dummyMode === 'attack' && Math.abs(p.x - e.x) < 180 && this.elapsed >= e.aiAt) {
          e.aiAt = this.elapsed + 1.8;
          this.punch(e, p, false, true);
        }
      }
      return;
    }
    const distance = Math.abs(p.x - e.x);
    const level = this.round + this.difficulty - 1;
    const grounded = e.elevation === 0;
    if (!isLocked(e.state)) {
      const wantsGuard = grounded && distance < 175 && Math.sin(this.elapsed * 2.3 + level) > 0.78;
      if (wantsGuard && canGuard(e.state, grounded)) {
        e.state = 'guard';
      } else if (grounded) {
        const moving = distance > 140;
        e.mobility.walkDirection = moving ? Math.sign(p.x - e.x) : 0;
        e.state = resolveGroundIdleState(false, moving);
        if (canMove(e.state) && moving) {
          e.x = Phaser.Math.Clamp(e.x + Math.sign(p.x - e.x) * (95 + level * 18) * dt, 70, W - 70);
        }
      } else {
        e.state = 'jump';
      }
    }
    if (canTurn(e.state, grounded)) e.facing = p.x >= e.x ? 1 : -1;
    if (distance < 175 && this.elapsed >= e.aiAt) {
      e.aiAt = this.elapsed + (1.55 - level * 0.16) + Math.random() * 0.5;
      if (hasAdvancedCombat(e.id) && Math.random() < 0.35) this.strongAttack(e, Math.random() < 0.5 ? 'strongPunch' : 'strongKick');
      else this.punch(e, p, this.bossPhase === 2 && Math.random() < 0.22);
    }
    if (this.elapsed >= e.aiSpecialAt && distance < 370) {
      e.aiSpecialAt = this.elapsed + 4.5 + Math.random() * 2;
      this.special(e, p, e.id === 'yafa' ? this.bossPhase === 2 && Math.random() < 0.22 : Math.random() < 0.3);
    }
  }

  private renderUnit(unit: Unit, bobOffset: number): void {
    // O gancho do Rui libera o controle do jogador em 0,25s (MOVES.hook,
    // igual a todo mundo), mas a animacao nova leva 0,6s para terminar (ver
    // GAUNCHO_VISUAL_HOLD). Sustenta a pose 'gauncho' enquanto isso, mas so
    // enquanto o personagem ficar parado em 'idle' -- qualquer acao nova
    // muda `unit.state` e a sustentacao para na hora, entao isto nunca
    // atrasa uma resposta ao jogador, so estica o que aparece na tela
    // enquanto ele nao faz nada.
    const sustainingGauncho = unit.state === 'idle' && this.elapsed < unit.gaunchoVisualUntil;
    let pose = sustainingGauncho ? 'gauncho' : visualPose(unit.state, unit.attack?.move);
    let manualFrame: number | null = null;
    const advanced = hasAdvancedCombat(unit.id);
    if (advanced) {
      const mobility = unit.mobility;
      if (unit.state === 'hurt') {
        pose = unit.hurtPose;
        let start = unit.hurtStarted;
        let end = unit.stateUntil;
        if (unit.knockedDown) {
          const duration = end - start;
          const fallAt = start + duration * 0.3;
          const riseAt = start + duration * 0.7;
          if (this.elapsed >= riseAt) { pose = 'getup'; start = riseAt; }
          else if (this.elapsed >= fallAt) { pose = 'knockdown'; start = fallAt; end = riseAt; }
          else end = fallAt;
        }
        manualFrame = Math.min(5, Math.max(0, Math.floor((this.elapsed - start) / Math.max(COMBAT_STEP, end - start) * 6)));
      } else if (unit.attack) {
        pose = unit.attack.move === 'sweep' ? 'sweep' : unit.attack.move === 'super' ? 'super'
          : unit.attack.move === 'strongPunch' ? 'punchStrong' : unit.attack.move === 'strongKick' ? 'kickStrong'
          : (unit.attack.move === 'kick' || unit.attack.move === 'weakKick') && unit.elevation > 0 ? 'airkick' : pose;
        manualFrame = attackVisualFrame(unit.attack, this.elapsed, advancedAnimation(unit.id, pose).frames.length);
      } else if (unit.state === 'blockstun') {
        pose = 'blockHit';
      } else if (unit.state === 'jump') {
        pose = mobility.evading ? 'backhop' : mobility.jumps === 2 ? 'doublejump' : 'jump';
        manualFrame = mobility.evading
          ? Math.min(5, Math.floor((this.elapsed - mobility.hopStarted) / (2 * BACKHOP_LIFT / 1450) * 6))
          : this.elapsed - mobility.jumpStarted < 0.035 ? 0 : unit.velocityY > 400 ? 1 : unit.velocityY > 100 ? 2 : unit.velocityY > -160 ? 3 : unit.elevation > 45 ? 4 : 5;
      } else if (unit.state === 'walk' && mobility.runDirection) {
        pose = 'run';
      } else if ((unit.id === 'rui' || unit.id === 'caio' || unit.id === 'kalliane') && unit.state === 'walk' && mobility.walkDirection === -unit.facing) {
        pose = 'walkBack';
      } else if (unit.state === 'idle' && this.elapsed < mobility.landUntil) {
        pose = 'land';
        manualFrame = Math.min(5, Math.floor((1 - (mobility.landUntil - this.elapsed) / 0.16) * 6));
      }
    }
    // Reinicia a animacao quando a pose muda E tambem quando o mesmo golpe e
    // repetido. Sem o segundo caso, dois socos seguidos mantinham `pose`
    // igual a `currentVisual` e o segundo soco nunca reanimava: o sprite
    // ficava parado no ultimo quadro enquanto o golpe acontecia.
    // `!sustainingGauncho` exclui a transicao 'attack' -> 'idle' que a
    // sustentacao do Gauncho provoca em 0,25s: sem isso, `unit.state` muda
    // (attack -> idle) enquanto a pose continua 'gauncho', e a condicao
    // abaixo interpretaria isso como "golpe repetido" e reiniciaria a
    // animacao do quadro zero no meio da propria sustentacao.
    const restarted = !sustainingGauncho && unit.state !== unit.lastAnimState;
    if (advanced && manualFrame !== null) {
      const animation = advancedAnimation(unit.id, pose);
      const texture = animation.texture;
      const frame = animation.frames[Math.max(0, manualFrame)];
      unit.sprite.stop();
      if (unit.sprite.texture.key !== texture || String(unit.sprite.frame.name) !== String(frame)) unit.sprite.setTexture(texture, frame);
      unit.currentVisual = pose;
    } else if (pose !== unit.currentVisual || (restarted && poseHoldsLastFrame(pose))) {
      if (fighters[unit.id].poses) unit.sprite.play(`${unit.id}-${pose}`, true);
      unit.currentVisual = pose;
    }
    unit.lastAnimState = unit.state;
    // As folhas v6 usam células maiores, mas o corpo e a escala são os mesmos.
    const v6 = advanced && unit.sprite.texture.key.startsWith('monteiro-v6-');
    const baseScale = advanced ? 312 / 256 : 282 / unit.sprite.height;
    unit.sprite.setOrigin(v6 ? (unit.facing === 1 ? 190 / 512 : 1 - 190 / 512) : 0.5, v6 ? 488 / 512 : 1);
    // Achatar o sprite verticalmente era uma compensacao para folhas sem arte
    // de agachamento: sem ela, o personagem "agachado" aparecia em pe. Quem
    // tem a pose desenhada ja agacha de verdade, e manter o squash por cima
    // esmagaria a arte nova.
    // DIVIDA: remover este condicional (e o squash) quando o ultimo
    // personagem migrar para uma folha com linha de agachamento.
    const drawsOwnCrouch = advanced || (fighters[unit.id].spriteSheetVersion ?? 'v3') !== 'v3';
    const squash = unit.state === 'crouch' && !drawsOwnCrouch ? 0.82 : 1;
    unit.sprite.setScale(baseScale, baseScale * squash);
    const visualX = unit.x + unit.facing * unit.visualLunge;
    // O balanco vertical e uma compensacao para folhas cuja caminhada nao tem
    // oscilacao desenhada (as quatro poses da v3 sao quase estaticas). Ele e
    // funcao do tempo real, nao do quadro, entao bate fora de fase com uma
    // caminhada animada de verdade e dobra a sensacao de flutuacao. Por isso
    // so vale para quem ainda esta na v3.
    // DIVIDA: remover este condicional (e o bob) quando o ultimo personagem
    // migrar para uma folha com caminhada animada.
    const drawsOwnWalkCycle = advanced || (fighters[unit.id].spriteSheetVersion ?? 'v3') !== 'v3';
    const walkingBob = unit.state === 'walk' && unit.elevation === 0 && !drawsOwnWalkCycle
      ? Math.sin(this.elapsed * 34 + bobOffset) * 3
      : 0;
    unit.sprite.setPosition(visualX, GROUND - unit.elevation + walkingBob);
    unit.sprite.setFlipX(unit.facing === -1);
    unit.sprite.setAngle(advanced ? 0 : pose === 'hurt' ? -unit.facing * 8 : pose === 'punch' || pose === 'kick' || pose === 'gauncho' ? -unit.facing * 3 : pose === 'special' ? unit.facing * 4 : 0);
    unit.shadow.setPosition(unit.x, GROUND - 5).setScale(Math.max(0.5, 1 - unit.elevation / 390), 1).setAlpha(Math.max(0.12, 0.52 - unit.elevation / 600));
    unit.guardAura.setPosition(unit.x, GROUND - 142 - unit.elevation).setVisible(unit.state === 'guard' || unit.state === 'blockstun' || unit.shieldUntil > this.elapsed);
    unit.sprite.setTint(this.elapsed < unit.flashUntil ? 0xffa4a4 : (unit.state === 'guard' || unit.state === 'blockstun') ? 0x9ddcff : 0xffffff);
    if (!this.hitstop.active && unit.elevation > 25 && Math.random() < 0.19) {
      const color = Phaser.Display.Color.HexStringToColor(fighters[unit.id].accent).color;
      this.emitParticle(unit.x + Phaser.Math.Between(-20, 20), GROUND - unit.elevation - 12, 5, 19, color, 0.6, 1, 0, 200, 0.21);
    }
  }

  private dust(x: number, y: number, id: FighterId): void {
    const color = Phaser.Display.Color.HexStringToColor(fighters[id].accent).color;
    for (let i = 0; i < 6; i++) {
      this.emitParticle(x + Phaser.Math.Between(-27, 27), y, Phaser.Math.Between(4, 9), 4, color, 0.75, 3, Phaser.Math.Between(-40, 40) / 0.27, -Phaser.Math.Between(5, 24) / 0.27, 0.27);
    }
  }

  // Reutiliza até 48 objetos: os rastros não criam objetos e tweens a cada frame.
  private emitParticle(x: number, y: number, width: number, height: number, color: number, alpha: number, depth: number, vx: number, vy: number, duration: number, shrink = false): void {
    let particle = this.particles.find(entry => entry.age >= entry.duration);
    if (!particle && this.particles.length < PARTICLE_LIMIT) {
      particle = { node: this.add.rectangle(0, 0, 1, 1), age: 0, duration: 0, vx: 0, vy: 0, alpha: 0, shrink: false };
      this.particles.push(particle);
    }
    if (!particle) {
      particle = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_LIMIT;
    }
    particle.age = 0;
    particle.duration = duration;
    particle.vx = vx;
    particle.vy = vy;
    particle.alpha = alpha;
    particle.shrink = shrink;
    particle.node.setPosition(x, y).setSize(width, height).setFillStyle(color).setAlpha(alpha).setScale(1).setDepth(depth).setVisible(true);
  }

  private updateParticles(dt: number): void {
    for (const particle of this.particles) {
      if (particle.age >= particle.duration) continue;
      particle.age += dt;
      if (particle.age >= particle.duration) {
        particle.node.setVisible(false);
        continue;
      }
      const progress = particle.age / particle.duration;
      particle.node.x += particle.vx * dt;
      particle.node.y += particle.vy * dt;
      particle.node.setAlpha(particle.alpha * (1 - progress));
      if (particle.shrink) particle.node.setScale(1 - progress * 0.8);
    }
  }

  // Converte as teclas do Jogador 1 em direcoes RELATIVAS ao lado para onde
  // ele olha e registra so as transicoes. Chamado uma vez por quadro, antes
  // de qualquer acao, para que o soco do mesmo quadro ja enxergue o ↓→.
  private trackMotion(p: Unit, down: boolean): void {
    const left = this.keys.left.isDown || this.virtual.left;
    const right = this.keys.right.isDown || this.virtual.right;
    const press = (key: keyof typeof this.motionHeld, held: boolean, direction: MotionDirection): void => {
      if (held && !this.motionHeld[key]) this.motionLog = pushMotion(this.motionLog, direction, this.elapsed);
      this.motionHeld[key] = held;
    };
    press('down', down, 'down');
    // Esquerda e direita viram frente/tras conforme o `facing`, entao o mesmo
    // comando funciona nos dois lados da tela.
    press('right', right, p.facing === 1 ? 'forward' : 'back');
    press('left', left, p.facing === 1 ? 'back' : 'forward');
  }

  // O especial de comando so sai se o movimento foi completo e o golpe esta
  // disponivel. Checar o cooldown AQUI (e nao so dentro de `special`) evita
  // que um comando feito durante a recarga engula o soco normal.
  private firewallReady(p: Unit): boolean {
    return p.specialCooldown <= 0 && quarterCircleForward(this.motionLog, this.elapsed);
  }

  private punch(attacker: Unit, target: Unit, hook = false, trainingDummy = false): void {
    if (attacker.cooldown > 0 || !canStartAction(attacker.state)) return;
    const move = hook ? 'hook' : hasAdvancedCombat(attacker.id) ? 'weakPunch' : 'punch';
    attacker.cooldown = hook ? 0.68 : hasAdvancedCombat(attacker.id) ? 0.30 : 0.44;
    this.beginAttack(attacker, move, trainingDummy ? 6 : MOVES[move].damage);
    attacker.visualLunge = hook ? 37 : 22;
    this.audio?.sound(hook ? 'hook' : 'punch');
    this.spark(attacker.x + attacker.facing * 76, GROUND - (hook ? 190 : 150), fighters[attacker.id].accent, hook ? 78 : 50);
    if (this.mode === 'training' && attacker === this.player && this.trainingStep === 'weakAttack' && !hook) this.callbacks?.training('weakAttack');
  }

  private kick(attacker: Unit, target: Unit): void {
    if (attacker.cooldown > 0 || !canStartAction(attacker.state)) return;
    attacker.cooldown = hasAdvancedCombat(attacker.id) ? 0.44 : 0.58;
    this.beginAttack(attacker, hasAdvancedCombat(attacker.id) ? 'weakKick' : 'kick');
    attacker.visualLunge = 31;
    this.audio?.sound('kick');
    this.spark(attacker.x + attacker.facing * 84, GROUND - 130, fighters[attacker.id].accent, 64);
    if (this.mode === 'training' && attacker === this.player && this.trainingStep === 'kick') this.callbacks?.training('kick');
  }

  private sweep(attacker: Unit): void {
    if (attacker.cooldown > 0 || !canStartAction(attacker.state)) return;
    attacker.cooldown = 0.65;
    this.beginAttack(attacker, 'sweep');
    this.audio?.sound('kick');
    if (this.mode === 'training' && attacker === this.player && this.trainingStep === 'sweep') this.callbacks?.training('sweep');
  }

  private strongAttack(attacker: Unit, move: 'strongPunch' | 'strongKick'): void {
    if (!hasAdvancedCombat(attacker.id) || attacker.cooldown > 0 || !canStartAction(attacker.state)) return;
    attacker.cooldown = moveDuration(move) + 0.12;
    this.beginAttack(attacker, move);
    attacker.visualLunge = move === 'strongPunch' ? 30 : 36;
    this.audio?.sound(move === 'strongPunch' ? 'punch' : 'kick');
    if (this.mode === 'training' && attacker === this.player && this.trainingStep === 'strongAttack') this.callbacks?.training('strongAttack');
  }

  private special(attacker: Unit, target: Unit, alternate = false): void {
    if (attacker.specialCooldown > 0 || !canStartAction(attacker.state)) return;
    attacker.specialCooldown = 2.6;
    attacker.visualLunge = 14;
    const def = fighters[attacker.id];
    const kind = alternate ? def.alternateKind : def.specialKind;
    this.audio?.sound(attacker.id);
    const wasReady = attacker.meter >= 100;
    attacker.meter = Math.min(100, attacker.meter + 8);
    if (attacker === this.player && !wasReady && attacker.meter >= 100) this.audio?.sound('ready');
    const move = kind === 'shield' || kind === 'barrier' || kind === 'cable' || kind === 'firewall' ? kind : 'projectile';
    // O Firewall Punch preserva 20 de dano e os tempos da própria tabela.
    const damage = kind === 'shield' ? MOVES.shield.damage : kind === 'firewall' ? MOVES.firewall.damage : kind === 'barrier' && attacker.id === 'yafa' ? 12 : 16;
    this.beginAttack(attacker, move, damage, kind === 'boomerang');
    if (this.mode === 'training' && attacker === this.player && this.trainingStep === 'special') this.callbacks?.training('special');
    if (this.mode === 'training' && attacker === this.player && this.trainingStep === 'alternate' && alternate) this.callbacks?.training('alternate');
    this.updateHud(true);
  }

  private makeProjectile(attacker: Unit): Phaser.GameObjects.Container {
    const id = attacker.id;
    const color = Phaser.Display.Color.HexStringToColor(fighters[id].accent).color;
    const container = this.add.container(attacker.x + attacker.facing * 84, GROUND - attacker.elevation - 154).setDepth(5).setScale(attacker.facing, 1);
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
    const y = GROUND - attacker.elevation - 149;
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

  // Rastro de fogo do Firewall Punch. A arte ja desenha a chama no sprite,
  // entao este efeito e deliberadamente discreto: so marca a extensao real
  // da hitbox (196px a frente) para o jogador aprender o alcance do golpe
  // olhando para a tela, em vez de decorar. Sem ele, a chama desenhada e
  // maior que o alcance e o golpe pareceria falhar "de perto".
  private firewallPunch(attacker: Unit): void {
    const fromX = attacker.x + attacker.facing * 42;
    const y = GROUND - attacker.elevation - MOVES.firewall.centerY;
    const reach = MOVES.firewall.reach - 42;
    const flame = this.add.graphics().setDepth(5);
    this.tweens.addCounter({ from: 0, to: 1, duration: 220, ease: 'Cubic.Out', onUpdate: tween => {
      const progress = Number(tween.getValue());
      flame.clear();
      for (let i = 0; i < 7; i++) {
        const step = (i / 6) * reach * progress;
        const x = fromX + attacker.facing * step;
        const wobble = Math.sin(progress * Math.PI * 3 + i) * 11;
        const radius = 30 * (1 - i / 9);
        flame.fillStyle(0xff7a1f, 0.18).fillCircle(x, y + wobble, radius * 1.5);
        flame.fillStyle(0xffc53d, 0.3).fillCircle(x, y + wobble, radius);
        flame.fillStyle(0xfff2c2, 0.45).fillCircle(x, y + wobble, radius * 0.42);
      }
    }, onComplete: () => {
      this.tweens.add({ targets: flame, alpha: 0, duration: 160, onComplete: () => flame.destroy() });
    } });
  }

  private cable(attacker: Unit): void {
    const graphics = this.add.graphics().setDepth(5);
    const fromX = attacker.x + attacker.facing * 37;
    const fromY = GROUND - attacker.elevation - 151;
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
    if (!canStartSuper(attacker.state, attacker.meter)) return;
    attacker.meter = 0;
    attacker.specialCooldown = 2.6;
    this.beginAttack(attacker, 'super');
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
    if (this.mode === 'training' && attacker === this.player && this.trainingStep === 'super') this.callbacks?.training('super');
    this.updateHud(true);
  }

  private tickShots(dt: number): void {
    for (let index = 0; index < this.shots.length;) {
      const shot = this.shots[index];
      if (shot.boomerang && !shot.returning && this.elapsed - shot.born > 0.55) { shot.returning = true; shot.velocity *= -1; }
      shot.x += shot.velocity * dt;
      shot.node.setX(shot.x);
      shot.node.angle += dt * (shot.boomerang ? 410 : 160);
      if (Math.random() < 0.65) {
        const color = Phaser.Display.Color.HexStringToColor(fighters[shot.owner.id].accent).color;
        this.emitParticle(shot.x - Math.sign(shot.velocity) * Phaser.Math.Between(25, 45), shot.y + Phaser.Math.Between(-23, 23), Phaser.Math.Between(4, 9), Phaser.Math.Between(4, 9), color, 0.85, 4, -Math.sign(shot.velocity) * 140, 0, 0.25, true);
      }
      const target = shot.owner === this.player ? this.enemy! : this.player!;
      if (overlaps(projectileBox(shot.x, shot.y), hurtbox(target))) {
        this.hit(target, shot.owner, shot.damage, 'special');
        this.removeShot(shot);
        break;
      } else if (shot.x < -100 || shot.x > W + 100 || this.elapsed - shot.born > 1.9) this.removeShot(shot);
      else index++;
    }
  }

  private removeShot(shot: Shot): void {
    shot.node.destroy();
    const index = this.shots.indexOf(shot);
    if (index !== -1) this.shots.splice(index, 1);
  }

  private hit(target: Unit, attacker: Unit, damage: number, style: HitStyle = 'basic'): void {
    if (this.stopped) return;
    const guarded = target.state === 'guard' || target.state === 'blockstun' || target.shieldUntil > this.elapsed;
    const playerMeterBefore = this.player?.meter ?? 0;
    target.health = applyDamage(target.health, damage, guarded);
    attacker.meter = Math.min(100, attacker.meter + (guarded ? 5 : 17));
    target.meter = Math.min(100, target.meter + (guarded ? 5 : 9));
    this.audio?.sound(guarded ? 'block' : 'hit');
    // Hitstun/blockstun calibrado para deixar o alvo em desvantagem por mais
    // tempo do que a própria recuperação do golpe do atacante — essa vantagem
    // de quadros positiva é o que permite um segundo golpe conectar antes que
    // o alvo possa agir de novo, ou seja, um combo de verdade.
    const wasChained = !guarded && target.state === 'hurt' && target.comboAttacker === attacker.id;
    let stun = guarded ? Math.min(0.4, 0.12 + damage * 0.012) : Math.min(0.95, 0.28 + damage * 0.03);
    if (hasAdvancedCombat(target.id)) {
      target.hurtStarted = this.elapsed;
      target.hurtPose = style === 'low' || attacker.attack?.move === 'weakKick' ? 'hurtLow'
        : style === 'high' || style === 'hook' || attacker.attack?.move === 'kick' || target.elevation > 0 ? 'hurtHigh' : damage >= 16 ? 'hurtStrong' : 'hurt';
      target.knockedDown = !guarded && (style === 'low' || damage >= 25);
      if (target.knockedDown) stun = Math.max(stun, 0.95);
      if (target.mobility) {
        target.mobility.evading = false;
        target.mobility.hopsLeft = 0;
        target.mobility.runDirection = 0;
        target.mobility.pending = null;
        target.mobility.jumps = target.elevation > 0 ? 2 : 0;
      }
    }
    this.enterState(target, guarded ? 'blockstun' : 'hurt', stun);
    if (guarded) {
      target.comboCount = 0;
      target.comboAttacker = null;
    } else {
      target.comboCount = wasChained ? target.comboCount + 1 : 1;
      target.comboAttacker = attacker.id;
      if (target.comboCount >= 2) this.comboPopup(target, target.comboCount);
      if (this.mode === 'training' && attacker === this.player && target === this.enemy && this.trainingStep === 'combo' && target.comboCount >= 2) this.callbacks?.training('combo');
    }
    if (!guarded && style !== 'basic' && this.mode !== 'training' && this.elapsed >= this.nextToast) {
      this.nextToast = this.elapsed + 6;
      this.callbacks?.toast();
    }
    this.spark(target.x, GROUND - target.elevation - 155, guarded ? '#7be1ff' : '#ffe166', guarded ? 62 : 95);
    this.cameras.main.shake(guarded ? 80 : 120, guarded ? 0.0015 : 0.003);
    const knockback = guarded ? 0 : attacker.facing * 21;
    if (!guarded) target.flashUntil = this.elapsed + 0.1;
    this.player?.sprite?.anims.pause();
    this.enemy?.sprite?.anims.pause();
    this.hitstop.start(() => {
      this.player?.sprite?.anims.resume();
      this.enemy?.sprite?.anims.resume();
      if (knockback) {
        target.x = Phaser.Math.Clamp(target.x + knockback, 70, W - 70);
        target.visualLunge = -16;
      }
      if (this.player!.health <= 0 || this.enemy!.health <= 0) {
        this.finish(roundWinner(this.player!.health, this.enemy!.health));
      }
    });
    if (this.mode === 'training' && target === this.player && guarded && this.trainingStep === 'block') this.callbacks?.training('block');
    if (this.mode === 'training') target.health = Math.max(30, target.health);
    if (target === this.enemy && target.id === 'yafa' && this.bossPhase === 1 && target.health > 0 && target.health <= 50) {
      this.bossPhase = 2;
      this.cameras.main.flash(400, 255, 107, 46);
      this.callbacks?.phase(2);
      this.audio?.sound('phase');
    }
    if (playerMeterBefore < 100 && (this.player?.meter ?? 0) >= 100) this.audio?.sound('ready');
    this.updateHud(true);
  }

  private comboPopup(target: Unit, count: number): void {
    const label = this.add.text(target.x, GROUND - target.elevation - 220, `COMBO x${count}!`, { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '26px', fontStyle: 'bold', color: '#ffe166', stroke: '#241300', strokeThickness: 6 }).setOrigin(0.5).setDepth(11);
    this.tweens.add({ targets: label, y: label.y - 30, alpha: 0, duration: 650, onComplete: () => label.destroy() });
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
    const hud: Hud = { player: this.player.health, enemy: this.enemy.health, playerMeter: this.player.meter, enemyMeter: this.enemy.meter, seconds: Math.max(0, Math.ceil(this.timeLimit - this.elapsed)), round: this.round, tutorial: this.mode === 'training', bossPhase: this.bossPhase, versus: this.mode === 'versus', playerState: this.player.state, enemyState: this.enemy.state, inputLog: this.inputLog };
    const previous = this.lastHudState;
    if (!force && previous && (Object.keys(hud) as (keyof Hud)[]).every(key => hud[key] === previous[key])) return;
    this.lastHudState = hud;
    this.callbacks?.hud(hud);
  }

  private finish(result: 'player' | 'enemy' | 'draw'): void {
    if (this.stopped) return;
    this.stopped = true;
    this.audio?.sound('ko');
    const winner = result === 'player' ? this.player : result === 'enemy' ? this.enemy : null;
    if (result === 'enemy' && this.player && hasAdvancedCombat(this.player.id)) this.player.sprite.play(`${this.player.id}-knockdown`);
    if (result === 'player' && this.enemy && hasAdvancedCombat(this.enemy.id)) this.enemy.sprite.play(`${this.enemy.id}-knockdown`);
    this.updateHud(true);
    if (winner?.id === 'monteiro') {
      this.celebrateMonteiro(result, winner);
      return;
    }
    if (winner) {
      winner.sprite.play(hasAdvancedCombat(winner.id) ? `${winner.id}-victory` : `${winner.id}-idle`);
      this.victoryTimer = this.time.delayedCall(3500, () => {
        this.victoryTimer = null;
        this.callbacks?.result(result);
      });
      return;
    }
    this.callbacks?.result(result);
  }

  private celebrateMonteiro(result: 'player' | 'enemy' | 'draw', winner: Unit): void {
    // A comemoração é uma vinheta desenhada com os dois personagens.
    // Ela fica visível antes da tela de resultado e funciona para ambos os lados.
    for (const unit of [this.player, this.enemy]) {
      unit?.sprite.setVisible(false);
      unit?.shadow.setVisible(false);
      unit?.guardAura.setVisible(false);
    }
    this.shots.forEach(shot => shot.node.destroy());
    this.shots = [];
    const loser = winner === this.player ? this.enemy! : this.player!;
    const key = `monteiro-victory-${loser.id}`;
    this.victorySprite = this.add.sprite(W / 2, GROUND, key, 0)
      .setOrigin(0.5, 308 / 320).setScale(312 / 256).setDepth(4).setFlipX(winner.facing === -1);
    this.victorySprite.play(key);
    this.victoryTimer = this.time.delayedCall(4200, () => {
      this.victoryTimer = null;
      this.callbacks?.result(result);
    });
  }
}
