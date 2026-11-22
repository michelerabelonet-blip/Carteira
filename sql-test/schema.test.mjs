// Roda supabase/schema.sql num Postgres em memória (PGlite) e confere as regras de segurança.
// Por que existe: uma política que consultava a própria tabela deu "infinite recursion" só no Supabase real.
//
// Uso:   cd sql-test && npm install && npm test
// Outro arquivo SQL:   SCHEMA=../caminho/schema.sql npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const aqui = dirname(fileURLToPath(import.meta.url));
const arquivo = resolve(aqui, process.env.SCHEMA || '../supabase/schema.sql');
const schema = readFileSync(arquivo, 'utf8');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

// Imita o que o Supabase já traz: schema auth, auth.uid(), papéis anon e authenticated.
const PREPARO = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  insert into auth.users values ('${A}'), ('${B}');
`;

async function novoBanco() {
  const db = new PGlite();
  await db.exec(PREPARO);
  await db.exec(schema);
  return db;
}

// Executa como o PostgREST faz: papel + usuário vindo do token.
async function como(db, papel, usuario, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${usuario || ''}', false); set role ${papel};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}

const dados = (extra = {}) => JSON.stringify({ v: 1, classes: [{ nome: 'RF', ...extra }] });
const inserir = (db, nome = 'Minha carteira', d = dados()) =>
  db.query('insert into public.carteiras (nome, dados) values ($1, $2::jsonb) returning id, user_id', [nome, d]);

test('o schema roda inteiro e pode rodar de novo (idempotente)', async () => {
  const db = await novoBanco();
  await db.exec(schema);
  const pol = await db.query("select count(*)::int n from pg_policies where tablename = 'carteiras'");
  assert.equal(pol.rows[0].n, 4);
  const rls = await db.query("select relrowsecurity from pg_class where oid = 'public.carteiras'::regclass");
  assert.equal(rls.rows[0].relrowsecurity, true);
});

test('quem entrou cria a primeira carteira (era aqui que dava "infinite recursion")', async () => {
  const db = await novoBanco();
  const r = await como(db, 'authenticated', A, () => inserir(db));
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].user_id, A, 'user_id vem de auth.uid() sozinho');
});

test('cada pessoa vê só as próprias carteiras', async () => {
  const db = await novoBanco();
  await como(db, 'authenticated', A, () => inserir(db, 'da A'));
  await como(db, 'authenticated', B, () => inserir(db, 'da B'));
  const vistoPorA = await como(db, 'authenticated', A, () => db.query('select nome from public.carteiras'));
  const vistoPorB = await como(db, 'authenticated', B, () => db.query('select nome from public.carteiras'));
  assert.deepEqual(vistoPorA.rows.map((x) => x.nome), ['da A']);
  assert.deepEqual(vistoPorB.rows.map((x) => x.nome), ['da B']);
});

test('uma pessoa não altera nem apaga a carteira da outra', async () => {
  const db = await novoBanco();
  const { rows } = await como(db, 'authenticated', A, () => inserir(db, 'da A'));
  const id = rows[0].id;
  const upd = await como(db, 'authenticated', B, () => db.query("update public.carteiras set nome = 'invadida' where id = $1 returning id", [id]));
  const del = await como(db, 'authenticated', B, () => db.query('delete from public.carteiras where id = $1 returning id', [id]));
  assert.equal(upd.rows.length, 0);
  assert.equal(del.rows.length, 0);
  const intacta = await como(db, 'authenticated', A, () => db.query('select nome from public.carteiras where id = $1', [id]));
  assert.equal(intacta.rows[0].nome, 'da A');
});

test('não dá para criar carteira em nome de outra pessoa', async () => {
  const db = await novoBanco();
  await assert.rejects(
    como(db, 'authenticated', B, () => db.query('insert into public.carteiras (user_id, nome, dados) values ($1, $2, $3::jsonb)', [A, 'falsa', dados()])),
    /row-level security/
  );
});

test('não dá para passar a carteira para outro dono nem mudar a data de criação', async () => {
  const db = await novoBanco();
  const { rows } = await como(db, 'authenticated', A, () => inserir(db));
  const antes = await db.query('select criado_em from public.carteiras where id = $1', [rows[0].id]);
  await como(db, 'authenticated', A, () => db.query("update public.carteiras set user_id = $2, criado_em = '2000-01-01' where id = $1", [rows[0].id, B]));
  const depois = await db.query('select user_id, criado_em from public.carteiras where id = $1', [rows[0].id]);
  assert.equal(depois.rows[0].user_id, A);
  assert.equal(new Date(depois.rows[0].criado_em).getTime(), new Date(antes.rows[0].criado_em).getTime());
});

test('atualizar carteira muda atualizado_em e salva os dados', async () => {
  const db = await novoBanco();
  const { rows } = await como(db, 'authenticated', A, () => inserir(db));
  await db.query("update public.carteiras set atualizado_em = '2000-01-01' where id = $1", [rows[0].id]);
  await como(db, 'authenticated', A, () => db.query("update public.carteiras set dados = '{\"v\":2}'::jsonb where id = $1", [rows[0].id]));
  const r = await db.query('select dados, atualizado_em from public.carteiras where id = $1', [rows[0].id]);
  assert.equal(r.rows[0].dados.v, 2);
  assert.ok(new Date(r.rows[0].atualizado_em).getFullYear() > 2000);
});

test('limite de 20 carteiras por pessoa, sem travar a outra pessoa', async () => {
  const db = await novoBanco();
  for (let i = 1; i <= 20; i++) await como(db, 'authenticated', A, () => inserir(db, `c${i}`));
  await assert.rejects(como(db, 'authenticated', A, () => inserir(db, 'c21')), /Limite de 20 carteiras/);
  const b = await como(db, 'authenticated', B, () => inserir(db, 'da B'));
  assert.equal(b.rows.length, 1);
  // apagar uma abre vaga
  await como(db, 'authenticated', A, () => db.query("delete from public.carteiras where nome = 'c1'"));
  await como(db, 'authenticated', A, () => inserir(db, 'c22'));
});

test('visitante (anon) não lê nem escreve nada', async () => {
  const db = await novoBanco();
  await como(db, 'authenticated', A, () => inserir(db));
  await assert.rejects(como(db, 'anon', '', () => db.query('select * from public.carteiras')), /permission denied/);
  await assert.rejects(como(db, 'anon', '', () => inserir(db)), /permission denied/);
});

test('dados inválidos são recusados (não é objeto, grande demais, nome vazio)', async () => {
  const db = await novoBanco();
  await assert.rejects(como(db, 'authenticated', A, () => inserir(db, 'x', '[1,2]')), /carteiras_dados_objeto/);
  const enorme = JSON.stringify({ lixo: 'x'.repeat(100001) });
  await assert.rejects(como(db, 'authenticated', A, () => inserir(db, 'x', enorme)), /carteiras_dados_tamanho/);
  await assert.rejects(como(db, 'authenticated', A, () => inserir(db, '')), /check/i);
  await assert.rejects(como(db, 'authenticated', A, () => inserir(db, 'n'.repeat(61))), /check/i);
});

test('apagar a conta apaga as carteiras (on delete cascade)', async () => {
  const db = await novoBanco();
  await como(db, 'authenticated', A, () => inserir(db));
  await db.exec(`delete from auth.users where id = '${A}'`);
  const r = await db.query('select count(*)::int n from public.carteiras');
  assert.equal(r.rows[0].n, 0);
});
