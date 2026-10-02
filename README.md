# CTRL+ALT+FIGHTER

Jogo de luta 2D para navegador dos Os Binários. Sem conta ou cadastro: qualquer pessoa com o link público pode jogar. O modo arcade passa por três adversários e termina na Yafa, com duas fases. A sala online permite uma luta entre duas pessoas em dispositivos diferentes.

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

## Sala de Treinamento

Abra **Sala de Treinamento** no menu, escolha um lutador e um cenário. Na primeira visita, uma faixa curta apresenta as 11 ações do tutorial; **Pular para treino livre** permite começar a praticar imediatamente. Depois de concluir o tutorial, as próximas visitas entram direto no treino livre, com a opção **Repetir tutorial** em **Mais**.

O treino livre continua na mesma arena, sem cronômetro ou vitória por nocaute. O dummy recupera vida e pode ficar parado, defender ou atacar periodicamente quando o jogador se aproxima. **Reiniciar** reposiciona os lutadores e recupera as barras. **Comandos** abre a lista de golpes abaixo da arena; **Mais** oferece o input display e a entrada opcional no torneio. **Sair** volta ao menu.

No versus local, o Player 2 usa as setas para mover, pular e agachar; no teclado numérico, `4` soca, `5` chuta, `6` usa o poder, `1` ativa o super e `2` defende. No versus online, cada jogador usa os controles do Player 1 em seu próprio dispositivo.

### Movimentos do Monteiro, Rui e Yafa

| Ação | Comando |
| --- | --- |
| Corrida | Dois toques rápidos em direção ao rival; mantenha o segundo pressionado |
| Dois saltos de recuo | Dois toques rápidos para longe do rival |
| Pulo duplo | `W` e depois `W` novamente no ar; direcione com `A` / `D` para cruzar o rival |
| Rasteira | `S` + `K` no chão |
| Chute aéreo | `K` no ar |
| Soco fraco | `J` |
| Soco forte | `H` |
| Chute fraco baixo | `K` |
| Chute forte alto | `O` |

Frente e trás acompanham o lado do rival: os comandos invertem depois de cruzá-lo. O intervalo entre os dois toques é de até 280 ms. Pulo, golpe ou defesa encerram a corrida; receber dano interrompe o recuo. Os mesmos gestos funcionam no direcional touch e nos controles do Player 2. O pulo duplo recarrega ao pousar e mantém o corpo dentro da arena. A rasteira tem uma área baixa de acerto e derruba o Monteiro quando ele é atingido. O treino e a tela de ajuda mostram os novos comandos.

Os quatro golpes do Monteiro usam oito quadros próprios; Rui e Yafa usam seis. Fracos são mais rápidos; fortes causam mais dano, têm maior alcance e demoram mais para recuperar. O chute forte alto passa por cima de um adversário agachado. `S` + `J` continua sendo gancho e `S` + `K` continua sendo rasteira. No Player 2, `Num4` / `Num7` dão soco fraco / forte e `Num5` / `Num8` dão chute fraco / forte. No celular, há botões separados para fraco e forte quando um desses três personagens está selecionado.

Quando Monteiro vence, uma vinheta arcade mostra a comemoração com o cabo de rede em volta do pescoço de um rival fictício derrotado. A tela de resultado aparece após 2,4 segundos, permitindo ver os seis quadros da comemoração. A sequência funciona nos dois lados do versus; sair da luta cancela o resultado pendente.

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
| Rasteira do Monteiro | 7 | 4 | 16 |
| Soco fraco do Monteiro | 4 | 2 | 8 |
| Soco forte do Monteiro | 10 | 4 | 20 |
| Chute fraco do Monteiro | 5 | 3 | 12 |
| Chute forte do Monteiro | 12 | 4 | 24 |
| Barreira / cabo | 7 | 6 | 13 |
| Projétil | 7 | 1 (emissão) | 18 |
| Super | 16 | 3 | 32 |

Golpes corpo a corpo e super só possuem hitbox na janela ativa e a consomem no primeiro contato, incluindo defesa. Um golpe interrompido perde sua caixa. O super mantém o alcance de toda a arena. Projéteis surgem na emissão, têm sua própria hitbox durante o voo e são removidos no primeiro contato ou ao expirar; não dependem da recuperação do dono.

