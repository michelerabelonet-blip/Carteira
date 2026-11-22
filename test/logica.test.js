'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../public/carteira-logica.js');

const perto = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const classe = (e, nome) => e.classes.find((c) => c.nome === nome);

test('exemplo: total de R$ 10.000 e quatro classes', () => {
  const e = L.exemplo();
  assert.equal(L.total(e), 10000);
  assert.equal(e.classes.length, 4);
  assert.deepEqual(e.classes.map((c) => c.cor), [0, 1, 2, 3]);
});

test('percentual da classe: total não muda e a soma fecha 100%', () => {
  const e = L.exemplo();
  const r = L.definirPercentualClasse(e, classe(e, 'Ações').id, 40);
  perto(L.total(r), 10000);
  perto(L.pct(L.somaClasse(classe(r, 'Ações')), L.total(r)), 40);
  // as outras mantêm a proporção entre si (5.000 : 2.000 : 2.000 antes)
  const rf = L.somaClasse(classe(r, 'Renda Fixa')), fii = L.somaClasse(classe(r, 'FIIs'));
  perto(rf / fii, 2.5);
  perto(L.somaClasse(classe(r, 'Exterior')), fii);
});

test('percentual da classe: ativos mantêm a proporção interna', () => {
  const e = L.exemplo();
  let m = L.definirValorAtivo(e, classe(e, 'Renda Fixa').id, classe(e, 'Renda Fixa').itens[0].id, 3000);
  m = L.definirPercentualClasse(m, classe(m, 'Renda Fixa').id, 20);
  const [a, b] = classe(m, 'Renda Fixa').itens;
  perto(a.valor / b.valor, 3000 / 2500);
  perto(L.pct(L.somaClasse(classe(m, 'Renda Fixa')), L.total(m)), 20);
});

test('percentual da classe: respeita classes travadas', () => {
  let e = L.exemplo();
  e = L.alternarTravada(e, classe(e, 'Exterior').id); // 20% travado
  const antes = L.somaClasse(classe(e, 'Exterior'));
  const r = L.definirPercentualClasse(e, classe(e, 'Ações').id, 30);
  perto(L.somaClasse(classe(r, 'Exterior')), antes);
  perto(L.total(r), L.total(e));
  perto(L.pct(L.somaClasse(classe(r, 'Ações')), L.total(r)), 30);
});

test('percentual da classe: limita ao que sobra quando há travadas', () => {
  let e = L.exemplo();
  e = L.alternarTravada(e, classe(e, 'Exterior').id); // 2000
  const r = L.definirPercentualClasse(e, classe(e, 'Ações').id, 100);
  perto(L.somaClasse(classe(r, 'Ações')), 8000);
  perto(L.somaClasse(classe(r, 'Renda Fixa')), 0);
  perto(L.total(r), 10000);
});

test('percentual da classe: com as outras todas travadas, o valor é forçado', () => {
  let e = L.exemplo();
  ['Renda Fixa', 'FIIs', 'Exterior'].forEach((n) => { e = L.alternarTravada(e, classe(e, n).id); });
  const r = L.definirPercentualClasse(e, classe(e, 'Ações').id, 90);
  perto(L.somaClasse(classe(r, 'Ações')), 1000); // o que sobra depois das travadas
  perto(L.total(r), 10000);
});

test('percentual da classe: valores inválidos ou fora da faixa', () => {
  const e = L.exemplo();
  const id = classe(e, 'FIIs').id;
  assert.deepEqual(L.definirPercentualClasse(e, id, NaN), e);
  perto(L.somaClasse(classe(L.definirPercentualClasse(e, id, -5), 'FIIs')), 0);
  perto(L.somaClasse(classe(L.definirPercentualClasse(e, id, 500), 'FIIs')), 10000);
  assert.deepEqual(L.definirPercentualClasse(e, 'nao-existe', 10), e);
});

test('percentual da classe: classe zerada recebe divisão igual entre os ativos', () => {
  let e = L.adicionarClasse(L.exemplo(), 'Cripto');
  const c = e.classes[4];
  c.itens.push({ id: 'zz', nome: 'Outro', valor: 0 });
  e = L.definirPercentualClasse(e, c.id, 10);
  perto(L.somaClasse(classe(e, 'Cripto')), 1000);
  perto(classe(e, 'Cripto').itens[0].valor, 500);
  perto(L.total(e), 10000);
});

