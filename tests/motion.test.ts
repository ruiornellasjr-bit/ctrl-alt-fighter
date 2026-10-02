import { describe, expect, it } from 'vitest';
import {
  BUTTON_WINDOW,
  MOTION_BUFFER,
  MOTION_WINDOW,
  pushMotion,
  quarterCircleForward,
  type MotionInput,
} from '../src/motion';

// Atalho para montar um log legível: [['down', 0], ['forward', 0.1]].
function log(...entries: [MotionInput['direction'], number][]): MotionInput[] {
  return entries.map(([direction, at]) => ({ direction, at }));
}

describe('comando ↓→', () => {
  it('reconhece o movimento completo seguido do soco', () => {
    expect(quarterCircleForward(log(['down', 0], ['forward', 0.1]), 0.2)).toBe(true);
  });

  it('exige que o ↓ venha ANTES do →', () => {
    // →↓ é outro comando no gênero; aceitá-lo tornaria o input impreciso.
    expect(quarterCircleForward(log(['forward', 0], ['down', 0.1]), 0.2)).toBe(false);
  });

  it('recusa quando o giro demorou demais', () => {
    const late = MOTION_WINDOW + 0.01;
    expect(quarterCircleForward(log(['down', 0], ['forward', late]), late)).toBe(false);
    expect(quarterCircleForward(log(['down', 0], ['forward', MOTION_WINDOW]), MOTION_WINDOW)).toBe(true);
  });

  it('recusa quando o soco veio tarde demais depois do →', () => {
    // Regressão importante: sem esta janela, andar para frente depois de
    // agachar deixaria o especial "armado" e o próximo soco sairia especial.
    const entries = log(['down', 0], ['forward', 0.1]);
    expect(quarterCircleForward(entries, 0.1 + BUTTON_WINDOW)).toBe(true);
    expect(quarterCircleForward(entries, 0.1 + BUTTON_WINDOW + 0.01)).toBe(false);
  });

  it('cancela se o jogador voltou para trás no meio do movimento', () => {
    expect(quarterCircleForward(log(['down', 0], ['back', 0.05], ['forward', 0.1]), 0.15)).toBe(false);
  });

  it('não dispara sem nenhuma direção registrada', () => {
    expect(quarterCircleForward([], 0)).toBe(false);
    expect(quarterCircleForward(log(['forward', 0]), 0.05)).toBe(false);
    expect(quarterCircleForward(log(['down', 0]), 0.05)).toBe(false);
  });

  it('usa o → mais recente e ignora um movimento antigo já gasto', () => {
    // O jogador fez ↓→ cedo, depois só andou para frente. O segundo → não
    // pode reaproveitar o ↓ antigo e ressuscitar o comando.
    const entries = log(['down', 0], ['forward', 0.1], ['forward', 2]);
    expect(quarterCircleForward(entries, 2.05)).toBe(false);
  });
});

describe('buffer de direções', () => {
  it('guarda os toques em ordem e descarta os mais antigos', () => {
    let entries: MotionInput[] = [];
    for (let i = 0; i < MOTION_BUFFER + 3; i++) {
      entries = pushMotion(entries, 'forward', i);
    }
    expect(entries).toHaveLength(MOTION_BUFFER);
    expect(entries[entries.length - 1].at).toBe(MOTION_BUFFER + 2);
  });

  it('não modifica o log recebido', () => {
    const original = log(['down', 0]);
    pushMotion(original, 'forward', 1);
    expect(original).toHaveLength(1);
  });

  it('cabe um ↓→ mesmo com o buffer cheio de direções anteriores', () => {
    let entries = log(['back', 0], ['back', 0.1], ['back', 0.2], ['back', 0.3]);
    entries = pushMotion(entries, 'down', 1);
    entries = pushMotion(entries, 'forward', 1.1);
    expect(quarterCircleForward(entries, 1.2)).toBe(true);
  });
});
