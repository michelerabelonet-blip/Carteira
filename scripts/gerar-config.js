'use strict';
/*
 * Gera public/config.js a partir das variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY
 * (no Render: Environment; no computador: arquivo .env). Roda no build do Render.
 *
 * Trava de segurança: recusa chaves "service_role" / "secret", que dão acesso total ao banco
 * e jamais podem ir para o navegador. Sem as variáveis, o app funciona só no modo visitante.
 */
const fs = require('node:fs');
const path = require('node:path');

function lerDotenv() {
  const arq = path.resolve(__dirname, '..', '.env');
  const out = {};
  if (!fs.existsSync(arq)) return out;
  for (const linha of fs.readFileSync(arq, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !linha.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function papelDoJwt(chave) {
  const partes = chave.split('.');
  if (partes.length !== 3) return null;
  try { return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')).role || null; } catch (e) { return null; }
}

const env = Object.assign({}, lerDotenv(), process.env);
const url = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const chave = (env.SUPABASE_ANON_KEY || '').trim();
const destino = path.resolve(__dirname, '..', 'public', 'config.js');

function gravar(cfg, aviso) {
  fs.writeFileSync(destino, '// Gerado por scripts/gerar-config.js. Não edite nem versione.\nwindow.MONTADOR_CONFIG = ' + JSON.stringify(cfg) + ';\n');
  console.log(aviso);
}

if (!url && !chave) {
  gravar({}, 'AVISO: SUPABASE_URL e SUPABASE_ANON_KEY não definidas. O app vai funcionar só no modo visitante (sem contas).');
  process.exit(0);
}

const erros = [];
if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) erros.push('SUPABASE_URL deve ser algo como https://abcdefgh.supabase.co');
if (!chave) erros.push('SUPABASE_ANON_KEY está vazia.');
if (/^sb_secret_/i.test(chave)) erros.push('Esta é uma chave SECRETA (sb_secret_...). Use a chave pública (publishable / anon).');
const papel = papelDoJwt(chave);
if (papel && papel !== 'anon') erros.push(`A chave tem o papel "${papel}". Use somente a chave pública "anon".`);
if (chave && !papel && !/^sb_publishable_/i.test(chave)) erros.push('Chave em formato desconhecido. Copie a "anon public" (ou "publishable") do painel do Supabase.');

if (erros.length) {
  console.error('ERRO ao gerar o config:\n - ' + erros.join('\n - '));
  process.exit(1);
}

gravar({ supabaseUrl: url, supabaseAnonKey: chave }, 'config.js gerado para ' + url);
