import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Scene: class {}, Math: { Clamp: (n: number, min: number, max: number) => Math.min(max, Math.max(min, n)) } } }));
import { ArenaScene } from '../src/arena';
import { createMobility } from '../src/agility';
import { COMBAT_STEP, MOVES, attackVisualFrame, createAttack, consumeHit, moveDuration } from '../src/combat';
import { PLAYER_ONE_CONTROLS, PLAYER_TWO_CONTROLS, actionForCode } from '../src/config/controls';
import { advancedAnimation, kallianeAnimationGroups, yafaAnimationGroups, ruiAnimationGroups } from '../src/animation';
import { fighters, roster } from '../src/fighters';
import { pickOpponents } from '../src/rules';

afterEach(() => vi.restoreAllMocks());

describe('integração das novas animações do Rui', () => {
  it('carrega a caminhada de 12 quadros e as folhas próprias de combate', () => {
    const s = setup(); const loaded = new Map<string, string>();
    s.load = { image: vi.fn(), spritesheet: (key: string, path: string) => loaded.set(key, path) };
    s.preload();
    expect(loaded.has('rui-spritesheet')).toBe(false);
    expect(loaded.get('rui-v6-walk')).toMatch(/characters\/rui\/rui-v6-walk\.webp$/);
    expect(loaded.get('rui-v6-walk-back')).toMatch(/characters\/rui\/rui-v6-walk-back\.webp$/);
    s.anims = { exists: () => false, generateFrameNumbers: (key: string) => { expect(loaded.has(key)).toBe(true); return []; }, create: vi.fn() };
    s.createFighterAnimations();
    expect(s.anims.create.mock.calls.filter(([a]: any[]) => a.key.startsWith('rui-'))).toHaveLength(27);
    for (const [group, poses] of Object.entries(ruiAnimationGroups)) {
      if (group !== 'backward') expect(loaded.get(`rui-v5-${group}`)).toMatch(new RegExp(`characters/rui/rui-v5-${group}\\.webp$`));
      poses.forEach((pose, row) => {
        const a = advancedAnimation('rui', pose);
        if (pose === 'walk' || pose === 'walkBack') {
          expect(a.texture).toBe(pose === 'walkBack' ? 'rui-v6-walk-back' : 'rui-v6-walk');
          expect(a.frames).toEqual(Array.from({ length: 12 }, (_, i) => i));
          expect(a.frameRate).toBe(18); expect(a.repeat).toBe(-1);
          return;
        }
        expect(a.texture).toBe(`rui-v5-${group}`);
        expect(a.frames).toEqual(Array.from({ length: 6 }, (_, i) => row*6+i));
      });
    }
  });
  it.each(['player', 'enemy'])('sincroniza o golpe forte e o espelhamento do Rui no %s', side => {
    const s = setup(); const u = s[side]; u.id = 'rui';
    s.strongAttack(u, 'strongKick'); s.elapsed = MOVES.strongKick.startup * COMBAT_STEP;
    s.renderUnit(u, 0);
    expect(u.attack.move).toBe('strongKick');
    expect(u.sprite.texture.key).toBe('rui-v5-strong');
    expect(u.sprite.frame.name).toBe(9);
    expect(u.sprite.setOrigin).toHaveBeenLastCalledWith(.5, 1);
    expect(u.sprite.setFlipX).toHaveBeenLastCalledWith(u.facing === -1);
  });
  it.each(['player', 'enemy'])('retoma as doze passadas ao encerrar a corrida no %s', side => {
    const s = setup(); const u = s[side]; u.id = 'rui'; u.state = 'walk'; u.mobility.runDirection = u.facing;
    s.renderUnit(u, 0); expect(u.sprite.play).toHaveBeenLastCalledWith('rui-run', true);
    u.mobility.runDirection = 0; s.renderUnit(u, 0);
    expect(u.sprite.play).toHaveBeenLastCalledWith('rui-walk', true);
    expect(u.sprite.setOrigin).toHaveBeenLastCalledWith(.5, 1);
    expect(u.sprite.setScale).toHaveBeenLastCalledWith(312/256, 312/256);
    expect(u.sprite.setFlipX).toHaveBeenLastCalledWith(side === 'enemy');
  });
  it.each(['player', 'enemy'])('anda para trás olhando o rival e retoma a frente no %s', side => {
    const s = setup(); const u = s[side]; const other = s[side === 'player' ? 'enemy' : 'player']; u.id = 'rui';
    const facing = u.facing;
    s.advancedMovement(u, other, -facing, false, false, false, COMBAT_STEP); s.renderUnit(u, 0);
    expect(u.state).toBe('walk'); expect(u.facing).toBe(facing);
    expect(u.sprite.play).toHaveBeenLastCalledWith('rui-walkBack', true);
    expect(u.sprite.setFlipX).toHaveBeenLastCalledWith(facing === -1);
    s.advancedMovement(u, other, facing, false, false, false, COMBAT_STEP); s.renderUnit(u, 0);
    expect(u.sprite.play).toHaveBeenLastCalledWith('rui-walk', true);
    s.advancedMovement(u, other, 0, false, false, false, COMBAT_STEP); s.renderUnit(u, 0);
    expect(u.sprite.play).toHaveBeenLastCalledWith('rui-idle', true);
  });
  it('reavalia frente e trás quando o adversário passa para o outro lado', () => {
    const s = setup(); s.player.id = 'rui';
    s.advancedMovement(s.player, s.enemy, -1, false, false, false, COMBAT_STEP); s.renderUnit(s.player, 0);
    expect(s.player.sprite.play).toHaveBeenLastCalledWith('rui-walkBack', true);
    s.enemy.x = s.player.x-150;
    s.advancedMovement(s.player, s.enemy, -1, false, false, false, COMBAT_STEP); s.renderUnit(s.player, 0);
    expect(s.player.facing).toBe(-1); expect(s.player.sprite.play).toHaveBeenLastCalledWith('rui-walk', true);
  });
  it('dois toques para trás ainda exibem o salto de recuo', () => {
    const s = setup(); s.player.id = 'rui';
    s.queueMobilityTap(s.player, 'left'); s.elapsed = .12; s.queueMobilityTap(s.player, 'left');
    s.advancedMovement(s.player, s.enemy, -1, false, false, false, COMBAT_STEP); s.renderUnit(s.player, 0);
    expect(s.player.mobility.evading).toBe(true); expect(s.player.currentVisual).toBe('backhop');
    expect(s.player.sprite.texture.key).toBe('rui-v5-locomotion');
    expect(s.player.sprite.frame.name).toBe(18);
  });
  it('mantém o Firewall Punch com 20 de dano e mostra o impacto apenas na janela ativa', () => {
    const s = setup(); s.player.id = 'rui'; s.firewallPunch = vi.fn();
    s.special(s.player, s.enemy);
    expect(s.player.attack.move).toBe('firewall');
    s.elapsed = (MOVES.firewall.startup-1)*COMBAT_STEP; s.tickAttacks();
    expect(s.enemy.health).toBe(100); expect(s.firewallPunch).not.toHaveBeenCalled();
    s.elapsed = MOVES.firewall.startup*COMBAT_STEP; s.tickAttacks(); s.renderUnit(s.player, 0);
    expect(s.enemy.health).toBe(80);
    expect(s.player.sprite.texture.key).toBe('rui-v5-special');
    expect(s.player.sprite.frame.name).toBe(3);
    s.tickAttacks(); expect(s.enemy.health).toBe(80); expect(s.firewallPunch).toHaveBeenCalledOnce();
  });
  it('habilita fracos, rasteira, corrida, recuos e pulo duplo com os mesmos comandos', () => {
    let s = setup(); s.player.id = 'rui'; s.punch(s.player, s.enemy);
    expect(s.player.attack.move).toBe('weakPunch');
    s = setup(); s.player.id = 'rui'; s.kick(s.player, s.enemy);
    expect(s.player.attack.move).toBe('weakKick');
    s = setup(); s.player.id = 'rui'; s.keys.down.isDown = true; s.setVirtualControl('kick', true); s.handlePlayer(COMBAT_STEP);
    expect(s.player.attack.move).toBe('sweep');
    s = setup(); s.player.id = 'rui';
    s.queueMobilityTap(s.player, 'right'); s.elapsed = .12; s.queueMobilityTap(s.player, 'right');
    s.advancedMovement(s.player, s.enemy, 1, false, false, false, COMBAT_STEP);
    expect(s.player.mobility.runDirection).toBe(1);
    s.advancedMovement(s.player, s.enemy, 0, false, false, true, COMBAT_STEP); s.player.elevation = 60;
    s.advancedMovement(s.player, s.enemy, 0, false, false, true, COMBAT_STEP);
    expect(s.player.mobility.jumps).toBe(2);
    s = setup(); s.player.id = 'rui';
    s.queueMobilityTap(s.player, 'left'); s.elapsed = .12; s.queueMobilityTap(s.player, 'left');
    s.advancedMovement(s.player, s.enemy, -1, false, false, false, COMBAT_STEP);
    expect(s.player.mobility.hopsLeft).toBeGreaterThan(0);
  });
  it('não sustenta o gancho antigo depois de terminar o golpe', () => {
    const s = setup(); s.player.id = 'rui'; s.punch(s.player, s.enemy, true);
    expect(s.player.attack.move).toBe('hook'); expect(s.player.gaunchoVisualUntil).toBe(0);
  });
  it.each(['player', 'enemy'])('aguarda a comemoração do Rui no %s e cancela o resultado ao sair', side => {
    const s = setup(); s[side].id = 'rui'; const timer = { remove: vi.fn() }; let complete = () => {};
    s.time = { delayedCall: vi.fn((_ms, cb) => { complete = cb; return timer; }) };
    s.finish(side); s.finish(side);
    expect(s[side].sprite.play).toHaveBeenCalledExactlyOnceWith('rui-victory');
    expect(s.callbacks.result).not.toHaveBeenCalled(); complete();
    expect(s.callbacks.result).toHaveBeenCalledExactlyOnceWith(side);
    const active = setup(); active[side].id = 'rui'; active.time = s.time;
    active.finish(side); active.clearCombat(); expect(timer.remove).toHaveBeenCalledWith(false);
  });
});

