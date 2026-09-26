import type { FighterId } from './rules';

export type SpecialKind = 'projectile' | 'boomerang' | 'barrier' | 'cable';

export interface FighterDef {
  id: FighterId;
  name: string;
  codename: string;
  role: string;
  accent: string;
  portraitSource: string;
  portraitRect: [number, number, number, number];
  art: string;
  special: string;
  superName: string;
  specialKind: SpecialKind;
  projectileLabel: string;
  intro: string;
}

const base = '/assets/';

export const fighters: Record<FighterId, FighterDef> = {
  kalliane: { id: 'kalliane', name: 'Kalliane', codename: 'DEAL-MAKER', role: 'COMERCIAL', accent: '#ff47bd', portraitSource: base + 'kalliane-card.png', portraitRect: [24, 170, 222, 191], art: base + 'kalliane.png', special: 'Proposta voadora', superName: 'Contrato Assinado!', specialKind: 'projectile', projectileLabel: 'PROPOSTA', intro: 'A proposta chegou. Vai fechar?' },
  laura: { id: 'laura', name: 'Laura', codename: 'BALANCE', role: 'FINANCEIRO', accent: '#ffb53f', portraitSource: base + 'laura-card.png', portraitRect: [47, 124, 219, 236], art: base + 'laura.png', special: 'Planilha voadora', superName: 'Fechamento do Mês', specialKind: 'projectile', projectileLabel: 'PLANILHA', intro: 'Os números estão a meu favor.' },
  caio: { id: 'caio', name: 'Caio', codename: 'REBOOT', role: 'SUPORTE', accent: '#34c7ff', portraitSource: base + 'caio-card.png', portraitRect: [21, 165, 227, 190], art: base + 'caio.png', special: 'Ticket bumerangue', superName: 'Reinício Forçado', specialKind: 'boomerang', projectileLabel: 'TICKET', intro: 'Já tentou reiniciar?' },
  rui: { id: 'rui', name: 'Rui', codename: 'COMMAND', role: 'SEGURANÇA', accent: '#ffd34f', portraitSource: base + 'rui-card.png', portraitRect: [5, 28, 76, 84], art: base + 'rui.png', special: 'Firewall estratégico', superName: 'Quarentena Total', specialKind: 'barrier', projectileLabel: 'FIREWALL', intro: 'Acesso negado!' },
  monteiro: { id: 'monteiro', name: 'Monteiro', codename: 'DEPLOY', role: 'INFRAESTRUTURA', accent: '#74e885', portraitSource: base + 'monteiro-card.png', portraitRect: [18, 124, 153, 132], art: base + 'monteiro.png', special: 'Cabo de rede', superName: 'Infraestrutura Sólida', specialKind: 'cable', projectileLabel: 'REDE', intro: 'Aqui a estrutura aguenta.' },
  vinicius: { id: 'vinicius', name: 'Vinicius', codename: 'FIX-IT', role: 'LENOVO / DATACENTER', accent: '#668dff', portraitSource: base + 'vinicius-card.png', portraitRect: [5, 41, 65, 82], art: base + 'vinicius.png', special: 'Processador voador', superName: 'Modo Turbo do Datacenter', specialKind: 'projectile', projectileLabel: 'CPU', intro: 'No datacenter, tudo acelera.' },
};

export const roster = Object.values(fighters);