test('percentual: outras classes zeradas recebem o resto por igual', () => {
  let e = { v: 1, classes: [
    { id: 'a', nome: 'A', cor: 0, meta: null, travada: false, itens: [{ id: 'a1', nome: 'x', valor: 1000 }] },
    { id: 'b', nome: 'B', cor: 1, meta: null, travada: false, itens: [{ id: 'b1', nome: 'y', valor: 0 }] },
    { id: 'c', nome: 'C', cor: 2, meta: null, travada: false, itens: [{ id: 'c1', nome: 'z', valor: 0 }] }
  ] };
  e = L.definirPercentualClasse(e, 'a', 50);
  perto(e.classes[0].itens[0].valor, 500);
  perto(e.classes[1].itens[0].valor, 250);
  perto(e.classes[2].itens[0].valor, 250);
});

test('uma classe só: continua com 100%', () => {
  const e = { v: 1, classes: [L.exemplo().classes[0]] };
  const r = L.definirPercentualClasse(e, e.classes[0].id, 30);
  perto(L.total(r), 5000);
});

test('total: escala tudo e mantém os percentuais', () => {
  const e = L.exemplo();
  const r = L.definirTotal(e, 25000);
  perto(L.total(r), 25000);
  perto(L.somaClasse(classe(r, 'Renda Fixa')), 12500);
  const vazio = { v: 1, classes: [
    { id: 'a', nome: 'A', cor: 0, meta: null, travada: false, itens: [{ id: 'a1', nome: 'x', valor: 0 }] },
    { id: 'b', nome: 'B', cor: 1, meta: null, travada: false, itens: [{ id: 'b1', nome: 'y', valor: 0 }] }
  ] };
  const dividido = L.definirTotal(vazio, 1000);
  perto(dividido.classes[0].itens[0].valor, 500);
  perto(L.total(L.definirTotal(e, -10)), 0);
});

test('classes: criar, limite de 8, cores sem repetir e remover', () => {
  let e = L.exemplo();
  e = L.adicionarClasse(e, '  Cripto  ');
  assert.equal(e.classes[4].nome, 'Cripto');
  assert.equal(e.classes[4].cor, 4);
  perto(L.total(e), 10000);
  while (L.podeAdicionarClasse(e)) e = L.adicionarClasse(e, 'Extra');
  assert.equal(e.classes.length, 8);
  assert.equal(L.adicionarClasse(e, 'Mais').classes.length, 8);
  assert.equal(new Set(e.classes.map((c) => c.cor)).size, 8);
  // remover libera a cor para a próxima
  const removida = e.classes[2];
  const menos = L.removerClasse(e, removida.id);
  assert.equal(menos.classes.length, 7);
  assert.equal(L.adicionarClasse(menos, 'Nova').classes[7].cor, removida.cor);
});

test('não remove a última classe nem o último ativo', () => {
  let e = { v: 1, classes: [{ id: 'a', nome: 'A', cor: 0, meta: null, travada: false, itens: [{ id: 'a1', nome: 'x', valor: 5 }] }] };
  assert.equal(L.removerClasse(e, 'a').classes.length, 1);
  assert.equal(L.removerAtivo(e, 'a', 'a1').classes[0].itens.length, 1);
});

test('trocar cor: quando já está em uso, as duas classes trocam', () => {
  const e = L.exemplo();
  const r = L.trocarCor(e, e.classes[0].id, 1);
  assert.equal(r.classes[0].cor, 1);
  assert.equal(r.classes[1].cor, 0);
  assert.equal(L.trocarCor(e, e.classes[0].id, 99).classes[0].cor, 0);
  assert.equal(L.trocarCor(e, e.classes[0].id, 1.5).classes[0].cor, 0);
  const livre = L.trocarCor(e, e.classes[0].id, 6);
  assert.deepEqual(livre.classes.map((c) => c.cor), [6, 1, 2, 3]);
});

test('ativos: limite por classe e nomes', () => {
  let e = L.exemplo();
  const id = e.classes[0].id;
  while (L.podeAdicionarAtivo(L.achar(e, id))) e = L.adicionarAtivo(e, id);
  assert.equal(L.achar(e, id).itens.length, L.MAX_ATIVOS);
  e = L.renomearAtivo(e, id, L.achar(e, id).itens[0].id, '   ');
  assert.equal(L.achar(e, id).itens[0].nome, 'Tesouro IPCA+'); // vazio mantém o nome
  e = L.renomearClasse(e, id, 'x'.repeat(200));
  assert.equal(L.achar(e, id).nome.length, L.MAX_NOME);
});

