'use strict';
// Garante que o build do Render recusa chaves que dão acesso total ao banco.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const script = path.resolve(__dirname, '..', 'scripts', 'gerar-config.js');
const destino = path.resolve(__dirname, '..', 'public', 'config.js');

function jwt(papel) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ role: papel, iss: 'supabase' })}.assinatura`;
}

function rodar(env) {
  // env mínimo: sem herdar SUPABASE_* do computador e sem ler um .env real
  const limpo = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  return spawnSync(process.execPath, [script], { env: { ...limpo, ...env }, encoding: 'utf8' });
}

test('gerar-config', async (t) => {
  const existia = fs.existsSync(destino);
  const antes = existia ? fs.readFileSync(destino) : null;
  t.after(() => { if (existia) fs.writeFileSync(destino, antes); else fs.rmSync(destino, { force: true }); });
  // se houver um .env real, o script o leria; o teste só vale sem ele
  const dotenv = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(dotenv)) { t.skip('há um .env local: teste ignorado'); return; }

  await t.test('sem variáveis: gera config vazio (modo visitante)', () => {
    const r = rodar({});
    assert.equal(r.status, 0);
    assert.match(fs.readFileSync(destino, 'utf8'), /MONTADOR_CONFIG = \{\};/);
  });

  await t.test('no Render, sem variáveis o build falha (o site não pode ficar sem login)', () => {
    fs.rmSync(destino, { force: true });
    const r = rodar({ RENDER: 'true' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /SUPABASE_URL/);
    assert.equal(fs.existsSync(destino), false);
  });

  await t.test('aceita a chave anon', () => {
    const r = rodar({ SUPABASE_URL: 'https://abcdefgh.supabase.co/', SUPABASE_ANON_KEY: jwt('anon') });
    assert.equal(r.status, 0, r.stderr);
    const txt = fs.readFileSync(destino, 'utf8');
    assert.match(txt, /"supabaseUrl":"https:\/\/abcdefgh\.supabase\.co"/);
  });

  await t.test('aceita a chave publishable nova', () => {
    const r = rodar({ SUPABASE_URL: 'https://abcdefgh.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_abc123' });
    assert.equal(r.status, 0, r.stderr);
  });

  await t.test('recusa service_role', () => {
    fs.rmSync(destino, { force: true });
    const r = rodar({ SUPABASE_URL: 'https://abcdefgh.supabase.co', SUPABASE_ANON_KEY: jwt('service_role') });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /service_role/);
    assert.equal(fs.existsSync(destino), false, 'não pode gravar o config com chave secreta');
  });

  await t.test('recusa chave secreta nova (sb_secret_)', () => {
    const r = rodar({ SUPABASE_URL: 'https://abcdefgh.supabase.co', SUPABASE_ANON_KEY: 'sb_secret_abc' });
    assert.equal(r.status, 1);
  });

  await t.test('recusa URL que não é do Supabase ou sem https', () => {
    assert.equal(rodar({ SUPABASE_URL: 'http://abcdefgh.supabase.co', SUPABASE_ANON_KEY: jwt('anon') }).status, 1);
    assert.equal(rodar({ SUPABASE_URL: 'https://exemplo.com', SUPABASE_ANON_KEY: jwt('anon') }).status, 1);
  });

  await t.test('recusa chave vazia ou em formato estranho', () => {
    assert.equal(rodar({ SUPABASE_URL: 'https://abcdefgh.supabase.co', SUPABASE_ANON_KEY: '' }).status, 1);
    assert.equal(rodar({ SUPABASE_URL: 'https://abcdefgh.supabase.co', SUPABASE_ANON_KEY: 'qualquer-coisa' }).status, 1);
  });
});
