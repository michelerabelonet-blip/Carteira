'use strict';
/*
 * Gera os ícones do app (PNG) em public/icones/, sem nenhuma dependência.
 * Desenho: dois anéis (classes por dentro, ativos por fora), igual ao gráfico do app, sobre fundo escuro.
 * Uso: node scripts/gerar-icones.js
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SAIDA = path.resolve(__dirname, '..', 'public', 'icones');

// mesma paleta do app (carteira-logica.js)
const FUNDO = [11, 11, 11];
const CORES = [[0x2a, 0x78, 0xd6], [0xeb, 0x68, 0x34], [0x1b, 0xaf, 0x7a], [0xed, 0xa1, 0x00]];
const FRACOES = [0.5, 0.1, 0.2, 0.2]; // 50 / 10 / 20 / 20, como no exemplo do app

function misturar(c, t) { return c.map((x) => Math.round(x + (255 - x) * t)); }

// ---- PNG mínimo (RGBA, 8 bits) ----
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = TABELA_CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function bloco(tipo, dados) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([len, corpo, crc]);
}
function png(w, h, rgba) {
  const linhas = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { linhas[y * (w * 4 + 1)] = 0; rgba.copy(linhas, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(linhas, { level: 9 })), bloco('IEND', Buffer.alloc(0))]);
}

// ---- desenho ----
// cor do ponto (x,y) em coordenadas de -0.5 a 0.5 (centro em 0,0); null = transparente
function amostra(x, y, o) {
  if (o.cantos) { // quadrado arredondado
    const q = 0.5 - o.cantos, dx = Math.max(Math.abs(x) - q, 0), dy = Math.max(Math.abs(y) - q, 0);
    if (dx * dx + dy * dy > o.cantos * o.cantos) return null;
  }
  const r = Math.hypot(x, y) / o.escala;
  let a = Math.atan2(x, -y); if (a < 0) a += Math.PI * 2; // 0 em cima, sentido horário
  const aneis = [
    { r0: 0.165, r1: 0.275, sub: 1 },  // classes
    { r0: 0.305, r1: 0.385, sub: 2 }   // ativos (cada classe em 2 tons)
  ];
  for (const an of aneis) {
    if (r < an.r0 || r > an.r1) continue;
    const folga = 0.022 / ((an.r0 + an.r1) / 2); // 2px de respiro, em ângulo
    let ini = 0;
    for (let i = 0; i < FRACOES.length; i++) {
      const fim = ini + FRACOES[i] * Math.PI * 2;
      if (a >= ini + folga / 2 && a < fim - folga / 2) {
        let cor = CORES[i];
        if (an.sub === 2) {
          const meio = (ini + fim) / 2;
          cor = a < meio ? cor : misturar(cor, 0.38);
          if (Math.abs(a - meio) < folga / 2) return o.fundo; // respiro entre os dois tons
        }
        return cor;
      }
      ini = fim;
    }
    return o.fundo;
  }
  return o.fundo;
}

function renderizar(tam, o) {
  const buf = Buffer.alloc(tam * tam * 4);
  const SS = 4; // 4x4 amostras por pixel (suaviza as bordas)
  for (let py = 0; py < tam; py++) {
    for (let px = 0; px < tam; px++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / tam - 0.5;
          const y = (py + (sy + 0.5) / SS) / tam - 0.5;
          const c = amostra(x, y, o);
          if (c === null || c === undefined) continue; // transparente (só nos cantos arredondados)
          rr += c[0]; gg += c[1]; bb += c[2]; aa += 1;
        }
      }
      const i = (py * tam + px) * 4, n = SS * SS;
      if (aa === 0) { buf[i + 3] = 0; continue; }
      buf[i] = Math.round(rr / aa); buf[i + 1] = Math.round(gg / aa); buf[i + 2] = Math.round(bb / aa); buf[i + 3] = Math.round(255 * aa / n);
    }
  }
  return png(tam, tam, buf);
}

function comFundo(o) { return Object.assign({}, o, { fundo: FUNDO }); }

const ICONES = [
  // "any": cantos arredondados e o desenho um pouco maior
  { arq: 'icon-192.png', tam: 192, o: { escala: 1.06, cantos: 0.22 } },
  { arq: 'icon-512.png', tam: 512, o: { escala: 1.06, cantos: 0.22 } },
  // "maskable": fundo até a borda e desenho dentro da zona segura (o Android recorta no formato do aparelho)
  { arq: 'icon-maskable-512.png', tam: 512, o: { escala: 1.0, cantos: 0 } },
  // iPhone: quadrado inteiro (o iOS arredonda sozinho)
  { arq: 'apple-touch-icon.png', tam: 180, o: { escala: 1.05, cantos: 0 } },
  { arq: 'favicon-32.png', tam: 32, o: { escala: 1.2, cantos: 0.2 } }
];

fs.mkdirSync(SAIDA, { recursive: true });
for (const ic of ICONES) {
  const arq = path.join(SAIDA, ic.arq);
  fs.writeFileSync(arq, renderizar(ic.tam, comFundo(ic.o)));
  console.log('gerado', path.relative(process.cwd(), arq), fs.statSync(arq).size + ' bytes');
}
