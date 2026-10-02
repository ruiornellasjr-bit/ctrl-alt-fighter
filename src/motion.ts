// Deteccao do comando ↓→ (quarto de circulo para frente), usado pelo Firewall
// Punch do Rui. Deliberadamente restrito a ESTE movimento: nao e um parser de
// notacao generico. Se um dia outro personagem precisar de ↓← ou de um
// movimento de meia-lua, este arquivo cresce -- ate la, resolver so o caso
// real mantem a regra legivel e testavel.
//
// Por que "frente" e nao "direita": num jogo de luta o comando e relativo ao
// lado para onde o personagem OLHA. Se o Rui estiver do lado direito da tela
// olhando para a esquerda, o mesmo golpe sai com ↓ seguido de ←. Quem traduz
// tecla para direcao relativa e quem registra o toque (a arena, que conhece o
// `facing` no instante da tecla), nao esta funcao.

export type MotionDirection = 'down' | 'forward' | 'back';
export type MotionInput = { direction: MotionDirection; at: number };

// Janela entre o ↓ e o →. 0,4s e folgado para quem esta aprendendo (Street
// Fighter trabalha com ~0,25s), e continua curto o bastante para um ↓ casual
// de agachamento nao virar especial quando o jogador anda para frente em
// seguida -- o golpe ainda exige o soco dentro da janela seguinte.
export const MOTION_WINDOW = 0.4;
// Janela entre o → e o soco. Separada da anterior de proposito: o jogador
// costuma completar o giro rapido e so entao apertar o botao.
export const BUTTON_WINDOW = 0.25;
// Quantos toques guardar. Tres bastam para ↓→ com uma direcao de sobra; um
// buffer maior so faria comandos antigos ressuscitarem.
export const MOTION_BUFFER = 4;

// Registra um toque de direcao, descartando os mais antigos.
export function pushMotion(
  log: readonly MotionInput[],
  direction: MotionDirection,
  at: number,
): MotionInput[] {
  return [...log, { direction, at }].slice(-MOTION_BUFFER);
}

// Houve ↓ e depois → dentro da janela, e o soco veio logo apos o →?
//
// A ordem importa: procuramos o ULTIMO `forward` e exigimos um `down` ANTES
// dele. Aceitar qualquer ordem faria o movimento sair de →↓, que e o comando
// de outro golpe no genero e deixaria o input impreciso.
export function quarterCircleForward(
  log: readonly MotionInput[],
  now: number,
): boolean {
  for (let i = log.length - 1; i >= 0; i--) {
    const forward = log[i];
    if (forward.direction !== 'forward') continue;
    if (now - forward.at > BUTTON_WINDOW) return false;
    for (let j = i - 1; j >= 0; j--) {
      const down = log[j];
      // Um `back` entre o ↓ e o → quebra o movimento: o jogador mudou de
      // ideia e voltou, nao completou um quarto de circulo.
      if (down.direction === 'back') return false;
      if (down.direction === 'down') return forward.at - down.at <= MOTION_WINDOW;
    }
    return false;
  }
  return false;
}
