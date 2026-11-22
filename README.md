# Montador de Carteira

Simulador de alocação: o visitante monta classes e ativos, muda percentuais, define metas, vê quanto
comprar/vender para chegar nelas e como dividir um novo aporte. Quem cria conta salva várias carteiras.

- **Sem conta (visitante):** tudo funciona e fica salvo no navegador.
- **Com conta:** carteiras guardadas no Supabase, com salvamento automático.
- **Hospedagem:** site estático no Render. **Código:** GitHub. **Banco e login:** Supabase.
- Dá para embutir no site do Framer (`framer/embed.html`).

## O que o app faz

| | |
|---|---|
| Classes | criar, renomear, excluir, escolher a cor (8 cores validadas, uma por classe), **travar** o percentual |
| Ativos | criar, renomear, excluir, valor em R$, % da carteira e % da classe |
| Percentual da classe | a classe vira X% do total e as outras se reajustam na proporção (as travadas não mexem) |
| Total | editar o total escala tudo, mantendo os percentuais |
| Gráfico | rosca de dois anéis (classes por dentro, ativos por fora) ou barras (por classe ou por ativo), com dica ao passar o mouse |
| Metas | % desejada por classe, diferença para a meta e quanto **comprar/vender** para chegar lá |
| Aporte | divide um valor novo só entre as classes abaixo da meta, sem vender nada |
| Extras | desfazer/refazer (Ctrl+Z), planilha CSV, carteiras múltiplas (renomear, duplicar, excluir) |

Limites: 8 classes, 30 ativos por classe, 20 carteiras por conta.

## Rodar no seu computador

Precisa do Node 18+.

```powershell
npm test        # testes da lógica e da trava de segurança do build
npm run dev     # abre em http://localhost:5173 (modo visitante)
```

Para testar contas localmente, copie `.env.exemplo` para `.env`, preencha as duas variáveis e rode `npm run config`.

## Publicar: passo a passo

Ordem importa: GitHub, depois Supabase, depois Render, e por fim voltar ao Supabase para informar o endereço.

### 1. GitHub

1. Crie um repositório **privado** vazio (ex.: `montador-carteira`).
2. Neste projeto:

```powershell
git add -A
git commit -m "Montador de Carteira"
git remote add origin https://github.com/SEU-USUARIO/montador-carteira.git
git push -u origin main
```

### 2. Supabase (banco e login)

1. Em supabase.com, crie um projeto (guarde a senha do banco num gerenciador de senhas).
2. **SQL Editor > New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. **Authentication > Sign In / Providers > Email**: deixe "Email" ligado. Em **Password**, ponha o
   tamanho mínimo em 8. Se quiser que a pessoa confirme o e-mail antes de entrar, deixe "Confirm email" ligado
   (recomendado para site público).
4. **Project Settings > API** (ou **API Keys**): copie a **Project URL** e a chave **anon / publishable**.
   Nunca use a `service_role` / `secret`: o build do Render recusa essa chave, mas o cuidado é seu também.

> O e-mail padrão do Supabase tem limite baixo de envios por hora. Para uso real, configure um SMTP próprio
> em **Authentication > Emails > SMTP Settings** (Resend, Brevo, etc.).

### 3. Render (hospedagem)

1. Em render.com: **New > Blueprint**, escolha o repositório. O `render.yaml` já define tudo.
2. Quando pedir, preencha:
   - `SUPABASE_URL`: a Project URL (ex.: `https://abcdefgh.supabase.co`)
   - `SUPABASE_ANON_KEY`: a chave pública
3. Aguarde o deploy. O Render dá um endereço como `https://montador-carteira.onrender.com`.

(Sem Blueprint: **New > Static Site**, Build Command `node scripts/gerar-config.js`, Publish Directory `public`, e as duas variáveis.)

### 4. Voltar ao Supabase com o endereço do Render

**Authentication > URL Configuration**:

- **Site URL:** o endereço do Render.
- **Redirect URLs:** adicione o mesmo endereço (os links de confirmar e-mail e redefinir senha voltam para ele).

