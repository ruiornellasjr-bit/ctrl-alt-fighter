import Phaser from 'phaser';
import './style.css';
import { ArcadeAudio } from './audio';
import { ArenaScene, type Hud } from './arena';
import { fighters, roster, type FighterDef } from './fighters';
import { pickOpponents, type FighterId } from './rules';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
type Screen = 'menu' | 'selection' | 'stage-select' | 'tutorial' | 'result' | 'pause' | 'settings' | null;
const screens: Exclude<Screen, null>[] = ['menu', 'selection', 'stage-select', 'tutorial', 'result', 'pause', 'settings'];
const audio = new ArcadeAudio();
let arena: ArenaScene | null = null;
let screen: Screen = 'menu';
let settingsReturn: Screen = 'menu';
let selected: FighterId = 'kalliane';
let opponents: FighterId[] = [];
let round = 0;
let trainingIndex = 0;
let forceTutorial = false;
let playMode: 'arcade' | 'versus' = 'arcade';
let choosingSecond = false;
let toastTimer = 0;
let selectedStage: 'office' | 'datacenter' = 'office';
let score = 0;
let latestHud: Hud | null = null;

const steps = [
  { action: 'move', title: 'ENCONTRE SEU RITMO', copy: 'Use uma seta lateral para se mover.', keys: ['←', '→'] },
  { action: 'jump', title: 'SAIA DO CHÃO', copy: 'Aperte ↑ para pular. Segure ← ou → no ar para passar pelo rival.', keys: ['↑', '←', '→'] },
  { action: 'attack', title: 'PRIMEIRO GOLPE', copy: 'Aproxime-se e aperte J para atacar.', keys: ['J'] },
  { action: 'hook', title: 'GANCHO!', copy: 'Aproxime-se, segure ↓ e aperte J para dar um gancho.', keys: ['↓', 'J'] },
  { action: 'block', title: 'DEFESA ATIVA', copy: 'Segure K para bloquear o ataque do rival.', keys: ['K'] },
  { action: 'special', title: 'PODER ESPECIAL', copy: 'Aperte L para usar seu poder. Ele volta após alguns segundos.', keys: ['L'] },
  { action: 'alternate', title: 'OUTRA ESTRATÉGIA', copy: 'Segure a direção do rival e aperte L para usar o segundo poder.', keys: ['→', 'L'] },
  { action: 'super', title: 'BARRA DE COLABORAÇÃO', copy: 'Com a barra cheia, segure ↓ e aperte L para chamar o super.', keys: ['↓', 'L'] },
] as const;

function show(next: Screen): void {
  screen = next;
  screens.forEach(name => $(name).classList.toggle('hidden', name !== next));
  const fighting = next === null || next === 'pause' || next === 'tutorial' || (next === 'settings' && settingsReturn === null);
  $('hud').classList.toggle('hidden', !fighting);
  $('fight-actions').classList.toggle('hidden', next !== null);
  $('touch-controls').classList.toggle('hidden', next !== null && next !== 'tutorial');
  if (next !== null && next !== 'tutorial') $('adalberto-toast').classList.remove('active');
}

function portrait(def: FighterDef): Promise<string> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 150; canvas.height = 160;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, ...def.portraitRect, 0, 0, 150, 160);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => resolve(def.art);
    image.src = def.portraitSource;
  });
}

function renderRoster(): void {
  const holder = $('roster');
  holder.replaceChildren();
  for (const def of roster) {
    const card = document.createElement('button');
    card.className = 'fighter-card';
    card.style.setProperty('--accent', def.accent);
    card.innerHTML = `<img alt="Foto de ${def.name}" src="${def.art}" /><span class="fighter-info"><small>${def.codename}</small><b>${def.name}</b><em>${def.role}</em></span>`;
    card.addEventListener('click', () => choose(def.id));
    holder.append(card);
    void portrait(def).then(cropped => {
      const image = card.querySelector('img');
      if (image?.isConnected) image.src = cropped;
    });
  }
}

