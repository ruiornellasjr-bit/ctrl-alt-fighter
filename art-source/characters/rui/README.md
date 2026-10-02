# Animações do Rui

A coleção está integrada ao jogo: **174 quadros em 27 animações**,
com **12 quadros de caminhada para frente e 12 para trás** e seis nos demais movimentos,
em células de 320 × 256 pixels. Usa o mesmo
conjunto de mobilidade, golpes fortes/fracos e reações do Monteiro e da Yafa.
Mantém óculos, barba, colete, manopla mecânica, Firewall Punch, Plano Perfeito
e Sincronia Total. A vitória usa uma comemoração própria sem adversário extra.

`v5-sources/` guarda as sete folhas transparentes geradas pelo ImageGen
integrado e os prompts. `sources/frames/` contém os 174 PNGs individuais,
`sources/atlases/` contém cópias das folhas finais, e `previews/` contém 27 GIFs.
`preview.gif` reúne nove movimentos. `manifest-v5.json` registra a grade,
os nomes e os arquivos usados no jogo.

`walk-v6/` guarda fontes, prompts e folhas numeradas das caminhadas para frente
e para trás, ambas a 18 FPS. `preview.gif` mostra a frente, `back-preview.gif`
mostra o recuo, e `forward-back.gif` mostra as duas juntas. Os manifestos
`manifest.json` e `back-manifest.json` registram os atlas próprios.

Segurar a direção contrária ao rival exibe `walkBack` mantendo o Rui de frente
para ele, inclusive quando o adversário cruza de lado. Dois toques para trás
continuam acionando os dois saltos de recuo; os comandos funcionam nos dois jogadores.

Para reconstruir todas as folhas WebP sem perda, com Pillow e NumPy:

```powershell
python scripts/build-rui-v5.py
```

O gerador verifica transparência, silhuetas separadas, margens e igualdade
dos pixels depois da compressão. As saídas publicadas ficam em
`public/assets/characters/rui/rui-v5-*.webp`, `rui-v6-walk.webp` e `rui-v6-walk-back.webp`;
fontes e prévias ficam fora de `dist/`. Para reconstruir apenas a caminhada,
use `python scripts/build-rui-walk-v6.py`.

As folhas v3/v4 e suas fontes permanecem arquivadas. O gerador v4 é histórico;
o jogo usa v5 com a caminhada v6. O retrato de seleção permanece o original.