function node() {
  const sprite: any = { height: 256, texture: { key: 'monteiro-v5-locomotion' }, frame: { name: 0 }, anims: { pause: vi.fn(), resume: vi.fn() } };
  for (const method of ['setVisible', 'setOrigin', 'setScale', 'setDepth', 'setFlipX', 'play', 'stop', 'destroy', 'setPosition', 'setAngle', 'setAlpha', 'setTint']) sprite[method] = vi.fn().mockReturnValue(sprite);
  sprite.setTexture = vi.fn((key: string, frame: number) => { sprite.texture.key = key; sprite.frame.name = frame; sprite.height = key.startsWith('monteiro-v6-') ? 512 : 256; return sprite; });
  return sprite;
}

function setup() {
  const scene = new ArenaScene() as any;
  const unit = (id: string, x: number, facing: number) => ({
    id, x, facing, elevation: 0, velocityY: 0, health: 100, meter: 0,
    state: 'idle', stateUntil: 0, attack: null, cooldown: 0, specialCooldown: 0,
    shieldUntil: 0, flashUntil: 0, visualLunge: 0, comboCount: 0, comboAttacker: null,
    mobility: createMobility(), hurtPose: 'hurt', hurtStarted: 0, knockedDown: false,
    gaunchoVisualUntil: 0, currentVisual: 'idle', lastAnimState: 'idle',
    sprite: node(), shadow: node(), guardAura: node(),
  });
  scene.player = unit('monteiro', 300, 1);
  scene.enemy = unit('caio', 395, -1);
  const keys = () => Object.fromEntries(['left', 'right', 'down', 'block'].map(key => [key, { isDown: false }]));
  scene.keys = keys(); scene.keys2 = keys();
  scene.mode = 'versus';
  scene.spark = vi.fn(); scene.dust = vi.fn(); scene.comboPopup = vi.fn(); scene.updateHud = vi.fn();
  scene.callbacks = { result: vi.fn(), training: vi.fn(), toast: vi.fn(), phase: vi.fn() };
  scene.cameras = { main: { shake: vi.fn() } };
  return scene;
}

