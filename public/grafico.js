/*
 * Gráficos do Montador de Carteira (SVG e HTML puros, sem biblioteca).
 *  - Rosca de dois anéis: classes por dentro, ativos por fora (mesmo tom da classe).
 *  - Barras ordenadas, por classe ou por ativo.
 * Todo texto vindo do usuário entra por textContent / setAttribute (nunca innerHTML).
 */
(function () {
  'use strict';
  var L = window.CarteiraLogica;
  var NS = 'http://www.w3.org/2000/svg';
  var TAU = Math.PI * 2;
  var NEUTRO = '#9b9b94';

  function s(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  function h(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function encurtar(t, n) { return t.length > n ? t.slice(0, n - 1) + '…' : t; }

  // Setor de anel: ângulos em radianos, 0 em cima, sentido horário. 2px de respiro entre fatias.
  function caminho(cx, cy, r0, r1, a0, a1, folga) {
    var span = a1 - a0;
    if (span >= TAU - 0.002) {
      return 'M' + (cx + r1) + ' ' + cy + 'A' + r1 + ' ' + r1 + ' 0 1 1 ' + (cx - r1) + ' ' + cy +
        'A' + r1 + ' ' + r1 + ' 0 1 1 ' + (cx + r1) + ' ' + cy + 'Z' +
        'M' + (cx + r0) + ' ' + cy + 'A' + r0 + ' ' + r0 + ' 0 1 0 ' + (cx - r0) + ' ' + cy +
        'A' + r0 + ' ' + r0 + ' 0 1 0 ' + (cx + r0) + ' ' + cy + 'Z';
    }
    var d = folga / ((r0 + r1) / 2);
    var b0 = a0 + d / 2, b1 = a1 - d / 2;
    if (b1 - b0 <= 0.004) return null;
    var big = (b1 - b0) > Math.PI ? 1 : 0;
    function p(r, a) { return (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2); }
    return 'M' + p(r1, b0) + 'A' + r1 + ' ' + r1 + ' 0 ' + big + ' 1 ' + p(r1, b1) +
      'L' + p(r0, b1) + 'A' + r0 + ' ' + r0 + ' 0 ' + big + ' 0 ' + p(r0, b0) + 'Z';
  }

  function criar(container, dicaEl, cb) {
    var dados = null;
    var opcoes = { modo: 'rosca', grupo: 'classes' };
    var dest = { classe: null, ativo: null };
    var marcas = [];      // elementos que reagem ao destaque
    var centro = null;    // textos do centro da rosca

    // ---------- tooltip ----------
    function esconderDica() { dicaEl.hidden = true; }

    function mostrarDica(info, x, y) {
      dicaEl.textContent = '';
      dicaEl.style.setProperty('--cor', info.cor);
      dicaEl.appendChild(h('div', 'dica-valor', info.valor + ' · ' + info.pct + '%'));
      var nome = h('div', 'dica-nome');
      nome.appendChild(h('span', 'dica-chave'));
      nome.appendChild(h('span', null, info.nome));
      dicaEl.appendChild(nome);
      if (info.extra) dicaEl.appendChild(h('div', 'dica-extra', info.extra));
      dicaEl.hidden = false;
      moverDica(x, y);
    }

    function moverDica(x, y) {
      var w = dicaEl.offsetWidth, hh = dicaEl.offsetHeight;
      var doc = document.documentElement;
      var esq = Math.min(Math.max(8, x + 14), Math.max(8, doc.clientWidth - w - 8));
      var topo = y - hh - 12;
      if (topo < 8) topo = y + 18;
      dicaEl.style.left = (esq + window.pageXOffset) + 'px';
      dicaEl.style.top = (topo + window.pageYOffset) + 'px';
    }

    function ligar(el, info) {
      el.addEventListener('pointerenter', function (ev) {
        cb.aoDestacar(info.classe, info.ativo);
        mostrarDica(info, ev.clientX, ev.clientY);
      });
      el.addEventListener('pointermove', function (ev) { if (!dicaEl.hidden) moverDica(ev.clientX, ev.clientY); });
      el.addEventListener('pointerleave', function () { esconderDica(); cb.aoDestacar(null, null); });
      el.addEventListener('focus', function () {
        var r = el.getBoundingClientRect();
        cb.aoDestacar(info.classe, info.ativo);
        mostrarDica(info, r.left + r.width / 2, r.top + r.height / 2);
      });
      el.addEventListener('blur', function () { esconderDica(); cb.aoDestacar(null, null); });
    }

    function infoClasse(c, T) {
      return { classe: c.id, ativo: null, nome: c.nome, cor: c.cor, valor: L.brl(c.valor, 2), pct: L.fmtPct(L.pct(c.valor, T)), extra: c.itens.length + (c.itens.length === 1 ? ' ativo' : ' ativos') };
    }

    function infoAtivo(c, a, T) {
      return {
        classe: c.id, ativo: a.id, nome: a.nome, cor: c.cor, valor: L.brl(a.valor, 2), pct: L.fmtPct(L.pct(a.valor, T)),
        extra: c.nome + ' · ' + L.fmtPct(L.pct(a.valor, c.valor)) + '% da classe'
      };
    }

    // ---------- destaque ----------
    function aplicarDestaque() {
      var tem = dest.classe !== null;
      container.classList.toggle('tem-destaque', tem);
      marcas.forEach(function (m) {
        var d = m.dataset;
        var on = tem && d.classe === dest.classe && (dest.ativo === null || !d.ativo || d.ativo === dest.ativo);
        m.classList.toggle('on', on);
      });
      if (centro) atualizarCentro();
    }

    function atualizarCentro() {
      var T = dados.total, c = null, a = null;
      if (dest.classe !== null) {
        for (var i = 0; i < dados.classes.length; i++) if (dados.classes[i].id === dest.classe) c = dados.classes[i];
        if (c && dest.ativo !== null) for (var j = 0; j < c.itens.length; j++) if (c.itens[j].id === dest.ativo) a = c.itens[j];
      }
      if (!c) {
        centro.a.textContent = 'Total';
        centro.b.textContent = L.brl(T);
        centro.c.textContent = dados.classes.length + (dados.classes.length === 1 ? ' classe' : ' classes');
      } else {
        var v = a ? a.valor : c.valor;
        centro.a.textContent = encurtar(a ? a.nome : c.nome, 20);
        centro.b.textContent = L.fmtPct(L.pct(v, T)) + '%';
        centro.c.textContent = L.brl(v);
      }
    }

    // ---------- rosca ----------
    function rosca() {
      var T = dados.total, cx = 160, cy = 160;
      var anelClasse = [70, 102], anelAtivo = [108, 142];
      var svg = s('svg', { viewBox: '0 0 320 320', role: 'group', 'aria-label': 'Gráfico de rosca da carteira. Anel de dentro: classes. Anel de fora: ativos.' });
      centro = null;

      if (!(T > 0)) {
        svg.appendChild(s('circle', { cx: cx, cy: cy, r: 106, class: 'vazio-aro' }));
        var t = s('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', class: 'centro-rotulo' });
        t.textContent = 'Informe os valores dos ativos';
        svg.appendChild(t);
        container.appendChild(svg);
        return;
      }

      var a = -Math.PI / 2;
      dados.classes.forEach(function (c) {
        if (!(c.valor > 0)) return;
        var a0 = a, a1 = a + c.valor / T * TAU;
        a = a1;
        var d = caminho(cx, cy, anelClasse[0], anelClasse[1], a0, a1, 2);
        if (d) {
          var info = infoClasse(c, T);
          var p = s('path', {
            d: d, fill: c.cor, class: 'fatia', 'fill-rule': 'evenodd', tabindex: '0', role: 'img',
            'aria-label': c.nome + ': ' + info.valor + ', ' + info.pct + '% da carteira'
          });
          p.dataset.classe = c.id;
          ligar(p, info);
          svg.appendChild(p);
          marcas.push(p);
        }
        var b = a0;
        c.itens.forEach(function (it) {
          if (!(it.valor > 0)) return;
          var b0 = b, b1 = b + it.valor / T * TAU;
          b = b1;
          var da = caminho(cx, cy, anelAtivo[0], anelAtivo[1], b0, b1, 2);
          if (!da) return;
          var ia = infoAtivo(c, it, T);
          var pa = s('path', {
            d: da, fill: it.tom, class: 'fatia', 'fill-rule': 'evenodd', role: 'img',
            'aria-label': it.nome + ' (' + c.nome + '): ' + ia.valor + ', ' + ia.pct + '% da carteira'
          });
          pa.dataset.classe = c.id;
          pa.dataset.ativo = it.id;
          ligar(pa, ia);
          svg.appendChild(pa);
          marcas.push(pa);
        });
      });

      var ta = s('text', { x: cx, y: cy - 10, 'text-anchor': 'middle', class: 'centro-rotulo' });
      var tb = s('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', class: 'centro-valor' });
      var tc = s('text', { x: cx, y: cy + 33, 'text-anchor': 'middle', class: 'centro-sub' });
      svg.appendChild(ta); svg.appendChild(tb); svg.appendChild(tc);
      container.appendChild(svg);
      centro = { a: ta, b: tb, c: tc };
    }

    // ---------- barras ----------
    function barras() {
      var T = dados.total, linhas = [];
      centro = null;

      if (opcoes.grupo === 'classes') {
        dados.classes.forEach(function (c) {
          if (c.valor > 0) linhas.push({ classe: c.id, ativo: null, nome: c.nome, valor: c.valor, cor: c.cor, info: infoClasse(c, T) });
        });
      } else {
        dados.classes.forEach(function (c) {
          c.itens.forEach(function (it) {
            if (it.valor > 0) linhas.push({ classe: c.id, ativo: it.id, nome: it.nome, valor: it.valor, cor: c.cor, info: infoAtivo(c, it, T) });
          });
        });
      }
      linhas.sort(function (x, y) { return y.valor - x.valor; });

      var outros = null;
      if (linhas.length > 10) {
        var resto = linhas.slice(10), soma = 0;
        resto.forEach(function (r) { soma += r.valor; });
        linhas = linhas.slice(0, 10);
        outros = {
          classe: null, ativo: null, nome: 'Outros (' + resto.length + ')', valor: soma, cor: NEUTRO,
          info: { classe: null, ativo: null, nome: 'Outros (' + resto.length + ' ativos)', cor: NEUTRO, valor: L.brl(soma, 2), pct: L.fmtPct(L.pct(soma, T)), extra: 'Ativos menores, somados' }
        };
        linhas.push(outros);
      }

      var lista = h('div', 'barras');
      lista.setAttribute('role', 'list');
      if (!linhas.length) {
        lista.appendChild(h('p', 'ajuda', 'Informe os valores dos ativos para ver as barras.'));
      }
      var maior = linhas.length ? Math.max.apply(null, linhas.map(function (l) { return l.valor; })) : 1;

      linhas.forEach(function (l) {
        var linha = h('div', 'barra-linha');
        linha.setAttribute('role', 'listitem');
        linha.tabIndex = 0;
        linha.setAttribute('aria-label', l.nome + ': ' + l.info.valor + ', ' + l.info.pct + '% da carteira');
        if (l.classe) linha.dataset.classe = l.classe;
        if (l.ativo) linha.dataset.ativo = l.ativo;
        linha.style.setProperty('--cor', l.cor);
        linha.appendChild(h('span', 'barra-nome', l.nome));
        var trilho = h('span', 'barra-trilho');
        var fill = h('span', 'barra-fill');
        fill.style.width = (l.valor / maior * 100).toFixed(2) + '%';
        trilho.appendChild(fill);
        linha.appendChild(trilho);
        var v = h('span', 'barra-valor', l.info.pct + '%');
        v.appendChild(h('small', null, L.brl(l.valor)));
        linha.appendChild(v);
        if (l.classe) { ligar(linha, l.info); marcas.push(linha); }
        else {
          linha.addEventListener('pointerenter', function (ev) { mostrarDica(l.info, ev.clientX, ev.clientY); });
          linha.addEventListener('pointermove', function (ev) { if (!dicaEl.hidden) moverDica(ev.clientX, ev.clientY); });
          linha.addEventListener('pointerleave', esconderDica);
        }
        lista.appendChild(linha);
      });
      container.appendChild(lista);
    }

    function desenhar() {
      esconderDica();
      container.textContent = '';
      marcas = [];
      if (opcoes.modo === 'barras') barras(); else rosca();
      aplicarDestaque();
    }

    return {
      atualizar: function (novosDados, novasOpcoes) {
        dados = novosDados;
        if (novasOpcoes) opcoes = novasOpcoes;
        desenhar();
      },
      destacar: function (classe, ativo) {
        dest = { classe: classe === undefined ? null : classe, ativo: ativo === undefined ? null : ativo };
        if (dados) aplicarDestaque();
      }
    };
  }

  // ---------- colunas empilhadas: quanto foi aportado e quanto veio de juros, ano a ano ----------
  function passoBonito(max) {
    var bruto = max / 4, exp = Math.pow(10, Math.floor(Math.log(bruto) / Math.LN10)), f = bruto / exp;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
  }

  function compacto(v) {
    if (L.estaPrivado()) return ''; // no modo privado o eixo não mostra a escala em reais
    if (v >= 1e6) { var m = v / 1e6; return 'R$ ' + (Math.abs(m - Math.round(m)) < 0.05 ? String(Math.round(m)) : m.toFixed(1).replace('.', ',')) + ' mi'; }
    if (v >= 1e3) return 'R$ ' + Math.round(v / 1e3) + ' mil';
    return 'R$ ' + Math.round(v);
  }

  // topo arredondado (4px) e base reta, como pede o padrão de colunas
  function colunaPath(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    if (r <= 0) return 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
    return 'M' + x + ' ' + (y + h) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'H' + (x + w - r) +
      'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'V' + (y + h) + 'Z';
  }

  function criarColunas(container, dicaEl) {
    function esconder() { dicaEl.hidden = true; }
    function mover(x, y) {
      var w = dicaEl.offsetWidth, hh = dicaEl.offsetHeight, doc = document.documentElement;
      var esq = Math.min(Math.max(8, x + 14), Math.max(8, doc.clientWidth - w - 8));
      var topo = y - hh - 12;
      if (topo < 8) topo = y + 18;
      dicaEl.style.left = (esq + window.pageXOffset) + 'px';
      dicaEl.style.top = (topo + window.pageYOffset) + 'px';
    }
    function mostrar(l, cores, x, y) {
      dicaEl.textContent = '';
      dicaEl.appendChild(h('div', 'dica-valor', L.brl(l.saldo) + ' aos ' + l.idade + ' anos'));
      [['Aportado', l.aportado, cores[0]], ['Juros', l.juros, cores[1]]].forEach(function (t) {
        var linha = h('div', 'dica-nome');
        linha.style.setProperty('--cor', t[2]);
        linha.appendChild(h('span', 'dica-chave'));
        linha.appendChild(h('span', null, t[0] + ': ' + L.brl(t[1])));
        dicaEl.appendChild(linha);
      });
      dicaEl.appendChild(h('div', 'dica-extra', 'Em dinheiro de hoje: ' + L.brl(l.real)));
      dicaEl.hidden = false;
      mover(x, y);
    }

    return {
      // dados: { cores: [cor do aportado, cor dos juros], linhas: [{ano, idade, aportado, juros, saldo, real}] } (ano 1 em diante)
      atualizar: function (dados) {
        esconder();
        container.textContent = '';
        var linhas = dados.linhas, n = linhas.length;
        if (!n) return;
        var W = 640, H = 300, ml = 66, mr = 10, mt = 22, mb = 30;
        var pw = W - ml - mr, ph = H - mt - mb, base = mt + ph;
        var max = 0;
        linhas.forEach(function (l) { if (l.saldo > max) max = l.saldo; });
        var passo = passoBonito(max > 0 ? max : 1), topo = Math.ceil((max > 0 ? max : 1) / passo) * passo;
        var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Gráfico de colunas: valor aportado e juros, ano a ano. Os mesmos números estão na tabela abaixo.' });

        // grade e eixo Y (hairline, sólida)
        for (var v = 0; v <= topo + 1e-9; v += passo) {
          var y = base - v / topo * ph;
          svg.appendChild(s('line', { x1: ml, x2: W - mr, y1: y, y2: y, class: v === 0 ? 'eixo-base' : 'grade' }));
          var t = s('text', { x: ml - 8, y: y + 4, 'text-anchor': 'end', class: 'eixo-texto' });
          t.textContent = compacto(v);
          svg.appendChild(t);
        }

        var slot = pw / n, larg = Math.max(2, Math.min(24, slot * 0.7));
        var cada = n <= 10 ? 1 : n <= 20 ? 2 : n <= 40 ? 5 : 10;
        linhas.forEach(function (l, k) {
          var cx = ml + slot * (k + 0.5), x = cx - larg / 2;
          var hAport = l.aportado / topo * ph, hJuros = Math.max(0, l.juros) / topo * ph, gap = 2;
          var g = s('g', { class: 'coluna' });
          if (hAport > gap) g.appendChild(s('path', { d: colunaPath(x, base - hAport + gap / 2, larg, hAport - gap / 2, hJuros > 0.5 ? 0 : 4), fill: dados.cores[0] }));
          if (hJuros > gap) g.appendChild(s('path', { d: colunaPath(x, base - hAport - hJuros, larg, hJuros - gap / 2, 4), fill: dados.cores[1] }));
          else if (hAport > gap && hJuros <= 0.5) { /* só aportado: o topo já é arredondado */ }
          svg.appendChild(g);
          // área de toque/mouse maior que a coluna (a faixa inteira do ano)
          var area = s('rect', { x: ml + slot * k, y: mt, width: slot, height: ph, fill: 'transparent', class: 'coluna-area' });
          area.addEventListener('pointerenter', function (ev) {
            container.classList.add('tem-destaque'); g.classList.add('on'); mostrar(l, dados.cores, ev.clientX, ev.clientY);
          });
          area.addEventListener('pointermove', function (ev) { if (!dicaEl.hidden) mover(ev.clientX, ev.clientY); });
          area.addEventListener('pointerleave', function () { container.classList.remove('tem-destaque'); g.classList.remove('on'); esconder(); });
          svg.appendChild(area);
          if (l.ano % cada === 0) {
            var tx = s('text', { x: cx, y: H - 10, 'text-anchor': 'middle', class: 'eixo-texto' });
            tx.textContent = String(l.idade);
            svg.appendChild(tx);
          }
        });

        // rótulo só no último ano (os outros valores ficam no eixo, na dica e na tabela)
        var ult = linhas[n - 1], xu = ml + slot * (n - 0.5), yu = base - ult.saldo / topo * ph - 6;
        var fim = s('text', { x: Math.min(W - mr, xu + 4), y: Math.max(12, yu), 'text-anchor': 'end', class: 'rotulo-fim' });
        fim.textContent = L.brl(ult.saldo);
        svg.appendChild(fim);
        container.appendChild(svg);
      }
    };
  }

  window.Grafico = { criar: criar, criarColunas: criarColunas };
})();
