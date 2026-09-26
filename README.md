# CTRL+ALT+FIGHTER

Jogo de luta 2D para navegador dos Os Binários. Sem conta ou cadastro: qualquer pessoa com o link público pode jogar. O modo arcade passa por três adversários e termina no Cliente do Escopo Infinito, com duas fases. Há versus local e uma sala online privada para dois jogadores em dispositivos diferentes.

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

`Esc` pausa. O tutorial ensina as ações na própria arena. Em aparelhos com toque há botões na tela; o versus local usa teclado.

## Versus online

1. O Player 1 abre **Criar sala online**, escolhe lutador e cenário e copia o convite.
2. O Player 2 abre o link em seu próprio navegador e escolhe um lutador.
3. A partida começa automaticamente. Cada jogador usa `←` `→` `↑` `↓`, `J`, `K` e `L` em seu próprio dispositivo; os botões de toque também funcionam.

O Player 1 mantém a aba da sala aberta durante a luta. A arena é simulada no navegador do Player 1 e transmitida por WebRTC ao Player 2. A conexão usa o serviço público de sinalização do PeerJS. Não há servidor próprio de partidas nem banco de dados; algumas redes que bloqueiam WebRTC podem impedir a transmissão. O link contém um identificador aleatório de sala e deve ser compartilhado apenas com o adversário.

## Executar e publicar

Requisitos: Node.js e pnpm. Use `pnpm install`, `pnpm test` e `pnpm build`. Os arquivos prontos ficam em `dist/`; hospede essa pasta em qualquer serviço de sites estáticos com HTTPS. O Site publicado no ChatGPT usa a mesma saída estática.

O jogo usa TypeScript, Vite e Phaser. Música chiptune, vinhetas e efeitos são gerados pelo Web Audio após uma interação do jogador. Música e efeitos têm volumes separados, salvos neste navegador.

## Arte

Os seis colegas são os lutadores jogáveis. Dona Homologação, O Prazo e o Cliente do Escopo Infinito são adversários fictícios com poses animadas. A aparição surpresa do Adalberto usa a foto em preto e branco fornecida pela equipe. As artes dos três adversários fictícios foram geradas especificamente para este jogo. Os arquivos necessários estão em `public/assets/`.