describe('golpes fracos e fortes do Monteiro', () => {
  it('mapeia comandos próprios para os dois jogadores', () => {
    expect(actionForCode(PLAYER_ONE_CONTROLS, 'KeyH')).toBe('heavyAttack');
    expect(actionForCode(PLAYER_ONE_CONTROLS, 'KeyO')).toBe('heavyKick');
    expect(actionForCode(PLAYER_TWO_CONTROLS, 'Numpad7')).toBe('heavyAttack');
    expect(actionForCode(PLAYER_TWO_CONTROLS, 'Numpad8')).toBe('heavyKick');
  });
  it('soco e chute comuns usam os golpes fracos para o elenco avançado, preservando o gancho', () => {
    let s = setup(); s.punch(s.player, s.enemy); expect(s.player.attack.move).toBe('weakPunch');
    s = setup(); s.kick(s.player, s.enemy); expect(s.player.attack.move).toBe('weakKick');
    s = setup(); s.punch(s.player, s.enemy, true); expect(s.player.attack.move).toBe('hook');
    s = setup(); s.punch(s.enemy, s.player); expect(s.enemy.attack.move).toBe('weakPunch');
    s = setup(); s.strongAttack(s.enemy, 'strongKick'); expect(s.enemy.attack.move).toBe('strongKick');
  });
  it('os fortes causam mais dano e alcance, pagando mais tempo de recuperação', () => {
    for (const [weak, strong] of [['weakPunch', 'strongPunch'], ['weakKick', 'strongKick']] as const) {
      expect(MOVES[strong].damage).toBeGreaterThan(MOVES[weak].damage);
      expect(MOVES[strong].reach).toBeGreaterThan(MOVES[weak].reach);
      expect(MOVES[strong].recovery).toBeGreaterThan(MOVES[weak].recovery);
      expect(moveDuration(strong)).toBeGreaterThan(moveDuration(weak));
    }
  });
  it('touch consome o golpe forte uma vez e prioriza forte quando ambos chegam juntos', () => {
    const s = setup();
    s.setVirtualControl('attack', true); s.setVirtualControl('heavyAttack', true);
    s.handlePlayer(COMBAT_STEP);
    expect(s.player.attack.move).toBe('strongPunch');
    expect(s.queuedHeavyAttack).toBe(false);
    const attack = s.player.attack;
    s.handlePlayer(COMBAT_STEP);
    expect(s.player.attack).toBe(attack);
  });
  it('comandos remotos de forte alcançam o Monteiro do Player 2 e são limpos ao desconectar', () => {
    const s = setup(); s.enemy.id = 'monteiro';
    s.setOnlineRemote(true); s.setRemoteControl('heavyKick', true);
    s.handleSecondPlayer(COMBAT_STEP);
    expect(s.enemy.attack.move).toBe('strongKick');
    s.setRemoteControl('heavyAttack', true); s.setOnlineRemote(false);
    expect(s.queuedHeavyAttack2).toBe(false);
  });
  it('bloqueia fortes durante guarda, hitstun e outra ação', () => {
    for (const state of ['guard', 'hurt', 'attack', 'blockstun']) {
      const s = setup(); s.player.state = state;
      s.strongAttack(s.player, 'strongPunch');
      expect(s.player.attack).toBeNull();
    }
  });
  it('só conecta na janela ativa e não aplica o dano duas vezes', () => {
    const s = setup(); s.strongAttack(s.player, 'strongPunch');
    s.elapsed = (MOVES.strongPunch.startup - 1) * COMBAT_STEP; s.tickAttacks();
    expect(s.enemy.health).toBe(100);
    s.elapsed = MOVES.strongPunch.startup * COMBAT_STEP; s.tickAttacks();
    expect(s.enemy.health).toBe(80);
    s.tickAttacks(); expect(s.enemy.health).toBe(80);
  });
  it('mostra os oito quadros e mantém o quadro de impacto na janela de colisão', () => {
    for (const move of ['weakPunch', 'strongPunch', 'weakKick', 'strongKick'] as const) {
      const attack = createAttack(move, 0);
      const shown = new Set<number>();
      const total = MOVES[move].startup + MOVES[move].active + MOVES[move].recovery;
      for (let frame = 0; frame < total; frame++) {
        const visual = attackVisualFrame(attack, frame * COMBAT_STEP, 8);
        shown.add(visual);
        if (frame >= MOVES[move].startup && frame < MOVES[move].startup + MOVES[move].active) expect(visual).toBe(4);
      }
      expect(shown.size).toBe(8);
    }
  });
  it('o chute baixo atinge agachados, enquanto o alto forte passa por cima deles', () => {
    const source = { x: 300, elevation: 0, facing: 1 as const, state: 'kick' as const };
    const target = { x: 400, elevation: 0, facing: -1 as const, state: 'crouch' as const };
    expect(consumeHit(source, createAttack('weakKick', 0), target, MOVES.weakKick.startup * COMBAT_STEP)).toBe(true);
    expect(consumeHit(source, createAttack('strongKick', 0), target, MOVES.strongKick.startup * COMBAT_STEP)).toBe(false);
  });
  it('o chute fraco seleciona reação baixa sem provocar a queda da rasteira', () => {
    const s = setup(); s.enemy.id = 'monteiro'; s.kick(s.player, s.enemy);
    s.elapsed = MOVES.weakKick.startup * COMBAT_STEP; s.tickAttacks();
    expect(s.enemy.hurtPose).toBe('hurtLow'); expect(s.enemy.knockedDown).toBe(false);
  });
  it('mantém escala e pivô dos pés ao trocar a textura e inverter o lado', () => {
    for (const facing of [1, -1]) {
      const s = setup(); s.player.facing = facing;
      s.strongAttack(s.player, 'strongPunch'); s.elapsed = MOVES.strongPunch.startup * COMBAT_STEP;
      s.renderUnit(s.player, 0);
      expect(s.player.sprite.texture.key).toBe('monteiro-v6-strong-punch');
      expect(s.player.sprite.frame.name).toBe(4);
      expect(s.player.sprite.setScale).toHaveBeenLastCalledWith(312 / 256, 312 / 256);
      expect(s.player.sprite.setOrigin).toHaveBeenLastCalledWith(facing === 1 ? 190/512 : 1-190/512, 488/512);
    }
  });
});

