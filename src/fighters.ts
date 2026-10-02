import type { FighterId } from './rules';

// `barrier` continua existindo: e o `alternateKind` de cinco personagens e o
// especial do chefao. Quem deixou de usa-lo como especial foi so o Rui, que
// ganhou arte propria de golpe ofensivo (`firewall`).
export type SpecialKind = 'projectile' | 'boomerang' | 'barrier' | 'cable' | 'firewall' | 'shield';

export interface FighterDef {
  id: FighterId;
  name: string;
  codename: string;
  role: string;
  accent: string;
  portraitSource: string;
  art: string;
  special: string;
  alternate: string;
  superName: string;
  specialKind: SpecialKind;
  alternateKind: SpecialKind;
  projectileLabel: string;
  intro: string;
  poses?: boolean;
  spriteSheetVersion?: 'v3' | 'v4';
  animationSet?: 'monteiro-v5' | 'yafa-v1' | 'rui-v5' | 'caio-v1' | 'kalliane-v1' | 'kalliane-v2' | 'laura-v1' | 'vinicius-v1';
}

const base = import.meta.env.BASE_URL + 'assets/';

export const fighters: Record<FighterId, FighterDef> = {
  kalliane: { id: 'kalliane', name: 'Kalliane', codename: 'DEAL-MAKER', role: 'COMERCIAL', accent: '#ff47bd', portraitSource: base + 'characters/kalliane/portrait-v2.webp', art: base + 'characters/kalliane/portrait-v2.webp', special: 'Proposta irresistível', alternate: 'Rede de contatos', superName: 'Contrato Assinado!', specialKind: 'projectile', alternateKind: 'barrier', projectileLabel: 'PROPOSTA', intro: 'A proposta chegou. Vai fechar?', poses: true, animationSet: 'kalliane-v2' },
  laura: { id: 'laura', name: 'Laura', codename: 'BALANCE', role: 'FINANCEIRO', accent: '#ffb53f', portraitSource: base + 'characters/laura/portrait.webp', art: base + 'characters/laura/portrait.webp', special: 'Investimento certo', alternate: 'Corte de custos', superName: 'Fechamento do Mês', specialKind: 'projectile', alternateKind: 'cable', projectileLabel: 'PLANILHA', intro: 'Os números estão a meu favor.', poses: true, animationSet: 'laura-v1' },
  caio: { id: 'caio', name: 'Caio', codename: 'REBOOT', role: 'SUPORTE', accent: '#34c7ff', portraitSource: base + 'characters/caio/portrait.webp', art: base + 'characters/caio/portrait.webp', special: 'Ticket bumerangue', alternate: 'Tela azul', superName: 'Reinício Forçado', specialKind: 'boomerang', alternateKind: 'barrier', projectileLabel: 'TICKET', intro: 'Já tentou reiniciar?', poses: true, animationSet: 'caio-v1' },
  rui: { id: 'rui', name: 'Rui', codename: 'COMMAND', role: 'COORDENAÇÃO DE TI', accent: '#ffd34f', portraitSource: base + 'characters/rui/portrait.webp', art: base + 'characters/rui/portrait.webp', special: 'Firewall Punch', alternate: 'Plano perfeito', superName: 'Sincronia Total', specialKind: 'firewall', alternateKind: 'projectile', projectileLabel: 'PLANO', intro: 'Pessoas, tecnologia e resultado.', poses: true, animationSet: 'rui-v5' },
  monteiro: { id: 'monteiro', name: 'Monteiro', codename: 'DEPLOY', role: 'INFRAESTRUTURA', accent: '#74e885', portraitSource: base + 'characters/monteiro/portrait.webp', art: base + 'characters/monteiro/portrait.webp', special: 'Cabo de rede', alternate: 'Backup supremo', superName: 'Infraestrutura Sólida', specialKind: 'cable', alternateKind: 'barrier', projectileLabel: 'REDE', intro: 'Aqui a estrutura aguenta.', poses: true, animationSet: 'monteiro-v5' },
  vinicius: { id: 'vinicius', name: 'Vinicius', codename: 'FIX-IT', role: 'SUPORTE / DATACENTER', accent: '#668dff', portraitSource: base + 'characters/vinicius/portrait.webp', art: base + 'characters/vinicius/portrait.webp', special: 'Processador voador', alternate: 'Campo de rede', superName: 'Modo Turbo do Datacenter', specialKind: 'projectile', alternateKind: 'cable', projectileLabel: 'CPU', intro: 'No datacenter, tudo acelera.', poses: true, animationSet: 'vinicius-v1' },
  yafa: { id: 'yafa', name: 'Yafa', codename: 'GUARDIÃO DA APÓLICE', role: 'CHEFÃO FINAL', accent: '#4ecbff', portraitSource: base + 'characters/yafa/portrait.webp', art: base + 'characters/yafa/portrait.webp', special: 'Escudo da Apólice', alternate: 'Cobertura Total', superName: 'Cláusula Final', specialKind: 'shield', alternateKind: 'barrier', projectileLabel: 'APÓLICE', intro: 'A sua vitória está coberta?', poses: true, animationSet: 'yafa-v1' },
};

export const roster = ['kalliane', 'laura', 'caio', 'rui', 'monteiro', 'vinicius', 'yafa'].map(id => fighters[id as FighterId]);

export function hasAdvancedCombat(id: FighterId): boolean { return Boolean(fighters[id]?.animationSet); }
