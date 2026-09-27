import Phaser from 'phaser';
import Peer, { type DataConnection, type MediaConnection } from 'peerjs';
import './style.css';
import { ArcadeAudio } from './audio';
import { ArenaScene, type ArenaControl, type Hud } from './arena';
import { fighters, roster, type FighterDef } from './fighters';
import { pickOpponents, type FighterId } from './rules';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
type Screen = 'menu' | 'selection' | 'stage-select' | 'online-room' | 'tutorial' | 'result' | 'pause' | 'settings' | null;
type PlayMode = 'arcade' | 'versus' | 'online-host' | 'online-guest';
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
let forceTutorial = false;
let playMode: PlayMode = 'arcade';
let choosingSecond = false;
let toastTimer = 0;
let selectedStage: 'office' | 'datacenter' = 'office';
let score = 0;
let latestHud: Hud | null = null;
let roomPeer: Peer | null = null;
let roomConnection: DataConnection | null = null;
let roomMedia: MediaConnection | null = null;
let roomStarted = false;
let roomId = '';
let guestFighter: FighterId = 'caio';
let toastQuipIndex = 0;
let controlsVisible = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760;
let controlsManuallyToggled = false;
const toastQuips = ['REINICIA QUE PASSA!', 'NA MINHA MÁQUINA FUNCIONA!', 'ABRE UM CHAMADO!'];
const validControls = new Set<Control>(['left', 'right', 'down', 'block', 'jump', 'attack', 'kick', 'special', 'super']);
const guestHeld = new Set<Control>();

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
  const inArena = next === null || next === 'tutorial';
  $('touch-controls').classList.toggle('hidden', !inArena || !controlsVisible);
  $('controls-toggle').classList.toggle('hidden', !inArena);
  $('controls-toggle').setAttribute('aria-pressed', String(controlsVisible));
  $('controls-toggle').setAttribute('aria-label', controlsVisible ? 'Ocultar controles na tela' : 'Mostrar controles na tela');
  $('controls-toggle').classList.toggle('active', controlsVisible);
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
  if (screen === 'tutorial') setTutorialText();
});

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
  if (playMode === 'online-host' && roomConnection?.open) roomConnection.send({ type: 'hud', hud });
  $('player-health').style.width = `${hud.player}%`;
  $('enemy-health').style.width = `${hud.enemy}%`;
  $('player-meter').style.width = `${hud.playerMeter}%`;
  $('enemy-meter').style.width = `${hud.enemyMeter}%`;
  $('timer').textContent = hud.tutorial ? '∞' : String(hud.seconds);
  $('round-label').textContent = hud.tutorial ? 'TREINO' : hud.versus ? (playMode.startsWith('online-') ? 'VERSUS ONLINE' : 'VERSUS LOCAL') : hud.bossPhase ? `CHEFÃO · FASE ${hud.bossPhase}` : `LUTA ${hud.round} / ${opponents.length}`;
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
  if (playMode === 'online-guest') {
    guestFighter = id;
    audio.sound('select');
    joinOnlineRoom(roomId);
    return;
  }
  if (playMode === 'online-host') {
    selected = id;
    audio.sound('select');
    show('stage-select');
    return;
  }
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
  if (playMode === 'online-host') createOnlineRoom();
  else if (playMode === 'arcade' && (forceTutorial || localStorage.getItem('caf-tutorial') !== 'done')) startTutorial();
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
  const touchInstructions: Record<string, { copy: string; keys: string[] }> = {
    move: { copy: 'Segure ◀ ou ▶ para se mover.', keys: ['◀', '▶'] },
    jump: { copy: 'Toque ↑ para pular. Segure ◀ ou ▶ no ar para passar pelo rival.', keys: ['↑', '◀', '▶'] },
    attack: { copy: 'Aproxime-se e toque SOCO.', keys: ['SOCO'] },
    hook: { copy: 'Aproxime-se, segure ↓ e toque SOCO para dar um gancho.', keys: ['↓', 'SOCO'] },
    block: { copy: 'Segure DEFESA para bloquear o ataque do rival.', keys: ['DEFESA'] },
    special: { copy: 'Toque PODER para usar sua habilidade.', keys: ['PODER'] },
    alternate: { copy: 'Segure a direção do rival e toque PODER para variar o golpe.', keys: ['→', 'PODER'] },
    super: { copy: 'Com a barra cheia, segure ↓ e toque ESPECIAL.', keys: ['↓', 'ESPECIAL'] },
  };
  const instruction = controlsVisible ? touchInstructions[step.action] : null;
  $('tutorial-title').textContent = step.title;
  $('tutorial-copy').textContent = instruction?.copy ?? step.copy;
  $('tutorial-keys').innerHTML = (instruction?.keys ?? step.keys).map(key => `<kbd>${key}</kbd>`).join('');
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
  ($('result-primary') as HTMLButtonElement).disabled = false;
  localStorage.setItem('caf-tutorial', 'done');
  setNames();
  arena.setOnlineRemote(playMode === 'online-host');
  arena.startRound(selected, opponents[round], round + 1, false, playMode !== 'arcade');
  audio.music(opponents[round] === 'cliente' ? 'boss' : 'battle');
  show(null);
  if (playMode === 'online-host' && roomConnection?.open) roomConnection.send({ type: 'start', host: selected, guest: opponents[round], stage: selectedStage });
}