test('adicionar ativo: o valor da classe é rateado por igual e o total não muda', () => {
  const e = L.exemplo(); // Exterior: GPUS11 1.000 + VWRA11 1.000
  const id = classe(e, 'Exterior').id;
  const r = L.adicionarAtivo(e, id, 'Novo');
  const c = classe(r, 'Exterior');
  assert.equal(c.itens.length, 3);
  c.itens.forEach((a) => perto(a.valor, 2000 / 3));
  perto(L.somaClasse(c), 2000);
  perto(L.total(r), 10000);
  ['Renda Fixa', 'Ações', 'FIIs'].forEach((n) => perto(L.somaClasse(classe(r, n)), L.somaClasse(classe(e, n))));
});

test('adicionar ativos em sequência continua ratando por igual (um ativo com R$ 1.526 vira 4 de 381,50)', () => {
  let e = { v: 1, classes: [
    { id: 'a', nome: 'Ações', cor: 0, meta: null, travada: false, itens: [{ id: 'a1', nome: 'ITSA4', valor: 1526 }] },
    { id: 'b', nome: 'FIIs', cor: 1, meta: null, travada: false, itens: [{ id: 'b1', nome: 'HGBS11', valor: 4293 }] }
  ] };
  for (let i = 0; i < 3; i++) e = L.adicionarAtivo(e, 'a', 'X' + i);
  const a = classe(e, 'Ações');
  assert.equal(a.itens.length, 4);
  a.itens.forEach((x) => perto(x.valor, 381.5));
  perto(L.somaClasse(a), 1526);
  perto(L.total(e), 5819);
});

test('adicionar ativo em classe zerada continua zerada (nada a ratear)', () => {
  const e = L.adicionarClasse(L.exemplo(), 'Nova');
  const id = e.classes[4].id;
  const r = L.adicionarAtivo(e, id, 'Outro');
  assert.equal(classe(r, 'Nova').itens.length, 2);
  perto(L.somaClasse(classe(r, 'Nova')), 0);
  perto(L.total(r), 10000);
});

test('remover ativo: a classe mantém o valor e os que ficam seguem na proporção', () => {
  let e = L.exemplo();
  const rf = classe(e, 'Renda Fixa');
  e = L.definirValorAtivo(e, rf.id, rf.itens[0].id, 3000); // 3.000 + 2.500 = 5.500
  const antes = L.total(e);
  const sem = L.removerAtivo(e, rf.id, rf.itens[1].id);
  assert.equal(classe(sem, 'Renda Fixa').itens.length, 1);
  perto(L.somaClasse(classe(sem, 'Renda Fixa')), 5500);
  perto(L.total(sem), antes);
  // com 3 ativos 3000 / 2500 / 500: tirar o último reparte na proporção 3000:2500
  const com3 = L.adicionarAtivo(e, rf.id, 'T');
  const base = classe(com3, 'Renda Fixa');
  let c3 = L.definirValorAtivo(com3, rf.id, base.itens[2].id, 500);
  c3 = L.definirValorAtivo(c3, rf.id, base.itens[0].id, 3000);
  c3 = L.definirValorAtivo(c3, rf.id, base.itens[1].id, 2500);
  const t = L.total(c3);
  const r = L.removerAtivo(c3, rf.id, base.itens[2].id);
  const [x, y] = classe(r, 'Renda Fixa').itens;
  perto(x.valor / y.valor, 3000 / 2500);
  perto(L.total(r), t);
});

test('remover ativo quando os que ficam estão zerados: divide por igual', () => {
  const e = { v: 1, classes: [{ id: 'a', nome: 'A', cor: 0, meta: null, travada: false, itens: [
    { id: 'a1', nome: 'x', valor: 0 }, { id: 'a2', nome: 'y', valor: 0 }, { id: 'a3', nome: 'z', valor: 900 }] }] };
  const r = L.removerAtivo(e, 'a', 'a3');
  assert.equal(r.classes[0].itens.length, 2);
  r.classes[0].itens.forEach((a) => perto(a.valor, 450));
});

test('ratearClasse: divide por igual sem mudar o valor da classe nem o total', () => {
  const e = { v: 1, classes: [
    { id: 'a', nome: 'Ações', cor: 0, meta: null, travada: false, itens: [
      { id: 'a1', nome: 'ITSA4', valor: 1526 }, { id: 'a2', nome: 'CMIG4', valor: 0 }, { id: 'a3', nome: 'TAEE11', valor: 0 }, { id: 'a4', nome: 'CXSE3', valor: 0 }] },
    { id: 'b', nome: 'FIIs', cor: 1, meta: null, travada: false, itens: [{ id: 'b1', nome: 'x', valor: 100 }] }
  ] };
  const r = L.ratearClasse(e, 'a');
  r.classes[0].itens.forEach((a) => perto(a.valor, 381.5));
  perto(L.total(r), L.total(e));
  perto(r.classes[1].itens[0].valor, 100);
  assert.deepEqual(L.ratearClasse(e, 'nao-existe'), e);
});

