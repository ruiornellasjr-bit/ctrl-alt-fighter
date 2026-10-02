import type { FighterState } from './fsm';
import type { FighterId } from './rules';
import type { MoveId } from './combat';

export type FighterPose = 'idle' | 'walk' | 'walkBack' | 'punch' | 'kick' | 'guard' | 'jump' | 'special' | 'hurt' | 'crouch' | 'gauncho'
  | 'run' | 'backhop' | 'doublejump' | 'airkick' | 'land' | 'sweep'
  | 'hurtStrong' | 'hurtLow' | 'hurtHigh' | 'knockdown' | 'getup' | 'super' | 'blockHit' | 'victory' | 'punchStrong' | 'kickStrong';

export const monteiroV6Groups = {
  'weak-punch': 'punch', 'strong-punch': 'punchStrong',
  'weak-kick': 'kick', 'strong-kick': 'kickStrong',
} as const;

type MonteiroAnimation = FighterAnimation & { group: string; sheet: 'v5' | 'v6' };

export const monteiroAnimationGroups = {
  locomotion: ['idle', 'walk', 'run', 'backhop'],
  flight: ['jump', 'doublejump', 'airkick', 'land'],
  attacks: ['punch', 'gauncho', 'kick', 'sweep'],
  damage: ['hurt', 'hurtStrong', 'hurtLow', 'hurtHigh'],
  defense: ['crouch', 'guard', 'knockdown', 'getup'],
  special: ['special', 'super', 'blockHit', 'victory'],
} as const;

export const yafaAnimationGroups = {
  ...monteiroAnimationGroups,
  strong: ['punchStrong', 'kickStrong'],
} as const;

export const ruiAnimationGroups = { ...yafaAnimationGroups, backward: ['walkBack'] } as const;
export const caioAnimationGroups = { ...yafaAnimationGroups, backward: ['walkBack'] } as const;
export const kallianeAnimationGroups = { ...yafaAnimationGroups, backward: ['walkBack'] } as const;

type AdvancedAnimation = FighterAnimation & { texture: string };
const advancedAnimationCache = new Map<string, AdvancedAnimation>();
export function advancedAnimation(id: FighterId, pose: FighterPose): AdvancedAnimation {
  const key = `${id}-${pose}`;
  const cached = advancedAnimationCache.get(key);
  if (cached) return cached;
  if ((id === 'rui' || id === 'caio') && (pose === 'walk' || pose === 'walkBack')) {
    const result = { texture: `${id}-v6-walk${pose === 'walkBack' ? '-back' : ''}`, frames: Array.from({ length: 12 }, (_, i) => i), frameRate: 18, repeat: -1 };
    advancedAnimationCache.set(key, result);
    return result;
  }
  if (id === 'kalliane' && (pose === 'walk' || pose === 'walkBack')) {
    const result = { texture: `kalliane-v2-${pose === 'walk' ? 'walk12' : 'walkBack12'}`, frames: Array.from({ length: 12 }, (_, i) => i), frameRate: 18, repeat: -1 };
    advancedAnimationCache.set(key, result);
    return result;
  }
  if (id === 'monteiro') {
    const animation = monteiroAnimation(pose);
    const result = { ...animation, texture: `monteiro-${animation.sheet}-${animation.group}` };
    advancedAnimationCache.set(key, result);
    return result;
  }
  for (const [group, poses] of Object.entries(yafaAnimationGroups)) {
    const row = (poses as readonly FighterPose[]).indexOf(pose);
    if (row < 0) continue;
    const version = id === 'rui' ? 'v5' : id === 'kalliane' ? 'v2' : 'v1';
    const frameCount = 6;
    const result = { texture: `${id}-${version}-${group}`, frames: Array.from({ length: frameCount }, (_, i) => row*6+i),
      frameRate: pose === 'run' ? 18 : pose === 'walk' ? 14 : pose === 'idle' ? 8 : 14,
      repeat: ['idle', 'walk', 'run'].includes(pose) ? -1 : 0 };
    advancedAnimationCache.set(key, result);
    return result;
  }
  throw new Error(`${id}: pose sem animação ${pose}`);
}

