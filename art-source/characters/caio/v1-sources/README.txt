Coleção ImageGen v1 do Caio: sete folhas de seis poses por linha. Cada folha
usa quatro movimentos; `strong.png` tem os dois golpes fortes do personagem.
`walk-v6/sources/` guarda as caminhadas originais de doze quadros para frente
e para trás. `sources/frames/` e `sources/atlases/` guardam os arquivos
empacotados para conferência. Não modifique a folha v3 original.

Para reconstruir os atlas e as prévias: `python scripts/build-caio-v1.py`.
O processo usa o extrator existente e preserva a transparência PNG/WebP sem
perda de dados nos quadros e arquivos de runtime.