// ---------- simulador de juros compostos ----------
const sim = (extra = {}) => ({ idadeAtual: 45, idadeFinal: 65, inicial: 0, aporte: 500, reajuste: 0, taxa: 10, inflacao: 4, momento: 'fim', meta: null, ...extra });

test('simulador: R$ 500/mês por 20 anos a 10% a.a. dá R$ 359.130 (conta fechada)', () => {
  const r = L.projetar(sim());
  const i = Math.pow(1.1, 1 / 12) - 1;
  const esperado = 500 * (Math.pow(1 + i, 240) - 1) / i;
  perto(r.final, esperado, 1e-6);
  assert.equal(Math.round(r.final), 359130);
  perto(r.aportado, 120000);
  perto(r.juros, r.final - 120000);
  assert.equal(r.meses, 240);
  assert.equal(r.anos.length, 21);
  assert.equal(r.anos[0].idade, 45);
  assert.equal(r.anos[20].idade, 65);
});

test('simulador: sem juros é só soma; com valor inicial parado em 10% cresce 10% no ano', () => {
  perto(L.projetar(sim({ taxa: 0 })).final, 120000);
  const a = L.projetar(sim({ idadeFinal: 46, aporte: 0, inicial: 1000, taxa: 10 }));
  perto(a.final, 1100, 1e-6);
});

test('simulador: aporte no início do mês rende um mês a mais que no fim', () => {
  const fim = L.projetar(sim()), ini = L.projetar(sim({ momento: 'inicio' }));
  perto(ini.final, fim.final * (1 + L.taxaMensal(10)), 1e-6);
});

test('simulador: reajuste anual do aporte', () => {
  const r = L.projetar(sim({ idadeFinal: 47, taxa: 0, reajuste: 10, aporte: 100 }));
  perto(r.aportado, 12 * 100 + 12 * 110); // 2.520
  perto(r.ultimoAporte, 110);
});

test('simulador: valor em dinheiro de hoje desconta a inflação', () => {
  const r = L.projetar(sim({ taxa: 0, aporte: 0, inicial: 1000, inflacao: 5, idadeFinal: 47 }));
  perto(r.finalReal, 1000 / 1.05 / 1.05, 1e-6);
  perto(L.projetar(sim({ inflacao: 0 })).finalReal, L.projetar(sim({ inflacao: 0 })).final);
});

test('simulador: a linha de cada ano fecha (aportado + juros = saldo) e o saldo nunca cai com taxa positiva', () => {
  const r = L.projetar(sim({ inicial: 5000, reajuste: 3 }));
  r.anos.forEach((a, k) => {
    perto(a.aportado + a.juros, a.saldo, 1e-6);
    if (k > 0) assert.ok(a.saldo > r.anos[k - 1].saldo);
  });
});

test('simulador: aporte necessário para uma meta (e a volta dá a mesma meta)', () => {
  const r = L.aporteNecessario(sim({ taxa: 10 }), 1000000);
  assert.equal(Math.round(r.aporte), 1392);
  assert.equal(r.jaAtinge, false);
  perto(L.projetar(sim({ aporte: r.aporte })).final, 1000000, 1e-3);
  // com reajuste e valor inicial também fecha
  const r2 = L.aporteNecessario(sim({ inicial: 20000, reajuste: 5 }), 800000);
  perto(L.projetar(sim({ inicial: 20000, reajuste: 5, aporte: r2.aporte })).final, 800000, 1e-3);
  // meta que o valor inicial sozinho já cumpre
  const r3 = L.aporteNecessario(sim({ inicial: 500000 }), 100000);
  assert.equal(r3.jaAtinge, true);
  assert.equal(r3.aporte, 0);
  assert.equal(L.aporteNecessario(sim(), -5), null);
  assert.equal(L.aporteNecessario(sim(), 'abc'), null);
});

// ---------- imposto sobre o ganho ----------
test('imposto sobre o ganho: 15% dos juros (valor final menos o aportado)', () => {
  const r = L.projetar(sim({ impostoGanho: 15 }));
  perto(r.final, 359130.4, 1);
  perto(r.imposto, (r.final - 120000) * 0.15, 1e-6);
  perto(r.liquido, r.final - r.imposto, 1e-6);
  perto(r.imposto, 35869.5, 1);  // ≈ R$ 35,9 mil
  perto(r.liquido, 323261, 1);   // ≈ R$ 323,3 mil
  perto(r.liquidoReal, r.liquido / Math.pow(1.04, 20), 1e-6);
});

