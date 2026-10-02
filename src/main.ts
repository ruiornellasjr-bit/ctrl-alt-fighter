import Phaser from 'phaser';
import type Peer from 'peerjs';
import type { DataConnection, MediaConnection } from 'peerjs';
import './style.css';
import { ArcadeAudio } from './audio';
import { ArenaScene, type ArenaControl, type Hud, type TrainingDummyMode } from './arena';
import { fighters, roster, hasAdvancedCombat } from './fighters';
import { pickOpponents, type FighterId } from './rules';
import { isStageId, stages, type StageId } from './stages';
import { ACTION_LABELS, CONTROL_ACTIONS, GUEST_CONTROLS, MOVE_SUMMARY, PLAYER_ONE_CONTROLS, PLAYER_TWO_CONTROLS, codeFor, labelFor, type ControlAction } from './config/controls';
import { gamepadTransitions, readGamepadActions, readGamepadMenuButtons } from './gamepad';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
type Screen = 'menu' | 'selection' | 'stage-select' | 'online-room' | 'tutorial' | 'result' | 'pause' | 'settings' | null;
type PlayMode = 'arcade' | 'online-host' | 'online-guest' | 'versus-local';
type Control = ArenaControl;
const screens: Exclude<Screen, null>[] = ['menu', 'selection', 'stage-select', 'online-room', 'tutorial', 'result', 'pause', 'settings'];
const audio = new ArcadeAudio();
let arena: ArenaScene | null = null;
let screen: Screen = 'menu';
let settingsReturn: Screen = 'menu';
let selected: FighterId = 'kalliane';
let opponents: FighterId[] = [];
let round = 0;
let trainingIndex = 0;
let trainingFree = false;
let trainingOnly = false;
let trainingUiTimer = 0;
let pausedFromTraining = false;
let playMode: PlayMode = 'arcade';
let toastTimer = 0;
let selectedStage: StageId = 'office';
let score = 0;
let latestHud: Hud | null = null;
let roomPeer: Peer | null = null;
let roomConnection: DataConnection | null = null;
let roomMedia: MediaConnection | null = null;
let roomStream: MediaStream | null = null;
let roomLoadId = 0;
let roomStarted = false;
let roomId = '';
let guestFighter: FighterId = 'caio';
let toastQuipIndex = 0;
let controlsVisible = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760;
let controlsManuallyToggled = false;
let gamepadConnected = false;
let highlightedFighter: FighterId = 'kalliane';
let versusLocalPhase: 1 | 2 = 1;
let versusLocalP1: FighterId = 'kalliane';
const toastQuips = ['REINICIA QUE PASSA!', 'NA MINHA MÁQUINA FUNCIONA!', 'ABRE UM CHAMADO!'];
const validControls = new Set<Control>(CONTROL_ACTIONS);
const guestHeld = new Set<Control>();

// Textos permanecem escritos à mão (copy), mas as TECLAS exibidas nunca são
// hardcoded — vêm sempre de PLAYER_ONE_CONTROLS via labelFor, então remapear
// o teclado em src/config/controls.ts atualiza o tutorial automaticamente.
const L = (action: ControlAction): string => labelFor(PLAYER_ONE_CONTROLS, action);
const steps = [
  { action: 'move', title: 'MOVER', copy: () => `Use ${L('left')} e ${L('right')} para avançar e recuar.`, keys: ['left', 'right'] as ControlAction[] },
  { action: 'crouch', title: 'AGACHAR', copy: () => `Segure ${L('down')} para agachar.`, keys: ['down'] as ControlAction[] },
  { action: 'jump', title: 'PULAR', copy: () => `Aperte ${L('jump')} para sair do chão.`, keys: ['jump'] as ControlAction[] },
  { action: 'weakAttack', title: 'SOCO FRACO', copy: () => `Aproxime-se e aperte ${L('attack')}.`, keys: ['attack'] as ControlAction[] },
  { action: 'strongAttack', title: 'SOCO FORTE', copy: () => `Aperte ${L('heavyAttack')} para causar mais dano.`, keys: ['heavyAttack'] as ControlAction[] },
  { action: 'kick', title: 'CHUTE', copy: () => `Aperte ${L('kick')} para atacar com as pernas.`, keys: ['kick'] as ControlAction[] },
  { action: 'sweep', title: 'RASTEIRA', copy: () => `Segure ${L('down')} e aperte ${L('kick')} para derrubar.`, keys: ['down', 'kick'] as ControlAction[] },
  { action: 'block', title: 'DEFESA', copy: () => `Segure ${L('block')} quando o rival atacar.`, keys: ['block'] as ControlAction[] },
  { action: 'special', title: 'GOLPE ESPECIAL', copy: () => `Aperte ${L('special')} para usar sua habilidade.`, keys: ['special'] as ControlAction[] },
  { action: 'combo', title: 'COMBO SIMPLES', copy: () => `Conecte ${L('attack')} e ${L('attack')} antes que o rival se recupere.`, keys: ['attack', 'attack'] as ControlAction[] },
  { action: 'super', title: 'SUPER ESPECIAL', copy: () => `Com a barra cheia, aperte ${L('super')}.`, keys: ['super'] as ControlAction[] },
] as const;

function show(next: Screen): void {
  screen = next;
  screens.forEach(name => $(name).classList.toggle('hidden', name !== next));
  const fighting = next === null || next === 'pause' || next === 'tutorial' || (next === 'settings' && settingsReturn === null);
  $('hud').classList.toggle('hidden', !fighting);
  $('fight-actions').classList.toggle('hidden', next !== null);
  $('training-tools').classList.toggle('hidden', next !== 'tutorial');
  $('app-footer').classList.toggle('hidden', next === 'tutorial');
  const inArena = next === null || next === 'tutorial';
  $('touch-controls').classList.toggle('hidden', !inArena || !controlsVisible);
  $('controls-toggle').classList.toggle('hidden', !inArena);
  $('controls-toggle').setAttribute('aria-pressed', String(controlsVisible));
  $('controls-toggle').setAttribute('aria-label', controlsVisible ? 'Ocultar controles na tela' : 'Mostrar controles na tela');
  $('controls-toggle').classList.toggle('active', controlsVisible);
  renderTouchStrength();
  renderControlLegend();
  $('pause-button').textContent = playMode === 'online-guest' ? '✕ SAIR DA SALA' : '⏸ PAUSAR';
  $('help-button').classList.toggle('hidden', playMode === 'online-guest');
  if (next !== null && next !== 'tutorial') $('adalberto-toast').classList.remove('active');
}

window.addEventListener('resize', () => {
  if (controlsManuallyToggled) return;
  controlsVisible = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760;
  if (screen !== null && screen !== 'tutorial') return;
  $('touch-controls').classList.toggle('hidden', !controlsVisible);
  $('controls-toggle').setAttribute('aria-pressed', String(controlsVisible));
  $('controls-toggle').setAttribute('aria-label', controlsVisible ? 'Ocultar controles na tela' : 'Mostrar controles na tela');
  $('controls-toggle').classList.toggle('active', controlsVisible);
  if (screen === 'tutorial') setTutorialText(false);
});

