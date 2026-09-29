export const MIN_GROUND_GAP = 92;

export function facingOpponent(x: number, opponentX: number): -1 | 1 {
  return x <= opponentX ? 1 : -1;
}

export function moveHorizontal(
  x: number,
  amount: number,
  opponentX: number,
  airborne: boolean,
  opponentAirborne: boolean,
  minX = 68,
  maxX = 892,
): number {
  const next = Math.max(minX, Math.min(maxX, x + amount));
  if (airborne || opponentAirborne) return next;
  if (x <= opponentX) return Math.min(next, opponentX - MIN_GROUND_GAP);
  return Math.max(next, opponentX + MIN_GROUND_GAP);
}

export function separateOnLanding(x: number, opponentX: number, minX = 68, maxX = 892): number {
  if (Math.abs(x - opponentX) >= MIN_GROUND_GAP) return x;
  return Math.max(minX, Math.min(maxX, opponentX + facingOpponent(opponentX, x) * MIN_GROUND_GAP));
}
