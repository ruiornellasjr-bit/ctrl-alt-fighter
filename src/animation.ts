import type { FighterState } from './fsm';
import type { FighterId } from './rules';

export type FighterPose = 'idle' | 'walk' | 'punch' | 'kick' | 'guard' | 'jump' | 'special' | 'hurt';

export type SpriteSheetLayout = {
  frameWidth: number;
  frameHeight: number;
};

export type FighterAnimation = {
  frames: readonly [number, number, number, number];
  frameRate: number;
  repeat: number;
};

const rows: Record<FighterPose, number> = {
  idle: 0,
  walk: 1,
  punch: 2,
  kick: 3,
  guard: 4,
  jump: 5,
  special: 6,
  hurt: 7,
};

// Com apenas 4 quadros por pose, a cadencia e o que separa "animacao travada"
// de "animacao fluida". A referencia do genero (Street Fighter III, KOF) e:
// poses sustentadas respiram devagar, golpes tem partida rapida.
const frameRates: Record<FighterPose, number> = {
  // Poses em loop: lentas e continuas, para o personagem "respirar" parado.
  idle: 7,
  walk: 12,
  guard: 8,
  // Golpes: rapidos o bastante para o impacto nao parecer em camera lenta.
  punch: 16,
  kick: 14,
  special: 12,
  // Pulo e dano acompanham a fisica: nao podem terminar antes do movimento.
  jump: 10,
  hurt: 12,
};

// Poses que voltam ao ultimo quadro e ficam nele (em vez de reiniciar) ou que
// devem sustentar a leitura da pose ate o estado da FSM mudar.
const holdsLastFrame: Record<FighterPose, boolean> = {
  idle: false,
  walk: false,
  guard: false,
  punch: true,
  kick: true,
  special: true,
  jump: true,
  hurt: true,
};

export const fighterPoses = Object.keys(rows) as FighterPose[];

export function spriteSheetLayout(id: FighterId): SpriteSheetLayout {
  void id;
  return { frameWidth: 320, frameHeight: 256 };
}

export function fighterAnimation(pose: FighterPose): FighterAnimation {
  const start = rows[pose] * 4;
  return {
    frames: [start, start + 1, start + 2, start + 3],
    frameRate: frameRates[pose],
    repeat: holdsLastFrame[pose] ? 0 : -1,
  };
}

export function poseHoldsLastFrame(pose: FighterPose): boolean {
  return holdsLastFrame[pose];
}

// Mapeia o estado da FSM (fonte da verdade sobre o que o personagem está
// fazendo) para uma das oito linhas animadas da folha. Estados equivalentes
// compartilham a mesma sequência (super/especial e agachar/defender).
export function visualPose(state: FighterState): FighterPose {
  switch (state) {
    case 'walk': return 'walk';
    case 'attack':
      return 'punch';
    case 'kick': return 'kick';
    case 'special':
    case 'super': return 'special';
    case 'guard':
    case 'blockstun': return 'guard';
    case 'jump': return 'jump';
    case 'hurt': return 'hurt';
    case 'crouch': return 'guard';
    case 'idle':
    default: return 'idle';
  }
}

export function resolvePose(
  action: FighterPose | null,
  actionUntil: number,
  now: number,
  guarding: boolean,
  elevation: number,
  walking: boolean,
): FighterPose {
  if (action && now < actionUntil) return action;
  if (guarding) return 'guard';
  if (elevation > 0) return 'jump';
  if (walking && Math.floor(now * 9) % 2 === 0) return 'walk';
  return 'idle';
}