describe('comemoração do Monteiro', () => {
  function victorySetup() {
    const s = setup(); const victory = node();
    const timer = { remove: vi.fn() };
    let callback = () => {};
    s.add = { sprite: vi.fn(() => victory) };
    s.time = { delayedCall: vi.fn((_delay: number, action: () => void) => { callback = action; return timer; }) };
    return { s, victory, timer, complete: () => callback() };
  }
  it('exibe a sequência inteira antes do resultado e impede KO duplicado', () => {
    const { s, victory, complete } = victorySetup();
    s.finish('player'); s.finish('player');
    expect(s.add.sprite).toHaveBeenCalledTimes(1);
    expect(victory.play).toHaveBeenCalledWith('monteiro-victory-caio');
    expect(s.callbacks.result).not.toHaveBeenCalled();
    complete(); expect(s.callbacks.result).toHaveBeenCalledExactlyOnceWith('player');
  });
  it('também comemora a vitória do Monteiro no Player 2 olhando para a esquerda', () => {
    const { s, victory, complete } = victorySetup();
    s.player.id = 'caio'; s.enemy.id = 'monteiro';
    s.finish('enemy');
    expect(victory.setFlipX).toHaveBeenCalledWith(true);
    expect(victory.play).toHaveBeenCalledWith('monteiro-victory-caio');
    complete(); expect(s.callbacks.result).toHaveBeenCalledWith('enemy');
  });
  it.each(roster.map(f => f.id))('usa o rival correto na vitória contra %s', id => {
    const { s, victory } = victorySetup(); s.enemy.id = id;
    s.finish('player');
    expect(victory.play).toHaveBeenCalledWith(`monteiro-victory-${id}`);
  });
  it('limpa a comemoração e cancela o resultado pendente ao sair ou reiniciar', () => {
    const { s, victory, timer } = victorySetup();
    s.finish('player'); s.clearCombat();
    expect(timer.remove).toHaveBeenCalledWith(false);
    expect(victory.destroy).toHaveBeenCalledOnce();
    expect(s.victorySprite).toBeNull(); expect(s.victoryTimer).toBeNull();
  });
  it('empates mostram o resultado de imediato e os outros vencedores têm comemoração longa', () => {
    const draw = victorySetup(); draw.s.finish('draw');
    expect(draw.s.add.sprite).not.toHaveBeenCalled();
    expect(draw.s.callbacks.result).toHaveBeenCalledWith('draw');

    const win = victorySetup(); win.s.finish('enemy');
    expect(win.s.add.sprite).not.toHaveBeenCalled();
    expect(win.s.callbacks.result).not.toHaveBeenCalled();
    expect(win.s.time.delayedCall).toHaveBeenCalledWith(3500, expect.any(Function));
    win.complete();
    expect(win.s.callbacks.result).toHaveBeenCalledWith('enemy');
  });
});

