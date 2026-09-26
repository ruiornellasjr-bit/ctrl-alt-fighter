# Ctrl+Alt+Fighter

Jogo de luta 2D para navegador criado para a equipe BBS One e Bug BusterS. Escolha um dos seis colegas, conclua o treino interativo e enfrente três adversários controlados pelo computador.

## Jogar no computador

- `←` e `→`: mover
- `↑`: pular; segure `←` ou `→` no ar para passar por cima do adversário
- `J`: atacar
- `K`: defender enquanto a tecla estiver pressionada
- `L`: poder especial
- Barra cheia + `↓`, direção do adversário, `L`: golpe forte
- `Esc`: pausar ou continuar

Cada confronto dura até 60 segundos. Se o tempo acabar, vence quem tiver mais vida. A primeira partida apresenta o tutorial, que pode ser repetido pelo menu.

## Executar localmente

```bash
npm install
npm run dev
```

Para verificar e gerar os arquivos estáticos:

```bash
npm test
npm run build
```

O resultado fica em `dist/`. O projeto usa TypeScript, Vite e Phaser 4. Música, vinhetas e efeitos são sintetizados por Web Audio após o clique em **Jogar**. Música e efeitos têm volumes separados; silêncio e volumes são salvos no navegador.

## Arte

As fotos de seleção vêm da pasta `Ideias` fornecida para este projeto. As versões de combate, com poses de movimento, ataque, defesa, salto, especial e dano, foram criadas com base nas referências dos funcionários. Os novos cenários mantêm o piso da arena livre para a luta. Os arquivos necessários para executar o jogo estão em `public/assets/`.

## Acesso

O jogo está publicado como site público no ChatGPT Sites. A área de cadastro fica para uma versão futura.
