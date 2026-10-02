Caminhadas direcionais do Caio. `walk-12frames-final.png` tem doze passadas
para a frente; `walk-back-12frames.png` tem doze passos de recuo mantendo o
rosto em direção ao rival. O processo de build aplica o mesmo tamanho de corpo,
alinhamento fixo da cabeça e linha de chão da caminhada v6 do Rui.
Ferramenta: ImageGen integrada. As folhas são empacotadas por
`scripts/build-caio-v1.py`, que aplica alinhamento fixo da cabeça, tamanho e
linha dos pés antes de gerar os atlas de runtime.
Status: implementado no jogo nas poses `walk` e `walkBack`, 12 quadros cada.
