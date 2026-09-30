// Servidor estatico minimo para abrir o jogo localmente.
// O build do Vite usa caminhos absolutos (/assets/...), entao abrir o
// index.html direto pelo Explorer (file://) nao carrega nada. Este servidor
// resolve isso servindo a pasta dist/ a partir da raiz de localhost.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

// Aceita rodar tanto da pasta do projeto (onde existe dist/) quanto de dentro
// da propria dist/ — foi um tropeco real na primeira tentativa de uso.
const HERE = import.meta.dirname;
const ROOT = existsSync(join(HERE, 'dist', 'index.html'))
  ? join(HERE, 'dist')
  : HERE;
const PORT = Number(process.env.PORT) || 4173;

if (!existsSync(join(ROOT, 'index.html'))) {
  console.log('\n  Nao achei o index.html do jogo.');
  console.log('  Coloque este arquivo na pasta que contem dist\\ e rode de novo.\n');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  // normalize + replace impede sair da pasta dist via ../
  const safe = normalize(url).replace(/^([/\\.]+)/, '');
  const file = join(ROOT, safe === '' ? 'index.html' : safe);

  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    // SPA fallback: qualquer rota desconhecida volta pro index.
    try {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      res.end(await readFile(join(ROOT, 'index.html')));
    } catch {
      res.writeHead(404).end('nao encontrado');
    }
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n  A porta ${PORT} ja esta em uso (provavelmente outra janela`);
    console.log('  deste servidor ainda aberta). Feche a outra janela, ou rode');
    console.log(`  com outra porta:  set PORT=4174 && node servidor-local.mjs\n`);
  } else {
    console.log(`\n  Erro ao subir o servidor: ${err.message}\n`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Ctrl+Alt+Fighter rodando em:  http://localhost:${PORT}\n`);
  console.log('  Deixe esta janela aberta enquanto joga.');
  console.log('  Para encerrar, feche a janela ou aperte Ctrl+C.\n');
});
