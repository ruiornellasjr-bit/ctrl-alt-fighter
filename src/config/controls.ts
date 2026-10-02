// Configuração centralizada de controles — desacoplada da cena Phaser (arena.ts)
// e da UI (main.ts). Qualquer remapeamento futuro deve ser feito apenas aqui.
// `code` usa os mesmos valores de KeyboardEvent.code do navegador; a tradução
// para o enum numérico do Phaser (Phaser.Input.Keyboard.KeyCodes) acontece
// dentro de arena.ts, que é a única camada que conhece o Phaser.

export type ControlAction = 'jump' | 'left' | 'down' | 'right' | 'attack' | 'kick' | 'heavyAttack' | 'heavyKick' | 'special' | 'super' | 'block';

export const CONTROL_ACTIONS: ControlAction[] = ['jump', 'left', 'down', 'right', 'attack', 'kick', 'heavyAttack', 'heavyKick', 'special', 'super', 'block'];

export type ControlBinding = { code: string; label: string };
export type PlayerControlScheme = Record<ControlAction, ControlBinding>;

// Player 1 — teclado esquerdo: WASD para movimento, JKLUI para golpes.
export const PLAYER_ONE_CONTROLS: PlayerControlScheme = {
  jump: { code: 'KeyW', label: 'W' },
  left: { code: 'KeyA', label: 'A' },
  down: { code: 'KeyS', label: 'S' },
  right: { code: 'KeyD', label: 'D' },
  attack: { code: 'KeyJ', label: 'J' },
  kick: { code: 'KeyK', label: 'K' },
  heavyAttack: { code: 'KeyH', label: 'H' },
  heavyKick: { code: 'KeyO', label: 'O' },
  special: { code: 'KeyL', label: 'L' },
  super: { code: 'KeyU', label: 'U' },
  block: { code: 'KeyI', label: 'I' },
};

// Player 2 — setas direcionais para movimento, numpad para golpes.
export const PLAYER_TWO_CONTROLS: PlayerControlScheme = {
  jump: { code: 'ArrowUp', label: '↑' },
  left: { code: 'ArrowLeft', label: '←' },
  down: { code: 'ArrowDown', label: '↓' },
  right: { code: 'ArrowRight', label: '→' },
  attack: { code: 'Numpad4', label: 'Num4' },
  kick: { code: 'Numpad5', label: 'Num5' },
  heavyAttack: { code: 'Numpad7', label: 'Num7' },
  heavyKick: { code: 'Numpad8', label: 'Num8' },
  special: { code: 'Numpad6', label: 'Num6' },
  super: { code: 'Numpad1', label: 'Num1' },
  block: { code: 'Numpad2', label: 'Num2' },
};

// Esquema usado pelo jogador convidado no versus online (recebido via rede,
// nunca lido diretamente do teclado local pela arena) — reaproveita o layout
// do Player 1 porque o guest controla um único lutador com um único teclado.
export const GUEST_CONTROLS: PlayerControlScheme = PLAYER_ONE_CONTROLS;

// Tecla global (não amarrada a um jogador) que alterna o modo debug visual.
export const DEBUG_HITBOX_TOGGLE = { code: 'KeyB', label: 'B' };

export const ACTION_LABELS: Record<ControlAction, string> = {
  jump: 'Pular',
  left: 'Esquerda',
  down: 'Agachar',
  right: 'Direita',
  attack: 'Soco',
  kick: 'Chute',
  heavyAttack: 'Soco forte',
  heavyKick: 'Chute forte',
  special: 'Especial',
  super: 'Super',
  block: 'Guarda',
};

export type MoveSummaryEntry = { title: string; description: string; actions: ControlAction[]; fighter?: 'rui' | 'monteiro' | 'yafa' };

// Resumo visual dos golpes básicos exibido no tutorial/treino.
export const MOVE_SUMMARY: MoveSummaryEntry[] = [
  { title: 'Normais', description: 'Soco e chute de curto alcance.', actions: ['attack', 'kick'] },
  { title: 'Anti-Aéreo', description: 'Gancho — soco enquanto agachado.', actions: ['down', 'attack'] },
  { title: 'Projétil / Especial', description: 'Ataque à distância.', actions: ['special'] },
  // O Rui tem o mesmo especial acessível por comando: ↓ → + soco. A tecla
  // direta continua valendo (os botões de toque dependem dela), então este
  // item é um atalho opcional, não uma substituição.
  { title: 'Especial por comando', description: 'Firewall Punch do Rui — também sai na tecla de especial.', actions: ['down', 'right', 'attack'], fighter: 'rui' },
  { title: 'Escudo da Apólice', description: 'Golpe frontal com proteção breve no impacto. Direção + especial ativa Cobertura Total.', actions: ['special'], fighter: 'yafa' },
  { title: 'Super', description: 'Golpe de barra cheia; cancela a guarda.', actions: ['super'] },
  { title: 'Golpes fortes · Lutadores avançados', description: 'Soco forte e chute alto forte: mais dano e alcance, mas recuperação mais lenta.', actions: ['heavyAttack', 'heavyKick'], fighter: 'monteiro' },
  { title: 'Corrida · Lutadores avançados', description: 'Dois toques em direção ao rival; segure o segundo para correr. Inverte ao trocar de lado.', actions: ['right', 'right'], fighter: 'monteiro' },
  { title: 'Recuo · Lutadores avançados', description: 'Dois toques para longe do rival fazem dois saltos curtos. Inverte ao trocar de lado.', actions: ['left', 'left'], fighter: 'monteiro' },
  { title: 'Pulo duplo · Lutadores avançados', description: 'Pule novamente no ar e direcione para passar por cima do rival.', actions: ['jump', 'jump'], fighter: 'monteiro' },
  { title: 'Rasteira · Lutadores avançados', description: 'Chute agachado derruba. No ar, chute dá um golpe aéreo.', actions: ['down', 'kick'], fighter: 'monteiro' },
];

export function codeFor(scheme: PlayerControlScheme, action: ControlAction): string {
  return scheme[action].code;
}

export function labelFor(scheme: PlayerControlScheme, action: ControlAction): string {
  return scheme[action].label;
}

export function actionForCode(scheme: PlayerControlScheme, code: string): ControlAction | null {
  for (const action of CONTROL_ACTIONS) {
    if (scheme[action].code === code) return action;
  }
  return null;
}