const monteiroAnimationCache = new Map<FighterPose, MonteiroAnimation>();

export function monteiroAnimation(pose: FighterPose): MonteiroAnimation {
  const cached = monteiroAnimationCache.get(pose);
  if (cached) return cached;
  for (const [group, action] of Object.entries(monteiroV6Groups)) {
    if (pose !== action) continue;
    const animation: MonteiroAnimation = { group, sheet: 'v6', frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 16, repeat: 0 };
    monteiroAnimationCache.set(pose, animation);
    return animation;
  }
  for (const [group, poses] of Object.entries(monteiroAnimationGroups)) {
    const row = (poses as readonly FighterPose[]).indexOf(pose);
    if (row < 0) continue;
    const rate = pose === 'idle' ? 8 : pose === 'run' ? 18 : pose === 'walk' ? 14 : pose === 'land' ? 30 : pose === 'backhop' ? 17 : 14;
    const animation: MonteiroAnimation = { group, sheet: 'v5', frames: Array.from({ length: 6 }, (_, i) => row * 6 + i), frameRate: rate,
      repeat: ['idle', 'walk', 'run'].includes(pose) ? -1 : 0 };
    monteiroAnimationCache.set(pose, animation);
    return animation;
  }
  throw new Error(`Monteiro: pose sem animação ${pose}`);
}

export type SpriteSheetLayout = {
  frameWidth: number;
  frameHeight: number;
};

export type FighterAnimation = {
  frames: readonly number[];
  frameRate: number;
  repeat: number;
};

// Descreve a grade de uma folha. Existe porque a v4 passou a ter 6 colunas
// (para caber a caminhada de 6 quadros) enquanto a v3 continua com 4. O
// indice de quadro do Phaser e `linha * colunas + coluna`, entao o numero de
// colunas NAO pode ser assumido: ele muda o indice de todas as linhas abaixo.
export type SheetGrid = {
  columns: number;
  // Quantos quadros uma pose usa quando nao esta em `frameCount`. NAO pode
  // ser deduzido de `columns`: numa folha de 6 colunas so a caminhada usa as
  // seis, e as demais linhas deixam duas celulas vazias. Sem isto o idle
  // animaria duas celulas transparentes e o personagem piscaria.
  defaultFrames: number;
  // Excecoes por pose.
  frameCount?: Partial<Record<FighterPose, number>>;
  // Poses que a folha NAO possui como linha propria e que reusam a linha de
  // outra pose. Existe porque as folhas v3 tem oito linhas e nao incluem
  // agachamento: nelas `crouch` cai na linha de guarda, que e exatamente o
  // comportamento que o jogo tinha antes da arte de agachar existir.
  aliases?: Partial<Record<FighterPose, FighterPose>>;
};

// Grade historica: 4 colunas, 4 quadros por pose, 8 linhas. E o padrao quando
// nenhuma grade e informada, para que as oito folhas v3 sigam funcionando sem
// mudanca. Nao tem linha de agachamento, entao `crouch` reusa a guarda.
export const LEGACY_GRID: SheetGrid = {
  columns: 4,
  defaultFrames: 4,
  // `gauncho` e visual exclusivo do Rui (unico com folha v4); nas folhas v3
  // (todo o resto do elenco) o gancho continua mostrando o soco comum, que e
  // exatamente o comportamento de hoje.
  aliases: { crouch: 'guard', gauncho: 'punch' },
};

// Grade da v4: 6 colunas. Caminhada e especial usam as seis; as demais linhas
// usam quatro quadros e deixam duas celulas vazias, que nunca sao exibidas
// porque `frameCount` limita a sequencia. O agachamento tem linha propria (a
// nona) e usa tres quadros: o quarto quadro da arte e o personagem se
// levantando, e como o agachamento e sustentado enquanto a tecla estiver
// pressionada, incluir esse quadro faria o personagem subir e descer sozinho.
// O especial usa os seis porque a arte do Firewall Punch e uma sequencia
// completa (carga 1-3, impacto 4-5, recuperacao 6) e cortar em quatro
// removeria justamente a recuperacao. O pulo tambem ganhou arte propria (a
// fonte tem 6 poses), mas usa o `defaultFrames` de 4 sem excecao aqui: a
// selecao dos quadros 2-5 (descartando os dois quadros de agachamento
// quase identicos) ja acontece no script de build (scripts/build-rui-v4.py).
export const WIDE_GRID: SheetGrid = {
  columns: 6,
  defaultFrames: 4,
  frameCount: { walk: 6, crouch: 3, special: 6, gauncho: 6 },
};