function renderRoster(): void {
  const holder = $('roster');
  if (holder.childElementCount) {
    updateSelectionPreview(highlightedFighter, false);
    return;
  }
  holder.replaceChildren();
  for (const def of roster) {
    const card = document.createElement('button');
    card.className = 'fighter-card';
    card.dataset.fighter = def.id;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-label', `${def.name}, ${def.codename}, ${def.role}`);
    card.style.setProperty('--accent', def.accent);
    card.innerHTML = `<img alt="" src="${def.portraitSource}" decoding="async" style="object-fit:contain" /><span class="fighter-info"><b>${def.name}</b><small>${def.codename}</small></span>`;
    card.addEventListener('click', () => updateSelectionPreview(def.id));
    card.addEventListener('dblclick', () => choose(def.id));
    card.addEventListener('focus', () => updateSelectionPreview(def.id, false));
    holder.append(card);
  }
  updateSelectionPreview(highlightedFighter, false);
}

function updateSelectionPreview(id: FighterId, playSound = true): void {
  const def = fighters[id];
  highlightedFighter = id;
  $('selection').style.setProperty('--accent', def.accent);
  const hero = $<HTMLImageElement>('selection-hero');
  hero.src = def.portraitSource;
  hero.alt = def.name;
  $('selection-name').textContent = def.name.toUpperCase();
  $('selection-codename').textContent = def.codename;
  $('selection-role').textContent = def.role;
  $('selection-intro').textContent = def.intro;
  $('selection-special').textContent = def.special;
  $('selection-alternate').textContent = def.alternate;
  $('selection-super').textContent = def.superName;
  document.querySelectorAll<HTMLButtonElement>('.fighter-card').forEach(card => {
    const active = card.dataset.fighter === id;
    card.classList.toggle('selected', active);
    card.setAttribute('aria-selected', String(active));
  });
  if (playSound) audio.sound('select');
}

function renderHud(hud: Hud): void {
  const previous = latestHud;
  latestHud = hud;
  if (playMode === 'online-host' && roomConnection?.open) roomConnection.send({ type: 'hud', hud });
  if (previous?.player !== hud.player) $('player-health').style.width = `${hud.player}%`;
  if (previous?.enemy !== hud.enemy) $('enemy-health').style.width = `${hud.enemy}%`;
  if (previous?.playerMeter !== hud.playerMeter) $('player-meter').style.width = `${hud.playerMeter}%`;
  if (previous?.enemyMeter !== hud.enemyMeter) $('enemy-meter').style.width = `${hud.enemyMeter}%`;
  const timer = hud.tutorial ? '∞' : String(hud.seconds);
  if ($('timer').textContent !== timer) $('timer').textContent = timer;
  const label = hud.tutorial ? (trainingFree ? 'TREINO LIVRE' : 'TUTORIAL') : hud.versus ? (playMode === 'versus-local' ? 'VERSUS LOCAL' : 'VERSUS ONLINE') : hud.bossPhase ? `CHEFÃO · FASE ${hud.bossPhase}` : `LUTA ${hud.round} / ${opponents.length}`;
  if ($('round-label').textContent !== label) $('round-label').textContent = label;
  if (hud.tutorial && (previous?.playerState !== hud.playerState || previous.inputLog !== hud.inputLog || !previous.tutorial)) renderInputDisplay(hud);
}

// Nomes de estado amigáveis para o painel de Input Display do modo treino.
const STATE_LABELS: Record<string, string> = {
  idle: 'PARADO', walk: 'ANDANDO', crouch: 'AGACHADO', jump: 'NO AR', attack: 'SOCO',
  kick: 'CHUTE', special: 'ESPECIAL', super: 'SUPER', guard: 'GUARDA', hurt: 'ATINGIDO', blockstun: 'BLOQUEANDO',
};

// Painel lateral do modo treino: últimas teclas pressionadas + estado atual da FSM.
function renderInputDisplay(hud: Hud | null): void {
  const log = $('input-display-log');
  const state = $('input-display-state');
  if (!log || !state) return;
  const keys = hud?.inputLog ?? [];
  log.innerHTML = keys.length ? keys.map(key => `<kbd>${key}</kbd>`).join('') : '<small>—</small>';
  state.textContent = hud ? (STATE_LABELS[hud.playerState] ?? hud.playerState.toUpperCase()) : '—';
}

// Resumo visual dos golpes básicos com os comandos correspondentes, gerado a
// partir de MOVE_SUMMARY + PLAYER_ONE_CONTROLS (nunca texto hardcoded de tecla).
function renderMoveSummary(): void {
  const holder = $('move-summary');
  if (!holder) return;
  holder.innerHTML = MOVE_SUMMARY.filter(entry => !entry.fighter || entry.fighter === selected || (entry.fighter === 'monteiro' && hasAdvancedCombat(selected))).map(entry => {
    const keys = entry.actions.map(action => `<kbd>${L(action)}</kbd>`).join('');
    return `<div class="move-summary-item"><strong>${entry.title}</strong><span class="move-summary-keys">${keys}</span><small>${entry.description}</small></div>`;
  }).join('');
}

// Legenda de controles (rodapé + dicas da tela de seleção) — sempre derivada
// de PLAYER_ONE_CONTROLS/ACTION_LABELS, nunca hardcoded no HTML.
const L2 = (action: ControlAction): string => labelFor(PLAYER_TWO_CONTROLS, action);
function renderTouchStrength(): void {
  const monteiro = hasAdvancedCombat(playMode === 'online-guest' ? guestFighter : selected);
  document.querySelectorAll<HTMLElement>('[data-monteiro-only]').forEach(button => button.classList.toggle('hidden', !monteiro));
  const actions = document.querySelector('.touch-actions');
  actions?.classList.toggle('monteiro-actions', monteiro);
  for (const [control, label] of [['attack', 'SOCO'], ['kick', 'CHUTE']]) {
    const button = document.querySelector<HTMLButtonElement>(`[data-control="${control}"]`);
    if (button) {
      button.innerHTML = monteiro ? `${label}<small>FRACO</small>` : label;
      button.setAttribute('aria-label', `${control === 'attack' ? 'Soco' : 'Chute'}${monteiro ? ' fraco' : ''}`);
    }
  }
}

