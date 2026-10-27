# BBS ONE Academy

Plataforma de aprendizagem da BBS ONE, publicada no ChatGPT Sites e mantida em código aberto para colaboração no repositório CTRL+ALT+FIGHTER.

- Plataforma: https://bbs-comece-por-aqui.bbsone-2952.chatgpt.site/
- Código compartilhado: https://github.com/ruiornellasjr-bit/ctrl-alt-fighter/tree/main/BBS%20Academy
- Interface inicial: `index.html`
- Experiência e integração com a API: `academy-runtime.js` e `app/api/`
- Plano de cursos e percursos por função: `data/`
- Banco de dados e migrações: `db/` e `drizzle/`
- Identidade visual: `assets/logo-bbs-one.png`
- Pasta colaborativa para videoaulas: [`videoaulas/`](videoaulas/README.md)

## O que a plataforma registra

- Biblioteca compartilhada de aulas, links e arquivos em armazenamento central.
- Acesso de aluno, instrutor e gestor, com permissões no servidor.
- Percursos obrigatórios e complementares por função, de acordo com o planejamento da Academy.
- Aulas consultadas/concluídas, testes por módulo, histórico de tentativas e práticas submetidas.
- Revisão de práticas com comentários, rubrica e reenvio para correção.
- Situação de produção de cada aula, responsável, revisor, prazo e pendências.
- Certificados de curso sujeitos aos critérios da diretriz e à homologação responsável.

## Desenvolvimento

Requer Node.js 22.13 ou superior. Na pasta `BBS Academy`, instale as dependências e execute `pnpm build`. A compilação sincroniza o `index.html`, o JavaScript e os arquivos de planejamento para `public/`.

Alterações no modelo do banco devem gerar uma nova migração com `pnpm db:generate`; não edite migrações já aplicadas. As migrações hospedadas são aplicadas pelo fluxo do ChatGPT Sites antes da publicação.

## Segurança e conteúdo

Os gabaritos das avaliações e o e-mail da administração ficam somente nos segredos de execução do Site; não os adicione ao repositório. A diretriz v1.1 identifica os critérios acadêmicos como proposta, então a emissão oficial de certificados continua bloqueada até homologação. Use dados fictícios nas atividades e envie apenas materiais autorizados.

## Publicação e colaboração

O repositório GitHub é a fonte compartilhada para colaboração. A plataforma de produção fica no ChatGPT Sites, que hospeda a aplicação, o banco D1 e os arquivos R2; mudanças integradas ao Git precisam ser publicadas pelo fluxo do Site. Não use uma cópia estática do GitHub Pages como produção, pois ela não oferece as rotas autenticadas nem os dados compartilhados desta plataforma.

Para contribuir, crie uma branch ou fork e abra um pull request. Preserve o planejamento da Academy, a identidade visual BBS ONE e as regras de acesso por perfil.