export type SheetVersion = 'v3' | 'v4';

// Unico lugar que associa versao de folha a grade. Quando um personagem
// migrar para a v4, basta marcar a versao em `fighters.ts`.
export function sheetGrid(version: SheetVersion): SheetGrid {
  return version === 'v4' ? WIDE_GRID : LEGACY_GRID;
}

const rows: Record<FighterPose, number> = {
  idle: 0,
  walk: 1,
  walkBack: 1,
  punch: 2,
  kick: 3,
  guard: 4,
  jump: 5,
  special: 6,
  hurt: 7,
  // Nona linha, so presente nas folhas v4. Em folhas de oito linhas o alias
  // de `crouch` redireciona para `guard` antes de chegar aqui.
  crouch: 8,
  // Decima linha, so presente nas folhas v4. Em folhas de oito linhas o
  // alias de `gauncho` redireciona para `punch` antes de chegar aqui.
  gauncho: 9,
  run: 10, backhop: 11, doublejump: 12, airkick: 13, land: 14, sweep: 15,
  hurtStrong: 16, hurtLow: 17, hurtHigh: 18, knockdown: 19, getup: 20,
  super: 21, blockHit: 22, victory: 23,
  punchStrong: 24, kickStrong: 25,
};

// Com apenas 4 quadros por pose, a cadencia e o que separa "animacao travada"
// de "animacao fluida". A referencia do genero (Street Fighter III, KOF) e:
// poses sustentadas respiram devagar, golpes tem partida rapida.
const frameRates: Record<FighterPose, number> = {
  // Poses em loop: lentas e continuas, para o personagem "respirar" parado.
  idle: 7,
  walk: 12,
  walkBack: 12,
  guard: 8,
  // Golpes: rapidos o bastante para o impacto nao parecer em camera lenta.
  punch: 16,
  kick: 14,
  special: 12,
  // Pulo e dano acompanham a fisica: nao podem terminar antes do movimento.
  jump: 10,
  hurt: 12,
  // Agachar e uma transicao curta, nao um loop: precisa ser rapido o
  // bastante para a pose agachada responder ao toque da tecla. A 14fps os
  // tres quadros levam ~0,2s -- proximo do tempo de agachar de Street
  // Fighter III, e abaixo do cooldown do soco (0,44s), entao a pose ja
  // esta assentada quando um golpe agachado sai.
  crouch: 14,
  // MOVES.hook soma 5+4+6 = 15 frames de simulacao a 60fps = 0,25s -- essa
  // janela e a mesma para todo personagem e nao muda (gameplay identica).
  // A 24fps (a cadencia que faria os 6 quadros caberem exatos nos 0,25s,
  // igual ao raciocinio do `punch`) a explosao do impacto passava rapido
  // demais para ser vista. Por isso o Gauncho usa uma cadencia bem mais
  // lenta e sustenta o ultimo quadro por conta propria (ver
  // `gaunchoVisualUntil` em arena.ts): a animacao tem permissao de continuar
  // tocando depois que o personagem ja recuperou o controle, sem atrasar a
  // recuperacao de ninguem -- so estica o quanto o golpe fica visivel na
  // tela. A 10fps os 6 quadros levam 0,6s, ritmo de finalizador (proximo do
  // Firewall Punch a 12fps/6 quadros = 0,5s) em vez de golpe comum.
  gauncho: 10,
  run: 18, backhop: 17, doublejump: 14, airkick: 18, land: 30, sweep: 18,
  hurtStrong: 14, hurtLow: 14, hurtHigh: 14, knockdown: 12, getup: 14,
  super: 14, blockHit: 14, victory: 10,
  punchStrong: 14, kickStrong: 14,
};