test('imposto sobre o ganho: sem imposto o líquido é igual ao bruto, e sem ganho não há imposto', () => {
  const s = L.projetar(sim());
  assert.equal(s.imposto, 0);
  perto(s.liquido, s.final);
  const sem = L.projetar(sim({ taxa: 0, impostoGanho: 15 }));
  assert.equal(sem.imposto, 0); // só devolveu o que foi aportado
  const perda = L.projetar(sim({ taxa: -5, impostoGanho: 15 }));
  assert.equal(perda.imposto, 0); // prejuízo não paga imposto
  assert.ok(perda.liquido < perda.aportado);
});

test('imposto sobre o ganho: o valor inicial já guardado também entra na conta do ganho', () => {
  const r = L.projetar(sim({ inicial: 10000, aporte: 0, impostoGanho: 15, idadeFinal: 46 }));
  perto(r.final, 11000, 1e-6);
  perto(r.imposto, 150, 1e-6); // ganho 1.000 × 15%
});

test('imposto sobre o ganho: aporte necessário para uma meta LÍQUIDA (ida e volta)', () => {
  const s = sim({ impostoGanho: 15 });
  const n = L.aporteNecessario(s, 500000);
  perto(L.projetar(Object.assign({}, s, { aporte: n.aporte })).liquido, 500000, 1e-3);
  assert.ok(n.aporte > L.aporteNecessario(sim(), 500000).aporte, 'com imposto precisa aportar mais');
  // com valor inicial e reajuste também fecha
  const s2 = sim({ impostoGanho: 15, inicial: 30000, reajuste: 4 });
  const n2 = L.aporteNecessario(s2, 900000);
  perto(L.projetar(Object.assign({}, s2, { aporte: n2.aporte })).liquido, 900000, 1e-3);
});

test('imposto sobre o ganho: campo novo é validado e planos antigos ficam sem imposto', () => {
  assert.equal(L.validarSimulador({ idadeAtual: 45, idadeFinal: 65 }).impostoGanho, 0);
  assert.equal(L.validarSimulador({ impostoGanho: 15 }).impostoGanho, 15);
  assert.equal(L.validarSimulador({ impostoGanho: 999 }).impostoGanho, 50);
  assert.equal(L.validarSimulador({ impostoGanho: -3 }).impostoGanho, 0);
  assert.equal(L.validarSimulador({ impostoGanho: 'x' }).impostoGanho, 0);
});

// ---------- renda passiva ----------
const renda = (extra = {}) => sim({ taxaRenda: 6, anosRenda: 25, reajustaRenda: false, inflacao: 4, ...extra });
// simula os meses da aposentadoria e devolve o saldo no fim (retirada no fim do mês)
function saldoFinalDaRetirada(saldo, s, primeira, crescer) {
  const i = L.taxaMensal(s.taxaRenda), g = crescer ? L.taxaMensal(s.inflacao) : 0;
  let w = primeira;
  for (let m = 0; m < s.anosRenda * 12; m++) { saldo = saldo * (1 + i) - w; w *= 1 + g; }
  return saldo;
}

test('renda passiva: retirada fixa que zera o patrimônio em 25 anos (anuidade)', () => {
  const s = renda();
  const r = L.rendaPassiva(1000000, s);
  const i = L.taxaMensal(6);
  perto(r.consumindo, 1000000 * i / (1 - Math.pow(1 + i, -300)), 1e-6);
  perto(saldoFinalDaRetirada(1000000, s, r.consumindo, false), 0, 1e-3);
  assert.equal(Math.round(r.consumindo), 6346); // ~R$ 6.346 por mês: 1.000.000 a 6% a.a. por 25 anos (conta à parte: 1,06^25 = 4,2919)
});

test('renda passiva: retirada que acompanha a inflação também zera o patrimônio, começando menor', () => {
  const fixa = L.rendaPassiva(1000000, renda());
  const corrigida = L.rendaPassiva(1000000, renda({ reajustaRenda: true }));
  assert.ok(corrigida.consumindo < fixa.consumindo);
  perto(saldoFinalDaRetirada(1000000, renda({ reajustaRenda: true }), corrigida.consumindo, true), 0, 1e-3);
});

test('renda passiva: só os juros deixa o patrimônio intacto (nominal, ou em poder de compra se corrigida)', () => {
  const s = renda();
  const r = L.rendaPassiva(1000000, s);
  perto(r.soJuros, 1000000 * L.taxaMensal(6), 1e-6);
  perto(saldoFinalDaRetirada(1000000, Object.assign({}, s, { anosRenda: 10 }), r.soJuros, false), 1000000, 1e-6);
  // corrigida pela inflação: o capital cresce na inflação, ou seja, mantém o poder de compra
  const sc = renda({ reajustaRenda: true, anosRenda: 10 });
  const rc = L.rendaPassiva(1000000, sc);
  perto(saldoFinalDaRetirada(1000000, sc, rc.soJuros, true), 1000000 * Math.pow(1 + L.taxaMensal(4), 120), 1e-3);
  assert.ok(rc.soJuros < r.soJuros);
});

