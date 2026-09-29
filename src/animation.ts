export type FighterPose = 'idle' | 'walk' | 'punch' | 'guard' | 'jump' | 'special' | 'hurt';

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
