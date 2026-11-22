'use strict';
// Confere o que faz o app ser instalável: manifesto, ícones, service worker e as tags do index.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publico = path.resolve(__dirname, '..', 'public');
const ler = (p) => fs.readFileSync(path.join(publico, p), 'utf8');
const manifesto = JSON.parse(ler('manifest.json'));

// largura e altura de um PNG, lidas do cabeçalho
function dimensoes(arq) {
  const b = fs.readFileSync(path.join(publico, arq));
  assert.equal(b.subarray(1, 4).toString('ascii'), 'PNG', arq + ' não é PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('manifesto: nome, abertura em tela cheia e cores', () => {
  assert.equal(manifesto.name, 'Montador de Carteira');
  assert.ok(manifesto.short_name.length <= 12, 'nome curto cabe embaixo do ícone');
  assert.equal(manifesto.display, 'standalone');
  assert.equal(manifesto.start_url, '/');
  assert.equal(manifesto.scope, '/');
  assert.equal(manifesto.lang, 'pt-BR');
  assert.match(manifesto.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifesto.theme_color, /^#[0-9a-f]{6}$/i);
});

test('manifesto: ícones de 192 e 512 existem, com o tamanho certo, e há um maskable', () => {
  const por = (tam, finalidade) => manifesto.icons.find((i) => i.sizes === tam && i.purpose === finalidade);
  assert.ok(por('192x192', 'any'));
  assert.ok(por('512x512', 'any'));
  assert.ok(por('512x512', 'maskable'));
  for (const ic of manifesto.icons) {
    const [l, a] = dimensoes(ic.src);
    assert.equal(`${l}x${a}`, ic.sizes, ic.src);
    assert.equal(ic.type, 'image/png');
  }
});

test('ícones do iPhone e da aba existem', () => {
  assert.deepEqual(dimensoes('icones/apple-touch-icon.png'), [180, 180]);
  assert.deepEqual(dimensoes('icones/favicon-32.png'), [32, 32]);
});

test('index.html liga o manifesto, os ícones e as tags de app', () => {
  const html = ler('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.json">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icones\/apple-touch-icon\.png">/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="theme-color"/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /id="instalar"/);
});

test('service worker: só toca em arquivos do próprio site e nunca em dados', () => {
  const sw = ler('sw.js');
  assert.match(sw, /url\.origin !== self\.location\.origin/, 'outros endereços (Supabase, Google) passam direto');
  assert.match(sw, /req\.method !== 'GET'/, 'só GET');
  assert.doesNotMatch(sw, /supabase\.co/i);
});

test('service worker: tudo o que ele guarda existe (config.js é gerado no build)', () => {
  const sw = ler('sw.js');
  const lista = /const BASICOS = \[([\s\S]*?)\];/.exec(sw)[1];
  const arquivos = [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((a) => a !== './');
  assert.ok(arquivos.length >= 8);
  for (const a of arquivos) {
    if (a === 'config.js') continue;
    assert.ok(fs.existsSync(path.join(publico, a)), 'falta ' + a);
  }
});

test('o app registra o service worker e pede para instalar', () => {
  const app = ler('app.js');
  assert.match(app, /serviceWorker\.register\('sw\.js'\)/);
  assert.match(app, /beforeinstallprompt/);
  assert.match(app, /Adicionar à Tela de Início/);
});

test('a CSP do Render deixa o service worker e o manifesto funcionarem', () => {
  const yaml = fs.readFileSync(path.resolve(__dirname, '..', 'render.yaml'), 'utf8');
  const csp = /name:\s*Content-Security-Policy\s*\r?\n\s*value:\s*"([^"]+)"/.exec(yaml)[1];
  assert.match(csp, /script-src 'self'/);   // sw.js vem do próprio site
  assert.match(csp, /default-src 'self'/);  // manifest-src e worker-src herdam daqui
  assert.doesNotMatch(csp, /manifest-src (?!'self')/);
  assert.doesNotMatch(csp, /worker-src (?!'self')/);
});
