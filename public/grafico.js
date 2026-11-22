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

  window.Grafico = { criar: criar };
})();