describe('integração da Yafa', () => {
  it('substitui os personagens removidos e reserva o chefe para o fim da campanha', () => {
    expect(Object.keys(fighters)).toHaveLength(7);
    expect(roster.map(f => f.id)).toContain('yafa');
    for (const id of ['cliente', 'homologacao', 'prazo']) expect(fighters).not.toHaveProperty(id);
    for (const selected of roster) {
      const route = pickOpponents(selected.id, () => 0.5);
      expect(route).toHaveLength(3);
      expect(new Set(route).size).toBe(3);
      expect(route).not.toContain('yafa'); expect(route).not.toContain(selected.id);
    }
  });
  it('registra 26 animações com seis quadros válidos por folha', () => {
    let count = 0;
    for (const [group, poses] of Object.entries(yafaAnimationGroups)) {
      poses.forEach((pose, row) => {
        const a = advancedAnimation('yafa', pose);
        expect(a.frames).toEqual(Array.from({length: 6}, (_, i) => row*6+i));
        expect(a.texture).toBe(`yafa-v1-${group}`);
        expect(advancedAnimation('yafa', pose)).toBe(a);
        count++;
      });
    }
    expect(count).toBe(26);
  });
  it('carrega apenas as folhas do elenco atual e cria as animações da Yafa', () => {
    const s = setup(); const loaded = new Map<string, string>();
    s.load = { image: vi.fn(), spritesheet: (key: string, path: string) => loaded.set(key, path) };
    s.preload();
    expect([...loaded.keys()].some(key => /cliente|prazo|homologacao|victory-cable/.test(key))).toBe(false);
    s.anims = { exists: () => false, generateFrameNumbers: (key: string) => { expect(loaded.has(key)).toBe(true); return []; }, create: vi.fn() };
    s.createFighterAnimations();
    expect(s.anims.create.mock.calls.filter(([a]: any[]) => a.key.startsWith('yafa-'))).toHaveLength(26);
  });
  it.each(['player', 'enemy'])('habilita os golpes fortes para a Yafa no %s', side => {
    const s = setup(); const u = s[side]; u.id = 'yafa';
    s.strongAttack(u, 'strongPunch'); s.elapsed = MOVES.strongPunch.startup * COMBAT_STEP;
    s.renderUnit(u, 0);
    expect(u.attack.move).toBe('strongPunch');
    expect(u.sprite.texture.key).toBe('yafa-v1-strong');
    expect(u.sprite.frame.name).toBe(3);
    expect(u.sprite.setOrigin).toHaveBeenLastCalledWith(.5, 1);
  });
  it('só ativa o Escudo da Apólice na janela de impacto e acerta uma vez', () => {
    const s = setup(); s.player.id = 'yafa'; s.special(s.player, s.enemy);
    expect(s.player.attack.move).toBe('shield');
    s.elapsed = (MOVES.shield.startup-1)*COMBAT_STEP; s.tickAttacks();
    expect(s.enemy.health).toBe(100); expect(s.player.shieldUntil).toBe(0);
    s.elapsed = MOVES.shield.startup*COMBAT_STEP; s.tickAttacks();
    expect(s.enemy.health).toBe(82);
    expect(s.player.shieldUntil).toBeCloseTo(s.elapsed + MOVES.shield.active*COMBAT_STEP);
    s.tickAttacks(); expect(s.enemy.health).toBe(82);
  });
  it('permite corrida e segundo pulo da Yafa sem mudar os lutadores antigos', () => {
    const s = setup(); s.player.id = 'yafa';
    s.queueMobilityTap(s.player, 'right'); s.elapsed = .12; s.queueMobilityTap(s.player, 'right');
    s.advancedMovement(s.player, s.enemy, 1, false, false, false, COMBAT_STEP);
    expect(s.player.mobility.runDirection).toBe(1);
    s.advancedMovement(s.player, s.enemy, 0, false, false, true, COMBAT_STEP);
    s.player.elevation = 60;
    s.advancedMovement(s.player, s.enemy, 0, false, false, true, COMBAT_STEP);
    expect(s.player.mobility.jumps).toBe(2);
    expect(s.advancedMovement(s.enemy, s.player, 1, false, false, true, COMBAT_STEP)).toBe(true);
  });
  it('a segunda fase da Yafa começa uma vez com metade da vida', () => {
    const s = setup(); s.mode = 'fight'; s.bossPhase = 1; s.enemy.id = 'yafa'; s.enemy.health = 60;
    s.cameras.main.flash = vi.fn();
    s.hit(s.enemy, s.player, 10);
    expect(s.enemy.health).toBe(50); expect(s.bossPhase).toBe(2);
    s.hit(s.enemy, s.player, 10);
    expect(s.callbacks.phase).toHaveBeenCalledExactlyOnceWith(2);
  });
  it('a vitória da Yafa toca antes do resultado e cancela ao sair', () => {
    const s = setup(); s.player.id = 'yafa'; const timer = { remove: vi.fn() }; let complete = () => {};
    s.time = { delayedCall: vi.fn((_ms, cb) => { complete = cb; return timer; }) };
    s.finish('player');
    expect(s.player.sprite.play).toHaveBeenCalledWith('yafa-victory');
    expect(s.callbacks.result).not.toHaveBeenCalled();
    complete(); expect(s.callbacks.result).toHaveBeenCalledExactlyOnceWith('player');
    s.clearCombat(); expect(s.victoryTimer).toBeNull();
    const active = setup(); active.player.id = 'yafa'; active.time = s.time;
    active.finish('player'); active.clearCombat(); expect(timer.remove).toHaveBeenCalledWith(false);
  });
});