function renderControlLegend(): void {
  const local2p = playMode === 'versus-local';
  const footer = document.getElementById('app-footer');
  if (footer) {
    const entries = [
      `${L('left')} / ${L('right')} MOVER`,
      `${L('jump')} PULAR`,
      `${L('attack')} ${ACTION_LABELS.attack.toUpperCase()}`,
      `${L('down')} + ${L('attack')} GANCHO`,
      `${L('kick')} ${ACTION_LABELS.kick.toUpperCase()}`,
      `${L('block')} ${ACTION_LABELS.block.toUpperCase()}`,
      `${L('special')} ${ACTION_LABELS.special.toUpperCase()}`,
      `${L('right')} + ${L('special')} VARIAÇÃO`,
      `${L('super')} ${ACTION_LABELS.super.toUpperCase()}`,
    ];
    if (hasAdvancedCombat(selected)) entries.push(`${L('heavyAttack')} SOCO FORTE`, `${L('heavyKick')} CHUTE FORTE`);
    if (gamepadConnected) entries.push('JOYSTICK · DIRECIONAL MOVER · A SOCO · B CHUTE · X/Y GOLPES FORTES · LB PODER · RB SUPER · START PAUSAR');
    if (local2p) {
      entries.push(
        `P2 · ${L2('left')} / ${L2('right')} MOVER`,
        `P2 · ${L2('jump')} PULAR`,
        `P2 · ${L2('attack')} ${ACTION_LABELS.attack.toUpperCase()}`,
        `P2 · ${L2('kick')} ${ACTION_LABELS.kick.toUpperCase()}`,
        `P2 · ${L2('block')} ${ACTION_LABELS.block.toUpperCase()}`,
        `P2 · ${L2('special')} ${ACTION_LABELS.special.toUpperCase()}`,
        `P2 · ${L2('super')} ${ACTION_LABELS.super.toUpperCase()}`,
      );
      if ((opponents[0] && hasAdvancedCombat(opponents[0]))) entries.push(`P2 · ${L2('heavyAttack')} SOCO FORTE`, `P2 · ${L2('heavyKick')} CHUTE FORTE`);
    }
    footer.innerHTML = entries.map(text => `<span>${text}</span>`).join('');
  }
  const specialHint = document.getElementById('profile-special-hint');
  const superHint = document.getElementById('profile-super-hint');
  if (specialHint) specialHint.innerHTML = `<kbd>${L('special')}</kbd> Poder`;
  if (superHint) superHint.innerHTML = `<kbd>${L('super')}</kbd> Super`;
  const pauseHint = document.getElementById('pause-controls-hint');
  if (pauseHint) {
    pauseHint.innerHTML = `${L('left')} ${L('right')} mover · ${L('jump')} pular · ${L('attack')} soco · ${L('kick')} chute · ${L('block')} defesa · ${L('special')} poder<br />`
      + `${L('down')} + ${L('attack')} gancho · direção + ${L('special')} variação · ${L('super')} super<br />`
      + (local2p
        ? `P2 (Player 2): ${L2('left')} ${L2('right')} mover · ${L2('jump')} pular · ${L2('attack')} soco · ${L2('kick')} chute · ${L2('block')} defesa · ${L2('special')} poder · ${L2('super')} super<br />`
        : '')
      + (hasAdvancedCombat(selected) || (local2p && (opponents[0] && hasAdvancedCombat(opponents[0])))
        ? `Lutadores avançados: ${hasAdvancedCombat(selected) ? L('attack') : L2('attack')} soco fraco · ${hasAdvancedCombat(selected) ? L('heavyAttack') : L2('heavyAttack')} soco forte · ${hasAdvancedCombat(selected) ? L('kick') : L2('kick')} chute fraco · ${hasAdvancedCombat(selected) ? L('heavyKick') : L2('heavyKick')} chute forte.<br />Dois toques para frente + segurar = corrida; dois para trás = dois recuos.<br />${hasAdvancedCombat(selected) ? L('jump') : L2('jump')} novamente no ar = pulo duplo; ${hasAdvancedCombat(selected) ? L('down') : L2('down')} + ${hasAdvancedCombat(selected) ? L('kick') : L2('kick')} = rasteira.<br />`
        : '')
      + 'No celular, use o direcional e os botões abaixo da arena.';
  }
}

function setNames(): void {
  $('player-name').textContent = fighters[selected].name.toUpperCase();
  $('enemy-name').textContent = fighters[opponents[round]].name.toUpperCase();
}

async function unlockAudio(): Promise<void> {
  const context = arena?.audioContext();
  if (context) await audio.unlock(context);
}

function activateAudio(playTitleCall = false): void {
  void unlockAudio().then(() => {
    if (screen === 'menu' || screen === 'selection' || screen === 'stage-select') audio.music('menu');
    else if (screen === null || screen === 'tutorial') audio.music(opponents[round] === 'yafa' ? 'boss' : 'battle');
    if (playTitleCall) audio.playTitleCall();
  }).catch(() => { /* Gameplay remains available if the browser blocks audio. */ });
}

function choose(id: FighterId): void {
  if (!arena) return;
  if (playMode === 'online-guest') {
    guestFighter = id;
    audio.sound('select');
    joinOnlineRoom(roomId);
    return;
  }
  if (playMode === 'online-host') {
    selected = id;
    audio.sound('select');
    renderCampaignRoute();
    show('stage-select');
    return;
  }
  if (playMode === 'versus-local') {
    if (versusLocalPhase === 1) {
      versusLocalP1 = id;
      versusLocalPhase = 2;
      audio.sound('select');
      openSelection('versus-local');
      return;
    }
    selected = versusLocalP1;
    opponents = [id];
    round = 0;
    score = 0;
    versusLocalPhase = 1;
    audio.sound('select');
    renderCampaignRoute();
    show('stage-select');
    return;
  }
  selected = id;
  opponents = [...pickOpponents(id), 'yafa'];
  round = 0;
  score = 0;
  audio.sound('select');
  renderCampaignRoute();
  show('stage-select');
}

function renderCampaignRoute(): void {
  const route = $('campaign-route');
  const track = $('opponent-track');
  track.replaceChildren();
  if (playMode !== 'arcade' || trainingOnly) { route.classList.add('hidden'); return; }
  route.classList.remove('hidden');
  opponents.forEach((id, index) => {
    const def = fighters[id];
    const stop = document.createElement('div');
    stop.className = `route-stop${id === 'yafa' ? ' boss' : ''}`;
    stop.setAttribute('aria-label', `Luta ${index + 1}: ${def.name}`);
    const image = document.createElement('img');
    image.src = def.portraitSource;
    image.alt = '';
    const name = document.createElement('strong');
    name.textContent = def.name;
    const label = document.createElement('small');
    label.textContent = id === 'yafa' ? 'CHEFÃO FINAL' : `LUTA ${index + 1} · ${def.codename}`;
    stop.append(image, name, label);
    track.append(stop);
  });
}

function renderStages(): void {
  const holder = $('stage-grid');
  holder.replaceChildren();
  for (const stage of stages) {
    const card = document.createElement('button');
    card.className = 'stage-card';
    const image = document.createElement('img');
    image.src = stage.art;
    image.alt = stage.name;
    const name = document.createElement('strong');
    name.textContent = stage.name;
    const detail = document.createElement('span');
    detail.textContent = stage.detail;
    card.append(image, name, detail);
    card.addEventListener('click', () => chooseStage(stage.id));
    holder.append(card);
  }
}

function chooseStage(stage: StageId): void {
  selectedStage = stage;
  arena?.setStage(stage);
  audio.sound('select');
  if (playMode === 'online-host') createOnlineRoom();
  else if (trainingOnly) startTraining(localStorage.getItem('caf-tutorial') !== 'done');
  else if (playMode === 'arcade' && localStorage.getItem('caf-tutorial') !== 'done') startTutorial();
  else startFight();
}

function startTraining(guided: boolean): void {
  if (!arena) return;
  window.clearTimeout(trainingUiTimer);
  trainingIndex = 0;
  trainingFree = !guided;
  setNames();
  $('enemy-name').textContent = `DUMMY · ${fighters[opponents[0]].name.toUpperCase()}`;
  arena.startRound(selected, opponents[0], 1, true);
  audio.music('battle');
  show('tutorial');
  $('input-display').classList.add('hidden');
  $('training-input-toggle').textContent = 'INPUT: OFF';
  $('training-input-toggle').setAttribute('aria-pressed', 'false');
  closeTrainingDrawers();
  renderMoveSummary();
  if (guided) setTutorialText();
  else showFreeTraining(false);
}

function startTutorial(): void { startTraining(true); }

function closeTrainingDrawers(): void {
  $('training-command-panel').classList.add('hidden');
  $('training-dummy-panel').classList.add('hidden');
  $('training-options-panel').classList.add('hidden');
  $('training-commands').setAttribute('aria-expanded', 'false');
  $('training-dummy').setAttribute('aria-expanded', 'false');
  $('training-options').setAttribute('aria-expanded', 'false');
}

