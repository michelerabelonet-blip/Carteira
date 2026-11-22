/*
 * Regras do Montador de Carteira (sem tela, sem rede).
 * O MESMO arquivo roda no navegador (window.CarteiraLogica) e nos testes (require).
 *
 * Estado:
 *   { v: 1, classes: [ { id, nome, cor (0..7), meta (0..100 | null), travada,
 *                        itens: [ { id, nome, valor } ] } ] }
 * O total da carteira NUNCA é guardado: é sempre a soma dos ativos.
 * Todas as funções devolvem um estado NOVO; nada é alterado no lugar.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.CarteiraLogica = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_CLASSES = 8;
  var MAX_ATIVOS = 30; // por classe
  var MAX_NOME = 60;
  var MAX_VALOR = 1e12;

  // Paleta categórica validada (ordem fixa, uma cor por classe). Ver README.
  var CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
  var NOMES_COR = ['Azul', 'Laranja', 'Verde-água', 'Amarelo', 'Rosa', 'Verde', 'Violeta', 'Vermelho'];

  // ---------- utilidades ----------
  function novoId() {
    var s = '';
    try {
      var a = new Uint8Array(6);
      (typeof crypto !== 'undefined' ? crypto : globalThis.crypto).getRandomValues(a);
      for (var i = 0; i < a.length; i++) s += (a[i] % 36).toString(36);
    } catch (e) {
      for (var j = 0; j < 8; j++) s += Math.floor(Math.random() * 36).toString(36);
    }
    return 'i' + s;
  }

  function clonar(e) { return JSON.parse(JSON.stringify(e)); }

  function limitarValor(v) {
    v = Number(v);
    if (!isFinite(v) || v < 0) return 0;
    return Math.min(v, MAX_VALOR);
  }

  function limitar(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function texto(v, padrao) {
    if (typeof v !== 'string') return padrao;
    v = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NOME);
    return v || padrao;
  }

  function somaClasse(c) {
    var s = 0;
    for (var i = 0; i < c.itens.length; i++) s += c.itens[i].valor;
    return s;
  }

  function total(e) {
    var s = 0;
    for (var i = 0; i < e.classes.length; i++) s += somaClasse(e.classes[i]);
    return s;
  }

  function achar(e, id) {
    for (var i = 0; i < e.classes.length; i++) if (e.classes[i].id === id) return e.classes[i];
    return null;
  }

  function acharAtivo(c, id) {
    for (var i = 0; i < c.itens.length; i++) if (c.itens[i].id === id) return c.itens[i];
    return null;
  }

  function escalar(c, fator) {
    for (var i = 0; i < c.itens.length; i++) c.itens[i].valor *= fator;
  }

  // Leva a classe ao valor alvo mantendo a proporção entre os ativos (ou dividindo igual se estava zerada).
  function definirValorClasse(c, alvo) {
    var atual = somaClasse(c);
    if (atual > 0) escalar(c, alvo / atual);
    else if (c.itens.length) {
      var cada = alvo / c.itens.length;
      for (var i = 0; i < c.itens.length; i++) c.itens[i].valor = cada;
    }
  }

  // Soma "extra" nos ativos de uma classe, na proporção dos valores atuais.
  function somarNaClasse(c, extra) {
    var atual = somaClasse(c);
    if (atual > 0) {
      for (var i = 0; i < c.itens.length; i++) c.itens[i].valor += extra * (c.itens[i].valor / atual);
    } else if (c.itens.length) {
      var cada = extra / c.itens.length;
      for (var j = 0; j < c.itens.length; j++) c.itens[j].valor += cada;
    }
  }

  // ---------- montagem ----------
  function exemplo() {
    function it(n, v) { return { id: novoId(), nome: n, valor: v }; }
    function cl(n, cor, itens) { return { id: novoId(), nome: n, cor: cor, meta: null, travada: false, itens: itens }; }
    return {
      v: 1,
      classes: [
        cl('Renda Fixa', 0, [it('Tesouro IPCA+', 2500), it('ETF de renda fixa', 2500)]),
        cl('Ações', 1, [it('Banco do Brasil', 250), it('Sanepar', 250), it('Taesa', 250), it('Caixa Seguridade', 250)]),
        cl('FIIs', 2, [it('HGBS11', 500), it('ALZR11', 500), it('HGLG11', 500), it('KNSC11', 500)]),
        cl('Exterior', 3, [it('GPUS11', 1000), it('VWRA11', 1000)])
      ]
    };
  }

  function corLivre(e) {
    var usadas = {};
    e.classes.forEach(function (c) { usadas[c.cor] = true; });
    for (var i = 0; i < MAX_CLASSES; i++) if (!usadas[i]) return i;
    return -1;
  }

  function podeAdicionarClasse(e) { return e.classes.length < MAX_CLASSES; }
  function podeAdicionarAtivo(c) { return c.itens.length < MAX_ATIVOS; }

  function adicionarClasse(e, nome) {
    var r = clonar(e);
    var cor = corLivre(r);
    if (cor < 0) return r;
    r.classes.push({
      id: novoId(), nome: texto(nome, 'Nova classe'), cor: cor, meta: null, travada: false,
      itens: [{ id: novoId(), nome: 'Novo ativo', valor: 0 }]
    });
    return r;
  }

  function removerClasse(e, id) {
    var r = clonar(e);
    if (r.classes.length <= 1) return r;
    r.classes = r.classes.filter(function (c) { return c.id !== id; });
    return r;
  }

  function renomearClasse(e, id, nome) {
    var r = clonar(e), c = achar(r, id);
    if (c) c.nome = texto(nome, c.nome);
    return r;
  }

  function alternarTravada(e, id) {
    var r = clonar(e), c = achar(r, id);
    if (c) c.travada = !c.travada;
    return r;
  }

  // Troca a cor da classe; se outra classe já usa essa cor, as duas trocam entre si.
  function trocarCor(e, id, cor) {
    var r = clonar(e), c = achar(r, id);
    if (!c || !(cor >= 0 && cor < MAX_CLASSES) || Math.floor(cor) !== cor) return r;
    var outra = r.classes.filter(function (x) { return x.cor === cor && x.id !== id; })[0];
    if (outra) outra.cor = c.cor;
    c.cor = cor;
    return r;
  }

  // Divide o valor atual da classe por igual entre os seus ativos (o valor da classe não muda).
  function ratearIgual(c, valorDaClasse) {
    if (!c.itens.length) return;
    var cada = valorDaClasse / c.itens.length;
    for (var i = 0; i < c.itens.length; i++) c.itens[i].valor = cada;
  }

  // O percentual da classe é o que manda: ao entrar um ativo novo, o valor da classe é rateado por igual entre todos.
  function adicionarAtivo(e, classeId, nome) {
    var r = clonar(e), c = achar(r, classeId);
    if (c && podeAdicionarAtivo(c)) {
      var soma = somaClasse(c);
      c.itens.push({ id: novoId(), nome: texto(nome, 'Novo ativo'), valor: 0 });
      ratearIgual(c, soma);
    }
    return r;
  }

  // Ao sair um ativo, o valor dele passa para os que ficam (na proporção atual) e a classe mantém o percentual.
  function removerAtivo(e, classeId, ativoId) {
    var r = clonar(e), c = achar(r, classeId);
    if (c && c.itens.length > 1) {
      var soma = somaClasse(c);
      c.itens = c.itens.filter(function (i) { return i.id !== ativoId; });
      definirValorClasse(c, soma);
    }
    return r;
  }

  // Botão "Dividir igualmente": reparte o valor da classe por igual, a qualquer momento.
  function ratearClasse(e, classeId) {
    var r = clonar(e), c = achar(r, classeId);
    if (c) ratearIgual(c, somaClasse(c));
    return r;
  }

  function renomearAtivo(e, classeId, ativoId, nome) {
    var r = clonar(e), c = achar(r, classeId), a = c && acharAtivo(c, ativoId);
    if (a) a.nome = texto(nome, a.nome);
    return r;
  }

  function definirValorAtivo(e, classeId, ativoId, valor) {
    var r = clonar(e), c = achar(r, classeId), a = c && acharAtivo(c, ativoId);
    if (a) a.valor = limitarValor(valor);
    return r;
  }

  // ---------- as duas regras centrais (mesma lógica do protótipo) ----------

  // A classe vira X% do total; as outras (não travadas) se reajustam na proporção e a soma continua 100%.
  // Diferença para o protótipo: os ativos da classe mantêm a proporção entre si (antes eram igualados).
  function definirPercentualClasse(e, id, pct) {
    var r = clonar(e);
    var T = total(r);
    var alvo = achar(r, id);
    pct = Number(pct);
    if (!alvo || !(T > 0) || !isFinite(pct)) return r;

    var outras = r.classes.filter(function (c) { return c.id !== id; });
    var fixas = outras.filter(function (c) { return c.travada; });
    var livres = outras.filter(function (c) { return !c.travada; });
    var somaFixas = fixas.reduce(function (s, c) { return s + somaClasse(c); }, 0);
    var teto = Math.max(0, T - somaFixas);
    var novo = livres.length ? limitar(pct / 100 * T, 0, teto) : teto;
    var resto = teto - novo;

    if (livres.length) {
      var somaLivres = livres.reduce(function (s, c) { return s + somaClasse(c); }, 0);
      if (somaLivres > 0) livres.forEach(function (c) { escalar(c, resto / somaLivres); });
      else livres.forEach(function (c) { definirValorClasse(c, resto / livres.length); });
    }
    definirValorClasse(alvo, novo);
    return r;
  }

  // Editar o total da carteira escala tudo na proporção (os percentuais não mudam).
  function definirTotal(e, novo) {
    var r = clonar(e);
    novo = limitarValor(novo);
    var T = total(r);
    if (T > 0) {
      r.classes.forEach(function (c) { escalar(c, novo / T); });
    } else if (novo > 0 && r.classes.length) {
      var porClasse = novo / r.classes.length;
      r.classes.forEach(function (c) { definirValorClasse(c, porClasse); });
    }
    return r;
  }

  // ---------- metas, rebalanceamento e aporte ----------
  function definirMeta(e, id, valor) {
    var r = clonar(e), c = achar(r, id);
    if (!c) return r;
    valor = (valor === null || valor === '' || valor === undefined) ? null : Number(valor);
    c.meta = (valor === null || !isFinite(valor)) ? null : Math.round(limitar(valor, 0, 100) * 100) / 100;
    return r;
  }

  function somaMetas(e) {
    return e.classes.reduce(function (s, c) { return s + (c.meta === null ? 0 : c.meta); }, 0);
  }

  function metasValidas(e) {
    return e.classes.every(function (c) { return c.meta !== null; }) && Math.abs(somaMetas(e) - 100) <= 0.05;
  }

  // Copia o percentual atual para a meta, com 1 casa decimal, fechando exatamente 100 (maior resto).
  function metasDoAtual(e) {
    var r = clonar(e), T = total(r), n = r.classes.length;
    var brutos = r.classes.map(function (c) { return T > 0 ? somaClasse(c) / T * 1000 : 1000 / n; });
    var base = brutos.map(Math.floor);
    var faltam = 1000 - base.reduce(function (s, x) { return s + x; }, 0);
    var ordem = brutos.map(function (b, i) { return { i: i, f: b - Math.floor(b) }; })
      .sort(function (a, b) { return b.f - a.f || a.i - b.i; });
    for (var k = 0; k < faltam && k < ordem.length; k++) base[ordem[k].i] += 1;
    r.classes.forEach(function (c, i) { c.meta = base[i] / 10; });
    return r;
  }

  function limparMetas(e) {
    var r = clonar(e);
    r.classes.forEach(function (c) { c.meta = null; });
    return r;
  }

  // Quanto falta (+) ou sobra (-) em cada classe para chegar na meta, mantendo o total.
  function planoAjuste(e) {
    if (!metasValidas(e)) return null;
    var T = total(e), S = somaMetas(e);
    return e.classes.map(function (c) {
      var atual = somaClasse(c), alvo = c.meta / S * T;
      return { id: c.id, atual: atual, alvo: alvo, diferenca: alvo - atual };
    });
  }

  function aplicarMetas(e) {
    var plano = planoAjuste(e);
    var r = clonar(e);
    if (!plano) return r;
    plano.forEach(function (p) { definirValorClasse(achar(r, p.id), p.alvo); });
    return r;
  }

  // Divide um aporte só entre as classes abaixo da meta (sem vender nada).
  function planoAporte(e, valor) {
    valor = limitarValor(valor);
    if (!metasValidas(e) || !(valor > 0)) return null;
    var T = total(e), S = somaMetas(e), Tn = T + valor;
    var itens = e.classes.map(function (c) {
      var atual = somaClasse(c), ideal = c.meta / S * Tn;
      return { id: c.id, atual: atual, falta: Math.max(0, ideal - atual) };
    });
    var soma = itens.reduce(function (s, x) { return s + x.falta; }, 0);
    return itens.map(function (x) {
      var aporte = soma > 0 ? x.falta * (valor / soma) : 0;
      return { id: x.id, atual: x.atual, aporte: aporte, depois: x.atual + aporte };
    });
  }

  function aplicarAporte(e, plano) {
    var r = clonar(e);
    if (!plano) return r;
    plano.forEach(function (p) {
      var c = achar(r, p.id);
      if (c && p.aporte > 0) somarNaClasse(c, p.aporte);
    });
    return r;
  }

  // ---------- simulador de juros compostos ----------
  // Parâmetros: idadeAtual, idadeFinal (anos inteiros), inicial (R$ já guardados), aporte (R$/mês),
  // reajuste (% ao ano sobre o aporte), taxa (% ao ano, efetiva), inflacao (% ao ano, só para o "valor de hoje"),
  // momento ('fim' ou 'inicio' do mês) e meta (R$ ou null).
  // Depois de parar de aportar: taxaRenda (% ao ano), anosRenda (por quanto tempo retirar), reajustaRenda
  // (a retirada acompanha a inflação?) e rendaDesejada (R$/mês em dinheiro de hoje, ou null).
  // impostoGanho: % de imposto sobre o ganho (valor final menos o aportado), descontado no fim; 0 = sem imposto.
  function simuladorPadrao() {
    return {
      idadeAtual: 35, idadeFinal: 65, inicial: 0, aporte: 500, reajuste: 0, taxa: 8, inflacao: 4, momento: 'fim', meta: null,
      taxaRenda: 6, anosRenda: 25, reajustaRenda: true, rendaDesejada: null, impostoGanho: 0
    };
  }

  function numeroEntre(v, a, b, padrao) {
    v = Number(v);
    if (!isFinite(v)) return padrao;
    return Math.min(b, Math.max(a, v));
  }

  function validarSimulador(bruto) {
    var p = simuladorPadrao();
    if (!bruto || typeof bruto !== 'object') return p;
    var s = {
      idadeAtual: Math.round(numeroEntre(bruto.idadeAtual, 0, 100, p.idadeAtual)),
      idadeFinal: Math.round(numeroEntre(bruto.idadeFinal, 1, 120, p.idadeFinal)),
      inicial: numeroEntre(bruto.inicial, 0, MAX_VALOR, p.inicial),
      aporte: numeroEntre(bruto.aporte, 0, 1e9, p.aporte),
      reajuste: numeroEntre(bruto.reajuste, -50, 100, p.reajuste),
      taxa: numeroEntre(bruto.taxa, -50, 200, p.taxa),
      inflacao: numeroEntre(bruto.inflacao, -50, 100, p.inflacao),
      momento: bruto.momento === 'inicio' ? 'inicio' : 'fim',
      meta: (bruto.meta === null || bruto.meta === undefined || bruto.meta === '') ? null : numeroEntre(bruto.meta, 0, MAX_VALOR, null),
      taxaRenda: numeroEntre(bruto.taxaRenda, -50, 200, p.taxaRenda),
      anosRenda: Math.round(numeroEntre(bruto.anosRenda, 1, 70, p.anosRenda)),
      reajustaRenda: bruto.reajustaRenda === undefined ? p.reajustaRenda : bruto.reajustaRenda === true,
      rendaDesejada: (bruto.rendaDesejada === null || bruto.rendaDesejada === undefined || bruto.rendaDesejada === '') ? null : numeroEntre(bruto.rendaDesejada, 0, 1e9, null),
      impostoGanho: numeroEntre(bruto.impostoGanho, 0, 50, p.impostoGanho)
    };
    if (s.idadeFinal <= s.idadeAtual) s.idadeFinal = Math.min(120, s.idadeAtual + 1);
    if (s.idadeFinal <= s.idadeAtual) s.idadeAtual = s.idadeFinal - 1;
    return s;
  }

  // taxa mensal equivalente a uma taxa anual efetiva (juros compostos)
  function taxaMensal(anual) {
    return Math.pow(1 + anual / 100, 1 / 12) - 1;
  }

  // Mês a mês. O aporte é reajustado uma vez por ano (a partir do 2º ano).
  // Devolve o resultado final e uma linha por ano (aportado, saldo, juros, valor em dinheiro de hoje).
  function projetar(s) {
    s = validarSimulador(s);
    var meses = (s.idadeFinal - s.idadeAtual) * 12;
    var i = taxaMensal(s.taxa), fator = 1 + s.reajuste / 100, defl = 1 + s.inflacao / 100;
    var saldo = s.inicial, aportado = s.inicial, aporte = s.aporte;
    var anos = [{ ano: 0, idade: s.idadeAtual, aportado: aportado, saldo: saldo, juros: 0, real: saldo }];
    for (var m = 1; m <= meses; m++) {
      if (m > 1 && (m - 1) % 12 === 0) aporte *= fator;
      saldo = s.momento === 'inicio' ? (saldo + aporte) * (1 + i) : saldo * (1 + i) + aporte;
      aportado += aporte;
      if (m % 12 === 0) {
        var ano = m / 12;
        anos.push({ ano: ano, idade: s.idadeAtual + ano, aportado: aportado, saldo: saldo, juros: saldo - aportado, real: saldo / Math.pow(defl, ano) });
      }
    }
    var ultimo = anos[anos.length - 1];
    // imposto sobre o ganho (valor final − o que foi aportado), só quando há ganho; descontado de uma vez no fim
    var ganho = Math.max(0, ultimo.saldo - ultimo.aportado);
    var imposto = ganho * s.impostoGanho / 100;
    var liquido = ultimo.saldo - imposto;
    return {
      meses: meses, anos: anos, final: ultimo.saldo, aportado: ultimo.aportado, juros: ultimo.juros,
      finalReal: ultimo.real, ultimoAporte: aporte, taxaMensal: i,
      imposto: imposto, liquido: liquido, liquidoReal: liquido / Math.pow(defl, meses / 12)
    };
  }

  // Quanto aportar por mês (o 1º aporte; os seguintes seguem o reajuste) para chegar a uma meta.
  // A meta é o valor LÍQUIDO (depois do imposto sobre o ganho, se houver). O valor líquido é linear no aporte,
  // então dá para resolver sem tentativa e erro.
  function aporteNecessario(s, meta) {
    s = validarSimulador(s);
    meta = Number(meta);
    if (!isFinite(meta) || meta < 0) return null;
    var base = projetar(Object.assign({}, s, { aporte: 0 })).liquido;
    var porReal = projetar(Object.assign({}, s, { aporte: 1 })).liquido - base;
    if (!(porReal > 0)) return null;
    return { aporte: Math.max(0, (meta - base) / porReal), jaAtinge: meta <= base };
  }

  // ---------- renda passiva: quanto o patrimônio pode pagar por mês ----------
  // Retiradas no fim de cada mês. Se "reajustaRenda", a retirada sobe todo mês pela inflação mensal equivalente
  // (mantém o poder de compra); senão é fixa. i = rendimento mensal, g = reajuste mensal da retirada.
  function parametrosRenda(s) {
    return { i: taxaMensal(s.taxaRenda), g: s.reajustaRenda ? taxaMensal(s.inflacao) : 0, n: s.anosRenda * 12 };
  }

  // Primeira retirada por R$ 1 de patrimônio para esgotá-lo em n meses (anuidade, crescente se g > 0).
  function fatorConsumo(p) {
    var d = p.i - p.g;
    if (Math.abs(d) < 1e-12) return (1 + p.i) / p.n;
    var r = (1 + p.g) / (1 + p.i);
    return d / (1 - Math.pow(r, p.n));
  }

  // O que o patrimônio paga por mês no 1º mês da aposentadoria, em duas formas:
  //  - soJuros: vive só dos rendimentos e o patrimônio fica intacto (em poder de compra, se a retirada acompanha a inflação);
  //  - consumindo: gasta o patrimônio até zerar em "anosRenda" anos.
  // "Hoje" = o mesmo valor descontado da inflação até a data da aposentadoria.
  function rendaPassiva(saldo, s) {
    s = validarSimulador(s);
    var p = parametrosRenda(s);
    var defl = Math.pow(1 + s.inflacao / 100, s.idadeFinal - s.idadeAtual);
    var soJuros = saldo * Math.max(0, p.i - p.g);
    var consumindo = saldo * fatorConsumo(p);
    return {
      soJuros: soJuros, soJurosHoje: soJuros / defl, consumindo: consumindo, consumindoHoje: consumindo / defl,
      jurosAbaixoDaInflacao: s.reajustaRenda && p.i <= p.g
    };
  }

  // Renda mensal para um prazo de retirada diferente do escolhido (tabela de comparação).
  function rendaPorPrazo(saldo, s, anos) {
    s = validarSimulador(s);
    var p = parametrosRenda(s);
    p.n = Math.max(1, Math.round(anos)) * 12;
    var defl = Math.pow(1 + s.inflacao / 100, s.idadeFinal - s.idadeAtual);
    var v = saldo * fatorConsumo(p);
    return { mensal: v, hoje: v / defl };
  }

  // Patrimônio necessário na aposentadoria para pagar "rendaHoje" por mês (em dinheiro de hoje, corrigido até lá).
  function patrimonioParaRenda(rendaHoje, s) {
    s = validarSimulador(s);
    var p = parametrosRenda(s);
    var r0 = Number(rendaHoje) * Math.pow(1 + s.inflacao / 100, s.idadeFinal - s.idadeAtual);
    if (!isFinite(r0) || r0 < 0) return null;
    var d = p.i - p.g;
    return { rendaNominal: r0, soJuros: d > 1e-12 ? r0 / d : null, consumindo: r0 / fatorConsumo(p) };
  }

  // ---------- validação de dados vindos de fora (localStorage, banco, arquivo) ----------
  function validar(bruto) {
    if (!bruto || typeof bruto !== 'object' || !Array.isArray(bruto.classes) || !bruto.classes.length) return null;
    var idsUsados = Object.create(null);
    var coresUsadas = Object.create(null);
    function idUnico(id) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(id) || idsUsados[id]) id = novoId();
      idsUsados[id] = true;
      return id;
    }
    var classes = [];
    var origem = bruto.classes.slice(0, MAX_CLASSES);
    origem.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var cor = Number.isInteger(c.cor) && c.cor >= 0 && c.cor < MAX_CLASSES && !coresUsadas[c.cor] ? c.cor : -1;
      if (cor >= 0) coresUsadas[cor] = true;
      var itens = [];
      (Array.isArray(c.itens) ? c.itens.slice(0, MAX_ATIVOS) : []).forEach(function (a) {
        if (!a || typeof a !== 'object') return;
        itens.push({ id: idUnico(a.id), nome: texto(a.nome, 'Ativo'), valor: limitarValor(a.valor) });
      });
      if (!itens.length) itens.push({ id: novoId(), nome: 'Ativo', valor: 0 });
      var meta = (typeof c.meta === 'number' && isFinite(c.meta)) ? Math.round(limitar(c.meta, 0, 100) * 100) / 100 : null;
      classes.push({ id: idUnico(c.id), nome: texto(c.nome, 'Classe'), cor: cor, meta: meta, travada: c.travada === true, itens: itens });
    });
    if (!classes.length) return null;
    classes.forEach(function (c) {
      if (c.cor < 0) {
        for (var i = 0; i < MAX_CLASSES; i++) if (!coresUsadas[i]) { c.cor = i; coresUsadas[i] = true; break; }
      }
    });
    var r = { v: 1, classes: classes };
    if (bruto.simulador && typeof bruto.simulador === 'object') r.simulador = validarSimulador(bruto.simulador);
    return r;
  }

  // ---------- números e textos ----------
  // Aceita "10.000", "10.000,50", "R$ 1.234,5", "33,3%", "1234.5". Devolve NaN se não for número.
  function parseNumero(str) {
    var s = String(str === null || str === undefined ? '' : str).replace(/[^\d.,-]/g, '');
    if (!/\d/.test(s)) return NaN;
    var neg = s.charAt(0) === '-';
    s = s.replace(/-/g, '');
    if (s.indexOf(',') >= 0) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      var pontos = s.split('.').length - 1;
      if (pontos > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    }
    var n = parseFloat(s);
    if (!isFinite(n)) return NaN;
    return neg ? -n : n;
  }

  function numero(v, casas) {
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 });
  }

  function brl(v, casas) { return 'R$ ' + numero(v, casas || 0); }

  // 33 -> "33"; 33,333 -> "33,3"
  function fmtPct(p) {
    if (!isFinite(p)) return '0';
    return Math.abs(p - Math.round(p)) < 0.05 ? String(Math.round(p)) : p.toFixed(1).replace('.', ',');
  }

  function pct(parte, todo) { return todo > 0 ? parte / todo * 100 : 0; }

  // Planilha (Excel pt-BR: separador ";"), com proteção contra fórmulas nos nomes.
  function celulaCSV(v) {
    var s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function dec(v) { return Number(v).toFixed(2).replace('.', ','); }

  function paraCSV(e) {
    var T = total(e);
    var linhas = [['Classe', 'Ativo', 'Valor (R$)', '% da carteira', '% da classe', 'Meta da classe (%)']];
    e.classes.forEach(function (c) {
      var sc = somaClasse(c);
      c.itens.forEach(function (a) {
        linhas.push([c.nome, a.nome, dec(a.valor), dec(pct(a.valor, T)), dec(pct(a.valor, sc)), c.meta === null ? '' : dec(c.meta)]);
      });
    });
    linhas.push(['Total', '', dec(T), dec(T > 0 ? 100 : 0), '', '']);
    return linhas.map(function (l) { return l.map(celulaCSV).join(';'); }).join('\r\n');
  }

  // Cor do ativo dentro da classe: o mesmo tom, clareando de leve a cada ativo (alterna para separar vizinhos).
  function misturarBranco(hex, t) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function m(x) { return Math.round(x + (255 - x) * t); }
    return '#' + [m(r), m(g), m(b)].map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }

  function tomDoAtivo(corClasse, indice, quantidade) {
    if (quantidade <= 1) return corClasse;
    var passo = Math.min(0.14, 0.5 / (quantidade - 1));
    return misturarBranco(corClasse, indice * passo);
  }

  return {
    MAX_CLASSES: MAX_CLASSES, MAX_ATIVOS: MAX_ATIVOS, MAX_NOME: MAX_NOME, CORES: CORES, NOMES_COR: NOMES_COR,
    novoId: novoId, clonar: clonar, exemplo: exemplo, somaClasse: somaClasse, total: total, achar: achar,
    podeAdicionarClasse: podeAdicionarClasse, podeAdicionarAtivo: podeAdicionarAtivo,
    adicionarClasse: adicionarClasse, removerClasse: removerClasse, renomearClasse: renomearClasse,
    alternarTravada: alternarTravada, trocarCor: trocarCor,
    adicionarAtivo: adicionarAtivo, removerAtivo: removerAtivo, ratearClasse: ratearClasse, renomearAtivo: renomearAtivo, definirValorAtivo: definirValorAtivo,
    definirPercentualClasse: definirPercentualClasse, definirTotal: definirTotal,
    definirMeta: definirMeta, somaMetas: somaMetas, metasValidas: metasValidas, metasDoAtual: metasDoAtual, limparMetas: limparMetas,
    planoAjuste: planoAjuste, aplicarMetas: aplicarMetas, planoAporte: planoAporte, aplicarAporte: aplicarAporte,
    simuladorPadrao: simuladorPadrao, validarSimulador: validarSimulador, taxaMensal: taxaMensal, projetar: projetar, aporteNecessario: aporteNecessario,
    rendaPassiva: rendaPassiva, rendaPorPrazo: rendaPorPrazo, patrimonioParaRenda: patrimonioParaRenda,
    validar: validar, parseNumero: parseNumero, numero: numero, brl: brl, fmtPct: fmtPct, pct: pct,
    paraCSV: paraCSV, tomDoAtivo: tomDoAtivo
  };
});