function renderHud(hud: Hud): void {
  latestHud = hud;
  $('player-health').style.width = `${hud.player}%`;
  $('enemy-health').style.width = `${hud.enemy}%`;
  $('player-meter').style.width = `${hud.playerMeter}%`;
  $('enemy-meter').style.width = `${hud.enemyMeter}%`;
  $('timer').textContent = hud.tutorial ? '∞' : String(hud.seconds);
  $('round-label').textContent = hud.tutorial ? 'TREINO' : hud.versus ? 'VERSUS LOCAL' : hud.bossPhase ? `CHEFÃO · FASE ${hud.bossPhase}` : `LUTA ${hud.round} / ${opponents.length}`;
}

function setNames(): void {
  $('player-name').textContent = fighters[selected].name.toUpperCase();
  $('enemy-name').textContent = fighters[opponents[round]].name.toUpperCase();
}

async function unlockAudio(): Promise<void> {
  const context = arena?.audioContext();
  if (context) await audio.unlock(context);
}

function activateAudio(): void {
  void unlockAudio().then(() => {
    if (screen === 'menu' || screen === 'selection' || screen === 'stage-select') audio.music('menu');
    else if (screen === null || screen === 'tutorial') audio.music(opponents[round] === 'cliente' ? 'boss' : 'battle');
  }).catch(() => { /* Gameplay remains available if the browser blocks audio. */ });
}

function choose(id: FighterId): void {
  if (!arena) return;
  if (playMode === 'versus') {
    if (!choosingSecond) {
      selected = id;
      choosingSecond = true;
      $('selection-heading').textContent = 'AGORA ESCOLHA O PLAYER 2';
      $('selection-hint').textContent = `${fighters[id].name.toUpperCase()} É O PLAYER 1`;
      audio.sound('select');
      return;
    }
    opponents = [id];
    round = 0;
    choosingSecond = false;
    show('stage-select');
    return;
  }
  selected = id;
  opponents = [pickOpponents(id)[0], 'homologacao', 'prazo', 'cliente'];
  round = 0;
  score = 0;
  audio.sound('select');
  show('stage-select');
}

function chooseStage(stage: 'office' | 'datacenter'): void {
  selectedStage = stage;
  arena?.setStage(stage);
  audio.sound('select');
  if (playMode === 'arcade' && (forceTutorial || localStorage.getItem('caf-tutorial') !== 'done')) startTutorial();
  else startFight();
}

function startTutorial(): void {
  if (!arena) return;
  trainingIndex = 0;
  setNames();
  arena.startRound(selected, opponents[0], 1, true);
  audio.music('battle');
  show('tutorial');
  setTutorialText();
}

function setTutorialText(): void {
  const step = steps[trainingIndex];
  $('tutorial-title').textContent = step.title;
  $('tutorial-copy').textContent = step.copy;
  $('tutorial-keys').innerHTML = step.keys.map(key => `<kbd>${key}</kbd>`).join('');
  $('tutorial-progress-bar').style.width = `${trainingIndex / steps.length * 100}%`;
  $('skip-tutorial').textContent = 'PULAR TUTORIAL →';
  arena?.setTrainingStep(step.action);
}

function completeTraining(action: string): void {
  if (screen !== 'tutorial' || steps[trainingIndex]?.action !== action) return;
  trainingIndex++;
  audio.sound('select');
  if (trainingIndex >= steps.length) {
    localStorage.setItem('caf-tutorial', 'done');
    $('tutorial-title').textContent = 'TREINO CONCLUÍDO!';
    $('tutorial-copy').textContent = 'Você já sabe o essencial. A arena espera por você.';
    $('tutorial-keys').innerHTML = '';
    $('tutorial-progress-bar').style.width = '100%';
    $('skip-tutorial').textContent = 'COMEÇAR TORNEIO →';
    arena?.setUiPaused(true);
  } else window.setTimeout(setTutorialText, 340);
}

function startFight(): void {
  if (!arena) return;
  localStorage.setItem('caf-tutorial', 'done');
  setNames();
  arena.startRound(selected, opponents[round], round + 1, false, playMode === 'versus');
  audio.music(opponents[round] === 'cliente' ? 'boss' : 'battle');
  show(null);
}