function toggleTrainingDrawer(name: 'commands' | 'dummy' | 'options'): void {
  if (screen !== 'tutorial' || !trainingFree) return;
  const panel = $(`training-${name === 'commands' ? 'command' : name}-panel`);
  const wasOpen = !panel.classList.contains('hidden');
  closeTrainingDrawers();
  panel.classList.toggle('hidden', wasOpen);
  $(`training-${name}`).setAttribute('aria-expanded', String(!wasOpen));
}

function setTutorialText(activateStep = true): void {
  if (screen !== 'tutorial' || trainingFree) return;
  const step = steps[trainingIndex];
  const touchInstructions: Record<string, { copy: string; keys: string[] }> = {
    move: { copy: 'Segure ◀ ou ▶ para se mover.', keys: ['◀', '▶'] },
    crouch: { copy: 'Segure ↓ para agachar.', keys: ['↓'] },
    jump: { copy: 'Toque ↑ para pular.', keys: ['↑'] },
    weakAttack: { copy: 'Aproxime-se e toque SOCO.', keys: ['SOCO'] },
    strongAttack: { copy: 'Toque SOCO FORTE para causar mais dano.', keys: ['SOCO FORTE'] },
    kick: { copy: 'Toque CHUTE para atacar com as pernas.', keys: ['CHUTE'] },
    sweep: { copy: 'Segure ↓ e toque CHUTE para derrubar.', keys: ['↓', 'CHUTE'] },
    block: { copy: 'Segure DEFESA para bloquear o ataque do rival.', keys: ['DEFESA'] },
    special: { copy: 'Toque PODER para usar sua habilidade.', keys: ['PODER'] },
    combo: { copy: 'Toque SOCO duas vezes em sequência.', keys: ['SOCO', 'SOCO'] },
    super: { copy: 'Com a barra cheia, toque ESPECIAL.', keys: ['ESPECIAL'] },
  };
  const instruction = controlsVisible ? touchInstructions[step.action] : null;
  $('tutorial-panel').classList.remove('hidden', 'is-complete');
  $('tutorial-count').textContent = `${String(trainingIndex + 1).padStart(2, '0')}/${steps.length}`;
  $('tutorial-title').textContent = step.title;
  $('tutorial-copy').textContent = (instruction?.copy ?? step.copy())
    + (hasAdvancedCombat(selected) && step.action === 'jump' ? ` Toque ${controlsVisible ? '↑' : L('jump')} novamente no ar para o pulo duplo.` : '');
  $('tutorial-keys').innerHTML = (instruction?.keys ?? step.keys.map(action => L(action))).map(key => `<kbd>${key}</kbd>`).join('');
  $('tutorial-progress-bar').style.width = `${trainingIndex / steps.length * 100}%`;
  $('training-mode-label').textContent = 'TUTORIAL GUIADO';
  $('skip-tutorial').classList.remove('hidden');
  $('free-training-tools').classList.add('hidden');
  $('training-diagnostic').classList.add('hidden');
  if (activateStep) arena?.setTrainingStep(step.action);
}

function showFreeTraining(completed: boolean): void {
  trainingFree = true;
  window.clearTimeout(trainingUiTimer);
  $('tutorial-panel').classList.add('hidden');
  $('training-mode-label').textContent = 'TREINO LIVRE';
  $('skip-tutorial').classList.add('hidden');
  $('free-training-tools').classList.remove('hidden');
  $('training-diagnostic').classList.toggle('hidden', !completed);
  if (completed) trainingUiTimer = window.setTimeout(() => $('training-diagnostic').classList.add('hidden'), 2400);
  closeTrainingDrawers();
  $<HTMLSelectElement>('training-dummy-mode').value = 'idle';
  $('training-dummy').textContent = 'DUMMY: PARADO';
  arena?.setTrainingStep('free');
  arena?.setDummyMode('idle');
  if (!completed) arena?.resetTraining();
  arena?.setUiPaused(false);
}

function completeTraining(action: string): void {
  if (screen !== 'tutorial' || trainingFree || steps[trainingIndex]?.action !== action) return;
  $('tutorial-panel').classList.add('is-complete');
  trainingIndex++;
  audio.sound('select');
  if (trainingIndex >= steps.length) {
    localStorage.setItem('caf-tutorial', 'done');
    showFreeTraining(true);
  } else {
    window.clearTimeout(trainingUiTimer);
    trainingUiTimer = window.setTimeout(() => setTutorialText(), 340);
  }
}

function startFight(): void {
  if (!arena) return;
  window.clearTimeout(trainingUiTimer);
  trainingOnly = false;
  closeTrainingDrawers();
  ($('result-primary') as HTMLButtonElement).disabled = false;
  setNames();
  arena.setOnlineRemote(playMode === 'online-host');
  arena.startRound(selected, opponents[round], round + 1, false, playMode !== 'arcade');
  audio.music(opponents[round] === 'yafa' ? 'boss' : 'battle');
  show(null);
  if (playMode === 'online-host' && roomConnection?.open) roomConnection.send({ type: 'start', host: selected, guest: opponents[round], stage: selectedStage });
}

function showResult(result: 'player' | 'enemy' | 'draw'): void {
  if (screen === 'tutorial') return;
  const winnerId = result === 'player' ? selected : result === 'enemy' ? opponents[round] : null;
  const winnerName = winnerId ? fighters[winnerId].name.toUpperCase() : '';
  if (playMode !== 'arcade') {
    $('result-tag').textContent = 'CINCO MINUTOS SEM PERDER A AMIZADE';
    $('result-title').textContent = result === 'draw' ? 'EMPATE!' : `${winnerName} VENCEU!`;
    $('result-copy').textContent = 'Diferenças acertadas. A colaboração continua!';
    $('result-primary').textContent = playMode === 'online-guest' ? 'AGUARDANDO PLAYER 1' : 'REVANCHE';
    $('result-bonus').textContent = '';
    ($('result-primary') as HTMLButtonElement).onclick = startFight;
    ($('result-primary') as HTMLButtonElement).disabled = playMode === 'online-guest';
    audio.jingle(result === 'player');
    show('result');
    if (playMode === 'online-host' && roomConnection?.open) roomConnection.send({ type: 'result', result });
    return;
  }
  const finalWin = result === 'player' && round === opponents.length - 1;
  const boss = opponents[round] === 'yafa';
  if (result === 'player') score += 500 + Math.max(0, Math.round((latestHud?.seconds ?? 0) * 20)) + Math.round((latestHud?.player ?? 0) * 10);
  $('result-tag').textContent = finalWin ? 'CONTRATO FECHADO' : result === 'player' ? `LUTA ${round + 1} VENCIDA` : boss ? 'CONTRATO EM RISCO' : result === 'draw' ? 'EMPATE' : 'AINDA NÃO ACABOU';
  $('result-title').textContent = finalWin ? 'A EQUIPE SALVOU O CONTRATO!' : result === 'player' ? `${winnerName} VENCEU!` : boss ? 'QUASE FECHAMOS O CONTRATO!' : result === 'draw' ? 'MAIS UMA RODADA!' : 'TENTE OUTRA VEZ!';
  $('result-copy').textContent = finalWin ? 'Os Binários fecharam juntos. Amanhã todo mundo volta a ser amigo.' : result === 'player' ? `${fighters[opponents[round]].name} caiu na arena. O próximo desafio espera.` : boss ? 'A Yafa protegeu a apólice. Respira e tenta de novo.' : 'Todo bom plano merece uma segunda tentativa.';
  $('result-primary').textContent = finalWin ? 'ESCOLHER OUTRO LUTADOR' : result === 'player' ? 'PRÓXIMA LUTA' : 'REPETIR LUTA';
  $('result-bonus').textContent = result === 'player' ? `BÔNUS DA RODADA · TEMPO ${latestHud?.seconds ?? 0}s · TOTAL ${score.toLocaleString('pt-BR')} PONTOS` : `TOTAL ${score.toLocaleString('pt-BR')} PONTOS`;
  ($('result-primary') as HTMLButtonElement).onclick = () => {
    if (finalWin) { audio.music('menu'); arena?.showMenuBackground(); show('selection'); }
    else { if (result === 'player') round++; startFight(); }
  };
  audio.jingle(result === 'player');
  show('result');
}

