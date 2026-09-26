import Phaser from 'phaser';
import './style.css';
import { ArcadeAudio } from './audio';
import { ArenaScene, type Hud } from './arena';
import { fighters, roster, type FighterDef } from './fighters';
import { pickOpponents, type FighterId } from './rules';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
type Screen = 'menu' | 'selection' | 'tutorial' | 'result' | 'pause' | 'settings' | null;
const screens: Exclude<Screen, null>[] = ['menu', 'selection', 'tutorial', 'result', 'pause', 'settings'];
const audio = new ArcadeAudio();
let arena: ArenaScene | null = null;
let screen: Screen = 'menu';
let settingsReturn: Screen = 'menu';
let selected: FighterId = 'kalliane';
let opponents: FighterId[] = [];
let round = 0;
let trainingIndex = 0;
let forceTutorial = false;

const steps = [
  { action: 'move', title: 'ENCONTRE SEU RITMO', copy: 'Use uma seta lateral para se mover.', keys: ['←', '→'] },
  { action: 'jump', title: 'SAIA DO CHÃO', copy: 'Aperte ↑ para pular. Segure ← ou → no ar para passar pelo rival.', keys: ['↑', '←', '→'] },
  { action: 'attack', title: 'PRIMEIRO GOLPE', copy: 'Aproxime-se e aperte J para atacar.', keys: ['J'] },
  { action: 'block', title: 'DEFESA ATIVA', copy: 'Segure K para bloquear o ataque do rival.', keys: ['K'] },
  { action: 'special', title: 'PODER ESPECIAL', copy: 'Aperte L para usar seu poder. Ele volta após alguns segundos.', keys: ['L'] },
  { action: 'super', title: 'GOLPE FORTE', copy: 'Com a barra cheia, aperte ↓, direção do rival e L.', keys: ['↓', '→', 'L'] },
] as const;

function show(next: Screen): void {
  screen = next;
  screens.forEach(name => $(name).classList.toggle('hidden', name !== next));
  const fighting = next === null || next === 'pause' || next === 'tutorial' || (next === 'settings' && settingsReturn === null);
  $('hud').classList.toggle('hidden', !fighting);
  $('fight-actions').classList.toggle('hidden', next !== null);
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

async function renderRoster(): Promise<void> {
  const holder = $('roster');
  holder.replaceChildren();
  for (const def of roster) {
    const card = document.createElement('button');
    card.className = 'fighter-card';
    card.style.setProperty('--accent', def.accent);
    card.innerHTML = `<img alt="Foto de ${def.name}" src="${def.art}" /><span class="fighter-info"><small>${def.codename}</small><b>${def.name}</b><em>${def.role}</em></span>`;
    card.addEventListener('click', () => choose(def.id));
    holder.append(card);
    const cropped = await portrait(def);
    const image = card.querySelector('img');
    if (image) image.src = cropped;
  }
}

function renderHud(hud: Hud): void {
  $('player-health').style.width = `${hud.player}%`;
  $('enemy-health').style.width = `${hud.enemy}%`;
  $('player-meter').style.width = `${hud.playerMeter}%`;
  $('enemy-meter').style.width = `${hud.enemyMeter}%`;
  $('timer').textContent = hud.tutorial ? '∞' : String(hud.seconds);
  $('round-label').textContent = hud.tutorial ? 'TREINO' : `LUTA ${hud.round} / 3`;
}

function setNames(): void {
  $('player-name').textContent = fighters[selected].name.toUpperCase();
  $('enemy-name').textContent = fighters[opponents[round]].name.toUpperCase();
}

async function unlockAudio(): Promise<void> {
  const context = arena?.audioContext();
  if (context) await audio.unlock(context);
}

function choose(id: FighterId): void {
  if (!arena) return;
  selected = id;
  opponents = pickOpponents(id);
  round = 0;
  audio.sound('select');
  if (forceTutorial || localStorage.getItem('caf-tutorial') !== 'done') startTutorial();
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
  arena.startRound(selected, opponents[round], round + 1, false);
  audio.music('battle');
  show(null);
}

function showResult(result: 'player' | 'enemy' | 'draw'): void {
  if (screen === 'tutorial') return;
  const finalWin = result === 'player' && round === 2;
  $('result-tag').textContent = finalWin ? 'TORNEIO CONCLUÍDO' : result === 'player' ? `LUTA ${round + 1} VENCIDA` : result === 'draw' ? 'EMPATE' : 'AINDA NÃO ACABOU';
  $('result-title').textContent = finalWin ? 'CAMPEÃO DO EXPEDIENTE!' : result === 'player' ? 'VITÓRIA!' : result === 'draw' ? 'MAIS UMA RODADA!' : 'TENTE OUTRA VEZ!';
  $('result-copy').textContent = finalWin ? `${fighters[selected].name} conquistou a arena. Agora é a vez de outro colega!` : result === 'player' ? `${fighters[opponents[round]].name} caiu na arena. O próximo desafio espera.` : result === 'draw' ? 'A luta ficou equilibrada até o fim.' : 'Todo bom plano merece uma segunda tentativa.';
  $('result-primary').textContent = finalWin ? 'ESCOLHER OUTRO LUTADOR' : result === 'player' ? 'PRÓXIMA LUTA' : 'REPETIR LUTA';
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

function pause(): void {
  if (screen !== null) return;
  arena?.setUiPaused(true);
  audio.music('none');
  show('pause');
}

function resume(): void {
  arena?.setUiPaused(false);
  audio.music('battle');
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
  arena.callbacks = { hud: renderHud, result: showResult, training: completeTraining };
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

playButton.addEventListener('click', async () => { await unlockAudio(); audio.music('menu'); forceTutorial = false; await renderRoster(); show('selection'); });
$('menu-tutorial').addEventListener('click', async () => { await unlockAudio(); audio.music('menu'); forceTutorial = true; await renderRoster(); show('selection'); });
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
