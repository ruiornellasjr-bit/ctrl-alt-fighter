export const stages = [
  { id: 'office', name: 'Fim do Expediente', detail: 'O escritório depois das 18h', art: '/assets/office-arena.png' },
  { id: 'datacenter', name: 'Datacenter', detail: 'Quando o chamado esquenta', art: '/assets/datacenter-arena.png' },
  { id: 'rooftop', name: 'Cobertura BBS', detail: 'Vista da cidade no fim do dia', art: '/assets/rooftop-arena.png' },
  { id: 'war-room', name: 'Sala de Operações', detail: 'Toda tela mostra um problema', art: '/assets/war-room-arena.png' },
  { id: 'cafeteria', name: 'Café das 17h59', detail: 'Cinco minutos sem perder a amizade', art: '/assets/cafeteria-arena.png' },
] as const;

export type StageId = (typeof stages)[number]['id'];

export function isStageId(value: unknown): value is StageId {
  return stages.some(stage => stage.id === value);
}
