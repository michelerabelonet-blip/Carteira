/*
 * Tela do simulador de juros compostos. As contas ficam em carteira-logica.js (projetar, aporteNecessario);
 * aqui só há campos, resultados, gráfico e tabelas. Texto digitado nunca entra por innerHTML.
 */
(function () {
  'use strict';
  var L = window.CarteiraLogica;
  var G = window.Grafico;

  function h(tag, attrs, filhos) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === false || v === null || v === undefined) return;
        if (k === 'class') e.className = v;
        else if (k === 'value') e.value = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, v);
      });
    }
    (filhos || []).forEach(function (f) { if (f !== null && f !== undefined) e.append(f); });
    return e;
  }

  // 7 -> "7", 7.25 -> "7,25"
  function fmtNum(v) { return String(Math.round(v * 100) / 100).replace('.', ','); }
  function fmtMoeda(v) { return Math.abs(v - Math.round(v)) < 0.005 ? L.numero(v, 0) : L.numero(v, 2); }
  function anosTxt(n) { return n + (n === 1 ? ' ano' : ' anos'); }

  var CAMPOS = [
    { k: 'idadeAtual', rotulo: 'Idade hoje', tipo: 'idade' },
    { k: 'idadeFinal', rotulo: 'Idade final', tipo: 'idade', ajuda: 'Até quando você vai aportar.' },
    { k: 'inicial', rotulo: 'Já guardado hoje', tipo: 'dinheiro' },
    { k: 'aporte', rotulo: 'Aporte por mês', tipo: 'dinheiro' },
    { k: 'reajuste', rotulo: 'Reajuste do aporte por ano', tipo: 'pct', ajuda: 'Quanto você aumenta o aporte a cada ano. 0 = sempre o mesmo valor.' },
    { k: 'taxa', rotulo: 'Rentabilidade por ano', tipo: 'pct', ajuda: 'Taxa efetiva ao ano. Use a taxa já descontada de impostos e taxas para ver o valor líquido.' },
    { k: 'inflacao', rotulo: 'Inflação por ano', tipo: 'pct', ajuda: 'Só serve para mostrar o valor em dinheiro de hoje.' }
  ];

  function criar(op) {
    var raiz = op.raiz;
    var sim = L.simuladorPadrao(); // o valor de verdade é lido em renderizar(), quando a carteira já existe
    var el = {};      // elementos que mudam
    var campos = {};  // k -> input
    var graf = null;
    var montado = false;

    function gravar() { op.gravar(L.validarSimulador(sim)); }

    function valorDoCampo(c) { return c.tipo === 'dinheiro' ? fmtMoeda(sim[c.k]) : (c.tipo === 'idade' ? String(sim[c.k]) : fmtNum(sim[c.k])); }

    function preencher() {
      CAMPOS.forEach(function (c) { if (document.activeElement !== campos[c.k]) campos[c.k].value = valorDoCampo(c); });
      if (document.activeElement !== campos.meta) campos.meta.value = sim.meta === null ? '' : fmtMoeda(sim.meta);
      el.momento.value = sim.momento;
    }

    function campo(c) {
      var id = 'sim-' + c.k;
      var inp = h('input', { id: id, type: 'text', class: 'campo', inputmode: c.tipo === 'idade' ? 'numeric' : 'decimal', autocomplete: 'off', spellcheck: 'false' });
      campos[c.k] = inp;
      inp.addEventListener('focus', function () { inp.select(); });
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') inp.blur(); });
      inp.addEventListener('input', function () {
        var n = L.parseNumero(inp.value);
        if (isNaN(n)) return;
        sim[c.k] = n;
        sim = L.validarSimulador(sim);
        calcular();
        gravar();
      });
      inp.addEventListener('change', function () { preencher(); });
      var caixa = c.tipo === 'dinheiro' ? h('span', { class: 'campo-moeda' }, [inp])
        : (c.tipo === 'pct' ? h('span', { class: 'campo-pct sim-pct' }, [inp, h('span', null, ['% ao ano'.slice(0, 1)])]) : h('span', { class: 'campo-pct sim-pct' }, [inp, h('span', null, ['anos'])]));
      return h('div', { class: 'sim-campo' }, [h('label', { for: id }, [c.rotulo]), caixa, c.ajuda ? h('p', { class: 'ajuda' }, [c.ajuda]) : null]);
    }

    function montar() {
      raiz.textContent = '';
      campos = {};

      // ----- formulário -----
      var form = h('div', { class: 'sim-form' });
      CAMPOS.forEach(function (c) { form.appendChild(campo(c)); });

      el.momento = h('select', { id: 'sim-momento', class: 'campo' }, [
        h('option', { value: 'fim' }, ['No fim do mês']), h('option', { value: 'inicio' }, ['No início do mês'])
      ]);
      el.momento.addEventListener('change', function () { sim.momento = el.momento.value; sim = L.validarSimulador(sim); calcular(); gravar(); });
      form.appendChild(h('div', { class: 'sim-campo' }, [h('label', { for: 'sim-momento' }, ['Quando você aporta']), el.momento]));

      // ver o total da carteira como ponto de partida
      el.usarTotal = h('button', { type: 'button', class: 'btn peq' }, ['Usar o total da carteira']);
      el.usarTotal.addEventListener('click', function () {
        sim.inicial = Math.round(op.totalCarteira() * 100) / 100;
        sim = L.validarSimulador(sim);
        preencher(); calcular(); gravar();
      });
      form.appendChild(h('div', { class: 'sim-campo sim-largo' }, [el.usarTotal]));

      // meta (opcional)
      var meta = h('input', { id: 'sim-meta', type: 'text', class: 'campo', inputmode: 'decimal', autocomplete: 'off', placeholder: 'opcional' });
      campos.meta = meta;
      meta.addEventListener('focus', function () { meta.select(); });
      meta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') meta.blur(); });
      meta.addEventListener('input', function () {
        if (meta.value.trim() === '') sim.meta = null;
        else { var n = L.parseNumero(meta.value); if (isNaN(n)) return; sim.meta = n; }
        sim = L.validarSimulador(sim);
        calcular(); gravar();
      });
      meta.addEventListener('change', function () { preencher(); });
      form.appendChild(h('div', { class: 'sim-campo sim-largo' }, [
        h('label', { for: 'sim-meta' }, ['Meta de valor final (opcional)']),
        h('span', { class: 'campo-moeda' }, [meta]),
        h('p', { class: 'ajuda' }, ['Informe quanto você quer ter e veja quanto precisa aportar por mês.'])
      ]));

      // ----- resultados -----
      el.heroRotulo = h('p', { class: 'hero-rotulo' });
      el.heroValor = h('p', { class: 'hero-valor' });
      el.heroSub = h('p', { class: 'hero-sub' });
      el.heroUltimo = h('p', { class: 'hero-sub' });
      function tile(chave, rotulo) {
        var v = h('div', { class: 'kpi-valor' }), d = h('div', { class: 'kpi-detalhe' });
        el[chave] = { v: v, d: d };
        return h('div', { class: 'kpi' }, [h('div', { class: 'kpi-rotulo' }, [rotulo]), v, d]);
      }
      var kpis = h('div', { class: 'kpis' }, [tile('kAportado', 'Total aportado'), tile('kJuros', 'Juros ganhos'), tile('kParte', 'Juros no total')]);

      var grafico = h('div', { class: 'grafico-colunas' });
      graf = G.criarColunas(grafico, op.dica);
      var legenda = h('div', { class: 'sim-legenda' }, [
        legendaItem(L.CORES[0], 'Aportado (seu dinheiro)'), legendaItem(L.CORES[1], 'Juros'),
        h('span', { class: 'ajuda' }, ['Eixo de baixo: sua idade.'])
      ]);

      el.meta = h('div', { class: 'sim-meta', 'aria-live': 'polite' });

      var resultado = h('div', { class: 'sim-resultado' }, [
        h('div', { class: 'hero' }, [el.heroRotulo, el.heroValor, el.heroSub, el.heroUltimo]),
        kpis,
        h('h3', { class: 'sim-titulo' }, ['Como o valor cresce']),
        grafico, legenda, el.meta
      ]);

      // ----- cenários e tabela ano a ano -----
      el.cenarios = h('tbody');
      var cenarios = h('section', { class: 'sim-secao' }, [
        h('h3', { class: 'sim-titulo' }, ['E se a rentabilidade for diferente?']),
        h('div', { class: 'rolavel' }, [h('table', { class: 'tab-metas sim-tab' }, [
          h('caption', { class: 'so-leitor' }, ['Valor final para rentabilidades próximas da sua']),
          h('thead', null, [h('tr', null, [h('th', { scope: 'col' }, ['Rentabilidade']), h('th', { scope: 'col' }, ['Valor final']), h('th', { scope: 'col' }, ['Juros']), h('th', { scope: 'col' }, ['Em dinheiro de hoje'])])]),
          el.cenarios
        ])])
      ]);

      el.anoAAno = h('tbody');
      var tabela = h('details', { class: 'sim-secao sim-detalhes' }, [
        h('summary', null, ['Tabela ano a ano']),
        h('div', { class: 'rolavel' }, [h('table', { class: 'tab-metas sim-tab' }, [
          h('caption', { class: 'so-leitor' }, ['Aportado, juros e total em cada ano']),
          h('thead', null, [h('tr', null, [h('th', { scope: 'col' }, ['Idade']), h('th', { scope: 'col' }, ['Aportado']), h('th', { scope: 'col' }, ['Juros']), h('th', { scope: 'col' }, ['Total']), h('th', { scope: 'col' }, ['Em dinheiro de hoje'])])]),
          el.anoAAno
        ])])
      ]);

      raiz.appendChild(h('h2', { class: 'sim-h2' }, ['Simulador de juros compostos']));
      raiz.appendChild(h('p', { class: 'ajuda sim-intro' }, ['Veja quanto aportes mensais podem render ao longo dos anos. É uma conta com as taxas que você informar, não uma promessa de rendimento nem uma recomendação de investimento.']));
      raiz.appendChild(h('div', { class: 'sim-grade' }, [form, resultado]));
      raiz.appendChild(cenarios);
      raiz.appendChild(tabela);
      raiz.appendChild(h('p', { class: 'rodape' }, ['Não considera imposto de renda, taxas de administração nem variações do mercado. Os aportes são sempre iguais (ou reajustados pelo percentual informado) e a rentabilidade é constante.']));
      montado = true;
    }

    function legendaItem(cor, texto) {
      var c = h('span', { class: 'amostra ponto', 'aria-hidden': 'true' });
      c.style.setProperty('--cor', cor);
      return h('span', { class: 'sim-leg-item' }, [c, texto]);
    }

    function linhaTabela(celulas, negrito) {
      var tr = h('tr', negrito ? { class: 'atual' } : null);
      celulas.forEach(function (t, i) { tr.appendChild(h('td', i === 0 ? { class: 'sim-rot' } : null, [t])); });
      return tr;
    }

    function calcular() {
      var s = L.validarSimulador(sim), r = L.projetar(s), n = s.idadeFinal - s.idadeAtual;

      el.heroRotulo.textContent = 'Em ' + anosTxt(n) + ' (aos ' + s.idadeFinal + ' anos) você teria';
      el.heroValor.textContent = L.brl(r.final);
      el.heroSub.textContent = '≈ ' + L.brl(r.finalReal) + ' em dinheiro de hoje, com inflação de ' + fmtNum(s.inflacao) + '% ao ano';
      el.heroUltimo.textContent = s.reajuste !== 0 ? 'O aporte mensal chega a ' + L.brl(r.ultimoAporte) + ' no último ano.' : '';
      el.heroUltimo.hidden = s.reajuste === 0;

      el.kAportado.v.textContent = L.brl(r.aportado);
      el.kAportado.d.textContent = s.inicial > 0 ? L.brl(s.inicial) + ' já guardados + aportes' : r.meses + ' aportes';
      el.kJuros.v.textContent = L.brl(r.juros);
      el.kJuros.d.textContent = 'tirando o que você aportou';
      var parte = r.final > 0 ? r.juros / r.final * 100 : 0;
      el.kParte.v.textContent = L.fmtPct(parte) + '%';
      el.kParte.d.textContent = 'do valor final vem de juros';

      graf.atualizar({ cores: [L.CORES[0], L.CORES[1]], linhas: r.anos.slice(1) });

      // meta
      el.meta.textContent = '';
      if (s.meta !== null && s.meta > 0) {
        var nec = L.aporteNecessario(s, s.meta);
        var real = s.meta / Math.pow(1 + s.inflacao / 100, n);
        var caixa = h('div', { class: 'info' });
        if (nec && nec.jaAtinge) {
          caixa.appendChild(h('p', null, ['O valor que você já tem guardado, com juros, já chega a ' + L.brl(s.meta) + ' sem novos aportes.']));
        } else if (nec) {
          caixa.appendChild(h('p', null, [h('strong', null, ['Para chegar a ' + L.brl(s.meta)]), ' (≈ ' + L.brl(real) + ' em dinheiro de hoje), o aporte mensal precisa ser de ', h('strong', null, [L.brl(nec.aporte)]), s.reajuste !== 0 ? ' no primeiro ano, com reajuste de ' + fmtNum(s.reajuste) + '% ao ano.' : '.']));
          var dif = r.final - s.meta;
          caixa.appendChild(h('p', null, [dif >= 0 ? 'Com o seu aporte atual você passa da meta em ' + L.brl(dif) + '.' : 'Com o seu aporte atual faltam ' + L.brl(-dif) + ' para a meta.']));
        }
        el.meta.appendChild(caixa);
      }

      // cenários: a sua taxa e quatro vizinhas
      el.cenarios.textContent = '';
      [-4, -2, 0, 2, 4].forEach(function (d) {
        var taxa = s.taxa + d;
        if (taxa < -50) return;
        var rr = L.projetar(Object.assign({}, s, { taxa: taxa }));
        el.cenarios.appendChild(linhaTabela([fmtNum(taxa) + '% ao ano' + (d === 0 ? ' (a sua)' : ''), L.brl(rr.final), L.brl(rr.juros), L.brl(rr.finalReal)], d === 0));
      });

      // tabela ano a ano
      el.anoAAno.textContent = '';
      r.anos.forEach(function (a) {
        el.anoAAno.appendChild(linhaTabela([String(a.idade), L.brl(a.aportado), L.brl(a.juros), L.brl(a.saldo), L.brl(a.real)]));
      });
    }

    function atualizarBotaoTotal() {
      var t = op.totalCarteira();
      el.usarTotal.textContent = 'Usar o total da carteira' + (t > 0 ? ' (' + L.brl(t) + ')' : '');
      el.usarTotal.disabled = !(t > 0);
    }

    return {
      renderizar: function () {
        sim = L.validarSimulador(op.obter());
        if (!montado) montar();
        preencher();
        atualizarBotaoTotal();
        calcular();
      },
      limpar: function () { raiz.textContent = ''; montado = false; campos = {}; el = {}; }
    };
  }

  window.Simulador = { criar: criar };
})();