function roomMessage(title: string, status: string): void {
  $('room-title').textContent = title;
  $('room-status').textContent = status;
  show('online-room');
}

function leaveOnlineRoom(): void {
  roomLoadId++;
  roomStarted = false;
  roomMedia?.close();
  stopRoomStream();
  roomConnection?.close();
  roomPeer?.destroy();
  roomMedia = null;
  roomConnection = null;
  roomPeer = null;
  roomId = '';
  guestHeld.clear();
  const video = $<HTMLVideoElement>('remote-video');
  video.pause();
  video.srcObject = null;
  video.classList.add('hidden');
  arena?.setOnlineRemote(false);
  if (new URLSearchParams(location.search).has('room')) history.replaceState(null, '', location.pathname);
  playMode = 'arcade';
}

function stopRoomStream(): void {
  roomStream?.getTracks().forEach(track => track.stop());
  roomStream = null;
}

async function loadRoomPeer(id?: string): Promise<Peer | null> {
  const request = ++roomLoadId;
  try {
    const { default: Peer } = await import('peerjs');
    if (request !== roomLoadId) return null;
    return roomPeer = id ? new Peer(id) : new Peer();
  } catch {
    if (request === roomLoadId) roomMessage('CONEXÃO FALHOU', 'Não foi possível carregar a conexão online. Confira a internet e tente novamente.');
    return null;
  }
}

async function createOnlineRoom(): Promise<void> {
  if (!arena || !('RTCPeerConnection' in window) || !('captureStream' in game.canvas)) {
    roomMessage('SALA INDISPONÍVEL', 'Este navegador não permite partidas online. Tente Chrome, Edge ou Firefox atualizado.');
    return;
  }
  roomMessage('CRIANDO SALA...', 'Conectando à rede.');
  $('room-share').classList.add('hidden');
  roomId = `caf-${crypto.randomUUID()}`;
  const peer = await loadRoomPeer(roomId);
  if (!peer) return;
  peer.on('open', id => {
    if (roomPeer !== peer) return;
    const link = new URL(location.href);
    link.searchParams.set('room', id);
    link.hash = '';
    $<HTMLInputElement>('room-link').value = link.toString();
    $('room-share').classList.remove('hidden');
    roomMessage(`SALA ${id.slice(4, 10).toUpperCase()}`, 'Você é o Player 1. Aguardando o Player 2 entrar pelo link.');
  });
  peer.on('connection', connection => {
    if (roomPeer !== peer) { connection.close(); return; }
    if (roomConnection && roomConnection !== connection) { connection.close(); return; }
    roomConnection = connection;
    connection.on('open', () => {
      if (roomConnection !== connection) return;
      $('room-status').textContent = 'Player 2 entrou. Aguardando a escolha do lutador.';
    });
    connection.on('data', raw => {
      if (roomConnection !== connection || !raw || typeof raw !== 'object') return;
      const message = raw as Record<string, unknown>;
      if (message.type === 'join' && !roomStarted) {
        const fighter = roster.find(def => def.id === message.fighter)?.id;
        if (!fighter) return;
        opponents = [fighter];
        round = 0;
        roomStarted = true;
        startFight();
        try {
          stopRoomStream();
          roomStream = game.canvas.captureStream(30);
          roomMedia = peer.call(connection.peer, roomStream);
          roomMedia.on('error', () => { $('room-status').textContent = 'A transmissão falhou. Saia da sala e tente novamente.'; });
        } catch {
          stopRoomStream();
          roomMessage('TRANSMISSÃO INDISPONÍVEL', 'Não foi possível transmitir a arena. Saia da sala e tente novamente.');
        }
      } else if (message.type === 'control' && roomStarted && validControls.has(message.control as Control) && typeof message.pressed === 'boolean') {
        arena?.setRemoteControl(message.control as Control, message.pressed);
      }
    });
    connection.on('close', () => {
      if (roomConnection !== connection || playMode !== 'online-host') return;
      roomConnection = null;
      roomMedia?.close();
      stopRoomStream();
      roomMedia = null;
      roomStarted = false;
      arena?.showMenuBackground();
      audio.music('menu');
      roomMessage('PLAYER 2 SAIU', 'A sala continua aberta. Envie o mesmo link para reconectar.');
    });
  });
  peer.on('error', () => {
    if (roomPeer === peer) roomMessage('SALA INDISPONÍVEL', 'A conexão não abriu. Confira a internet e tente criar outra sala.');
  });
}

async function joinOnlineRoom(id: string): Promise<void> {
  if (!/^caf-[0-9a-f-]{36}$/.test(id) || !('RTCPeerConnection' in window)) {
    roomMessage('LINK INVÁLIDO', 'Peça ao Player 1 um novo link de convite.');
    return;
  }
  activateAudio();
  roomMessage('ENTRANDO NA SALA...', 'Conectando ao Player 1.');
  $('room-share').classList.add('hidden');
  const peer = await loadRoomPeer();
  if (!peer) return;
  peer.on('open', () => {
    if (roomPeer !== peer) return;
    const connection = peer.connect(id, { serialization: 'json', reliable: true });
    roomConnection = connection;
    connection.on('open', () => {
      if (roomConnection !== connection) return;
      connection.send({ type: 'join', fighter: guestFighter });
      roomMessage('AGUARDANDO PLAYER 1', 'A luta vai começar assim que a arena estiver pronta.');
    });
    connection.on('data', raw => {
      if (roomConnection !== connection || !raw || typeof raw !== 'object') return;
      const message = raw as Record<string, unknown>;
      if (message.type === 'start') {
        const host = roster.find(def => def.id === message.host)?.id;
        const guest = roster.find(def => def.id === message.guest)?.id;
        if (!host || !guest) return;
        selected = host;
        opponents = [guest];
        round = 0;
        selectedStage = isStageId(message.stage) ? message.stage : 'office';
        setNames();
        audio.music('battle');
        show(null);
      } else if (message.type === 'hud' && message.hud && typeof message.hud === 'object') {
        renderHud(message.hud as Hud);
      } else if (message.type === 'toast' && typeof message.quip === 'string') {
        showToast(message.quip);
      } else if (message.type === 'result' && ['player', 'enemy', 'draw'].includes(String(message.result))) {
        showResult(message.result as 'player' | 'enemy' | 'draw');
      } else if (message.type === 'pause') {
        if (message.paused) roomMessage('LUTA PAUSADA', 'O Player 1 pausou. Aguardando a volta.');
        else show(null);
      }
    });
    connection.on('close', () => {
      if (roomConnection !== connection || playMode !== 'online-guest') return;
      $<HTMLVideoElement>('remote-video').classList.add('hidden');
      audio.music('none');
      roomMessage('SALA ENCERRADA', 'A conexão com o Player 1 terminou. Peça um novo link ou volte ao menu.');
    });
    connection.on('error', () => roomMessage('CONEXÃO FALHOU', 'Não foi possível entrar. Confira o link e tente novamente.'));
  });
  peer.on('call', call => {
    if (roomPeer !== peer || call.peer !== id) { call.close(); return; }
    roomMedia = call;
    call.answer();
    call.on('stream', stream => {
      const video = $<HTMLVideoElement>('remote-video');
      video.srcObject = stream;
      video.classList.remove('hidden');
      void video.play().catch(() => roomMessage('TOQUE PARA ASSISTIR', 'O navegador bloqueou a reprodução. Toque na arena para continuar.'));
    });
    call.on('close', () => {
      if (playMode === 'online-guest' && roomConnection?.open) roomMessage('IMAGEM INTERROMPIDA', 'A transmissão parou. Peça ao Player 1 para criar outra sala.');
    });
  });
  peer.on('error', () => {
    if (roomPeer === peer) roomMessage('CONEXÃO FALHOU', 'Esta sala não está disponível. Confira o link ou peça um novo convite.');
  });
}

