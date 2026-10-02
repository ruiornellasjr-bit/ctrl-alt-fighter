import type { ControlAction } from './config/controls';

// Mapeamento do padrão Gamepad API (Xbox/USB): A/B/X/Y = botões 0-3,
// LB/RB = 4-5, LT/RT = 6-7, direcional = 12-15.
export function readGamepadActions(gamepad: Pick<Gamepad, 'axes' | 'buttons'>): Set<ControlAction> {
  const down = (index: number): boolean => {
    const button = gamepad.buttons[index];
    return Boolean(button && (button.pressed || button.value >= 0.5));
  };
  const x = gamepad.axes[0] ?? 0;
  const y = gamepad.axes[1] ?? 0;
  const left = down(14) || x < -0.35;
  const right = down(15) || x > 0.35;
  const up = down(12) || y < -0.55;
  const downDirection = down(13) || y > 0.55;
  const actions: ControlAction[] = [
    'left', 'right', 'jump', 'down', 'attack', 'kick', 'heavyAttack', 'heavyKick', 'special', 'super', 'block',
  ];
  const held = [left, right, up, downDirection, down(0), down(1), down(2), down(3), down(4), down(5), down(6) || down(7)];
  return new Set(actions.filter((_, index) => held[index]));
}

export function readGamepadMenuButtons(gamepad: Pick<Gamepad, 'buttons'>): { confirm: boolean; back: boolean; start: boolean } {
  const down = (index: number): boolean => {
    const button = gamepad.buttons[index];
    return Boolean(button && (button.pressed || button.value >= 0.5));
  };
  return { confirm: down(0), back: down(1), start: down(9) };
}

export function gamepadTransitions(
  previous: ReadonlySet<ControlAction>,
  current: ReadonlySet<ControlAction>,
  sent: ReadonlySet<ControlAction>,
  inGameplay: boolean,
): { pressed: ControlAction[]; released: ControlAction[] } {
  const continuous = new Set<ControlAction>(['left', 'right', 'down', 'block']);
  const pressed: ControlAction[] = [];
  const released: ControlAction[] = [];
  if (!inGameplay) return { pressed, released: [...sent] };
  for (const action of ['jump', 'left', 'down', 'right', 'attack', 'kick', 'heavyAttack', 'heavyKick', 'special', 'super', 'block'] as const) {
    const held = current.has(action);
    if (continuous.has(action)) {
      if (held && !sent.has(action)) pressed.push(action);
      else if (!held && sent.has(action)) released.push(action);
    } else {
      if (held && !previous.has(action)) pressed.push(action);
      else if (!held && sent.has(action)) released.push(action);
    }
  }
  return { pressed, released };
}
