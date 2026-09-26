export type FighterId = 'kalliane' | 'laura' | 'caio' | 'rui' | 'monteiro' | 'vinicius';
export type Direction = 'down' | 'left' | 'right';

export const fighterIds: FighterId[] = ['kalliane', 'laura', 'caio', 'rui', 'monteiro', 'vinicius'];

export function comboReady(inputs: Direction[], facing: -1 | 1): boolean {
  const lastTwo = inputs.slice(-2);
  return lastTwo[0] === 'down' && lastTwo[1] === (facing === 1 ? 'right' : 'left');
}

export function applyDamage(health: number, damage: number, blocking: boolean): number {
  return Math.max(0, health - (blocking ? Math.ceil(damage * 0.25) : damage));
}

export function pickOpponents(selected: FighterId, random: () => number = Math.random): FighterId[] {
  const pool = fighterIds.filter(id => id !== selected);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

export function roundWinner(playerHealth: number, enemyHealth: number): 'player' | 'enemy' | 'draw' {
  if (playerHealth > enemyHealth) return 'player';
  if (enemyHealth > playerHealth) return 'enemy';
  return 'draw';
}
