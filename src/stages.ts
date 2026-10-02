export const stages = [
  { id: 'office', name: 'Fim do Expediente', detail: 'O escritório depois das 18h', art: import.meta.env.BASE_URL + 'assets/stages/office-arena.webp' },
  { id: 'datacenter', name: 'Datacenter', detail: 'Quando o chamado esquenta', art: import.meta.env.BASE_URL + 'assets/stages/datacenter-arena.webp' },
  { id: 'rooftop', name: 'Cobertura BBS', detail: 'Vista da cidade no fim do dia', art: import.meta.env.BASE_URL + 'assets/stages/rooftop-arena.webp' },
  { id: 'war-room', name: 'Sala de Operações', detail: 'Toda tela mostra um problema', art: import.meta.env.BASE_URL + 'assets/stages/war-room-arena.webp' },
  { id: 'cafeteria', name: 'Café das 17h59', detail: 'Cinco minutos sem perder a amizade', art: import.meta.env.BASE_URL + 'assets/stages/cafeteria-arena.webp' },
  { id: 'ultima-conexao', name: 'Última Conexão', detail: 'O datacenter depois do fim do mundo', art: import.meta.env.BASE_URL + 'assets/stages/ultima-conexao-arena.webp' },
] as const;

export type StageId = (typeof stages)[number]['id'];

export function isStageId(value: unknown): value is StageId {
  return stages.some(stage => stage.id === value);
}
