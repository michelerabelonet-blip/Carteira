/*
 * Montador de Carteira: tela, desfazer/refazer, metas e aporte, contas e carteiras salvas.
 * As regras de cálculo ficam em carteira-logica.js (testada em test/logica.test.js).
 * Texto digitado pelo usuário só entra na página por textContent / value (nunca innerHTML).
 */
(function () {
  'use strict';
  var L = window.CarteiraLogica;
  var G = window.Grafico;
  var A = window.Armazenamento;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- utilidades de DOM ----------
  function h(tag, attrs, filhos) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === false || v === null || v === undefined) return;
        if (k === 'class') el.className = v;
        else if (k === 'value') el.value = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      });
    }
    (filhos || []).forEach(function (f) { if (f !== null && f !== undefined) el.append(f); });
    return el;
  }

  var ICONES = {
    x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    trava: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>',
    destrava: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.6"/></svg>',
    olho: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    olhoRisco: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.7C3.8 8.5 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
  };
  function icone(nome) {
    var t = document.createElement('template');
    t.innerHTML = ICONES[nome];
    return t.content.firstChild;
  }

  function limitar(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function ativoEm(el) { return document.activeElement === el; }

  // ---------- estado ----------
  var estado, confirmado;
  var pilhaDesfazer = [], pilhaRefazer = [];
  var modoGrafico = 'rosca', grupoBarras = 'classes';
  var refs = { classes: {}, ativos: {}, metas: {}, kpis: {} };
  var aporteValor = 0;
  var grafico;

  // conta
  var usuarioId = null, carteiras = [], carteiraAtual = null;
  var timerSalvar = null, salvando = false, pendente = false;
  var modoVisitante = false;      // sem Supabase configurado (só no computador): funciona sem login
  var sessaoConhecida = false;    // já recebemos a primeira resposta sobre a sessão?
  var sessaoAtual = null;
  var recuperando = false;        // abriu pelo link de "esqueci a senha"
  var googleDisponivel = false;
  var abaAtual = 'carteira';      // 'carteira' ou 'simulador'
  var simulador = null;

  // Qual tela está à vista: 'carregando', 'login' ou 'app'. Fora do 'app', nenhum dado de carteira aparece.
  function mostrarTela(qual, texto, comErro) {
    $('telaCarregando').hidden = qual !== 'carregando';
    $('telaLogin').hidden = qual !== 'login';
    $('app').hidden = qual !== 'app';
    if (qual === 'carregando') {
      var t = $('carregandoTexto');
      t.textContent = texto || 'Verificando sua conta…';
      t.classList.toggle('erro', !!comErro);
      $('carregandoAcoes').hidden = !comErro;
    }
  }

  // ---------- avisos e status ----------
  var timerAviso = null;
  function avisar(texto, comDesfazer) {
    var el = $('aviso');
    el.textContent = texto;
    if (comDesfazer) el.appendChild(h('button', { type: 'button', onclick: function () { desfazerAcao(); limparAviso(); } }, ['Desfazer']));
    clearTimeout(timerAviso);
    timerAviso = setTimeout(limparAviso, 9000);
  }
  function limparAviso() { $('aviso').textContent = ''; }

  function status(texto, erro, acaoTexto, acaoFn) {
    var el = $('statusSalvo');
    el.textContent = texto || '';
    el.classList.toggle('erro', !!erro);
    if (acaoTexto) el.appendChild(h('button', { type: 'button', onclick: acaoFn }, [acaoTexto]));
  }
  function hora() { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function statusVisitante() {
    status(A.contasDisponiveis() ? 'Salvo neste navegador. Entre para guardar na sua conta.' : 'Salvo neste navegador.');
  }

  // ---------- diálogo de pergunta ----------
  function perguntar(o) {
    return new Promise(function (resolve) {
      var dlg = $('dlgPergunta'), form = $('formPergunta'), campo = $('perguntaCampo');
      $('perguntaTitulo').textContent = o.titulo || '';
      $('perguntaTexto').textContent = o.texto || '';
      $('perguntaRotulo').hidden = !o.campo;
      if (o.campo) { $('perguntaRotuloTexto').textContent = o.campo.rotulo; campo.value = o.campo.valor || ''; }
      var ok = $('perguntaOk'), extra = $('perguntaExtra');
      ok.textContent = o.ok || 'OK';
      ok.classList.toggle('perigo', !!o.perigo);
      ok.classList.toggle('primario', !o.perigo);
      extra.hidden = !o.extra;
      extra.textContent = o.extra || '';
      var feito = false;
      function fechar(r) {
        if (feito) return;
        feito = true;
        form.onsubmit = null; $('perguntaCancelar').onclick = null; extra.onclick = null; dlg.oncancel = null; dlg.onclick = null;
        if (dlg.open) dlg.close();
        resolve(r);
      }
      form.onsubmit = function (ev) {
        ev.preventDefault();
        if (o.campo) {
          var v = campo.value.replace(/\s+/g, ' ').trim();
          if (!v) { campo.focus(); return; }
          fechar({ acao: 'ok', valor: v });
        } else fechar({ acao: 'ok' });
      };
      $('perguntaCancelar').onclick = function () { fechar({ acao: null }); };
      extra.onclick = function () { fechar({ acao: 'extra' }); };
      dlg.oncancel = function (ev) { ev.preventDefault(); fechar({ acao: null }); };
      dlg.onclick = function (ev) { if (ev.target === dlg) fechar({ acao: null }); };
      dlg.showModal();
      if (o.campo) { campo.focus(); campo.select(); }
    });
  }

  // ---------- histórico (desfazer / refazer) ----------
  function mesmoEstado(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function confirmar() {
    if (mesmoEstado(estado, confirmado)) return;
    pilhaDesfazer.push(confirmado);
    if (pilhaDesfazer.length > 60) pilhaDesfazer.shift();
    pilhaRefazer = [];
    confirmado = L.clonar(estado);
    atualizarBotoesHistorico();
    agendarSalvar();
  }

  function aplicar(novo, opc) {
    opc = opc || {};
    estado = novo;
    confirmar();
    if (opc.estrutura) renderTudo(); else atualizarNumeros();
    if (opc.aviso) avisar(opc.aviso, opc.desfazer !== false);
  }

  function desfazerAcao() {
    confirmar();
    if (!pilhaDesfazer.length) return;
    pilhaRefazer.push(L.clonar(estado));
    estado = pilhaDesfazer.pop();
    confirmado = L.clonar(estado);
    atualizarBotoesHistorico();
    renderTudo();
    agendarSalvar();
  }

  function refazerAcao() {
    if (!pilhaRefazer.length) return;
    pilhaDesfazer.push(L.clonar(estado));
    estado = pilhaRefazer.pop();
    confirmado = L.clonar(estado);
    atualizarBotoesHistorico();
    renderTudo();
    agendarSalvar();
  }

  function zerarHistorico() { pilhaDesfazer = []; pilhaRefazer = []; confirmado = L.clonar(estado); atualizarBotoesHistorico(); }
  function atualizarBotoesHistorico() {
    $('btnDesfazer').disabled = !pilhaDesfazer.length;
    $('btnRefazer').disabled = !pilhaRefazer.length;
  }

  // ---------- destaque ligado entre tabela e gráfico ----------
  function definirDestaque(classe, ativo) {
    grafico.destacar(classe, ativo);
    var marcadas = document.querySelectorAll('#corpo tr.hl');
    for (var i = 0; i < marcadas.length; i++) marcadas[i].classList.remove('hl');
    if (classe) {
      var r = ativo ? refs.ativos[ativo] : refs.classes[classe];
      if (r && r.tr) r.tr.classList.add('hl');
    }
  }

  // ---------- campos numéricos ----------
  function ligarNumero(inp, aoDigitar, aoConfirmar) {
    inp.addEventListener('focus', function () { inp.select(); });
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') inp.blur(); });
    if (aoDigitar) inp.addEventListener('input', aoDigitar);
    inp.addEventListener('change', aoConfirmar);
  }

  // ---------- tabela ----------
  function renderTabela() {
    var corpo = $('corpo');
    corpo.textContent = '';
    refs.classes = {};
    refs.ativos = {};

    estado.classes.forEach(function (c) {
      var cor = L.CORES[c.cor];
      var trC = h('tr', { class: 'classe' });
      var rc = refs.classes[c.id] = { tr: trC };

      var amostra = h('button', {
        type: 'button', class: 'amostra', 'aria-haspopup': 'true', 'aria-expanded': 'false',
        'aria-label': 'Cor da classe ' + c.nome + ' (' + L.NOMES_COR[c.cor] + ')', title: 'Mudar a cor'
      });
      amostra.style.setProperty('--cor', cor);
      amostra.addEventListener('click', function () { abrirPaleta(c.id, amostra); });
      var celCor = h('span', { class: 'cel-cor' }, [amostra]);
      rc.amostra = amostra;

      var nome = h('input', { type: 'text', class: 'campo-nome', value: c.nome, maxlength: String(L.MAX_NOME), 'aria-label': 'Nome da classe', autocomplete: 'off', spellcheck: 'false' });
      nome.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') nome.blur(); });
      nome.addEventListener('change', function () {
        aplicar(L.renomearClasse(estado, c.id, nome.value));
        nome.value = L.achar(estado, c.id).nome;
        renderMetas(); atualizarNumeros();
      });
      rc.nome = nome;

      var trava = h('button', { type: 'button', class: 'icone-btn', 'aria-pressed': 'false' });
      trava.addEventListener('click', function () { aplicar(L.alternarTravada(estado, c.id)); });
      rc.trava = trava;

      var soma = h('span', { class: 'soma' });
      rc.soma = soma;

      var pctInp = h('input', { type: 'text', class: 'campo', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Percentual da classe ' + c.nome });
      ligarNumero(pctInp, null, function () {
        var n = L.parseNumero(pctInp.value);
        if (isNaN(n)) { atualizarNumeros(); return; }
        var novo = L.definirPercentualClasse(estado, c.id, n);
        var T = L.total(novo), real = L.pct(L.somaClasse(L.achar(novo, c.id)), T);
        var alvo = limitar(n, 0, 100);
        aplicar(novo);
        if (Math.abs(real - alvo) > 0.05) avisar('Ficou em ' + L.fmtPct(real) + '%: as classes travadas não se movem.', true);
      });
      rc.pct = pctInp;

      var excluir = h('button', { type: 'button', class: 'icone-btn perigo', 'aria-label': 'Excluir a classe ' + c.nome, title: 'Excluir classe', disabled: estado.classes.length <= 1 }, [icone('x')]);
      excluir.addEventListener('click', function () {
        aplicar(L.removerClasse(estado, c.id), { estrutura: true, aviso: 'Classe “' + c.nome + '” excluída.' });
      });

      trC.appendChild(h('td', null, [h('div', { class: 'cel-nome' }, [celCor, nome, trava])]));
      trC.appendChild(h('td', { class: 'val' }, [soma]));
      trC.appendChild(h('td', { class: 'pc' }, [h('span', { class: 'campo-pct' }, [pctInp, h('span', null, ['%'])])]));
      trC.appendChild(h('td', { class: 'acoes' }, [excluir]));
      ligarDestaqueLinha(trC, c.id, null);
      corpo.appendChild(trC);

      c.itens.forEach(function (a, i) {
        var tr = h('tr', { class: 'ativo' });
        var ra = refs.ativos[a.id] = { tr: tr };
        var ponto = h('span', { class: 'amostra ponto', 'aria-hidden': 'true' });
        ponto.style.setProperty('--cor', L.tomDoAtivo(cor, i, c.itens.length));
        var nomeA = h('input', { type: 'text', class: 'campo-nome', value: a.nome, maxlength: String(L.MAX_NOME), 'aria-label': 'Nome do ativo da classe ' + c.nome, autocomplete: 'off', spellcheck: 'false' });
        nomeA.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') nomeA.blur(); });
        nomeA.addEventListener('change', function () {
          aplicar(L.renomearAtivo(estado, c.id, a.id, nomeA.value));
          var salvoA = L.achar(estado, c.id).itens.filter(function (x) { return x.id === a.id; })[0];
          if (salvoA) nomeA.value = salvoA.nome;
          atualizarNumeros();
        });
        ra.nome = nomeA;

        var valor = h('input', { type: 'text', class: 'campo', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Valor de ' + a.nome });
        ligarNumero(valor, function () {
          var n = L.parseNumero(valor.value);
          if (isNaN(n)) return;
          estado = L.definirValorAtivo(estado, c.id, a.id, n);
          atualizarNumeros();
          agendarSalvar();
        }, function () {
          var n = L.parseNumero(valor.value);
          if (isNaN(n)) { atualizarNumeros(); return; }
          confirmar();
          atualizarNumeros();
        });
        ra.valor = valor;

        var pc = h('span');
        ra.pct = pc;

        var del = h('button', { type: 'button', class: 'icone-btn perigo', 'aria-label': 'Excluir o ativo ' + a.nome, title: 'Excluir ativo', disabled: c.itens.length <= 1 }, [icone('x')]);
        del.addEventListener('click', function () {
          aplicar(L.removerAtivo(estado, c.id, a.id), { estrutura: true, aviso: 'Ativo “' + a.nome + '” excluído; o valor ficou com os outros ativos da classe.' });
        });

        tr.appendChild(h('td', null, [h('div', { class: 'cel-nome' }, [ponto, nomeA])]));
        tr.appendChild(h('td', { class: 'val' }, [h('span', { class: 'campo-moeda' }, [valor])]));
        tr.appendChild(h('td', { class: 'pc' }, [pc]));
        tr.appendChild(h('td', { class: 'acoes' }, [del]));
        ligarDestaqueLinha(tr, c.id, a.id);
        corpo.appendChild(tr);
      });

      var add = h('button', { type: 'button', class: 'btn-add', disabled: !L.podeAdicionarAtivo(c) }, ['+ ativo']);
      add.addEventListener('click', function () {
        var novo = L.adicionarAtivo(estado, c.id);
        aplicar(novo, { estrutura: true });
        var itens = L.achar(estado, c.id).itens;
        var ultimo = refs.ativos[itens[itens.length - 1].id];
        if (ultimo) { ultimo.nome.focus(); ultimo.nome.select(); }
      });
      var ratear = h('button', {
        type: 'button', class: 'btn-add', disabled: c.itens.length < 2,
        title: 'Reparte o valor da classe por igual entre os ativos (a classe mantém o percentual)'
      }, ['Dividir igualmente']);
      ratear.addEventListener('click', function () {
        aplicar(L.ratearClasse(estado, c.id), { aviso: 'Valor de “' + L.achar(estado, c.id).nome + '” dividido igualmente entre os ativos.' });
      });
      corpo.appendChild(h('tr', { class: 'novo' }, [h('td', { colspan: '4' }, [add, ratear])]));
    });

    $('btnNovaClasse').disabled = !L.podeAdicionarClasse(estado);
    $('ajudaClasses').textContent = L.podeAdicionarClasse(estado) ? '' : 'Limite de ' + L.MAX_CLASSES + ' classes (cada uma tem a sua cor).';
  }

  function ligarDestaqueLinha(tr, classe, ativo) {
    tr.addEventListener('pointerenter', function () { definirDestaque(classe, ativo); });
    tr.addEventListener('pointerleave', function () { definirDestaque(null, null); });
    tr.addEventListener('focusin', function () { definirDestaque(classe, ativo); });
    tr.addEventListener('focusout', function () { definirDestaque(null, null); });
  }

  // ---------- paleta de cores ----------
  var paletaAberta = null;
  function fecharPaleta(devolverFoco) {
    if (!paletaAberta) return;
    var p = paletaAberta;
    paletaAberta = null;
    p.el.remove();
    p.botao.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', p.fora, true);
    document.removeEventListener('keydown', p.tecla, true);
    if (devolverFoco) p.botao.focus();
  }

  function abrirPaleta(classeId, botao) {
    if (paletaAberta) { var mesmo = paletaAberta.botao === botao; fecharPaleta(false); if (mesmo) return; }
    var c = L.achar(estado, classeId);
    var el = h('div', { class: 'paleta', role: 'group', 'aria-label': 'Escolher a cor da classe ' + c.nome });
    L.CORES.forEach(function (hex, i) {
      var b = h('button', { type: 'button', class: i === 3 ? 'amarelo' : '', 'aria-label': L.NOMES_COR[i], 'aria-pressed': c.cor === i ? 'true' : 'false', title: L.NOMES_COR[i] }, [c.cor === i ? '✓' : '']);
      b.style.setProperty('--cor', hex);
      b.addEventListener('click', function () {
        fecharPaleta(false);
        if (c.cor !== i) aplicar(L.trocarCor(estado, classeId, i), { estrutura: true });
        var r = refs.classes[classeId];
        if (r) r.amostra.focus();
      });
      el.appendChild(b);
    });
    botao.parentNode.appendChild(el);
    botao.setAttribute('aria-expanded', 'true');
    var fora = function (ev) { if (!el.contains(ev.target) && ev.target !== botao) fecharPaleta(false); };
    var tecla = function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); fecharPaleta(true); } };
    document.addEventListener('pointerdown', fora, true);
    document.addEventListener('keydown', tecla, true);
    paletaAberta = { el: el, botao: botao, fora: fora, tecla: tecla };
    var atual = el.querySelector('[aria-pressed="true"]');
    (atual || el.firstChild).focus();
  }

  // ---------- KPIs ----------
  function renderKpis() {
    var box = $('kpis');
    box.textContent = '';
    function tile(chave, rotulo) {
      var v = h('div', { class: 'kpi-valor' }), d = h('div', { class: 'kpi-detalhe' });
      refs.kpis[chave] = { v: v, d: d };
      return h('div', { class: 'kpi' }, [h('div', { class: 'kpi-rotulo' }, [rotulo]), v, d]);
    }
    box.appendChild(tile('classe', 'Maior classe'));
    box.appendChild(tile('ativo', 'Maior ativo'));
    box.appendChild(tile('qtd', 'Ativos'));
  }

  function atualizarKpis(T) {
    var maiorC = null, maiorA = null, maiorAClasse = '', qtd = 0;
    estado.classes.forEach(function (c) {
      var s = L.somaClasse(c);
      if (!maiorC || s > L.somaClasse(maiorC)) maiorC = c;
      c.itens.forEach(function (a) {
        qtd++;
        if (!maiorA || a.valor > maiorA.valor) { maiorA = a; maiorAClasse = c.nome; }
      });
    });
    var k = refs.kpis;
    if (T > 0 && maiorC) {
      k.classe.v.textContent = L.fmtPct(L.pct(L.somaClasse(maiorC), T)) + '%';
      k.classe.d.textContent = maiorC.nome;
      k.ativo.v.textContent = L.fmtPct(L.pct(maiorA.valor, T)) + '%';
      k.ativo.d.textContent = maiorA.nome;
    } else {
      k.classe.v.textContent = '—'; k.classe.d.textContent = '';
      k.ativo.v.textContent = '—'; k.ativo.d.textContent = '';
    }
    k.qtd.v.textContent = String(qtd);
    k.qtd.d.textContent = 'em ' + estado.classes.length + (estado.classes.length === 1 ? ' classe' : ' classes');
  }

  // ---------- gráfico ----------
  function atualizarGrafico(T) {
    var dados = {
      total: T,
      classes: estado.classes.map(function (c) {
        var cor = L.CORES[c.cor];
        return {
          id: c.id, nome: c.nome, cor: cor, valor: L.somaClasse(c),
          itens: c.itens.map(function (a, i) { return { id: a.id, nome: a.nome, valor: a.valor, tom: L.tomDoAtivo(cor, i, c.itens.length) }; })
        };
      })
    };
    grafico.atualizar(dados, { modo: modoGrafico, grupo: grupoBarras });
    $('legendaGrafico').textContent = modoGrafico === 'rosca'
      ? 'Anel de dentro: classes. Anel de fora: ativos.'
      : (grupoBarras === 'ativos' ? 'Os 10 maiores ativos; o resto aparece em “Outros”.' : '');
  }

  // ---------- atualização dos números (sem refazer a tabela) ----------
  function atualizarNumeros() {
    var T = L.total(estado);
    var inpTotal = $('inpTotal');
    if (!ativoEm(inpTotal)) inpTotal.value = L.numero(T);

    estado.classes.forEach(function (c) {
      var r = refs.classes[c.id];
      if (!r) return;
      var soma = L.somaClasse(c);
      r.soma.textContent = L.brl(soma);
      if (!ativoEm(r.pct)) r.pct.value = L.fmtPct(L.pct(soma, T));
      r.trava.setAttribute('aria-pressed', c.travada ? 'true' : 'false');
      r.trava.setAttribute('aria-label', (c.travada ? 'Destravar' : 'Travar') + ' o percentual da classe ' + c.nome);
      r.trava.title = c.travada ? 'Percentual travado: não muda quando você edita outras classes' : 'Travar o percentual desta classe';
      r.trava.textContent = '';
      r.trava.appendChild(icone(c.travada ? 'trava' : 'destrava'));
      c.itens.forEach(function (a) {
        var ra = refs.ativos[a.id];
        if (!ra) return;
        if (!ativoEm(ra.valor)) ra.valor.value = L.numero(a.valor);
        ra.pct.textContent = L.fmtPct(L.pct(a.valor, T)) + '%';
        ra.tr.title = L.fmtPct(L.pct(a.valor, soma)) + '% da classe';
      });
    });
    atualizarKpis(T);
    atualizarGrafico(T);
    atualizarMetas(T);
  }

  // ---------- metas, rebalanceamento e aporte ----------
  function renderMetas() {
    var box = $('metasPainel');
    box.textContent = '';
    refs.metas = { linhas: {} };
    var m = refs.metas;

    var tbody = h('tbody');
    estado.classes.forEach(function (c) {
      var ponto = h('span', { class: 'amostra ponto', 'aria-hidden': 'true' });
      ponto.style.setProperty('--cor', L.CORES[c.cor]);
      var atual = h('td'), dif = h('td', { class: 'diferenca' }), ajuste = h('td', { class: 'acao-ajuste' });
      var inp = h('input', { type: 'text', class: 'campo', inputmode: 'decimal', autocomplete: 'off', placeholder: '—', 'aria-label': 'Meta da classe ' + c.nome + ' em porcentagem', value: c.meta === null ? '' : L.fmtPct(c.meta) });
      ligarNumero(inp, null, function () {
        var txt = inp.value.trim();
        if (txt === '') { aplicar(L.definirMeta(estado, c.id, null)); return; }
        var n = L.parseNumero(txt);
        if (isNaN(n)) { atualizarNumeros(); inp.value = L.achar(estado, c.id).meta === null ? '' : L.fmtPct(L.achar(estado, c.id).meta); return; }
        aplicar(L.definirMeta(estado, c.id, n));
        var meta = L.achar(estado, c.id).meta;
        inp.value = meta === null ? '' : L.fmtPct(meta);
      });
      m.linhas[c.id] = { atual: atual, dif: dif, ajuste: ajuste, inp: inp };
      tbody.appendChild(h('tr', null, [
        h('td', null, [h('div', { class: 'cel-nome' }, [ponto, h('span', { class: 'nm' }, [c.nome])])]),
        atual,
        h('td', null, [h('span', { class: 'campo-pct' }, [inp, h('span', null, ['%'])])]),
        dif, ajuste
      ]));
    });

    var tabela = h('table', { class: 'tab-metas' }, [
      h('caption', { class: 'so-leitor' }, ['Metas por classe, diferença para a meta e ajuste necessário']),
      h('thead', null, [h('tr', null, [
        h('th', { scope: 'col' }, ['Classe']), h('th', { scope: 'col' }, ['Atual']), h('th', { scope: 'col' }, ['Meta']),
        h('th', { scope: 'col' }, ['Diferença']), h('th', { scope: 'col' }, ['Para chegar na meta'])
      ])]),
      tbody
    ]);

    m.selo = h('span', { class: 'selo' });
    m.btnAtual = h('button', { type: 'button', class: 'btn peq' }, ['Usar % atual como meta']);
    m.btnLimpar = h('button', { type: 'button', class: 'btn peq' }, ['Limpar metas']);
    m.btnLevar = h('button', { type: 'button', class: 'btn peq primario', title: 'Ajusta os valores de cada classe para as metas, mantendo o total' }, ['Levar às metas']);
    m.btnAtual.addEventListener('click', function () { aplicar(L.metasDoAtual(estado), { estrutura: true }); });
    m.btnLimpar.addEventListener('click', function () { aplicar(L.limparMetas(estado), { estrutura: true, aviso: 'Metas removidas.' }); });
    m.btnLevar.addEventListener('click', function () {
      aplicar(L.aplicarMetas(estado), { aviso: 'Carteira ajustada às metas.' });
    });

    var esquerda = h('div', null, [
      h('h3', null, ['Metas por classe']),
      h('div', { class: 'rolavel' }, [tabela]),
      h('div', { class: 'metas-acoes' }, [m.selo, m.btnAtual, m.btnLimpar, m.btnLevar])
    ]);

    // aporte
    m.aporteInp = h('input', { id: 'inpAporte', type: 'text', class: 'campo', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', value: aporteValor > 0 ? L.numero(aporteValor) : '' });
    ligarNumero(m.aporteInp, function () {
      var n = L.parseNumero(m.aporteInp.value);
      aporteValor = isNaN(n) ? 0 : limitar(n, 0, 1e12);
      atualizarAporte();
    }, function () {
      if (aporteValor > 0) m.aporteInp.value = L.numero(aporteValor);
    });
    m.planoBox = h('div');
    var direita = h('div', null, [
      h('h3', null, ['Quanto aportar']),
      h('div', { class: 'aporte-campo' }, [
        h('label', { for: 'inpAporte' }, ['Valor do aporte']),
        h('span', { class: 'campo-moeda' }, [m.aporteInp])
      ]),
      m.planoBox
    ]);

    box.appendChild(h('div', { class: 'metas-grade' }, [esquerda, direita]));
  }

  function fmtPP(x) { return L.fmtPct(Math.abs(x)); }

  function atualizarMetas(T) {
    var m = refs.metas;
    if (!m || !m.linhas) return;
    var validas = L.metasValidas(estado);
    var plano = L.planoAjuste(estado);
    var planoPorId = {};
    if (plano) plano.forEach(function (p) { planoPorId[p.id] = p; });

    estado.classes.forEach(function (c) {
      var l = m.linhas[c.id];
      if (!l) return;
      var atualPct = L.pct(L.somaClasse(c), T);
      l.atual.textContent = L.fmtPct(atualPct) + '%';
      if (!ativoEm(l.inp)) l.inp.value = c.meta === null ? '' : L.fmtPct(c.meta);
      if (c.meta === null) { l.dif.textContent = '—'; }
      else {
        var d = atualPct - c.meta;
        l.dif.textContent = Math.abs(d) < 0.05 ? 'No alvo' : (d > 0 ? '▲ ' + fmtPP(d) + ' pp acima' : '▼ ' + fmtPP(d) + ' pp abaixo');
      }
      l.ajuste.textContent = '';
      var p = planoPorId[c.id];
      if (!p) l.ajuste.textContent = '—';
      else if (Math.abs(p.diferenca) < 0.5) l.ajuste.textContent = 'Nada a fazer';
      else {
        l.ajuste.appendChild(document.createTextNode((p.diferenca > 0 ? 'Comprar ' : 'Vender ') + L.brl(Math.abs(p.diferenca))));
        l.ajuste.appendChild(h('small', null, ['fica com ' + L.brl(p.alvo)]));
      }
    });

    var soma = L.somaMetas(estado);
    var algumaMeta = estado.classes.some(function (c) { return c.meta !== null; });
    m.selo.classList.toggle('ok', validas);
    if (validas) m.selo.textContent = '✓ Metas somam 100%';
    else if (!algumaMeta) m.selo.textContent = 'Sem metas definidas';
    else if (estado.classes.some(function (c) { return c.meta === null; })) m.selo.textContent = 'Faltam metas · soma ' + L.fmtPct(soma) + '%';
    else m.selo.textContent = soma < 100 ? 'Faltam ' + fmtPP(100 - soma) + ' pontos para 100%' : 'Passou ' + fmtPP(soma - 100) + ' pontos de 100%';
    m.btnLevar.disabled = !validas || T <= 0;
    m.btnLimpar.disabled = !algumaMeta;
    atualizarAporte();
  }

  function atualizarAporte() {
    var m = refs.metas;
    if (!m || !m.planoBox) return;
    var box = m.planoBox;
    box.textContent = '';
    if (!L.metasValidas(estado)) {
      box.appendChild(h('p', { class: 'sem-meta' }, ['Defina metas que somem 100% para ver como dividir o aporte.']));
      return;
    }
    var plano = L.planoAporte(estado, aporteValor);
    if (!plano) {
      box.appendChild(h('p', { class: 'sem-meta' }, ['Digite um valor para ver quanto vai para cada classe. O aporte vai só para as classes abaixo da meta, sem vender nada.']));
      return;
    }
    var T2 = L.total(estado) + aporteValor;
    var tbody = h('tbody');
    estado.classes.forEach(function (c) {
      var p = plano.filter(function (x) { return x.id === c.id; })[0];
      var ponto = h('span', { class: 'amostra ponto', 'aria-hidden': 'true' });
      ponto.style.setProperty('--cor', L.CORES[c.cor]);
      tbody.appendChild(h('tr', null, [
        h('td', null, [h('div', { class: 'cel-nome' }, [ponto, h('span', { class: 'nm' }, [c.nome])])]),
        h('td', null, [p.aporte >= 0.005 ? L.brl(p.aporte) : '—']),
        h('td', null, [L.fmtPct(L.pct(p.depois, T2)) + '%'])
      ]));
    });
    box.appendChild(h('div', { class: 'rolavel' }, [h('table', { class: 'tab-metas' }, [
      h('caption', { class: 'so-leitor' }, ['Como dividir o aporte entre as classes']),
      h('thead', null, [h('tr', null, [h('th', { scope: 'col' }, ['Classe']), h('th', { scope: 'col' }, ['Aporte']), h('th', { scope: 'col' }, ['Depois'])])]),
      tbody,
      h('tfoot', null, [h('tr', null, [h('td', null, ['Total']), h('td', null, [L.brl(aporteValor)]), h('td', null, [L.brl(T2)])])])
    ])]));
    var aplicarBtn = h('button', { type: 'button', class: 'btn primario' }, ['Aplicar aporte']);
    aplicarBtn.addEventListener('click', function () {
      var valor = aporteValor;
      aplicar(L.aplicarAporte(estado, L.planoAporte(estado, valor)), { aviso: 'Aporte de ' + L.brl(valor) + ' aplicado.' });
      aporteValor = 0;
      m.aporteInp.value = '';
      atualizarAporte();
    });
    box.appendChild(h('div', { class: 'metas-acoes' }, [aplicarBtn]));
  }

  // ---------- render geral ----------
  function renderTudo() {
    fecharPaleta(false);
    renderTabela();
    renderKpis();
    renderMetas();
    atualizarNumeros();
    if (abaAtual === 'simulador' && simulador) simulador.renderizar();
  }

  // ---------- modo privado: Ocultar valores ----------
  var CHAVE_PRIVADO = 'montador.v1.ocultar-valores';
  function lerPrivado() { try { return localStorage.getItem(CHAVE_PRIVADO) === '1'; } catch (e) { return false; } }
  function guardarPrivado(sim) {
    try { if (sim) localStorage.setItem(CHAVE_PRIVADO, '1'); else localStorage.removeItem(CHAVE_PRIVADO); } catch (e) { /* sem armazenamento: ok */ }
  }

  function atualizarBotaoPrivacidade() {
    var p = L.estaPrivado(), btn = $('btnPrivacidade'), ic = $('iconePrivacidade');
    btn.setAttribute('aria-pressed', p ? 'true' : 'false');
    btn.title = p ? 'Mostra os valores em reais de novo' : 'Esconde todos os valores em reais da tela';
    $('rotuloPrivacidade').textContent = p ? 'Mostrar valores' : 'Ocultar valores';
    ic.textContent = '';
    ic.appendChild(icone(p ? 'olhoRisco' : 'olho'));
    document.body.classList.toggle('privado', p);
  }

  function alternarPrivacidade() {
    L.definirPrivado(!L.estaPrivado());
    guardarPrivado(L.estaPrivado());
    atualizarBotaoPrivacidade();
    $('dica').hidden = true;
    $('aviso').textContent = ''; // avisos antigos podem ter valores escritos
    renderTudo();                // refaz tudo com os valores à mostra ou mascarados
  }

  // ---------- abas: Carteira | Simulador de juros ----------
  function mostrarVista(qual) {
    abaAtual = qual;
    $('vistaCarteira').hidden = qual !== 'carteira';
    $('vistaSimulador').hidden = qual !== 'simulador';
    Array.prototype.forEach.call(document.querySelectorAll('.aba-app'), function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-vista') === qual ? 'true' : 'false');
    });
    if (qual === 'simulador' && simulador && estado) simulador.renderizar();
  }

  // O simulador é guardado junto com a carteira (cada carteira tem o seu plano).
  function gravarSimulador(sim) {
    estado.simulador = sim;
    if (confirmado) confirmado.simulador = L.clonar(sim); // não conta como ação de desfazer
    agendarSalvar();
  }

  // ---------- eventos gerais ----------
  function baixarCSV() {
    var texto = '﻿' + L.paraCSV(estado);
    // No celular (sobretudo no iPhone com o app instalado) o download direto não funciona bem:
    // abre a folha de compartilhar, de onde dá para salvar em Arquivos, mandar por WhatsApp, e-mail etc.
    try {
      var arquivo = new File([texto], 'carteira.csv', { type: 'text/csv' });
      if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        navigator.share({ files: [arquivo], title: 'Minha carteira' }).catch(function () { /* cancelou */ });
        return;
      }
    } catch (e) { /* segue para o download comum */ }
    var blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'carteira.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    avisar('Planilha gerada. Se o download não começar, abra o app em tela cheia.');
  }

  function ligarEventosGerais() {
    ligarNumero($('inpTotal'), null, function () {
      var n = L.parseNumero($('inpTotal').value);
      if (isNaN(n)) { atualizarNumeros(); return; }
      aplicar(L.definirTotal(estado, n));
    });

    $('btnNovaClasse').addEventListener('click', function () {
      aplicar(L.adicionarClasse(estado, 'Nova classe'), { estrutura: true });
      var ultima = estado.classes[estado.classes.length - 1];
      var r = refs.classes[ultima.id];
      if (r) { r.nome.focus(); r.nome.select(); }
    });

    $('btnDesfazer').addEventListener('click', desfazerAcao);
    $('btnRefazer').addEventListener('click', refazerAcao);
    $('btnCSV').addEventListener('click', baixarCSV);
    $('btnExemplo').addEventListener('click', function () {
      perguntar({ titulo: 'Restaurar o exemplo?', texto: 'A carteira atual será trocada pelo exemplo. Você pode desfazer logo em seguida.', ok: 'Restaurar' }).then(function (r) {
        if (r.acao !== 'ok') return;
        aporteValor = 0;
        var novo = L.exemplo();
        if (estado.simulador) novo.simulador = estado.simulador; // o plano do simulador não é apagado
        aplicar(novo, { estrutura: true, aviso: 'Exemplo restaurado.' });
      });
    });

    var botoesModo = document.querySelectorAll('[data-modo].seg-btn');
    Array.prototype.forEach.call(botoesModo, function (b) {
      b.addEventListener('click', function () {
        modoGrafico = b.getAttribute('data-modo');
        Array.prototype.forEach.call(botoesModo, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        $('segGrupo').hidden = modoGrafico !== 'barras';
        atualizarGrafico(L.total(estado));
      });
    });
    var botoesGrupo = document.querySelectorAll('[data-grupo]');
    Array.prototype.forEach.call(botoesGrupo, function (b) {
      b.addEventListener('click', function () {
        grupoBarras = b.getAttribute('data-grupo');
        Array.prototype.forEach.call(botoesGrupo, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        atualizarGrafico(L.total(estado));
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.aba-app'), function (b) {
      b.addEventListener('click', function () { mostrarVista(b.getAttribute('data-vista')); });
    });
    $('btnPrivacidade').addEventListener('click', alternarPrivacidade);

    document.addEventListener('keydown', function (ev) {
      var t = ev.target, emCampo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
      if (emCampo || !(ev.ctrlKey || ev.metaKey) || abaAtual !== 'carteira') return;
      var k = ev.key.toLowerCase();
      if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); desfazerAcao(); }
      else if ((k === 'z' && ev.shiftKey) || k === 'y') { ev.preventDefault(); refazerAcao(); }
    });

    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') salvarAgora(); });
    window.addEventListener('pagehide', function () { salvarAgora(); });
  }

  // ---------- salvar (visitante ou conta) ----------
  function agendarSalvar() {
    clearTimeout(timerSalvar);
    if (carteiraAtual) status('Alterações não salvas…');
    timerSalvar = setTimeout(salvarAgora, 900);
  }

  function salvarAgora() {
    clearTimeout(timerSalvar);
    timerSalvar = null;
    if (!carteiraAtual) {
      // Com login obrigatório nunca se guarda carteira no navegador; só no modo local, sem Supabase.
      if (!modoVisitante) return Promise.resolve();
      A.salvarVisitante(estado);
      statusVisitante();
      return Promise.resolve();
    }
    if (salvando) { pendente = true; return Promise.resolve(); }
    salvando = true;
    var id = carteiraAtual.id;
    var dados = L.clonar(estado);
    status('Salvando…');
    return A.salvar(id, dados).then(function () {
      if (carteiraAtual && carteiraAtual.id === id) status('Salvo às ' + hora());
    }).catch(function (e) {
      status('Não salvou: ' + e.message, true, 'Tentar de novo', salvarAgora);
    }).then(function () {
      salvando = false;
      if (pendente) { pendente = false; return salvarAgora(); }
    });
  }

  // ---------- conta ----------
  function iniciarConta() {
    $('conta').hidden = false;
    $('btnSair').addEventListener('click', sair);
    $('btnSairCarregando').addEventListener('click', sair);
    $('btnCarregarDeNovo').addEventListener('click', function () {
      if (sessaoAtual) aoEntrar(sessaoAtual); else location.reload();
    });
    $('selCarteira').addEventListener('change', function () { trocarCarteira($('selCarteira').value); });
    $('btnNovaCarteira').addEventListener('click', novaCarteira);
    $('btnRenomearCarteira').addEventListener('click', renomearCarteira);
    $('btnDuplicarCarteira').addEventListener('click', duplicarCarteira);
    $('btnExcluirCarteira').addEventListener('click', excluirCarteira);
    prepararTelaLogin();
    A.googleAtivo().then(function (ok) { googleDisponivel = ok; atualizarBlocoGoogle(); });
    // o supabase-js avisa a sessão atual logo ao assinar (INITIAL_SESSION)
    A.aoMudarSessao(function (evento, sessao) {
      setTimeout(function () { aoMudarSessao(evento, sessao); }, 0);
    });
    // se a resposta sobre a sessão não vier (sem internet, por exemplo), não deixa a página parada
    setTimeout(function () {
      if (!sessaoConhecida) mostrarTela('carregando', 'Não foi possível verificar a sua conta. Confira a internet e tente de novo.', true);
    }, 12000);
  }

  function aoMudarSessao(evento, sessao) {
    if (evento === 'PASSWORD_RECOVERY') { recuperando = true; mostrarLogin('nova-senha', true); }
    var id = sessao && sessao.user ? sessao.user.id : null;
    var primeira = !sessaoConhecida;
    sessaoConhecida = true;
    if (!primeira && id === usuarioId) return;
    usuarioId = id;
    sessaoAtual = sessao || null;
    if (!id) aoSair(primeira); else aoEntrar(sessao);
  }

  function mostrarBarraConta(email) {
    $('contaEmail').textContent = email || '';
    $('barraCarteiras').hidden = !email;
  }

  function aoEntrar(sessao) {
    var meuId = usuarioId;
    mostrarBarraConta(sessao.user.email);
    if (!recuperando) mostrarTela('carregando', 'Carregando suas carteiras…');
    return A.listar().then(function (lista) {
      if (usuarioId !== meuId) return;
      carteiras = lista;
      if (!carteiras.length) {
        // primeira vez desta conta: começa com o exemplo
        var inicial = L.exemplo();
        return A.criar('Minha carteira', inicial).then(function (nova) {
          carteiras = [nova];
          abrirRegistro(nova, inicial);
        });
      }
      var guardada = A.lerUltima(meuId);
      var alvo = carteiras.filter(function (c) { return c.id === guardada; })[0] || carteiras[0];
      return carregarCarteira(alvo.id);
    }).then(function () {
      if (usuarioId === meuId && !recuperando) mostrarTela('app');
    }).catch(function (e) {
      if (usuarioId !== meuId) return;
      mostrarTela('carregando', 'Não foi possível carregar as suas carteiras: ' + e.message, true);
    });
  }

  // Ao sair, a carteira some da tela e da memória da página: só fica a tela de login.
  function aoSair(primeira) {
    clearTimeout(timerSalvar);
    carteiraAtual = null;
    carteiras = [];
    sessaoAtual = null;
    mostrarBarraConta('');
    estado = L.exemplo();
    aporteValor = 0;
    zerarHistorico();
    limparTelaDoApp();
    if (!recuperando) mostrarLogin('entrar', !primeira);
    // abriu pelo botão "Continuar com o Google" de dentro de um iframe: segue direto para o Google
    if (primeira && /[?&]entrar=google\b/.test(location.search)) {
      history.replaceState(null, '', location.pathname);
      iniciarGoogle();
    }
    var d = erroNaUrl();
    if (d) $('contaErro').textContent = d;
  }

  function limparTelaDoApp() {
    ['corpo', 'kpis', 'metasPainel', 'selCarteira', 'legendaGrafico', 'aviso', 'statusSalvo'].forEach(function (id) { $(id).textContent = ''; });
    $('inpTotal').value = '';
    refs = { classes: {}, ativos: {}, metas: {}, kpis: {} };
    grafico.atualizar({ total: 0, classes: [] }, { modo: modoGrafico, grupo: grupoBarras });
    grafico.destacar(null, null);
    // o simulador também é esvaziado: nenhum número de quem saiu fica na página
    if (simulador) simulador.limpar();
    mostrarVista('carteira');
  }

  // O Supabase devolve o motivo na URL quando o Google recusa ou o link expirou.
  function erroNaUrl() {
    var m = /[#&?]error_description=([^&]+)/.exec(location.hash + location.search);
    if (!m && !/[#&?]error=/.test(location.hash + location.search)) return '';
    history.replaceState(null, '', location.pathname);
    var desc = '';
    try { desc = decodeURIComponent((m && m[1] || '').replace(/\+/g, ' ')).toLowerCase(); } catch (e) { /* ignora */ }
    if (desc.indexOf('expired') >= 0) return 'O link expirou. Peça um novo.';
    return 'Não foi possível concluir a entrada. Tente de novo.';
  }

  function sair() {
    Promise.resolve(salvarAgora()).then(function () { return A.sair(); }).catch(function (e) { avisar(e.message); });
  }

  function abrirRegistro(reg, dados) {
    carteiraAtual = { id: reg.id, nome: reg.nome };
    estado = L.validar(dados) || L.exemplo();
    aporteValor = 0;
    zerarHistorico();
    A.guardarUltima(usuarioId, reg.id);
    renderSeletor();
    renderTudo();
    status('Salvo às ' + hora());
  }

  function carregarCarteira(id) {
    return A.carregar(id).then(function (r) {
      abrirRegistro({ id: r.id, nome: r.nome }, r.dados);
    });
  }

  function trocarCarteira(id) {
    if (!carteiraAtual || id === carteiraAtual.id) return;
    Promise.resolve(salvarAgora()).then(function () { return carregarCarteira(id); }).catch(function (e) {
      avisar(e.message);
      renderSeletor();
    });
  }

  function renderSeletor() {
    var sel = $('selCarteira');
    sel.textContent = '';
    carteiras.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.nome;
      if (carteiraAtual && c.id === carteiraAtual.id) o.selected = true;
      sel.appendChild(o);
    });
    $('btnNovaCarteira').disabled = carteiras.length >= A.LIMITE_CARTEIRAS;
    $('btnDuplicarCarteira').disabled = carteiras.length >= A.LIMITE_CARTEIRAS;
  }

  function nomeUnico(base) {
    base = base.slice(0, L.MAX_NOME);
    return base;
  }

  function novaCarteira() {
    perguntar({ titulo: 'Nova carteira', texto: 'Ela começa com o exemplo; troque os ativos e valores do seu jeito.', campo: { rotulo: 'Nome', valor: 'Nova carteira' }, ok: 'Criar' }).then(function (r) {
      if (r.acao !== 'ok') return;
      return Promise.resolve(salvarAgora()).then(function () { return A.criar(nomeUnico(r.valor), L.exemplo()); }).then(function (nova) {
        carteiras.unshift(nova);
        return carregarCarteira(nova.id);
      });
    }).catch(function (e) { avisar(e.message); });
  }

  function duplicarCarteira() {
    if (!carteiraAtual) return;
    Promise.resolve(salvarAgora()).then(function () {
      return A.criar(nomeUnico(carteiraAtual.nome + ' (cópia)'), estado);
    }).then(function (nova) {
      carteiras.unshift(nova);
      return carregarCarteira(nova.id);
    }).then(function () { avisar('Carteira duplicada.'); }).catch(function (e) { avisar(e.message); });
  }

  function renomearCarteira() {
    if (!carteiraAtual) return;
    perguntar({ titulo: 'Renomear carteira', campo: { rotulo: 'Nome', valor: carteiraAtual.nome }, ok: 'Salvar' }).then(function (r) {
      if (r.acao !== 'ok') return;
      var nome = nomeUnico(r.valor);
      return A.renomear(carteiraAtual.id, nome).then(function () {
        carteiraAtual.nome = nome;
        carteiras.forEach(function (c) { if (c.id === carteiraAtual.id) c.nome = nome; });
        renderSeletor();
      });
    }).catch(function (e) { avisar(e.message); });
  }

  function excluirCarteira() {
    if (!carteiraAtual) return;
    var alvo = carteiraAtual;
    perguntar({ titulo: 'Excluir “' + alvo.nome + '”?', texto: 'Esta carteira será apagada da sua conta e não dá para desfazer.', ok: 'Excluir', perigo: true }).then(function (r) {
      if (r.acao !== 'ok') return;
      clearTimeout(timerSalvar);
      return A.excluir(alvo.id).then(function () {
        carteiras = carteiras.filter(function (c) { return c.id !== alvo.id; });
        carteiraAtual = null;
        if (carteiras.length) return carregarCarteira(carteiras[0].id);
        return A.criar('Minha carteira', L.exemplo()).then(function (nova) { carteiras = [nova]; return carregarCarteira(nova.id); });
      }).then(function () { avisar('Carteira excluída.'); });
    }).catch(function (e) { avisar(e.message); });
  }

  // ---------- tela de login ----------
  var modoConta = 'entrar';

  function definirModoConta(modo) {
    modoConta = modo;
    var titulos = { entrar: 'Entrar', criar: 'Criar conta', 'nova-senha': 'Definir nova senha' };
    $('contaTitulo').textContent = titulos[modo];
    $('contaAbas').hidden = modo === 'nova-senha';
    Array.prototype.forEach.call($('contaAbas').querySelectorAll('.aba'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-modo') === modo ? 'true' : 'false'); });
    $('rotEmail').hidden = modo === 'nova-senha';
    $('rotSenha').textContent = modo === 'nova-senha' ? 'Nova senha' : 'Senha';
    $('contaCampoSenha').setAttribute('autocomplete', modo === 'entrar' ? 'current-password' : 'new-password');
    $('contaOk').textContent = titulos[modo] === 'Definir nova senha' ? 'Salvar senha' : titulos[modo];
    $('btnEsqueci').hidden = modo !== 'entrar';
    $('contaCancelar').hidden = modo !== 'nova-senha';
    $('contaTexto').textContent = modo === 'criar'
      ? 'Use uma senha com 8 ou mais caracteres. Dependendo da configuração, você receberá um e-mail para confirmar a conta.'
      : (modo === 'nova-senha' ? 'Escolha uma senha nova, com 8 ou mais caracteres.' : '');
    $('contaErro').textContent = '';
    $('contaInfo').textContent = '';
    atualizarBlocoGoogle();
  }

  function atualizarBlocoGoogle() {
    $('blocoGoogle').hidden = !(googleDisponivel && modoConta !== 'nova-senha');
  }

  // Mostra a tela de login (e esvazia os campos, para não sobrar e-mail nem senha de quem saiu).
  function mostrarLogin(modo, focar) {
    mostrarTela('login');
    definirModoConta(modo);
    $('contaCampoEmail').value = '';
    $('contaCampoSenha').value = '';
    if (focar) setTimeout(function () { (modo === 'nova-senha' ? $('contaCampoSenha') : $('contaCampoEmail')).focus(); }, 0);
  }

  function emailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254; }

  // Dentro de um iframe (Framer) o Google não deixa abrir o login; então abre o app em outra aba, em tela cheia.
  function dentroDeIframe() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  function iniciarGoogle() {
    if (dentroDeIframe()) {
      var url = location.origin + location.pathname + '?entrar=google';
      // sem a opção "noopener" de propósito: com ela o navegador sempre devolve null e não dá para saber se bloqueou
      var aba = window.open(url, '_blank');
      if (aba) { try { aba.opener = null; } catch (e) { /* ok */ } }
      if (!aba) $('contaErro').textContent = 'O navegador bloqueou a nova aba. Permita pop-ups para este site e tente de novo.';
      else $('contaInfo').textContent = 'Abrimos o login do Google em outra aba. Continue por lá.';
      return;
    }
    $('btnGoogle').disabled = true;
    A.entrarComGoogle().catch(function (e) {
      $('contaErro').textContent = e.message;
      $('btnGoogle').disabled = false;
    });
  }

  function prepararTelaLogin() {
    Array.prototype.forEach.call($('contaAbas').querySelectorAll('.aba'), function (b) {
      b.addEventListener('click', function () { definirModoConta(b.getAttribute('data-modo')); $('contaCampoEmail').focus(); });
    });
    $('btnGoogle').addEventListener('click', iniciarGoogle);
    $('contaCancelar').addEventListener('click', function () {
      recuperando = false;
      if (usuarioId) mostrarTela('app'); else mostrarLogin('entrar', true);
    });

    $('btnEsqueci').addEventListener('click', function () {
      var email = $('contaCampoEmail').value.trim();
      $('contaErro').textContent = '';
      if (!emailValido(email)) { $('contaErro').textContent = 'Digite seu e-mail acima para receber o link.'; $('contaCampoEmail').focus(); return; }
      $('btnEsqueci').disabled = true;
      A.esqueciSenha(email).then(function () {
        $('contaInfo').textContent = 'Se existir uma conta com esse e-mail, enviamos o link para criar uma nova senha.';
      }).catch(function (e) { $('contaErro').textContent = e.message; }).then(function () { $('btnEsqueci').disabled = false; });
    });

    $('formConta').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = $('contaCampoEmail').value.trim();
      var senha = $('contaCampoSenha').value;
      var erro = $('contaErro');
      erro.textContent = '';
      if (modoConta !== 'nova-senha' && !emailValido(email)) { erro.textContent = 'Digite um e-mail válido.'; $('contaCampoEmail').focus(); return; }
      if (!senha) { erro.textContent = 'Digite a senha.'; $('contaCampoSenha').focus(); return; }
      if (modoConta !== 'entrar' && senha.length < 8) { erro.textContent = 'A senha precisa ter 8 ou mais caracteres.'; $('contaCampoSenha').focus(); return; }
      var ok = $('contaOk');
      ok.disabled = true;
      var acao;
      if (modoConta === 'entrar') {
        // quem leva para a carteira é o aviso de sessão (onAuthStateChange), em aoEntrar()
        acao = A.entrar(email, senha).then(function () { $('contaCampoSenha').value = ''; });
      } else if (modoConta === 'criar') {
        acao = A.criarConta(email, senha).then(function (res) {
          $('contaCampoSenha').value = '';
          if (!(res && res.session)) {
            definirModoConta('entrar');
            $('contaInfo').textContent = 'Enviamos um e-mail para ' + email + '. Se for um cadastro novo, confirme pelo link e depois entre aqui. Se já tinha conta, é só entrar.';
          }
        });
      } else {
        acao = A.novaSenha(senha).then(function () {
          recuperando = false;
          $('contaCampoSenha').value = '';
          if (usuarioId) mostrarTela('app'); else mostrarLogin('entrar', true);
        });
      }
      acao.catch(function (e) { erro.textContent = e.message; }).then(function () { ok.disabled = false; });
    });
  }

  // ---------- app instalável (PWA) ----------
  var CHAVE_INSTALAR = 'montador.v1.instalar-dispensado';
  var eventoInstalar = null;

  function jaInstalado() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function ehIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function instalarDispensado() { try { return localStorage.getItem(CHAVE_INSTALAR) === '1'; } catch (e) { return false; } }

  function mostrarConviteInstalar() {
    if (jaInstalado() || dentroDeIframe() || instalarDispensado()) { $('instalar').hidden = true; return; }
    var texto = $('instalarTexto'), botao = $('btnInstalar');
    if (eventoInstalar) {
      // Android/Chrome: o navegador deixa instalar com um toque
      texto.textContent = 'Instale o app para abrir direto da tela inicial, em tela cheia.';
      botao.hidden = false;
    } else if (ehIOS()) {
      // iPhone/iPad: não há botão de instalar; o caminho é pelo menu Compartilhar
      texto.textContent = 'Para instalar no iPhone: toque em Compartilhar (o quadrado com a seta) e depois em “Adicionar à Tela de Início”.';
      botao.hidden = true;
    } else {
      $('instalar').hidden = true;
      return;
    }
    $('instalar').hidden = false;
  }

  function prepararInstalacao() {
    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();
      eventoInstalar = ev;
      mostrarConviteInstalar();
    });
    window.addEventListener('appinstalled', function () { eventoInstalar = null; $('instalar').hidden = true; });
    $('btnInstalar').addEventListener('click', function () {
      if (!eventoInstalar) return;
      eventoInstalar.prompt();
      eventoInstalar.userChoice.then(function () { eventoInstalar = null; $('instalar').hidden = true; });
    });
    $('btnInstalarFechar').addEventListener('click', function () {
      try { localStorage.setItem(CHAVE_INSTALAR, '1'); } catch (e) { /* sem armazenamento: ok */ }
      $('instalar').hidden = true;
    });
    mostrarConviteInstalar();
    // service worker: deixa o app instalável e abrir sem internet; no iframe do Framer não é necessário
    if ('serviceWorker' in navigator && !dentroDeIframe() && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* ok */ }); });
    }
  }

  // ---------- altura para quando estiver dentro de um iframe (Framer) ----------
  function observarAltura() {
    if (window.parent === window || typeof ResizeObserver === 'undefined') return;
    var ultima = 0;
    function enviar() {
      var alt = Math.ceil(document.documentElement.getBoundingClientRect().height);
      if (alt === ultima || alt < 100) return;
      ultima = alt;
      window.parent.postMessage({ montadorAltura: alt, embedHeight: alt }, '*');
    }
    new ResizeObserver(enviar).observe(document.body);
    enviar();
  }

  // ---------- início ----------
  function iniciar() {
    modoVisitante = !A.contasDisponiveis();
    L.definirPrivado(lerPrivado()); // a escolha de ocultar valores fica guardada neste aparelho
    atualizarBotaoPrivacidade();
    grafico = G.criar($('grafico'), $('dica'), { aoDestacar: definirDestaque });
    simulador = window.Simulador.criar({
      raiz: $('vistaSimulador'), dica: $('dica'),
      obter: function () { return estado.simulador || L.simuladorPadrao(); },
      gravar: gravarSimulador,
      totalCarteira: function () { return L.total(estado); }
    });
    ligarEventosGerais();
    if (modoVisitante) {
      // sem Supabase configurado (teste no computador): funciona sem login, salvando no navegador
      estado = L.validar(A.lerVisitante()) || L.exemplo();
      confirmado = L.clonar(estado);
      renderTudo();
      atualizarBotoesHistorico();
      statusVisitante();
      mostrarTela('app');
    } else {
      // com contas: nada de carteira aparece antes do login. Apaga qualquer carteira de visitante antiga.
      A.limparVisitante();
      estado = L.exemplo();
      confirmado = L.clonar(estado);
      atualizarBotoesHistorico();
      mostrarTela('carregando');
      iniciarConta();
    }
    prepararInstalacao();
    observarAltura();
  }

  iniciar();
})();
