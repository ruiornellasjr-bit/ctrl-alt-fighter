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
  alternate: string;
  superName: string;
  specialKind: SpecialKind;
  alternateKind: SpecialKind;
  projectileLabel: string;
  intro: string;
  poses?: boolean;
}

const base = '/assets/';

export const fighters: Record<FighterId, FighterDef> = {
  kalliane: { id: 'kalliane', name: 'Kalliane', codename: 'DEAL-MAKER', role: 'COMERCIAL', accent: '#ff47bd', portraitSource: base + 'kalliane-card.png', portraitRect: [24, 170, 222, 191], art: base + 'kalliane.png', special: 'Proposta irresistível', alternate: 'Rede de contatos', superName: 'Contrato Assinado!', specialKind: 'projectile', alternateKind: 'barrier', projectileLabel: 'PROPOSTA', intro: 'A proposta chegou. Vai fechar?', poses: true },
  laura: { id: 'laura', name: 'Laura', codename: 'BALANCE', role: 'FINANCEIRO', accent: '#ffb53f', portraitSource: base + 'laura-card.png', portraitRect: [47, 124, 219, 236], art: base + 'laura.png', special: 'Investimento certo', alternate: 'Corte de custos', superName: 'Fechamento do Mês', specialKind: 'projectile', alternateKind: 'cable', projectileLabel: 'PLANILHA', intro: 'Os números estão a meu favor.', poses: true },
  caio: { id: 'caio', name: 'Caio', codename: 'REBOOT', role: 'SUPORTE', accent: '#34c7ff', portraitSource: base + 'caio-card.png', portraitRect: [21, 165, 227, 190], art: base + 'caio.png', special: 'Ticket bumerangue', alternate: 'Tela azul', superName: 'Reinício Forçado', specialKind: 'boomerang', alternateKind: 'barrier', projectileLabel: 'TICKET', intro: 'Já tentou reiniciar?', poses: true },
  rui: { id: 'rui', name: 'Rui', codename: 'COMMAND', role: 'COORDENAÇÃO DE TI', accent: '#ffd34f', portraitSource: base + 'rui-card.png', portraitRect: [5, 28, 76, 84], art: base + 'rui.png', special: 'Firewall estratégico', alternate: 'Plano perfeito', superName: 'Sincronia Total', specialKind: 'barrier', alternateKind: 'projectile', projectileLabel: 'PLANO', intro: 'Pessoas, tecnologia e resultado.', poses: true },
  monteiro: { id: 'monteiro', name: 'Monteiro', codename: 'DEPLOY', role: 'INFRAESTRUTURA', accent: '#74e885', portraitSource: base + 'monteiro-card.png', portraitRect: [18, 124, 153, 132], art: base + 'monteiro.png', special: 'Cabo de rede', alternate: 'Backup supremo', superName: 'Infraestrutura Sólida', specialKind: 'cable', alternateKind: 'barrier', projectileLabel: 'REDE', intro: 'Aqui a estrutura aguenta.', poses: true },
  vinicius: { id: 'vinicius', name: 'Vinicius', codename: 'FIX-IT', role: 'SUPORTE / DATACENTER', accent: '#668dff', portraitSource: base + 'vinicius-card.png', portraitRect: [5, 41, 65, 82], art: base + 'vinicius.png', special: 'Processador voador', alternate: 'Campo de rede', superName: 'Modo Turbo do Datacenter', specialKind: 'projectile', alternateKind: 'cable', projectileLabel: 'CPU', intro: 'No datacenter, tudo acelera.', poses: true },
  homologacao: { id: 'homologacao', name: 'Dona Homologação', codename: 'APROVAÇÃO', role: 'ADVERSÁRIA', accent: '#57aaff', portraitSource: base + 'homologacao.png', portraitRect: [0, 0, 1024, 1536], art: base + 'homologacao.png', special: 'Volta para ajuste', alternate: 'Carimbo final', superName: 'Teste Reprovado', specialKind: 'boomerang', alternateKind: 'barrier', projectileLabel: 'AJUSTE', intro: 'Faltou só um detalhezinho.', poses: true },
  prazo: { id: 'prazo', name: 'O Prazo', codename: 'URGENTE', role: 'ADVERSÁRIO', accent: '#ff677a', portraitSource: base + 'prazo.png', portraitRect: [0, 0, 1024, 1536], art: base + 'prazo.png', special: 'Calendário voador', alternate: 'Entrega relâmpago', superName: 'Era Para Ontem', specialKind: 'projectile', alternateKind: 'cable', projectileLabel: 'PRAZO', intro: 'É para ontem. De novo.', poses: true },
  cliente: { id: 'cliente', name: 'Cliente do Escopo Infinito', codename: 'CHEFÃO FINAL', role: 'CLIENTE', accent: '#ff9b45', portraitSource: base + 'cliente-escopo.png', portraitRect: [0, 0, 1145, 1374], art: base + 'cliente-escopo.png', special: 'Mudança de escopo', alternate: 'Revisão de escopo', superName: 'Só Mais Um Ajuste', specialKind: 'projectile', alternateKind: 'barrier', projectileLabel: 'ESCOPO', intro: 'É uma alteração bem simples...', poses: true },
};

export const roster = ['kalliane', 'laura', 'caio', 'rui', 'monteiro', 'vinicius'].map(id => fighters[id as FighterId]);