function showResult(result: 'player' | 'enemy' | 'draw'): void {
  if (screen === 'tutorial') return;
  if (playMode === 'versus') {
    $('result-tag').textContent = 'CINCO MINUTOS SEM PERDER A AMIZADE';
    $('result-title').textContent = result === 'draw' ? 'EMPATE!' : result === 'player' ? 'PLAYER 1 VENCEU!' : 'PLAYER 2 VENCEU!';
    $('result-copy').textContent = 'Diferenças acertadas. A colaboração continua!';
    $('result-primary').textContent = 'REVANCHE';
    $('result-bonus').textContent = '';
    ($('result-primary') as HTMLButtonElement).onclick = startFight;
    audio.jingle(result === 'player');
    show('result');
    return;
  }
  const finalWin = result === 'player' && round === opponents.length - 1;
  const boss = opponents[round] === 'cliente';
  if (result === 'player') score += 500 + Math.max(0, Math.round((latestHud?.seconds ?? 0) * 20)) + Math.round((latestHud?.player ?? 0) * 10);
  $('result-tag').textContent = finalWin ? 'CONTRATO FECHADO' : result === 'player' ? `LUTA ${round + 1} VENCIDA` : boss ? 'CONTRATO EM RISCO' : result === 'draw' ? 'EMPATE' : 'AINDA NÃO ACABOU';
  $('result-title').textContent = finalWin ? 'A EQUIPE SALVOU O CONTRATO!' : result === 'player' ? 'VITÓRIA!' : boss ? 'REUNIÃO DE ALINHAMENTO...' : result === 'draw' ? 'MAIS UMA RODADA!' : 'TENTE OUTRA VEZ!';
  $('result-copy').textContent = finalWin ? 'Os Binários fecharam juntos. Amanhã todo mundo volta a ser amigo.' : result === 'player' ? `${fighters[opponents[round]].name} caiu na arena. O próximo desafio espera.` : boss ? 'O cliente pediu mais um ajuste. Você pode tentar essa luta de novo.' : 'Todo bom plano merece uma segunda tentativa.';
  $('result-primary').textContent = finalWin ? 'ESCOLHER OUTRO LUTADOR' : result === 'player' ? 'PRÓXIMA LUTA' : 'REPETIR LUTA';
  $('result-bonus').textContent = result === 'player' ? `BÔNUS DA RODADA · TEMPO ${latestHud?.seconds ?? 0}s · TOTAL ${score.toLocaleString('pt-BR')} PONTOS` : `TOTAL ${score.toLocaleString('pt-BR')} PONTOS`;
  ($('result-primary') as HTMLButtonElement).onclick = () => {
    if (finalWin) { audio.music('menu'); arena?.showMenuBackground(); show('selection'); }
    else { if (result === 'player') round++; startFight(); }
  };
  audio.jingle(result === 'player');
  show('result');
}

function menu(): void {
  arena?.showMenuBackground();
  audio.music('menu');
  show('menu');
}

function openSelection(mode: 'arcade' | 'versus', tutorial: boolean): void {
  playMode = mode;
  forceTutorial = tutorial;
  choosingSecond = false;
  $('selection-heading').textContent = mode === 'versus' ? 'ESCOLHA O PLAYER 1' : 'QUEM VAI PARA A ARENA?';
  $('selection-hint').textContent = mode === 'versus' ? 'DEPOIS ESCOLHA O PLAYER 2 · WASD + F G H' : 'ESCOLHA UM LUTADOR PARA COMEÇAR';
  audio.music('menu');
  renderRoster();
  show('selection');
}

function showToast(): void {
  const toast = $('adalberto-toast');
  window.clearTimeout(toastTimer);
  toast.classList.remove('active');
  void toast.offsetWidth;
  toast.classList.add('active');
  if (!audio.muted && audio.effectsVolume > 0 && 'speechSynthesis' in window) {
    const speech = new SpeechSynthesisUtterance('Toaaast! Perdeu pacote!');
    speech.lang = 'pt-BR';
    speech.rate = 1.12;
    speech.pitch = 1.55;
    speech.volume = Math.min(1, audio.effectsVolume);
    speech.voice = window.speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith('pt')) ?? null;
    window.speechSynthesis.speak(speech);
  }
  toastTimer = window.setTimeout(() => toast.classList.remove('active'), 1350);
}