// Poses que voltam ao ultimo quadro e ficam nele (em vez de reiniciar) ou que
// devem sustentar a leitura da pose ate o estado da FSM mudar.
const holdsLastFrame: Record<FighterPose, boolean> = {
  idle: false,
  walk: false,
  walkBack: false,
  guard: false,
  punch: true,
  kick: true,
  special: true,
  jump: true,
  hurt: true,
  // Agachar toca a descida uma vez e SEGURA na pose agachada. Em loop, o
  // personagem ficaria repetindo o movimento de agachar enquanto estivesse
  // simplesmente parado agachado.
  crouch: true,
  // Golpe de um tempo so, igual ao soco: nao e loop.
  gauncho: true,
  run: false, backhop: true, doublejump: true, airkick: true, land: true, sweep: true,
  hurtStrong: true, hurtLow: true, hurtHigh: true, knockdown: true, getup: true,
  super: true, blockHit: true, victory: true,
  punchStrong: true, kickStrong: true,
};

// Folhas antigas continuam recebendo apenas suas dez poses originais.
export const fighterPoses: FighterPose[] = ['idle', 'walk', 'punch', 'kick', 'guard', 'jump', 'special', 'hurt', 'crouch', 'gauncho'];

export function spriteSheetLayout(id: FighterId): SpriteSheetLayout {
  void id;
  return { frameWidth: 320, frameHeight: 256 };
}

export function fighterAnimation(
  pose: FighterPose,
  grid: SheetGrid = LEGACY_GRID,
): FighterAnimation {
  // Resolve antes de tudo: numa folha sem linha propria para esta pose, todo
  // o resto (linha, contagem de quadros, cadencia) tem que vir da pose que
  // ela reusa, senao leriamos uma linha que nao existe no arquivo.
  const source = grid.aliases?.[pose] ?? pose;
  const columns = grid.columns;
  const count = Math.min(grid.frameCount?.[source] ?? grid.defaultFrames, columns);
  const start = rows[source] * columns;
  const frames = Array.from({ length: count }, (_, index) => start + index);
  return {
    frames,
    frameRate: source === 'walk' ? walkFrameRate(count) : frameRates[source],
    repeat: holdsLastFrame[source] ? 0 : -1,
  };
}

// Caminhadas com mais quadros precisam de cadencia maior para durar o mesmo
// tempo: 6 quadros a 12fps levariam 0,5s por ciclo contra 0,33s dos 4 quadros
// originais, e o passo pareceria arrastado. Escalar pelo numero de quadros
// mantem a duracao do ciclo constante.
export function walkFrameRate(frameCount: number): number {
  return Math.round(frameRates.walk * (frameCount / 4));
}

export function poseHoldsLastFrame(pose: FighterPose): boolean {
  return holdsLastFrame[pose];
}

// Mapeia o estado da FSM (fonte da verdade sobre o que o personagem está
// fazendo) para uma das linhas animadas da folha. Estados equivalentes
// compartilham a mesma sequência (super/especial e agachar/defender).
// `move` diferencia o golpe agachado (gancho) do soco reto dentro do mesmo
// estado `attack` -- os dois compartilham FSM, mas só o Rui tem arte própria
// para o gancho (ver alias `gauncho -> punch` em LEGACY_GRID).
export function visualPose(state: FighterState, move?: MoveId): FighterPose {
  switch (state) {
    case 'walk': return 'walk';
    case 'attack':
      return move === 'hook' ? 'gauncho' : 'punch';
    case 'kick': return 'kick';
    case 'special':
    case 'super': return 'special';
    case 'guard':
    case 'blockstun': return 'guard';
    case 'jump': return 'jump';
    case 'hurt': return 'hurt';
    // Agachar deixou de ser sinonimo de defender: agora pede a propria pose.
    // Em folhas sem linha de agachamento o alias da grade devolve a guarda,
    // preservando o visual antigo de quem ainda nao tem a arte nova.
    case 'crouch': return 'crouch';
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
