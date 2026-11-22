/*
 * Onde a carteira é guardada:
 *  - visitante: no navegador (localStorage), sem conta;
 *  - com conta: no Supabase (tabela "carteiras"), protegido por RLS (cada pessoa só enxerga as próprias).
 * A chave pública (anon) vai para o navegador de propósito; quem protege os dados é a RLS (supabase/schema.sql).
 */
(function () {
  'use strict';
  var CHAVE_VISITANTE = 'montador.v1.visitante';
  var CHAVE_EDITADO = 'montador.v1.visitante.editado';
  var CHAVE_ULTIMA = 'montador.v1.ultima.';
  var LIMITE_CARTEIRAS = 20;

  var cfg = window.MONTADOR_CONFIG || {};
  var sb = null;
  try {
    if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && window.supabase.createClient) {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // "implicit": os links do e-mail funcionam mesmo quando o app está dentro de um iframe (Framer),
          // onde o navegador separa o armazenamento do iframe do da aba aberta pelo link.
          flowType: 'implicit'
        }
      });
    }
  } catch (e) { sb = null; }

  function guardar(chave, valor) { try { localStorage.setItem(chave, valor); } catch (e) { /* sem armazenamento: ok */ } }
  function ler(chave) { try { return localStorage.getItem(chave); } catch (e) { return null; } }
  function apagar(chave) { try { localStorage.removeItem(chave); } catch (e) { /* ok */ } }

  function traduzir(erro) {
    var msg = String((erro && (erro.message || erro.error_description)) || erro || '');
    var cod = String((erro && (erro.code || erro.error_code)) || '');
    var m = msg.toLowerCase();
    if (m.indexOf('invalid login credentials') >= 0) return 'E-mail ou senha incorretos.';
    if (m.indexOf('already registered') >= 0 || cod === 'user_already_exists') return 'Este e-mail já tem conta. Use "Entrar".';
    if (m.indexOf('email not confirmed') >= 0 || cod === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).';
    if (m.indexOf('rate limit') >= 0 || cod === 'over_email_send_rate_limit' || cod === 'over_request_rate_limit' || (erro && erro.status === 429)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    if (m.indexOf('password should be at least') >= 0 || cod === 'weak_password') return 'Senha fraca. Use pelo menos 8 caracteres.';
    if (m.indexOf('same password') >= 0 || cod === 'same_password') return 'A nova senha precisa ser diferente da atual.';
    if (m.indexOf('invalid email') >= 0 || m.indexOf('unable to validate email') >= 0) return 'E-mail inválido.';
    if (m.indexOf('provider is not enabled') >= 0 || m.indexOf('unsupported provider') >= 0) return 'Entrar com o Google ainda não foi ativado neste site.';
    if (m.indexOf('limite de ' + LIMITE_CARTEIRAS) >= 0) return 'Limite de ' + LIMITE_CARTEIRAS + ' carteiras atingido. Exclua uma para criar outra.';
    if (m.indexOf('row-level security') >= 0 || cod === '42501') return 'Sem permissão para salvar. Sua sessão pode ter expirado: saia e entre de novo.';
    if (m.indexOf('failed to fetch') >= 0 || m.indexOf('networkerror') >= 0 || m.indexOf('load failed') >= 0) return 'Sem conexão com o servidor. Verifique a internet.';
    if (m.indexOf('jwt') >= 0 || m.indexOf('not authenticated') >= 0) return 'Sua sessão expirou. Entre de novo.';
    return 'Algo deu errado. Tente de novo em instantes.';
  }

  function checar(res) {
    if (res.error) {
      // o detalhe técnico vai para o console (F12), para facilitar achar a causa de um erro
      try { console.error('[Montador] erro do Supabase:', res.error); } catch (x) { /* sem console: ok */ }
      var e = new Error(traduzir(res.error)); e.original = res.error; throw e;
    }
    return res.data;
  }

  function urlDeRetorno() { return location.href.split('#')[0].split('?')[0]; }

  window.Armazenamento = {
    LIMITE_CARTEIRAS: LIMITE_CARTEIRAS,
    contasDisponiveis: function () { return !!sb; },

    // ----- visitante -----
    lerVisitante: function () {
      var t = ler(CHAVE_VISITANTE);
      if (!t) return null;
      try { return JSON.parse(t); } catch (e) { return null; }
    },
    salvarVisitante: function (estado) { guardar(CHAVE_VISITANTE, JSON.stringify(estado)); },
    limparVisitante: function () { apagar(CHAVE_VISITANTE); apagar(CHAVE_EDITADO); },
    lerUltima: function (usuarioId) { return ler(CHAVE_ULTIMA + usuarioId); },
    guardarUltima: function (usuarioId, id) { guardar(CHAVE_ULTIMA + usuarioId, id); },

    // ----- conta -----
    sessao: function () { return sb.auth.getSession().then(function (r) { return r.data && r.data.session; }); },
    aoMudarSessao: function (fn) { return sb.auth.onAuthStateChange(fn); },
    entrar: function (email, senha) { return sb.auth.signInWithPassword({ email: email, password: senha }).then(checar); },
    criarConta: function (email, senha) {
      return sb.auth.signUp({ email: email, password: senha, options: { emailRedirectTo: urlDeRetorno() } }).then(checar);
    },
    sair: function () { return sb.auth.signOut().then(function (r) { if (r.error) throw new Error(traduzir(r.error)); }); },
    esqueciSenha: function (email) {
      return sb.auth.resetPasswordForEmail(email, { redirectTo: urlDeRetorno() }).then(checar);
    },
    novaSenha: function (senha) { return sb.auth.updateUser({ password: senha }).then(checar); },

    // Google: só aparece se estiver ligado no painel do Supabase (a pergunta é pública, vai com a chave pública).
    googleAtivo: function () {
      if (!sb) return Promise.resolve(false);
      return fetch(cfg.supabaseUrl + '/auth/v1/settings', { headers: { apikey: cfg.supabaseAnonKey } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return !!(j && j.external && j.external.google); })
        .catch(function () { return false; });
    },
    // Leva a página para o login do Google e volta para cá já com a sessão (cria a conta no primeiro acesso).
    entrarComGoogle: function () {
      return sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: urlDeRetorno(), queryParams: { prompt: 'select_account' } }
      }).then(checar);
    },

    // ----- carteiras (RLS garante que só voltam as da própria pessoa) -----
    listar: function () {
      return sb.from('carteiras').select('id,nome,atualizado_em').order('atualizado_em', { ascending: false }).limit(LIMITE_CARTEIRAS).then(checar);
    },
    carregar: function (id) {
      return sb.from('carteiras').select('id,nome,dados').eq('id', id).single().then(checar);
    },
    criar: function (nome, dados) {
      return sb.from('carteiras').insert({ nome: nome, dados: dados }).select('id,nome,atualizado_em').single().then(checar);
    },
    salvar: function (id, dados) {
      return sb.from('carteiras').update({ dados: dados }).eq('id', id).then(checar);
    },
    renomear: function (id, nome) {
      return sb.from('carteiras').update({ nome: nome }).eq('id', id).then(checar);
    },
    excluir: function (id) {
      return sb.from('carteiras').delete().eq('id', id).then(checar);
    },
    traduzir: traduzir
  };
})();