function sendGuestControl(control: Control, pressed: boolean): void {
  if (playMode !== 'online-guest' || !roomConnection?.open) return;
  if (pressed && screen !== null) return;
  if (guestHeld.has(control) === pressed) return;
  if (pressed) guestHeld.add(control);
  else guestHeld.delete(control);
  roomConnection.send({ type: 'control', control, pressed });
}

function menu(): void {
  window.clearTimeout(trainingUiTimer);
  pausedFromTraining = false;
  if (playMode.startsWith('online-')) leaveOnlineRoom();
  if (playMode === 'versus-local') playMode = 'arcade';
  trainingOnly = false;
  closeTrainingDrawers();
  arena?.showMenuBackground();
  audio.music('menu');
  renderControlLegend();
  show('menu');
  closeMenuModes(false);
}

function openSelection(mode: PlayMode, trainingEntry = false): void {
  playMode = mode;
  trainingOnly = trainingEntry;
  $('stage-select-kicker').textContent = trainingEntry ? 'SALA DE TREINAMENTO' : 'MAPA DO CIRCUITO BBS';
  $('stage-select-title').textContent = trainingEntry ? 'ESCOLHA O CENÁRIO DE TREINO' : 'ESCOLHA A ARENA';
  $('selection-heading').textContent = trainingEntry ? 'ESCOLHA SEU LUTADOR DE TREINO' : mode === 'online-host' ? 'ESCOLHA O PLAYER 1' : mode === 'online-guest' ? 'ESCOLHA O PLAYER 2' : mode === 'versus-local' ? (versusLocalPhase === 1 ? 'PLAYER 1: ESCOLHA SEU LUTADOR' : 'PLAYER 2: ESCOLHA SEU LUTADOR') : 'QUEM VAI PARA A ARENA?';
  $('selection-hint').textContent = mode === 'online-host' ? 'ESCOLHA E CONFIRME O PLAYER 1' : mode === 'online-guest' ? 'ESCOLHA E CONFIRME O PLAYER 2' : mode === 'versus-local' ? (versusLocalPhase === 1 ? 'PLAYER 1, SELECIONE E CONFIRME (MESMO TECLADO)' : 'PLAYER 2, SELECIONE E CONFIRME (MESMO TECLADO)') : 'SELECIONE E CONFIRME SEU LUTADOR';
  highlightedFighter = mode === 'online-guest' ? guestFighter : mode === 'versus-local' && versusLocalPhase === 2 ? (versusLocalP1 === 'kalliane' ? 'caio' : 'kalliane') : selected;
  const marker = document.getElementById('selection-player-marker');
  if (marker) marker.textContent = mode === 'online-guest' || (mode === 'versus-local' && versusLocalPhase === 2) ? '2P' : '1P';
  audio.music('menu');
  renderRoster();
  renderControlLegend();
  show('selection');
}

function showToast(fromHost?: string): void {
  const toast = $('adalberto-toast');
  const quip = fromHost && toastQuips.includes(fromHost) ? fromHost : toastQuips[toastQuipIndex++ % toastQuips.length];
  $('toast-quip').textContent = quip;
  toast.setAttribute('aria-label', `Toaaast! ${quip}`);
  window.clearTimeout(toastTimer);
  toast.classList.remove('active');
  void toast.offsetWidth;
  toast.classList.add('active');
  if (playMode === 'online-host' && roomConnection?.open) roomConnection.send({ type: 'toast', quip });
  toastTimer = window.setTimeout(() => toast.classList.remove('active'), 1700);
}

function announcePhase(phase: number): void {
  const banner = $('phase-banner');
  banner.textContent = phase === 2 ? 'FASE 2 · COBERTURA TOTAL!' : '';
  banner.classList.add('active');
  window.setTimeout(() => banner.classList.remove('active'), 1700);
}

function pause(): void {
  if (screen !== null && screen !== 'tutorial') return;
  if (playMode === 'online-guest') { menu(); return; }
  pausedFromTraining = screen === 'tutorial';
  arena?.setUiPaused(true);
  audio.music('none');
  renderControlLegend();
  show('pause');
  if (playMode === 'online-host' && roomConnection?.open) roomConnection.send({ type: 'pause', paused: true });
}

function resume(): void {
  arena?.setUiPaused(false);
  audio.music(pausedFromTraining ? 'battle' : opponents[round] === 'yafa' ? 'boss' : 'battle');
  show(pausedFromTraining ? 'tutorial' : null);
  pausedFromTraining = false;
  if (playMode === 'online-host' && roomConnection?.open) roomConnection.send({ type: 'pause', paused: false });
}

function openSettings(): void {
  if (screen === 'settings') return;
  settingsReturn = screen;
  if (screen === null || screen === 'tutorial') { arena?.setUiPaused(true); audio.music('none'); }
  ($('music-volume') as HTMLInputElement).value = String(Math.round(audio.musicVolume * 100));
  ($('effects-volume') as HTMLInputElement).value = String(Math.round(audio.effectsVolume * 100));
  show('settings');
}

function closeSettings(): void {
  show(settingsReturn);
  if (settingsReturn === null) resume();
  else if (settingsReturn === 'tutorial') { arena?.setUiPaused(false); audio.music('battle'); }
  else if (settingsReturn === 'menu' || settingsReturn === 'selection') audio.music('menu');
}

function updateSoundLabel(): void { $('sound-toggle').textContent = audio.muted ? '♫ SOM OFF' : '♫ SOM ON'; $('sound-toggle').classList.toggle('active', !audio.muted); }

const playButton = $('play-button') as HTMLButtonElement;
const arcadeButton = $('menu-arcade') as HTMLButtonElement;
const onlineButton = $('menu-online') as HTMLButtonElement;
const versusLocalButton = $('menu-versus-local') as HTMLButtonElement;
playButton.disabled = true;
arcadeButton.disabled = true;
onlineButton.disabled = true;
versusLocalButton.disabled = true;
playButton.textContent = 'CARREGANDO ARENA...';

function openMenuModes(): void {
  $('menu').classList.add('is-choosing');
  $('menu-mode-panel').classList.remove('hidden');
  playButton.setAttribute('aria-expanded', 'true');
  arcadeButton.focus({ preventScroll: true });
}

function closeMenuModes(restoreFocus = true): void {
  $('menu').classList.remove('is-choosing');
  $('menu-mode-panel').classList.add('hidden');
  playButton.setAttribute('aria-expanded', 'false');
  if (restoreFocus) playButton.focus({ preventScroll: true });
}

