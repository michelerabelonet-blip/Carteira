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

## Comandos

- `npm test` testes automáticos
- `npm run dev` servidor local em http://localhost:5173
- `npm run config` gera `public/config.js` a partir do `.env`
