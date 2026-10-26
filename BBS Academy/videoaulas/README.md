# Envio de videoaulas

Este diretório organiza os vídeos de cada módulo da BBS ONE Academy. Monteiro e os demais colaboradores podem adicionar os arquivos na pasta correspondente e enviar as alterações ao GitHub.

## Organização

- `modulo-01/` a `modulo-12/`: coloque o vídeo na pasta do módulo da aula.
- Nomeie o arquivo com o número e um título curto, por exemplo `01-01-visao-geral.mp4`.
- Prefira MP4 (H.264/AAC) ou WebM e mantenha os arquivos compactados e autorizados para uso.
- Não envie dados reais de clientes, senhas ou informações internas nos vídeos.

## Vincular o vídeo à aula

1. Envie o arquivo para a pasta do módulo e conclua o commit no GitHub.
2. Abra o arquivo no repositório e copie seu endereço **Raw**. O endereço direto costuma seguir este formato:

   `https://raw.githubusercontent.com/ruiornellasjr-bit/ctrl-alt-fighter/main/BBS%20Academy/videoaulas/modulo-01/01-01-visao-geral.mp4`

3. Entre na [BBS ONE Academy](https://bbs-comece-por-aqui.bbsone-2952.chatgpt.site/) com perfil de instrutor ou gestor.
4. Abra **Biblioteca compartilhada**, escolha o módulo e a aula, cole o endereço em **Link do vídeo**, atualize a situação e salve no acervo compartilhado.

Links Raw de arquivos MP4 e WebM são reproduzidos dentro da aula. O link somente funciona para todos quando o arquivo está em um repositório acessível aos participantes da Academy.

## Limites do GitHub

O envio pelo navegador do GitHub aceita arquivos de até 25 MiB. No Git comum, acima de 50 MiB o GitHub exibe um aviso e arquivos acima de 100 MiB são bloqueados. Para vídeos maiores, use **Biblioteca compartilhada → Arquivo de vídeo** na própria Academy; o upload vai para o armazenamento compartilhado da plataforma (até 1,5 GB) e dispensa link externo. Git LFS tem cotas próprias de armazenamento e transferência, então não o use para vídeos sem combinar isso com a gestão do repositório.

## Como contribuir

Se você tiver permissão de escrita, envie o arquivo para `main`. Caso contrário, faça um fork ou branch e abra um pull request para revisão.
