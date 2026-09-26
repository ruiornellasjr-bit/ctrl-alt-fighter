# CTRL+ALT+FIGHTER

Jogo de luta 2D para navegador dos Os Binários. Sem conta ou cadastro: qualquer pessoa com o link público pode jogar. O modo arcade passa por três adversários e termina no Cliente do Escopo Infinito, com duas fases. Há também versus local para dois jogadores no mesmo teclado.

## Controles

| Ação | Player 1 | Player 2 no versus |
| --- | --- | --- |
| Mover | `←` e `→` | `A` e `D` |
| Pular | `↑` | `W` |
| Ataque | `J` | `F` |
| Gancho | `↓` + `J` | `S` + `F` |
| Defesa | segurar `K` | segurar `G` |
| Especial | `L` | `H` |
| Segundo especial | direção do rival + `L` | direção do rival + `H` |
| Super com barra cheia | `↓` + `L` | `S` + `H` |

`Esc` pausa. O tutorial ensina as ações na própria arena. Em aparelhos com toque há botões na tela para o Player 1; o versus local usa teclado.

## Executar e publicar

Requisitos: Node.js e npm. Use `npm ci`, `npm test` e `npm run build`. Os arquivos prontos ficam em `dist/`; hospede essa pasta em qualquer serviço de sites estáticos com HTTPS. Não há API, login ou banco de dados. O Site publicado no ChatGPT usa a mesma saída estática.

O jogo usa TypeScript, Vite e Phaser. Música chiptune, vinhetas e efeitos são gerados pelo Web Audio após uma interação do jogador. Música e efeitos têm volumes separados, salvos neste navegador.

## Arte

Os seis colegas são os lutadores jogáveis. Dona Homologação, O Prazo e o Cliente do Escopo Infinito são adversários fictícios. A aparição surpresa do Adalberto usa a foto em preto e branco fornecida pela equipe. As artes dos três adversários fictícios foram geradas especificamente para este jogo. Os arquivos necessários estão em `public/assets/`.