test('renda passiva: rendimento abaixo da inflação não sustenta uma retirada corrigida', () => {
  const r = L.rendaPassiva(1000000, renda({ reajustaRenda: true, taxaRenda: 3, inflacao: 4 }));
  assert.equal(r.soJuros, 0);
  assert.equal(r.jurosAbaixoDaInflacao, true);
  assert.equal(L.patrimonioParaRenda(5000, renda({ reajustaRenda: true, taxaRenda: 3, inflacao: 4 })).soJuros, null);
  assert.ok(L.rendaPassiva(1000000, renda({ reajustaRenda: true, taxaRenda: 3, inflacao: 4 })).consumindo > 0);
});

test('renda passiva: sem juros é só dividir o patrimônio pelos meses', () => {
  const r = L.rendaPassiva(120000, renda({ taxaRenda: 0, anosRenda: 10 }));
  perto(r.consumindo, 1000, 1e-6);
  const t = L.rendaPorPrazo(120000, renda({ taxaRenda: 0 }), 20);
  perto(t.mensal, 500, 1e-6);
});

test('renda passiva: valor em dinheiro de hoje desconta a inflação até a aposentadoria', () => {
  const s = renda({ idadeAtual: 45, idadeFinal: 65, inflacao: 4 });
  const r = L.rendaPassiva(1000000, s);
  perto(r.consumindoHoje, r.consumindo / Math.pow(1.04, 20), 1e-6);
  perto(r.soJurosHoje, r.soJuros / Math.pow(1.04, 20), 1e-6);
});

test('renda passiva: prazos maiores pagam menos por mês', () => {
  const s = renda();
  const [a, b, c] = [15, 25, 35].map((n) => L.rendaPorPrazo(500000, s, n).mensal);
  assert.ok(a > b && b > c);
  assert.ok(c > L.rendaPassiva(500000, s).soJuros, 'consumir paga mais que só os juros');
});

test('renda desejada: o patrimônio necessário volta para a mesma renda (ida e volta)', () => {
  const s = renda({ reajustaRenda: true, idadeAtual: 45, idadeFinal: 65 });
  const n = L.patrimonioParaRenda(5000, s);
  const comoConsumo = L.rendaPassiva(n.consumindo, s);
  perto(comoConsumo.consumindoHoje, 5000, 1e-6);
  const comoJuros = L.rendaPassiva(n.soJuros, s);
  perto(comoJuros.soJurosHoje, 5000, 1e-6);
  assert.ok(n.soJuros > n.consumindo);
  assert.equal(L.patrimonioParaRenda(-1, s), null);
  // e o aporte para chegar lá fecha com a projeção
  const ap = L.aporteNecessario(s, n.consumindo);
  perto(L.projetar(Object.assign({}, s, { aporte: ap.aporte })).final, n.consumindo, 1e-3);
});

test('renda passiva: campos novos entram na validação e planos antigos ganham os padrões', () => {
  const v = L.validarSimulador({ idadeAtual: 45, idadeFinal: 65, aporte: 500 }); // plano salvo antes da renda existir
  assert.equal(v.taxaRenda, 6);
  assert.equal(v.anosRenda, 25);
  assert.equal(v.reajustaRenda, true);
  assert.equal(v.rendaDesejada, null);
  const w = L.validarSimulador({ taxaRenda: 999, anosRenda: 500, reajustaRenda: 'sim', rendaDesejada: -4 });
  assert.equal(w.taxaRenda, 200);
  assert.equal(w.anosRenda, 70);
  assert.equal(w.reajustaRenda, false); // só true de verdade vale
  assert.equal(w.rendaDesejada, 0);
});

test('simulador: entradas inválidas viram valores seguros', () => {
  const s = L.validarSimulador({ idadeAtual: 70, idadeFinal: 60, inicial: -5, aporte: 'x', taxa: 9999, momento: 'qualquer', meta: -1, reajuste: NaN });
  assert.ok(s.idadeFinal > s.idadeAtual);
  assert.equal(s.inicial, 0);
  assert.equal(s.aporte, 500);
  assert.equal(s.taxa, 200);
  assert.equal(s.momento, 'fim');
  assert.equal(s.meta, 0);
  assert.equal(s.reajuste, 0);
  assert.deepEqual(L.validarSimulador(null), L.simuladorPadrao());
  assert.deepEqual(L.validarSimulador('texto'), L.simuladorPadrao());
  assert.ok(L.projetar({}).anos.length > 1);
});

