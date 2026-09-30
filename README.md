# CTRL+ALT+FIGHTER

Jogo de luta 2D para navegador dos Os Binários. Sem conta ou cadastro: qualquer pessoa com o link público pode jogar. O modo arcade passa por três adversários e termina no Cliente do Escopo Infinito, com duas fases. A sala online permite uma luta entre duas pessoas em dispositivos diferentes.

## Controles

| Ação | Teclado | Celular ou tablet |
| --- | --- | --- |
| Mover | `A` e `D` | direcional na tela |
| Pular | `W` | botão `↑` |
| Agachar | `S` | botão `↓` |
| Ataque | `J` | botão **Soco** |
| Gancho | `S` + `J` | segure `↓` e toque **Soco** |
| Chute | `K` | botão **Chute** |
| Defesa | segurar `I` | segure **Defesa** |
| Especial | `L` | botão **Poder** |
| Segundo especial | direção do rival + `L` | direção do rival + **Poder** |
| Super com barra cheia | `U` | toque **Especial** |

`Esc` pausa. O tutorial ensina as ações na própria arena. Em telas pequenas, os menus e resultados usam a altura disponível do celular, e os controles touch ficam abaixo da arena. Na orientação horizontal, a arena ganha mais espaço.

No versus local, o Player 2 usa as setas para mover, pular e agachar; no teclado numérico, `4` soca, `5` chuta, `6` usa o poder, `1` ativa o super e `2` defende. No versus online, cada jogador usa os controles do Player 1 em seu próprio dispositivo.

## Versus online

1. O Player 1 abre **Criar sala online**, escolhe lutador e cenário e copia o convite.
2. O Player 2 abre o link em seu próprio navegador e escolhe um lutador.
3. A partida começa automaticamente. Cada jogador usa os controles do Player 1 em seu próprio dispositivo; os botões de toque também funcionam.

O Player 1 mantém a aba da sala aberta durante a luta. A arena é simulada no navegador do Player 1 e transmitida por WebRTC ao Player 2. A conexão usa o serviço público de sinalização do PeerJS. Não há servidor próprio de partidas nem banco de dados; algumas redes que bloqueiam WebRTC podem impedir a transmissão. O link contém um identificador aleatório de sala e deve ser compartilhado apenas com o adversário.

## Versões

- `v1.0.0`: importação do checkpoint do jogo antes da adaptação mobile.
- `v1.1.0`: menus e resultados ajustados à tela do celular; controles touch maiores e área segura para telas com recortes.

## Executar e publicar

### Colisões e impacto

O combate usa passos fixos de 60 Hz. `src/combat.ts` centraliza os retângulos de colisão e os tempos dos golpes em frames:

| Golpe | Startup | Ativa | Recovery |
| --- | ---: | ---: | ---: |
| Soco | 4 | 3 | 8 |
| Gancho | 5 | 4 | 6 |
| Chute | 6 | 4 | 11 |
| Barreira / cabo | 7 | 6 | 13 |
| Projétil | 7 | 1 (emissão) | 18 |
| Super | 16 | 3 | 32 |

Golpes corpo a corpo e super só possuem hitbox na janela ativa e a consomem no primeiro contato, incluindo defesa. Um golpe interrompido perde sua caixa. O super mantém o alcance de toda a arena. Projéteis surgem na emissão, têm sua própria hitbox durante o voo e são removidos no primeiro contato ou ao expirar; não dependem da recuperação do dono.

Acertos e bloqueios pausam ambos os lutadores, a física, os projéteis e os relógios de combate por **3 frames (50 ms)**. O knockback de acerto e a conclusão de KO são aplicados ao fim da pausa; a defesa mantém o comportamento anterior sem deslocamento. Entradas recebidas durante a pausa ficam para o próximo passo de combate.

No tutorial/treino, pressione **B** para alternar o debug: hurtbox do jogador em verde, do adversário em azul e hitboxes em vermelho. A flag `ArenaScene.debugHitboxes` também permite ativá-lo por código. Os retângulos desenhados são os mesmos usados na colisão e ficam ocultos fora do treino. Controle aéreo, ataques iniciados no ar/agachado e super cancelando guarda com barra cheia continuam permitidos.

Requisitos: Node.js e pnpm. Use `pnpm install`, `pnpm test` e `pnpm build`. Os arquivos prontos ficam em `dist/`; hospede essa pasta em qualquer serviço de sites estáticos com HTTPS. O Site publicado no ChatGPT usa a mesma saída estática.

O jogo usa TypeScript, Vite e Phaser. Música chiptune, vinhetas e efeitos são gerados pelo Web Audio após uma interação do jogador. Música e efeitos têm volumes separados, salvos neste navegador.

## Arte

Os seis colegas são os lutadores jogáveis. Dona Homologação, O Prazo e o Cliente do Escopo Infinito são adversários fictícios com poses animadas. A aparição surpresa do Adalberto usa a foto em preto e branco fornecida pela equipe. As artes dos três adversários fictícios foram geradas especificamente para este jogo. Os arquivos necessários estão em `public/assets/`.