Acertos e bloqueios pausam ambos os lutadores, a física, os projéteis e os relógios de combate por **3 frames (50 ms)**. O knockback de acerto e a conclusão de KO são aplicados ao fim da pausa; a defesa mantém o comportamento anterior sem deslocamento. Entradas recebidas durante a pausa ficam para o próximo passo de combate.

No tutorial/treino, pressione **B** para alternar o debug: hurtbox do jogador em verde, do adversário em azul e hitboxes em vermelho. A flag `ArenaScene.debugHitboxes` também permite ativá-lo por código. Os retângulos desenhados são os mesmos usados na colisão e ficam ocultos fora do treino. Controle aéreo, ataques iniciados no ar/agachado e super cancelando guarda com barra cheia continuam permitidos.

Requisitos: Node.js e pnpm. Use `pnpm install`, `pnpm test` e `pnpm build`. Os arquivos prontos ficam em `dist/`; hospede essa pasta em qualquer serviço de sites estáticos com HTTPS. O Site publicado no ChatGPT usa a mesma saída estática.

O jogo usa TypeScript, Vite e Phaser. A música do menu e a chamada de abertura usam arquivos de áudio; músicas de combate e efeitos são sintetizados pelo Web Audio após uma interação do jogador. Música e efeitos têm volumes separados, salvos neste navegador.

## Desempenho e distribuição

A primeira etapa de otimização reduziu `dist/` de 72,9 MB para 24,0 MB (aproximadamente 67%), antes de ampliar as animações do Monteiro. As 29 imagens daquela versão passaram de 53,2 MB para 15,9 MB. As novas animações acrescentam seis folhas, substituindo a folha e a imagem de vitória antigas do Monteiro. As folhas de animação usam WebP sem perda; retratos, logo e cenários usam dimensões menores e WebP com qualidade 88. Não é necessário instalar Python para jogar, testar ou compilar.

Com a coleção v5 do Monteiro, a distribuição ficou em aproximadamente **28,7 MB**, ainda cerca de 61% menor que a versão original de 72,9 MB. A coleção v6 acrescenta aproximadamente 1,8 MB para os quatro golpes e a comemoração.

A renderização tem limite de 60 FPS, acompanhando a simulação de combate de 60 Hz. Rastros e poeira reutilizam até 48 partículas; o painel de vida e a conexão online recebem atualizações quando os valores mudam. A seleção reutiliza os retratos diretamente, e a biblioteca PeerJS só é baixada ao criar ou entrar em uma sala. Esses ajustes reduzem trabalho e transferências; a taxa de quadros real depende do aparelho e do navegador.

Publique ou compartilhe apenas `dist/`. Para abrir a versão compilada no Windows, mantenha `ABRIR-JOGO.cmd` e `servidor-local.mjs` ao lado dessa pasta. `node_modules/`, caches, testes, scripts e `art-source/` são arquivos de desenvolvimento e não fazem parte da distribuição.

## Arte

Os seis colegas e a Yafa são os lutadores jogáveis. A Yafa é o chefe final da campanha. O aviso “TOAAAST!” aparece apenas como texto, sem foto, fala ou efeito sonoro. Os arquivos necessários estão em `public/assets/`; as artes dos personagens removidos ficam arquivadas em `art-source/`.

Os PNGs originais, fontes de criação, folhas antigas e metadados ficam em `art-source/`, fora da pasta publicada, para permitir futuras alterações da arte. Para regenerar as imagens estáticas leves após editar os originais, instale Pillow no seu ambiente Python e execute `python scripts/optimize-assets.py` antes de `pnpm build`. As coleções de animação novas usam os empacotadores próprios descritos abaixo; o script geral exclui folhas antigas e prévias.

O Monteiro usa a coleção **v5**, gerada com a ferramenta ImageGen integrada: 144 quadros em 24 animações, incluindo caminhada, corrida, recuo, pulo, pulo duplo, pouso, soco, gancho, chute alto, rasteira, chute aéreo, defesa, bloqueio atingido, impactos fraco/forte/baixo/alto, queda, recuperação, especial, super e vitória. Os quadros têm fundo transparente, escala comum e alinhamento dos pés; os golpes e pulos acompanham os tempos de colisão e a física do jogo.