test('simulador: a carteira guarda o simulador e o validar o limpa', () => {
  const e = L.exemplo();
  assert.equal(e.simulador, undefined);
  const com = Object.assign(L.clonar(e), { simulador: { idadeAtual: 45, idadeFinal: 65, aporte: 500, taxa: 10, lixo: 'x', momento: 'inicio' } });
  const v = L.validar(com);
  assert.equal(v.simulador.aporte, 500);
  assert.equal(v.simulador.momento, 'inicio');
  assert.equal(v.simulador.lixo, undefined);
  assert.equal(L.validar(e).simulador, undefined);
});

test('metas do atual: 1 casa decimal e soma exatamente 100', () => {
  const e = L.metasDoAtual(L.definirTotal({ v: 1, classes: [
    { id: 'a', nome: 'A', cor: 0, meta: null, travada: false, itens: [{ id: 'a1', nome: 'x', valor: 1 }] },
    { id: 'b', nome: 'B', cor: 1, meta: null, travada: false, itens: [{ id: 'b1', nome: 'y', valor: 1 }] },
    { id: 'c', nome: 'C', cor: 2, meta: null, travada: false, itens: [{ id: 'c1', nome: 'z', valor: 1 }] }
  ] }, 3000));
  perto(L.somaMetas(e), 100, 1e-9);
  assert.ok(L.metasValidas(e));
  assert.deepEqual(e.classes.map((c) => c.meta).sort(), [33.3, 33.3, 33.4]);
});

test('rebalancear: levar à meta mantém o total e acerta os percentuais', () => {
  let e = L.exemplo();
  const metas = { 'Renda Fixa': 40, 'Ações': 20, 'FIIs': 20, 'Exterior': 20 };
  e.classes.forEach((c) => { e = L.definirMeta(e, c.id, metas[c.nome]); });
  assert.ok(L.metasValidas(e));
  const plano = L.planoAjuste(e);
  perto(plano.reduce((s, p) => s + p.diferenca, 0), 0);
  const r = L.aplicarMetas(e);
  perto(L.total(r), 10000);
  r.classes.forEach((c) => perto(L.pct(L.somaClasse(c), 10000), metas[c.nome], 1e-6));
});

test('metas inválidas: sem plano', () => {
  let e = L.exemplo();
  assert.equal(L.planoAjuste(e), null);
  e = L.definirMeta(e, e.classes[0].id, 50);
  assert.equal(L.planoAporte(e, 1000), null);
  e = L.definirMeta(e, e.classes[0].id, 'abc');
  assert.equal(e.classes[0].meta, null);
  e = L.definirMeta(e, e.classes[0].id, 150);
  assert.equal(e.classes[0].meta, 100);
});

test('aporte: soma o valor, só vai para classes abaixo da meta e nunca vende', () => {
  let e = L.exemplo(); // Renda Fixa 5.000, Ações 1.000, FIIs 2.000, Exterior 2.000
  const metas = { 'Renda Fixa': 40, 'Ações': 20, 'FIIs': 20, 'Exterior': 20 };
  e.classes.forEach((c) => { e = L.definirMeta(e, c.id, metas[c.nome]); });
  const plano = L.planoAporte(e, 2000);
  perto(plano.reduce((s, p) => s + p.aporte, 0), 2000);
  plano.forEach((p) => assert.ok(p.aporte >= 0));
  const rf = plano.find((p) => p.id === classe(e, 'Renda Fixa').id);
  perto(rf.aporte, 0); // acima da meta: não recebe
  const r = L.aplicarAporte(e, plano);
  perto(L.total(r), 12000);
  // depois do aporte, a classe mais distante da meta ficou mais perto
  const antes = Math.abs(L.pct(1000, 10000) - 20);
  const depois = Math.abs(L.pct(L.somaClasse(classe(r, 'Ações')), 12000) - 20);
  assert.ok(depois < antes);
});

test('aporte: valor zero ou negativo não gera plano', () => {
  let e = L.metasDoAtual(L.exemplo());
  assert.equal(L.planoAporte(e, 0), null);
  assert.equal(L.planoAporte(e, -50), null);
});

test('aporte grande leva todas as classes à meta', () => {
  let e = L.exemplo();
  const metas = { 'Renda Fixa': 25, 'Ações': 25, 'FIIs': 25, 'Exterior': 25 };
  e.classes.forEach((c) => { e = L.definirMeta(e, c.id, metas[c.nome]); });
  const r = L.aplicarAporte(e, L.planoAporte(e, 10000)); // 20.000 no total: 5.000 cada
  r.classes.forEach((c) => perto(L.somaClasse(c), 5000, 1e-6));
});

