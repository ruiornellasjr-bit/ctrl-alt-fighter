export const DOUBLE_TAP_WINDOW = 0.28;
export const RUN_SPEED = 510;
export const BACKHOP_SPEED = 285;
export const BACKHOP_LIFT = 260;
export const DOUBLE_JUMP_CEILING = 240;

export type Mobility = {
  lastDirection: number; lastFacing: number; lastTap: number;
  pending: 'run' | 'backhop' | null;
  runDirection: number; walkDirection: number; hopDirection: number; hopsLeft: number;
  evading: boolean; jumps: number; landUntil: number; jumpStarted: number; hopStarted: number;
};

export function createMobility(): Mobility {
  return { lastDirection: 0, lastFacing: 1, lastTap: -Infinity, pending: null,
    runDirection: 0, walkDirection: 0, hopDirection: 0, hopsLeft: 0, evading: false,
    jumps: 0, landUntil: 0, jumpStarted: 0, hopStarted: 0 };
}

// Recebe apenas bordas de pressionamento, nunca repetição nem polling de tecla.
export function tapDirection(mobility: Mobility, direction: -1 | 1, facing: -1 | 1, now: number): void {
  const gap = now - mobility.lastTap;
  if (direction === mobility.lastDirection && facing === mobility.lastFacing && gap >= 0 && gap <= DOUBLE_TAP_WINDOW) {
    mobility.pending = direction === facing ? 'run' : 'backhop';
    mobility.lastTap = -Infinity; // Um terceiro toque não reaproveita o segundo.
  } else mobility.lastTap = now;
  mobility.lastDirection = direction;
  mobility.lastFacing = facing;
}

export function canDoubleJump(jumps: number, airborne: boolean, free: boolean): boolean {
  return airborne && free && jumps === 1;
}