// Browsers block audio until the page has a user gesture, so the title-screen BGM can't
// truly autoplay on load — instead we grab the very first interaction anywhere on the
// page (click, key press, or touch/pointer down) and use that to unlock audio and start
// the menu theme immediately, rather than waiting specifically for a menu button click.
let menuMusicStarted = false;
function startMenuMusicAsap(): void {
  if (menuMusicStarted) return;
  const context = arena?.audioContext();
  if (!context) return; // Arena not ready yet; will retry on the next interaction.
  menuMusicStarted = true;
  void audio.unlock(context).then(() => {
    if (screen === 'menu' || screen === 'selection' || screen === 'stage-select') audio.music('menu');
  }).catch(() => { menuMusicStarted = false; });
}
const firstInteractionEvents: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'click'];
const onFirstInteraction = () => {
  startMenuMusicAsap();
  firstInteractionEvents.forEach(type => window.removeEventListener(type, onFirstInteraction));
};
firstInteractionEvents.forEach(type => window.addEventListener(type, onFirstInteraction, { once: true }));

window.addEventListener('ctrl-alt-fighter-ready', () => {
  arena = game.scene.getScene('Arena') as ArenaScene;
  arena.audio = audio;
  arena.callbacks = { hud: renderHud, result: showResult, training: completeTraining, toast: showToast, phase: announcePhase };
  playButton.disabled = false;
  arcadeButton.disabled = false;
  onlineButton.disabled = false;
  versusLocalButton.disabled = false;
  playButton.textContent = '▶ JOGAR';
  arena.showMenuBackground();
  // In case the user already interacted with the page while the arena was still loading.
  startMenuMusicAsap();
  const invite = new URLSearchParams(location.search).get('room');
  if (invite) { roomId = invite; openSelection('online-guest'); }
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'stage',
  width: 960,
  height: 540,
  backgroundColor: '#081225',
  pixelArt: true,
  // A simulação já usa 60 Hz; evita desenhar quadros extras em telas 120/144 Hz.
  fps: { target: 60, limit: 60 },
  roundPixels: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [ArenaScene],
});

playButton.addEventListener('click', () => { activateAudio(true); openMenuModes(); });
arcadeButton.addEventListener('click', () => { activateAudio(); openSelection('arcade'); });
$('menu-back').addEventListener('click', () => closeMenuModes());
$('menu-tutorial').addEventListener('click', () => { activateAudio(); openSelection('arcade', true); });
$('menu-online').addEventListener('click', () => { activateAudio(); openSelection('online-host'); });
$('menu-versus-local').addEventListener('click', () => { activateAudio(); versusLocalPhase = 1; openSelection('versus-local'); });
$('controls-toggle').addEventListener('click', () => {
  controlsManuallyToggled = true;
  controlsVisible = !controlsVisible;
  const inArena = screen === null || screen === 'tutorial';
  $('touch-controls').classList.toggle('hidden', !inArena || !controlsVisible);
  $('controls-toggle').setAttribute('aria-pressed', String(controlsVisible));
  $('controls-toggle').setAttribute('aria-label', controlsVisible ? 'Ocultar controles na tela' : 'Mostrar controles na tela');
  $('controls-toggle').classList.toggle('active', controlsVisible);
  if (screen === 'tutorial') setTutorialText(false);
});
$('room-back').addEventListener('click', menu);
$('copy-room').addEventListener('click', async () => {
  const link = $<HTMLInputElement>('room-link');
  try { await navigator.clipboard.writeText(link.value); }
  catch { link.select(); document.execCommand('copy'); }
  $('copy-room').textContent = 'LINK COPIADO!';
  window.setTimeout(() => { $('copy-room').textContent = 'COPIAR LINK'; }, 1600);
});
renderStages();
$('stage-back').addEventListener('click', () => show('selection'));
$('difficulty').addEventListener('change', () => arena?.setDifficulty(Number(($('difficulty') as HTMLSelectElement).value)));
document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button => {
  const control = button.dataset.control as Control;
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    if (playMode === 'online-guest') sendGuestControl(control, true);
    else arena?.setVirtualControl(control, true);
    button.classList.add('pressed');
  });
  const release = () => { if (playMode === 'online-guest') sendGuestControl(control, false); else arena?.setVirtualControl(control, false); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});
$('selection-back').addEventListener('click', menu);
$('confirm-fighter').addEventListener('click', () => choose(highlightedFighter));
$('skip-tutorial').addEventListener('click', () => { if (screen === 'tutorial' && !trainingFree) showFreeTraining(false); });
$('training-commands').addEventListener('click', () => toggleTrainingDrawer('commands'));
$('training-dummy').addEventListener('click', () => toggleTrainingDrawer('dummy'));
$('training-options').addEventListener('click', () => toggleTrainingDrawer('options'));
$('training-commands-close').addEventListener('click', closeTrainingDrawers);
$('training-dummy-close').addEventListener('click', closeTrainingDrawers);
$('training-options-close').addEventListener('click', closeTrainingDrawers);
$('training-dummy-mode').addEventListener('change', () => {
  const mode = $<HTMLSelectElement>('training-dummy-mode').value as TrainingDummyMode;
  arena?.setDummyMode(mode);
  $('training-dummy').textContent = mode === 'guard' ? 'DUMMY: DEFESA' : mode === 'attack' ? 'DUMMY: ATAQUE' : 'DUMMY: PARADO';
});
$('training-reset').addEventListener('click', () => arena?.resetTraining());
$('training-input-toggle').addEventListener('click', () => {
  const hidden = $('input-display').classList.toggle('hidden');
  $('training-input-toggle').textContent = hidden ? 'INPUT: OFF' : 'INPUT: ON';
  $('training-input-toggle').setAttribute('aria-pressed', String(!hidden));
  if (!hidden) renderInputDisplay(latestHud);
});
$('training-repeat').addEventListener('click', startTutorial);
$('training-tournament').addEventListener('click', startFight);
$('training-exit').addEventListener('click', menu);
$('result-menu').addEventListener('click', menu);
$('pause-button').addEventListener('click', pause);
$('help-button').addEventListener('click', pause);
$('resume-button').addEventListener('click', resume);
$('pause-menu').addEventListener('click', menu);
$('settings-button').addEventListener('click', openSettings);
$('menu-options').addEventListener('click', () => { activateAudio(); openSettings(); });
$('settings-close').addEventListener('click', closeSettings);
$('sound-toggle').addEventListener('click', async () => { await unlockAudio(); audio.setLevels(audio.musicVolume, audio.effectsVolume, !audio.muted); updateSoundLabel(); });
for (const id of ['music-volume', 'effects-volume']) $(id).addEventListener('input', () => { audio.setLevels(Number(($('music-volume') as HTMLInputElement).value) / 100, Number(($('effects-volume') as HTMLInputElement).value) / 100, audio.muted); });
// Gerado a partir de GUEST_CONTROLS (src/config/controls.ts) em vez de hardcoded,
// então o guest ganha automaticamente qualquer ação nova adicionada à config (ex: super).
const guestKeys: Record<string, Control> = Object.fromEntries(CONTROL_ACTIONS.map(action => [codeFor(GUEST_CONTROLS, action), action])) as Record<string, Control>;
window.addEventListener('keydown', event => {
  if (event.code === 'Escape' && screen === 'menu' && !$('menu-mode-panel').classList.contains('hidden')) {
    event.preventDefault();
    closeMenuModes();
    return;
  }
  if (screen === 'selection') {
    const current = Math.max(0, roster.findIndex(def => def.id === highlightedFighter));
    const moves: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    const delta = moves[event.code];
    if (delta !== undefined) {
      event.preventDefault();
      const next = Math.min(roster.length - 1, Math.max(0, current + delta));
      updateSelectionPreview(roster[next].id);
      document.querySelector<HTMLButtonElement>(`.fighter-card[data-fighter="${roster[next].id}"]`)?.focus();
      return;
    }
    if (event.code === 'Enter' && document.activeElement?.id !== 'confirm-fighter') {
      event.preventDefault();
      choose(highlightedFighter);
      return;
    }
  }
  if (event.code === 'Escape') {
    if (screen === null || screen === 'tutorial') {
      if (screen === 'tutorial' && (!$('training-command-panel').classList.contains('hidden') || !$('training-dummy-panel').classList.contains('hidden') || !$('training-options-panel').classList.contains('hidden'))) closeTrainingDrawers();
      else pause();
    } else if (screen === 'pause') resume();
  }
  const control = guestKeys[event.code];
  if (playMode === 'online-guest' && control) { event.preventDefault(); if (!event.repeat) sendGuestControl(control, true); }
});
window.addEventListener('keyup', event => { const control = guestKeys[event.code]; if (playMode === 'online-guest' && control) sendGuestControl(control, false); });

