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
    { k: 'inflacao', rotulo: 'Inflação por ano', tipo: 'pct', ajuda: 'Mostra o valor em dinheiro de hoje e corrige a retirada, se você escolher isso.' }
  ];

  // depois de parar de aportar
  var CAMPOS_RENDA = [
    { k: 'taxaRenda', rotulo: 'Rentabilidade na aposentadoria', tipo: 'pct', ajuda: 'Costuma ser menor que na fase de aportes, porque o dinheiro fica mais seguro.' },
    { k: 'anosRenda', rotulo: 'Retirar durante', tipo: 'idade', ajuda: 'Por quantos anos o patrimônio vai pagar a renda.' }
  ];
  var TODOS = CAMPOS.concat(CAMPOS_RENDA);

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
      TODOS.forEach(function (c) { if (document.activeElement !== campos[c.k]) campos[c.k].value = valorDoCampo(c); });
      if (document.activeElement !== campos.meta) campos.meta.value = sim.meta === null ? '' : fmtMoeda(sim.meta);
      if (document.activeElement !== campos.rendaDesejada) campos.rendaDesejada.value = sim.rendaDesejada === null ? '' : fmtMoeda(sim.rendaDesejada);
      el.momento.value = sim.momento;
      el.reajustaRenda.value = sim.reajustaRenda ? 'sim' : 'nao';
    }

    // campo de dinheiro opcional (vazio = sem valor)
    function campoOpcional(k, id, rotulo, ajuda, placeholder) {
      var inp = h('input', { id: id, type: 'text', class: 'campo', inputmode: 'decimal', autocomplete: 'off', placeholder: placeholder || 'opcional' });
      campos[k] = inp;
      inp.addEventListener('focus', function () { inp.select(); });
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') inp.blur(); });
      inp.addEventListener('input', function () {
        if (inp.value.trim() === '') sim[k] = null;
        else { var n = L.parseNumero(inp.value); if (isNaN(n)) return; sim[k] = n; }
        sim = L.validarSimulador(sim);
        calcular(); gravar();
      });
      inp.addEventListener('change', function () { preencher(); });
      return h('div', { class: 'sim-campo sim-largo' }, [
        h('label', { for: id }, [rotulo]), h('span', { class: 'campo-moeda' }, [inp]), ajuda ? h('p', { class: 'ajuda' }, [ajuda]) : null
      ]);
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

      // meta de patrimônio (opcional)
      form.appendChild(campoOpcional('meta', 'sim-meta', 'Meta de valor final (opcional)', 'Informe quanto você quer ter e veja quanto precisa aportar por mês.'));

      // depois de parar de aportar: renda passiva
      form.appendChild(h('h3', { class: 'sim-subtitulo sim-largo' }, ['Depois de parar de aportar']));
      CAMPOS_RENDA.forEach(function (c) { form.appendChild(campo(c)); });
      el.reajustaRenda = h('select', { id: 'sim-reajustaRenda', class: 'campo' }, [
        h('option', { value: 'sim' }, ['Sim, acompanha a inflação']), h('option', { value: 'nao' }, ['Não, valor fixo'])
      ]);
      el.reajustaRenda.addEventListener('change', function () { sim.reajustaRenda = el.reajustaRenda.value === 'sim'; sim = L.validarSimulador(sim); calcular(); gravar(); });
      form.appendChild(h('div', { class: 'sim-campo sim-largo' }, [
        h('label', { for: 'sim-reajustaRenda' }, ['A retirada acompanha a inflação?']), el.reajustaRenda,
        h('p', { class: 'ajuda' }, ['Sim mantém o poder de compra ao longo dos anos, mas começa menor.'])
      ]));
      form.appendChild(campoOpcional('rendaDesejada', 'sim-rendaDesejada', 'Renda mensal que você quer (opcional)', 'Em dinheiro de hoje. Veja o patrimônio e o aporte necessários para isso.'));

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

      // ----- renda passiva possível -----
      el.rendaTitulo = h('h3', { class: 'sim-titulo' });
      var kRenda = h('div', { class: 'kpis kpis-2' }, [tile('kSoJuros', 'Só com os rendimentos'), tile('kConsumo', 'Consumindo o patrimônio')]);
      el.rendaNota = h('p', { class: 'ajuda sim-nota' });
      el.rendaMeta = h('div', { class: 'sim-meta', 'aria-live': 'polite' });
      el.rendaPrazos = h('tbody');
      var tabelaPrazos = h('div', { class: 'rolavel' }, [h('table', { class: 'tab-metas sim-tab' }, [
        h('caption', { class: 'so-leitor' }, ['Renda mensal conforme o tempo de retirada']),
        h('thead', null, [h('tr', null, [h('th', { scope: 'col' }, ['Retirar por']), h('th', { scope: 'col' }, ['Renda por mês']), h('th', { scope: 'col' }, ['Em dinheiro de hoje'])])]),
        el.rendaPrazos
      ])]);

      var resultado = h('div', { class: 'sim-resultado' }, [
        h('div', { class: 'hero' }, [el.heroRotulo, el.heroValor, el.heroSub, el.heroUltimo]),
        kpis,
        h('h3', { class: 'sim-titulo' }, ['Como o valor cresce']),
        grafico, legenda, el.meta,
        el.rendaTitulo, kRenda, el.rendaNota, tabelaPrazos, el.rendaMeta
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
      raiz.appendChild(h('p', { class: 'rodape' }, ['Não considera imposto de renda, taxas de administração nem variações do mercado. Os aportes são sempre iguais (ou reajustados pelo percentual informado) e a rentabilidade é constante. A renda passiva é uma conta com as taxas que você informa: não é promessa de rendimento nem recomendação de investimento.']));
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

      calcularRenda(s, r);

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

    // Frase "Com o plano atual você chega a X: passa/falta Y. Para chegar lá, aporte Z por mês."
    function paragrafoDoPatrimonio(s, r, titulo, necessario) {
      var p = h('p', null, [h('strong', null, [titulo + ': ']), 'precisa de ' + L.brl(necessario) + ' aos ' + s.idadeFinal + ' anos. ']);
      var dif = r.final - necessario;
      p.append(dif >= 0 ? 'O seu plano chega a ' + L.brl(r.final) + ', ou seja, passa em ' + L.brl(dif) + '.' : 'O seu plano chega a ' + L.brl(r.final) + ' e faltam ' + L.brl(-dif) + '.');
      if (dif < 0) {
        var nec = L.aporteNecessario(s, necessario);
        if (nec && !nec.jaAtinge) p.append(' Para chegar lá, o aporte mensal precisa ser de ' + L.brl(nec.aporte) + (s.reajuste !== 0 ? ' no primeiro ano.' : '.'));
      }
      return p;
    }

    function calcularRenda(s, r) {
      var rp = L.rendaPassiva(r.final, s);
      var fimConsumo = s.idadeFinal + s.anosRenda;

      el.rendaTitulo.textContent = 'Renda passiva possível aos ' + s.idadeFinal + ' anos';
      el.kSoJuros.v.textContent = L.brl(rp.soJuros) + ' por mês';
      el.kSoJuros.d.textContent = rp.jurosAbaixoDaInflacao
        ? 'O rendimento não supera a inflação: sem gastar o patrimônio, não sobra renda que mantenha o poder de compra.'
        : '≈ ' + L.brl(rp.soJurosHoje) + ' em dinheiro de hoje, com o patrimônio intacto';
      el.kConsumo.v.textContent = L.brl(rp.consumindo) + ' por mês';
      el.kConsumo.d.textContent = '≈ ' + L.brl(rp.consumindoHoje) + ' em dinheiro de hoje, até os ' + fimConsumo + ' anos';
      el.rendaNota.textContent = (s.reajustaRenda
        ? 'A retirada sobe todo mês com a inflação e mantém o poder de compra; por isso o primeiro valor é menor que o de uma retirada fixa. '
        : 'A retirada é fixa: o valor em reais não muda, mas o poder de compra cai com a inflação. ')
        + 'Primeiro mês da aposentadoria, sem imposto de renda nem taxas.';

      // comparação de prazos
      el.rendaPrazos.textContent = '';
      var prazos = [15, 20, 25, 30, 35];
      if (prazos.indexOf(s.anosRenda) < 0) { prazos.push(s.anosRenda); prazos.sort(function (a, b) { return a - b; }); }
      prazos.forEach(function (anos) {
        var rr = L.rendaPorPrazo(r.final, s, anos);
        el.rendaPrazos.appendChild(linhaTabela([anosTxt(anos) + ' (até os ' + (s.idadeFinal + anos) + ')' + (anos === s.anosRenda ? ' · o seu' : ''), L.brl(rr.mensal), L.brl(rr.hoje)], anos === s.anosRenda));
      });
      el.rendaPrazos.appendChild(linhaTabela(['Só os rendimentos (sem fim)', L.brl(rp.soJuros), L.brl(rp.soJurosHoje)], false));

      // renda desejada: patrimônio e aporte necessários
      el.rendaMeta.textContent = '';
      if (s.rendaDesejada !== null && s.rendaDesejada > 0) {
        var nec = L.patrimonioParaRenda(s.rendaDesejada, s);
        var caixa = h('div', { class: 'info' });
        caixa.appendChild(h('p', null, [h('strong', null, ['Para receber ' + L.brl(s.rendaDesejada) + ' por mês']), ' (em dinheiro de hoje), o primeiro mês da aposentadoria já será de ' + L.brl(nec.rendaNominal) + ' por causa da inflação.']));
        caixa.appendChild(paragrafoDoPatrimonio(s, r, 'Consumindo o patrimônio até os ' + fimConsumo + ' anos', nec.consumindo));
        if (nec.soJuros !== null) caixa.appendChild(paragrafoDoPatrimonio(s, r, 'Vivendo só dos rendimentos', nec.soJuros));
        else caixa.appendChild(h('p', null, ['Vivendo só dos rendimentos: com o rendimento abaixo da inflação, não dá para manter o poder de compra sem gastar o patrimônio.']));
        el.rendaMeta.appendChild(caixa);
      }
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