function showResult(result: 'player' | 'enemy' | 'draw'): void {
  if (screen === 'tutorial') return;
  if (playMode !== 'arcade') {
    $('result-tag').textContent = 'CINCO MINUTOS SEM PERDER A AMIZADE';
    $('result-title').textContent = result === 'draw' ? 'EMPATE!' : result === 'player' ? 'PLAYER 1 VENCEU!' : 'PLAYER 2 VENCEU!';
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

function roomMessage(title: string, status: string): void {
  $('room-title').textContent = title;
  $('room-status').textContent = status;
  show('online-room');
}

function leaveOnlineRoom(): void {
  roomStarted = false;
  roomMedia?.close();
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

function createOnlineRoom(): void {
  if (!arena || !('RTCPeerConnection' in window) || !('captureStream' in game.canvas)) {
    roomMessage('SALA INDISPONÍVEL', 'Este navegador não permite partidas online. Tente Chrome, Edge ou Firefox atualizado.');
    return;
  }
  roomMessage('CRIANDO SALA...', 'Conectando à rede.');
  $('room-share').classList.add('hidden');
  roomId = `caf-${crypto.randomUUID()}`;
  const peer = new Peer(roomId);
  roomPeer = peer;
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
          roomMedia = peer.call(connection.peer, game.canvas.captureStream(30));
          roomMedia.on('error', () => { $('room-status').textContent = 'A transmissão falhou. Saia da sala e tente novamente.'; });
        } catch {
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

function joinOnlineRoom(id: string): void {
  if (!/^caf-[0-9a-f-]{36}$/.test(id) || !('RTCPeerConnection' in window)) {
    roomMessage('LINK INVÁLIDO', 'Peça ao Player 1 um novo link de convite.');
    return;
  }
  activateAudio();
  roomMessage('ENTRANDO NA SALA...', 'Conectando ao Player 1.');
  $('room-share').classList.add('hidden');
  const peer = new Peer();
  roomPeer = peer;
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
        selectedStage = message.stage === 'datacenter' ? 'datacenter' : 'office';
        setNames();
        audio.music('battle');
        show(null);
      } else if (message.type === 'hud' && message.hud && typeof message.hud === 'object') {
        renderHud(message.hud as Hud);
      } else if (message.type === 'toast' && typeof message.quip === 'string') {
        showToast(message.quip);
        audio.sound('toast');
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
  if (playMode.startsWith('online-')) leaveOnlineRoom();
  arena?.showMenuBackground();
  audio.music('menu');
  show('menu');
}

function openSelection(mode: PlayMode, tutorial: boolean): void {
  playMode = mode;
  forceTutorial = tutorial;
  choosingSecond = false;
  $('selection-heading').textContent = mode === 'versus' || mode === 'online-host' ? 'ESCOLHA O PLAYER 1' : mode === 'online-guest' ? 'ESCOLHA O PLAYER 2' : 'QUEM VAI PARA A ARENA?';
  $('selection-hint').textContent = mode === 'versus' ? 'DEPOIS ESCOLHA O PLAYER 2 · WASD + F G H' : mode === 'online-host' ? 'DEPOIS VOCÊ VAI COPIAR O LINK DA SALA' : mode === 'online-guest' ? 'CONTROLES NO SEU DISPOSITIVO: SETAS + J K L' : 'ESCOLHA UM LUTADOR PARA COMEÇAR';
  audio.music('menu');
  renderRoster();
  show('selection');
}

function showToast(fromHost?: string): void {
  const toast = $('adalberto-toast');
  const quip = fromHost && toastQuips.includes(fromHost) ? fromHost : toastQuips[toastQuipIndex++ % toastQuips.length];
  $('toast-quip').textContent = quip;
  toast.setAttribute('aria-label', `Adalberto: Toaaast! ${quip}`);
  window.clearTimeout(toastTimer);
  toast.classList.remove('active');
  void toast.offsetWidth;
  toast.classList.add('active');
  if (!audio.muted && audio.effectsVolume > 0 && 'speechSynthesis' in window) {
    const speech = new SpeechSynthesisUtterance(`Toaaast! ${quip.toLowerCase()}`);
    speech.lang = 'pt-BR';
    speech.rate = 1.12;
    speech.pitch = 1.55;
    speech.volume = Math.min(1, audio.effectsVolume);
    speech.voice = window.speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith('pt')) ?? null;
    window.speechSynthesis.speak(speech);
  }
  if (playMode === 'online-host' && roomConnection?.open) roomConnection.send({ type: 'toast', quip });
  toastTimer = window.setTimeout(() => toast.classList.remove('active'), 1700);
}

function announcePhase(phase: number): void {
  const banner = $('phase-banner');
  banner.textContent = phase === 2 ? 'FASE 2 · SÓ MAIS UM AJUSTE!' : '';
  banner.classList.add('active');
  window.setTimeout(() => banner.classList.remove('active'), 1700);
}

function pause(): void {
  if (screen !== null) return;
  if (playMode === 'online-guest') { menu(); return; }
  arena?.setUiPaused(true);
  audio.music('none');
  show('pause');
  if (playMode === 'online-host' && roomConnection?.open) roomConnection.send({ type: 'pause', paused: true });
}

function resume(): void {
  arena?.setUiPaused(false);
  audio.music(opponents[round] === 'cliente' ? 'boss' : 'battle');
  show(null);
  if (playMode === 'online-host' && roomConnection?.open) roomConnection.send({ type: 'pause', paused: false });
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
const onlineButton = $('menu-online') as HTMLButtonElement;
playButton.disabled = true;
onlineButton.disabled = true;
playButton.textContent = 'CARREGANDO ARENA...';

window.addEventListener('ctrl-alt-fighter-ready', () => {
  arena = game.scene.getScene('Arena') as ArenaScene;
  arena.audio = audio;
  arena.callbacks = { hud: renderHud, result: showResult, training: completeTraining, toast: showToast, phase: announcePhase };
  playButton.disabled = false;
  onlineButton.disabled = false;
  playButton.textContent = '▶ JOGAR AGORA';
  arena.showMenuBackground();
  const invite = new URLSearchParams(location.search).get('room');
  if (invite) { roomId = invite; openSelection('online-guest', false); }
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
$('menu-online').addEventListener('click', () => { activateAudio(); openSelection('online-host', false); });
$('controls-toggle').addEventListener('click', () => {
  controlsManuallyToggled = true;
  controlsVisible = !controlsVisible;
  const inArena = screen === null || screen === 'tutorial';
  $('touch-controls').classList.toggle('hidden', !inArena || !controlsVisible);
  $('controls-toggle').setAttribute('aria-pressed', String(controlsVisible));
  $('controls-toggle').setAttribute('aria-label', controlsVisible ? 'Ocultar controles na tela' : 'Mostrar controles na tela');
  $('controls-toggle').classList.toggle('active', controlsVisible);
  if (screen === 'tutorial') setTutorialText();
});
$('room-back').addEventListener('click', menu);
$('copy-room').addEventListener('click', async () => {
  const link = $<HTMLInputElement>('room-link');
  try { await navigator.clipboard.writeText(link.value); }
  catch { link.select(); document.execCommand('copy'); }
  $('copy-room').textContent = 'LINK COPIADO!';
  window.setTimeout(() => { $('copy-room').textContent = 'COPIAR LINK'; }, 1600);
});
$('stage-office').addEventListener('click', () => chooseStage('office'));
$('stage-datacenter').addEventListener('click', () => chooseStage('datacenter'));
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
const guestKeys: Record<string, Control> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'jump', KeyJ: 'attack', KeyK: 'block', KeyL: 'special' };
window.addEventListener('keydown', event => {
  if (event.code === 'Escape') { if (screen === null) pause(); else if (screen === 'pause') resume(); }
  const control = guestKeys[event.code];
  if (playMode === 'online-guest' && control) { event.preventDefault(); if (!event.repeat) sendGuestControl(control, true); }
});
window.addEventListener('keyup', event => { const control = guestKeys[event.code]; if (playMode === 'online-guest' && control) sendGuestControl(control, false); });
window.addEventListener('blur', () => {
  if (playMode === 'online-guest') for (const control of [...guestHeld]) sendGuestControl(control, false);
  else if (playMode !== 'online-host' && screen === null) pause();
});
updateSoundLabel();