// Polling via the browser Gamepad API keeps the controls working with standard
// USB/Xbox pads without a third-party library. Button edges are sent to the
// same virtual-control path used by touch controls, so combat stays identical.
let gamepadHeld = new Set<ControlAction>();
let gamepadSent = new Set<ControlAction>();
let gamepadUi = { confirm: false, back: false, start: false };
let navRepeatAt = 0;
let navHeld = '';
let gamepadHintShown = false;

function gamepadDirection(actions: Set<ControlAction>): string {
  if (actions.has('left')) return 'left';
  if (actions.has('right')) return 'right';
  if (actions.has('jump')) return 'up';
  if (actions.has('down')) return 'down';
  return '';
}

function navigateWithGamepad(direction: string, now: number): void {
  if (!direction) { navHeld = ''; return; }
  if (direction === navHeld && now < navRepeatAt) return;
  navHeld = direction;
  navRepeatAt = now + 210;
  if (screen === 'selection') {
    const current = Math.max(0, roster.findIndex(def => def.id === highlightedFighter));
    const delta = direction === 'left' ? -1 : direction === 'right' ? 1 : direction === 'up' ? -3 : 3;
    const next = Math.min(roster.length - 1, Math.max(0, current + delta));
    updateSelectionPreview(roster[next].id);
    document.querySelector<HTMLButtonElement>(`.fighter-card[data-fighter="${roster[next].id}"]`)?.focus();
  } else if (screen === 'stage-select') {
    const cards = Array.from(document.querySelectorAll<HTMLButtonElement>('#stage-grid .stage-card'));
    if (!cards.length) return;
    const current = Math.max(0, cards.indexOf(document.activeElement as HTMLButtonElement));
    const delta = direction === 'left' ? -1 : direction === 'right' ? 1 : direction === 'up' ? -3 : 3;
    cards[Math.min(cards.length - 1, Math.max(0, current + delta))].focus();
  } else if (screen === 'menu') {
    const scope = $('menu-mode-panel').classList.contains('hidden') ? $('menu') : $('menu-mode-panel');
    const buttons = Array.from(scope.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not(.hidden)'));
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = direction === 'left' || direction === 'up' ? -1 : 1;
    buttons[(current < 0 ? 0 : (current + step + buttons.length) % buttons.length)].focus();
  }
}

function activateGamepadUi(confirm: boolean, back: boolean, start: boolean): void {
  if (screen === 'menu') {
    if (back && !$('menu-mode-panel').classList.contains('hidden')) { closeMenuModes(); return; }
    if (confirm || start) {
      if ($('menu-mode-panel').classList.contains('hidden')) playButton.click();
      else {
        const focused = document.activeElement instanceof HTMLButtonElement ? document.activeElement : arcadeButton;
        focused.click();
      }
    }
  } else if (screen === 'selection') {
    if (back) $('selection-back').click();
    else if (confirm) choose(highlightedFighter);
  } else if (screen === 'stage-select') {
    if (back) $('stage-back').click();
    else if (confirm) {
      const focused = document.activeElement instanceof HTMLButtonElement && document.activeElement.classList.contains('stage-card')
        ? document.activeElement : document.querySelector<HTMLButtonElement>('#stage-grid .stage-card');
      focused?.click();
    }
  } else if (screen === 'pause') {
    if (back) $('pause-menu').click();
    else if (confirm || start) $('resume-button').click();
  } else if (screen === 'result') {
    if (back) $('result-menu').click();
    else if (confirm || start) $('result-primary').click();
  } else if (screen === 'tutorial' && start) pause();
  else if (screen === 'settings' && (confirm || back)) $('settings-close').click();
  else if (screen === 'online-room' && back) $('room-back').click();
  else if (screen === null && start) pause();
}

window.addEventListener('gamepadconnected', () => {
  gamepadConnected = true;
  if (!gamepadHintShown) { renderControlLegend(); gamepadHintShown = true; }
});
window.addEventListener('gamepaddisconnected', () => {
  gamepadConnected = Array.from(navigator.getGamepads?.() ?? []).some(Boolean);
  if (!gamepadConnected) renderControlLegend();
});

function pollGamepad(): void {
  const pad = Array.from(navigator.getGamepads?.() ?? []).find((candidate): candidate is Gamepad => Boolean(candidate && candidate.connected));
  if (pad) {
    if (!gamepadConnected) { gamepadConnected = true; renderControlLegend(); }
    const actions = readGamepadActions(pad);
    const ui = readGamepadMenuButtons(pad);
    const inGameplay = screen === null || screen === 'tutorial';
    const transitions = gamepadTransitions(gamepadHeld, actions, gamepadSent, inGameplay);
    for (const control of transitions.pressed) {
      if (playMode === 'online-guest') sendGuestControl(control, true);
      else arena?.setVirtualControl(control, true);
      gamepadSent.add(control);
    }
    for (const control of transitions.released) {
      if (playMode === 'online-guest') sendGuestControl(control, false);
      else arena?.setVirtualControl(control, false);
      gamepadSent.delete(control);
    }
    if (inGameplay) {
      const confirm = ui.confirm && !gamepadUi.confirm;
      const back = ui.back && !gamepadUi.back;
      const start = ui.start && !gamepadUi.start;
      if (playMode !== 'online-guest') {
        activateGamepadUi(confirm, back, start);
        if (screen === null && start && playMode === 'online-host') pause();
      }
    } else {
      const direction = gamepadDirection(actions);
      navigateWithGamepad(direction, performance.now());
      activateGamepadUi(ui.confirm && !gamepadUi.confirm, ui.back && !gamepadUi.back, ui.start && !gamepadUi.start);
    }
    gamepadHeld = actions;
    gamepadUi = ui;
  } else {
    for (const control of gamepadSent) {
      if (screen === null || screen === 'tutorial') {
        if (playMode === 'online-guest') sendGuestControl(control, false);
        else arena?.setVirtualControl(control, false);
      }
    }
    gamepadHeld = new Set();
    gamepadSent.clear();
    gamepadUi = { confirm: false, back: false, start: false };
    navHeld = '';
  }
  window.requestAnimationFrame(pollGamepad);
}
window.requestAnimationFrame(pollGamepad);

window.addEventListener('blur', () => {
  if (playMode === 'online-guest') for (const control of [...guestHeld]) sendGuestControl(control, false);
  else if (playMode !== 'online-host' && (screen === null || screen === 'tutorial')) pause();
});
renderControlLegend();
renderMoveSummary();
updateSoundLabel();