describe('Kalliane de cabelo curto', () => {
  it('carrega os atlas v2 e as caminhadas de doze quadros sem trocar poderes', () => {
    const s = setup(); const loaded = new Map<string, string>();
    s.load = { image: vi.fn(), spritesheet: (key: string, path: string) => loaded.set(key, path) };
    s.preload();
    for (const group of Object.keys(yafaAnimationGroups)) {
      expect(loaded.get(`kalliane-v2-${group}`)).toMatch(new RegExp(`characters/kalliane/kalliane-v2-${group}\\.webp$`));
    }
    expect(loaded.get('kalliane-v2-walk12')).toMatch(/characters\/kalliane\/kalliane-v2-walk12\.webp$/);
    expect(loaded.get('kalliane-v2-walkBack12')).toMatch(/characters\/kalliane\/kalliane-v2-walkBack12\.webp$/);
    expect(fighters.kalliane.animationSet).toBe('kalliane-v2');
    expect(fighters.kalliane.portraitSource).toMatch(/portrait-v2\.webp$/);
    expect(fighters.kalliane.special).toBe('Proposta irresistível');
    expect(fighters.kalliane.alternate).toBe('Rede de contatos');
    expect(fighters.kalliane.superName).toBe('Contrato Assinado!');

    expect(advancedAnimation('kalliane', 'idle').texture).toBe('kalliane-v2-locomotion');
    expect(advancedAnimation('kalliane', 'idle').frames).toEqual([0, 1, 2, 3, 4, 5]);
    for (const pose of ['walk', 'walkBack'] as const) {
      const animation = advancedAnimation('kalliane', pose);
      expect(animation.texture).toBe(pose === 'walk' ? 'kalliane-v2-walk12' : 'kalliane-v2-walkBack12');
      expect(animation.frames).toEqual(Array.from({ length: 12 }, (_, i) => i));
      expect(animation.frameRate).toBe(18); expect(animation.repeat).toBe(-1);
    }
    expect(kallianeAnimationGroups.backward).toEqual(['walkBack']);
  });

  it.each(['player', 'enemy'])('recua com passadas enquanto mantém o rosto voltado ao oponente (%s)', side => {
    const s = setup(); const u = s[side]; const other = s[side === 'player' ? 'enemy' : 'player']; u.id = 'kalliane';
    const facing = u.facing;
    s.advancedMovement(u, other, -facing, false, false, false, COMBAT_STEP); s.renderUnit(u, 0);
    expect(u.state).toBe('walk'); expect(u.facing).toBe(facing);
    expect(u.sprite.play).toHaveBeenLastCalledWith('kalliane-walkBack', true);
    expect(advancedAnimation('kalliane', 'walkBack').frames).toHaveLength(12);
    expect(u.sprite.setFlipX).toHaveBeenLastCalledWith(facing === -1);
  });
});
