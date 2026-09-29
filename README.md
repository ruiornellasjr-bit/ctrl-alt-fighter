# CTRL+ALT+FIGHTER

Jogo de luta 2D para navegador dos Os Binários. Sem conta ou cadastro: qualquer pessoa com o link público pode jogar. O modo arcade passa por três adversários e termina no Cliente do Escopo Infinito, com duas fases. A sala online permite uma luta entre duas pessoas em dispositivos diferentes.

## Controles

| Ação | Teclado | Celular ou tablet |
| --- | --- | --- |
| Mover | `←` e `→` | direcional na tela |
| Pular | `↑` | botão `↑` |
| Agachar | `↓` | botão `↓` |
| Ataque | `J` | botão **Soco** |
| Gancho | `↓` + `J` | segure `↓` e toque **Soco** |
| Chute | `I` | botão **Chute** |
| Defesa | segurar `K` | segure **Defesa** |
| Especial | `L` | botão **Poder** |
| Segundo especial | direção do rival + `L` | direção do rival + **Poder** |
| Super com barra cheia | `↓` + `L` | segure `↓` e toque **Especial** |

`Esc` pausa. O tutorial ensina as ações na própria arena. Em telas pequenas, os menus e resultados usam a altura disponível do celular, e os controles touch ficam abaixo da arena. Na orientação horizontal, a arena ganha mais espaço.

## Versus online

1. O Player 1 abre **Criar sala online**, escolhe lutador e cenário e copia o convite.
2. O Player 2 abre o link em seu próprio navegador e escolhe um lutador.
3. A partida começa automaticamente. Cada jogador usa `←` `→` `↑` `↓`, `J`, `K` e `L` em seu próprio dispositivo; os botões de toque também funcionam.

O Player 1 mantém a aba da sala aberta durante a luta. A arena é simulada no navegador do Player 1 e transmitida por WebRTC ao Player 2. A conexão usa o serviço público de sinalização do PeerJS. Não há servidor próprio de partidas nem banco de dados; algumas redes que bloqueiam WebRTC podem impedir a transmissão. O link contém um identificador aleatório de sala e deve ser compartilhado apenas com o adversário.

## Versões

- `v1.0.0`: importação do checkpoint do jogo antes da adaptação mobile.
- `v1.1.0`: menus e resultados ajustados à tela do celular; controles touch maiores e área segura para telas com recortes.

## Executar e publicar

Requisitos: Node.js e pnpm. Use `pnpm install`, `pnpm test` e `pnpm build`. Os arquivos prontos ficam em `dist/`; hospede essa pasta em qualquer serviço de sites estáticos com HTTPS. O Site publicado no ChatGPT usa a mesma saída estática.

O jogo usa TypeScript, Vite e Phaser. Música chiptune, vinhetas e efeitos são gerados pelo Web Audio após uma interação do jogador. Música e efeitos têm volumes separados, salvos neste navegador.

## Arte

Os seis colegas são os lutadores jogáveis. Dona Homologação, O Prazo e o Cliente do Escopo Infinito são adversários fictícios com poses animadas. A aparição surpresa do Adalberto usa a foto em preto e branco fornecida pela equipe. As artes dos três adversários fictícios foram geradas especificamente para este jogo. Os arquivos necessários estão em `public/assets/`.
