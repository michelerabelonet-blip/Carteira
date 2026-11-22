/*
 * Service worker: deixa o app instalável e abrir sem internet (a tela, não os dados).
 * Estratégia: REDE PRIMEIRO. Com internet sempre vem a versão mais nova do site (nada de tela velha depois de um deploy);
 * sem internet, usa a cópia guardada. Só mexe em arquivos do próprio site: Supabase, Google e qualquer outro
 * endereço passam direto, e dados de carteira nunca são guardados aqui.
 */
'use strict';

const VERSAO = 'v1'; // troque para limpar as cópias antigas
const CACHE = 'montador-' + VERSAO;
const BASICOS = [
  './', 'index.html', 'estilos.css', 'app.js', 'grafico.js', 'simulador.js', 'armazenamento.js', 'carteira-logica.js',
  'config.js', 'vendor/supabase.js', 'manifest.json',
  'icones/icon-192.png', 'icones/icon-512.png', 'icones/apple-touch-icon.png', 'icones/favicon-32.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE)
      // um arquivo que falhe não impede a instalação dos outros
      .then((c) => Promise.allSettled(BASICOS.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k.startsWith('montador-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Google etc.: direto na rede

  ev.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
      )
  );
});
