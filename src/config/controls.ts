// Configuração centralizada de controles — desacoplada da cena Phaser (arena.ts)
// e da UI (main.ts). Qualquer remapeamento futuro deve ser feito apenas aqui.
// `code` usa os mesmos valores de KeyboardEvent.code do navegador; a tradução
// para o enum numérico do Phaser (Phaser.Input.Keyboard.KeyCodes) acontece
// dentro de arena.ts, que é a única camada que conhece o Phaser.

export type ControlAction = 'jump' | 'left' | 'down' | 'right' | 'attack' | 'kick' | 'special' | 'super' | 'block';

export const CONTROL_ACTIONS: ControlAction[] = ['jump', 'left', 'down', 'right', 'attack', 'kick', 'special', 'super', 'block'];

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
  special: 'Especial',
  super: 'Super',
  block: 'Guarda',
};

export type MoveSummaryEntry = { title: string; description: string; actions: ControlAction[] };

// Resumo visual dos golpes básicos exibido no tutorial/treino.
export const MOVE_SUMMARY: MoveSummaryEntry[] = [
  { title: 'Normais', description: 'Soco e chute de curto alcance.', actions: ['attack', 'kick'] },
  { title: 'Anti-Aéreo', description: 'Gancho — soco enquanto agachado.', actions: ['down', 'attack'] },
  { title: 'Projétil / Especial', description: 'Ataque à distância.', actions: ['special'] },
  { title: 'Super', description: 'Golpe de barra cheia; cancela a guarda.', actions: ['super'] },
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