### 5. Framer

No site do Framer, adicione um componente **Embed**, modo **HTML**, e cole `framer/embed.html`
trocando `SEU-APP.onrender.com` pelo seu endereço. A altura acompanha o conteúdo sozinha.

Dica: login por e-mail e senha funciona dentro do Framer. Links enviados por e-mail (confirmar conta, redefinir senha)
abrem o app **em tela cheia**, direto no endereço do Render, e depois a pessoa pode voltar ao seu site.

## Segurança

- A chave `anon` é pública de propósito. Quem protege os dados é a **RLS** (`supabase/schema.sql`):
  cada política exige `user_id = auth.uid()`, então ninguém lê nem altera a carteira de outra pessoa.
  Anônimos não têm nenhum acesso à tabela.
- `scripts/gerar-config.js` **recusa** `service_role` e `sb_secret_` (testado em `test/config.test.js`).
- O Render envia uma CSP restrita (`render.yaml`): só scripts do próprio site, conexões só com o Supabase.
  O servidor local (`npm run dev`) usa a mesma política, então o que funciona aí funciona no ar.
- O Supabase JS fica **dentro do repositório** (`public/vendor/`, versão 2.119.2), sem CDN.
  Para atualizar: `npm i @supabase/supabase-js@VERSAO` numa pasta temporária e copie `dist/umd/supabase.js`.
- Nomes digitados entram na página só por `textContent`/`value` (nunca `innerHTML`), e o CSV protege contra fórmulas (`=`, `+`, `-`, `@`).
- Dados vindos do navegador ou do banco passam por `validar()` (limites de tamanho, cores e quantidades) antes de aparecer.

### Endurecer o embed (opcional)

Por padrão, qualquer site pode embutir o app. Para só o seu site poder, acrescente ao final da CSP no `render.yaml`:

```
; frame-ancestors 'self' https://eitonilda.com https://www.eitonilda.com
```

Antes, confirme no Framer todos os endereços de onde o app será aberto (o editor e a pré-visualização do Framer usam
outros domínios; se faltar algum, o embed fica em branco ali).

## Decisões de projeto

- **Login por e-mail e senha** (fluxo `implicit` do Supabase): funciona dentro de iframe, onde o navegador separa o armazenamento
  do iframe do da aba aberta por links de e-mail (com o fluxo PKCE, a confirmação falharia no embed).
- **Cores:** paleta categórica de 8 cores, ordem fixa, validada para daltonismo com `validate_palette.js` do skill de dataviz
  (pior par vizinho: ΔE 9,1 com daltonismo; mínimo normal 19,6). Três cores claras ficam abaixo de 3:1 de contraste com o branco,
  por isso **toda fatia tem rótulo na tabela, dica e centro da rosca**, e a tabela é a visão em texto do gráfico.
- A rosca foi mantida por ser o desenho original; as **barras** ordenadas são o jeito mais exato de comparar partes.
- O total nunca é guardado: é a soma dos ativos. Editar um ativo muda o total, como no protótipo original.
- Valores aparecem arredondados em reais; a precisão completa é mantida por baixo (dica do gráfico e CSV mostram centavos).
- Só tema claro: o site do Framer é branco. As cores estão em variáveis no começo de `public/estilos.css`.

## Estrutura

```
public/                 o site (é isso que o Render publica)
  index.html, estilos.css
  carteira-logica.js    regras de cálculo, sem tela (testada)
  grafico.js            rosca e barras em SVG/HTML
  armazenamento.js      navegador (visitante) e Supabase (conta)
  app.js                tela, desfazer, metas, aporte, login
  vendor/supabase.js    biblioteca do Supabase (cópia local)
  config.js             gerado no build (não vai para o Git)
supabase/schema.sql     tabela, RLS e gatilho
scripts/                gerar-config.js (build), servir.js (local)
test/                   logica.test.js, config.test.js
framer/embed.html       código para colar no Framer
render.yaml             Blueprint do Render
```

> Ferramenta de simulação, sem caráter de recomendação de investimento.