function announcePhase(phase: number): void {
  const banner = $('phase-banner');
  banner.textContent = phase === 2 ? 'FASE 2 · SÓ MAIS UM AJUSTE!' : '';
  banner.classList.add('active');
  window.setTimeout(() => banner.classList.remove('active'), 1700);
}

function pause(): void {
  if (screen !== null) return;
  arena?.setUiPaused(true);
  audio.music('none');
  show('pause');
}

function resume(): void {
  arena?.setUiPaused(false);
  audio.music(opponents[round] === 'cliente' ? 'boss' : 'battle');
  show(null);
}

function openSettings(): void {
  if (screen === 'settings') return;
  settingsReturn = screen;
  if (screen === null) { arena?.setUiPaused(true); audio.music('none'); }
  ($('music-volume') as HTMLInputElement).value = String(Math.round(audio.musicVolume * 100));
  ($('effects-volume') as HTMLInputElement).value = String(Math.round(audio.effectsVolume * 100));
  show('settings');
}

function closeSettings(): void {
  show(settingsReturn);
  if (settingsReturn === null) resume();
  else if (settingsReturn === 'menu' || settingsReturn === 'selection') audio.music('menu');
}

function updateSoundLabel(): void { $('sound-toggle').textContent = audio.muted ? '♫ SOM OFF' : '♫ SOM ON'; $('sound-toggle').classList.toggle('active', !audio.muted); }

const playButton = $('play-button') as HTMLButtonElement;
playButton.disabled = true;
playButton.textContent = 'CARREGANDO ARENA...';

window.addEventListener('ctrl-alt-fighter-ready', () => {
  arena = game.scene.getScene('Arena') as ArenaScene;
  arena.audio = audio;
  arena.callbacks = { hud: renderHud, result: showResult, training: completeTraining, toast: showToast, phase: announcePhase };
  playButton.disabled = false;
  playButton.textContent = '▶ JOGAR AGORA';
  arena.showMenuBackground();
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'stage',
  width: 960,
  height: 540,
  backgroundColor: '#081225',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [ArenaScene],
});

playButton.addEventListener('click', () => { activateAudio(); openSelection('arcade', false); });
$('menu-tutorial').addEventListener('click', () => { activateAudio(); openSelection('arcade', true); });
$('menu-versus').addEventListener('click', () => { activateAudio(); openSelection('versus', false); });
$('stage-office').addEventListener('click', () => chooseStage('office'));
$('stage-datacenter').addEventListener('click', () => chooseStage('datacenter'));
$('stage-back').addEventListener('click', () => show('selection'));
$('difficulty').addEventListener('change', () => arena?.setDifficulty(Number(($('difficulty') as HTMLSelectElement).value)));
document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button => {
  const control = button.dataset.control as 'left' | 'right' | 'down' | 'block' | 'jump' | 'attack' | 'special';
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    arena?.setVirtualControl(control, true);
    button.classList.add('pressed');
  });
  const release = () => { arena?.setVirtualControl(control, false); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});
$('selection-back').addEventListener('click', menu);
$('skip-tutorial').addEventListener('click', startFight);
$('result-menu').addEventListener('click', menu);
$('pause-button').addEventListener('click', pause);
$('help-button').addEventListener('click', pause);
$('resume-button').addEventListener('click', resume);
$('pause-menu').addEventListener('click', menu);
$('settings-button').addEventListener('click', openSettings);
$('settings-close').addEventListener('click', closeSettings);
$('sound-toggle').addEventListener('click', async () => { await unlockAudio(); audio.setLevels(audio.musicVolume, audio.effectsVolume, !audio.muted); updateSoundLabel(); });
for (const id of ['music-volume', 'effects-volume']) $(id).addEventListener('input', () => { audio.setLevels(Number(($('music-volume') as HTMLInputElement).value) / 100, Number(($('effects-volume') as HTMLInputElement).value) / 100, audio.muted); });
window.addEventListener('keydown', event => { if (event.code === 'Escape') { if (screen === null) pause(); else if (screen === 'pause') resume(); } });
window.addEventListener('blur', () => { if (screen === null) pause(); });
updateSoundLabel();
