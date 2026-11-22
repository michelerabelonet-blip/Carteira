'use strict';
// Servidor local mínimo para testar o app (sem dependências). Uso: npm run dev  ->  http://localhost:5173
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', 'public');
const PORTA = Number(process.env.PORT) || 5173;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

// Mesma política de segurança (CSP) do Render, lida do render.yaml, para o teste local ser igual à produção.
function lerCSP() {
  try {
    const yaml = fs.readFileSync(path.resolve(__dirname, '..', 'render.yaml'), 'utf8');
    const m = yaml.match(/name:\s*Content-Security-Policy\s*\r?\n\s*value:\s*"([^"]+)"/);
    return m ? m[1] : null;
  } catch (e) { return null; }
}
const CSP = lerCSP();

http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400).end(); return; }
  if (url.endsWith('/')) url += 'index.html';
  const arquivo = path.resolve(RAIZ, '.' + url);
  if (arquivo !== RAIZ && !arquivo.startsWith(RAIZ + path.sep)) { res.writeHead(403).end('Proibido'); return; }
  fs.readFile(arquivo, (erro, dados) => {
    if (erro) {
      // sem config.js gerado: roda só no modo visitante
      if (url === '/config.js') { res.writeHead(200, { 'Content-Type': TIPOS['.js'] }).end('window.MONTADOR_CONFIG = {};'); return; }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
      return;
    }
    const cab = { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (CSP) cab['Content-Security-Policy'] = CSP;
    res.writeHead(200, cab).end(dados);
  });
}).listen(PORTA, () => console.log(`Montador de Carteira em http://localhost:${PORTA}`));
