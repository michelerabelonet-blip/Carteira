# Montador de Carteira

Site estático (HTML/CSS/JS puros, sem build de front-end) + Supabase (login e carteiras) + Render (hospedagem). Textos em português do Brasil.
Leia o `README.md` para a arquitetura e os passos de publicação.

## Regras do projeto

- **Regras de cálculo só em `public/carteira-logica.js`** (funções puras, devolvem estado novo). A tela (`app.js`) não calcula nada de carteira. Toda regra nova ganha teste em `test/logica.test.js`.
- **Segurança de dados é do banco:** a RLS em `supabase/schema.sql` decide quem vê o quê. O front-end nunca é a barreira.
- **Nunca** `innerHTML` com texto do usuário (use `textContent`/`value`). Todo dado de fora passa por `validar()`.
- **Nunca** colocar a chave `service_role`/`secret` no front-end; `scripts/gerar-config.js` recusa essas chaves.
- Sem CDN e sem script inline: a CSP do `render.yaml` só permite scripts do próprio site. Mude a CSP e o `npm run dev` acompanha (lê do mesmo arquivo).
- Cores: no máximo 8 classes, uma cor da paleta validada por classe (`CORES` em `carteira-logica.js`). Não gere uma 9ª cor.
- Embed no Framer: o app avisa a altura por `postMessage` (`montadorAltura`).
- **Login obrigatório** quando o Supabase está configurado: telas `#telaLogin`, `#telaCarregando` e `#app` (função `mostrarTela` em `app.js`). Nenhum dado de carteira aparece nem fica no DOM sem sessão (`aoSair` esvazia tudo). O modo visitante só existe sem Supabase (desenvolvimento local), e o build do Render falha sem as chaves.
- **Simulador de juros:** a conta é `projetar`/`aporteNecessario` em `carteira-logica.js` (mês a mês, aporte no fim ou início do mês, reajuste anual, taxa efetiva anual convertida para mensal); `simulador.js` só desenha. A renda passiva usa `rendaPassiva`, `rendaPorPrazo` e `patrimonioParaRenda` (anuidade; retirada no fim do mês; se corrigida, cresce todo mês pela inflação mensal equivalente; só-juros = patrimônio × (rendimento − inflação) mensal). O plano vai em `estado.simulador` (validado por `validarSimulador` e salvo junto com a carteira, sem entrar no desfazer). Todo script novo no `index.html` precisa entrar em `BASICOS` do `sw.js` (o `pwa.test.js` confere).
- **PWA:** `manifest.json`, `sw.js` e `icones/` fazem o app ser instalável (Android e iPhone). O `sw.js` é **rede primeiro** e só toca em arquivos do próprio site: nunca cache de Supabase/Google nem de dados de carteira. Se mudar arquivos do app, confira a lista `BASICOS` do `sw.js` (o `test/pwa.test.js` checa que todos existem). Ícones: `node scripts/gerar-icones.js`. Campos de texto têm 16px em tela de toque (evita o zoom do iPhone).
- Google: botão aparece só se o Supabase tiver o provedor ligado (`googleAtivo`). Dentro de iframe o Google bloqueia, então o botão abre `?entrar=google` em outra aba.

## Comandos

- `npm test` testes automáticos
- `cd sql-test && npm test` testa o `supabase/schema.sql` num Postgres de verdade. **Rode sempre que mudar o SQL.** Política de RLS nunca pode consultar a própria tabela (recursão infinita); regras que precisam contar linhas vão em gatilho.
- `npm run dev` servidor local em http://localhost:5173
- `npm run config` gera `public/config.js` a partir do `.env`