test('validar: aceita estado bom e conserta/derruba lixo', () => {
  const bom = L.exemplo();
  assert.deepEqual(L.validar(bom), bom);
  assert.equal(L.validar(null), null);
  assert.equal(L.validar('texto'), null);
  assert.equal(L.validar({ classes: [] }), null);
  assert.equal(L.validar({ classes: 'x' }), null);

  const sujo = L.validar({
    classes: Array.from({ length: 12 }, (_, i) => ({
      id: 'dup', nome: '<img src=x onerror=alert(1)>'.repeat(10), cor: 0, meta: 'x', travada: 'sim',
      itens: [{ id: 'dup', nome: 7, valor: -50 }, { id: 'ok', nome: 'A', valor: 1e30 }, null, { nome: 'B', valor: 'abc' }]
    })),
    __proto__: { x: 1 }
  });
  assert.equal(sujo.classes.length, 8);
  assert.equal(new Set(sujo.classes.map((c) => c.cor)).size, 8);
  const ids = [];
  sujo.classes.forEach((c) => { ids.push(c.id); c.itens.forEach((a) => ids.push(a.id)); });
  assert.equal(new Set(ids).size, ids.length);
  sujo.classes.forEach((c) => {
    assert.ok(c.nome.length <= L.MAX_NOME);
    assert.equal(c.meta, null);
    assert.equal(c.travada, false);
    c.itens.forEach((a) => { assert.ok(a.valor >= 0 && a.valor <= 1e12); assert.equal(typeof a.nome, 'string'); });
  });
  const semItens = L.validar({ classes: [{ nome: 'A', itens: [] }] });
  assert.equal(semItens.classes[0].itens.length, 1);
});

test('parseNumero: formatos brasileiros e americanos', () => {
  const casos = [['10.000', 10000], ['R$ 10.000', 10000], ['10.000,50', 10000.5], ['1234,5', 1234.5], ['1234.5', 1234.5],
    ['1.234.567', 1234567], ['33,3%', 33.3], ['0,25', 0.25], ['1000', 1000], ['  7 ', 7], ['1.5', 1.5], ['2.500', 2500]];
  casos.forEach(([entrada, saida]) => perto(L.parseNumero(entrada), saida, 1e-9));
  ['', 'abc', '-', null, undefined, 'R$'].forEach((x) => assert.ok(Number.isNaN(L.parseNumero(x)), String(x)));
});

test('formatação', () => {
  assert.equal(L.fmtPct(33), '33');
  assert.equal(L.fmtPct(33.04), '33');
  assert.equal(L.fmtPct(33.34), '33,3');
  assert.equal(L.fmtPct(NaN), '0');
  assert.equal(L.brl(10000), 'R$ 10.000');
  assert.equal(L.brl(1234.5, 2), 'R$ 1.234,50');
});

test('CSV: separador ;, decimais com vírgula e proteção contra fórmula', () => {
  let e = L.exemplo();
  e = L.renomearAtivo(e, e.classes[0].id, e.classes[0].itens[0].id, '=SOMA(A1)');
  e = L.renomearClasse(e, e.classes[1].id, 'Ações; "BR"');
  const csv = L.paraCSV(e);
  const linhas = csv.split('\r\n');
  assert.equal(linhas[0], 'Classe;Ativo;Valor (R$);% da carteira;% da classe;Meta da classe (%)');
  assert.ok(linhas[1].includes("'=SOMA(A1)"));
  assert.ok(csv.includes('"Ações; ""BR"""'));
  assert.equal(linhas[linhas.length - 1], 'Total;;10000,00;100,00;;');
});

test('tom do ativo: um ativo usa a cor da classe, vários clareiam sem passar de 50%', () => {
  assert.equal(L.tomDoAtivo('#2a78d6', 0, 1), '#2a78d6');
  assert.equal(L.tomDoAtivo('#2a78d6', 0, 4), '#2a78d6');
  assert.notEqual(L.tomDoAtivo('#2a78d6', 3, 4), '#2a78d6');
  assert.match(L.tomDoAtivo('#e34948', 29, 30), /^#[0-9a-f]{6}$/);
});

test('funções não alteram o estado recebido', () => {
  const e = L.exemplo();
  const copia = JSON.stringify(e);
  L.definirPercentualClasse(e, e.classes[0].id, 10);
  L.definirTotal(e, 1);
  L.adicionarClasse(e, 'x');
  L.trocarCor(e, e.classes[0].id, 3);
  L.metasDoAtual(e);
  assert.equal(JSON.stringify(e), copia);
});