As seis folhas PNG de origem estão em `art-source/characters/monteiro/v5-sources/`. Os prompts completos ficam em `art-source/characters/monteiro/generation-prompts-v5.json`, e a grade final em `manifest-v5.json` na mesma pasta do personagem. Para reconstruir os atlas após editar essas fontes, execute `python scripts/build-monteiro-v5.py` com Pillow e NumPy instalados. Ele extrai as silhuetas inteiras, organiza seis quadros por animação em células de 320 × 256 e verifica a igualdade dos pixels após salvar WebP. As seis saídas são `public/assets/characters/monteiro/monteiro-v5-*.webp`; elas são copiadas para `dist/` na compilação.

Os quatro golpes fraco/forte usam a coleção **v6**, com 32 quadros gerados no ImageGen integrado. Fontes, quadros individuais, GIFs e prompts ficam em `art-source/characters/monteiro/concepts-v6/`; os PNGs ficam no subdiretório `sources/`, que o otimizador geral não publica. `python scripts/build-monteiro-v6.py` exporta quatro atlas WebP sem perda, preservando o tamanho corporal e a linha de contato da v5. `runtime-manifest.json` registra dimensões, pivôs e grade. A comemoração genérica anterior permanece arquivada como fonte.

As comemorações do Monteiro estão integradas ao jogo: sete versões, com seis quadros cada, selecionadas pelo rival derrotado e espelhadas para o Player 2. A antiga arte com rival genérico foi arquivada. Fontes, quadros, GIFs e prompts estão em `art-source/characters/monteiro/victory-roster/`. `python scripts/build-monteiro-victories.py` publica folhas de 384 × 320 em `public/assets/characters/monteiro/victories/` e verifica os pixels WebP. `preview.html` permite conferir essas artes pelo servidor de desenvolvimento.

A **Yafa — Guardião da Apólice** substitui o Cliente e também pode ser selecionada. Homologação e Prazo foram removidos do elenco e da distribuição, mantendo as artes de origem arquivadas. A campanha sorteia três adversários diferentes antes da Yafa, que entra na segunda fase com 50% de vida. A Yafa usa **156 quadros em 26 animações**, incluindo fortes/fracos, corrida, dois recuos, pulo duplo, queda e recuperação. Compartilha os controles de mobilidade e força do Monteiro.

**Escudo da Apólice:** ataque frontal, 18 de dano, alcance de 196, preparação de 12 quadros, impacto de 6 e recuperação de 20 (simulação a 60 Hz). A proteção dura somente os seis quadros do impacto. Direção + especial usa **Cobertura Total**; o super é **Cláusula Final**. As animações acompanham a janela de colisão. `python scripts/build-yafa.py` separa as silhuetas completas, padroniza a escala e gera as sete folhas WebP sem perda e o retrato em `public/assets/characters/yafa/`. Referências, prompts, quadros individuais e prévias ficam em `art-source/characters/yafa/`.

O **Rui** usa a coleção **v5 com caminhada v6**, com **174 quadros em 27 animações**, gerados pelo ImageGen integrado. As caminhadas para frente e para trás possuem **12 quadros cada a 18 FPS**, em ciclos contínuos. Ao segurar a direção oposta ao rival, o Rui recua mantendo a guarda voltada para ele. Dois toques para trás continuam acionando os dois saltos de recuo. As demais animações têm seis quadros. Inclui os mesmos comandos de corrida, dois recuos, pulo duplo, rasteira, golpes fracos/fortes e reações do Monteiro e da Yafa, além de queda, recuperação e vitória. O Firewall Punch mantém 20 de dano, 15 quadros de preparação, 10 de impacto e 20 de recuperação; a imagem de impacto acompanha a janela de colisão. Plano Perfeito e Sincronia Total permanecem disponíveis. `python scripts/build-rui-v5.py` gera todas as folhas WebP sem perda com transparência e margens verificadas, incluindo o atlas separado de caminhada. `python scripts/build-rui-walk-v6.py` reconstrói somente a caminhada. Fontes, prompts, quadros individuais, GIFs e manifesto ficam em `art-source/characters/rui/`; as fontes novas e a prévia das doze passadas ficam em `walk-v6/`. A folha v4 foi arquivada e não faz parte da distribuição.
