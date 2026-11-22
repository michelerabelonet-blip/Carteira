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
