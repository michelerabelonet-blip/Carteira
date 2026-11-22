# Montador de Carteira

Simulador de alocação: o visitante monta classes e ativos, muda percentuais, define metas, vê quanto
comprar/vender para chegar nelas e como dividir um novo aporte. Quem cria conta salva várias carteiras.

- **Login obrigatório:** no ar, quem não entrou vê só a tela de entrada (e-mail e senha, ou Google). Ao clicar em **Sair**,
  a carteira some da tela e da memória da página.
- **Com conta:** várias carteiras guardadas no Supabase, com salvamento automático.
- **Só no seu computador, sem Supabase configurado** (`npm run dev` sem `.env`): o app abre sem login e salva no navegador,
  para facilitar o desenvolvimento. O build do Render **falha** se as chaves faltarem, para o site nunca subir sem login.
- **Hospedagem:** site estático no Render. **Código:** GitHub. **Banco e login:** Supabase.
- Dá para embutir no site do Framer (`framer/embed.html`).

## O que o app faz

| | |
|---|---|
| Classes | criar, renomear, excluir, escolher a cor (8 cores validadas, uma por classe), **travar** o percentual |
| Ativos | criar, renomear, excluir, valor em R$, % da carteira e % da classe. **Ao adicionar um ativo, o valor da classe é rateado por igual entre todos** (a classe mantém o percentual); ao excluir, o valor fica com os que sobram; **Dividir igualmente** refaz o rateio a qualquer momento |
| Percentual da classe | a classe vira X% do total e as outras se reajustam na proporção (as travadas não mexem) |
| Total | editar o total escala tudo, mantendo os percentuais |
| Gráfico | rosca de dois anéis (classes por dentro, ativos por fora) ou barras (por classe ou por ativo), com dica ao passar o mouse |
| Metas | % desejada por classe, diferença para a meta e quanto **comprar/vender** para chegar lá |
| Aporte | divide um valor novo só entre as classes abaixo da meta, sem vender nada |
| Simulador de juros | aba **Simulador de juros**: idade, valor já guardado (dá para usar o total da carteira), aporte mensal, reajuste anual do aporte, rentabilidade, inflação e momento do aporte. Mostra o valor final (também em dinheiro de hoje), quanto é aportado e quanto é juros, gráfico ano a ano, cenários de rentabilidade, tabela ano a ano e **quanto aportar para chegar a uma meta**. Cada carteira guarda o seu plano |
| Extras | desfazer/refazer (Ctrl+Z), planilha CSV, carteiras múltiplas (renomear, duplicar, excluir) |

Limites: 8 classes, 30 ativos por classe, 20 carteiras por conta.

## Rodar no seu computador

Precisa do Node 18+.

```powershell
npm test        # testes da lógica e da trava de segurança do build
npm run dev     # abre em http://localhost:5173 (modo visitante)
```

O SQL do Supabase tem teste próprio, que roda o `schema.sql` num Postgres de verdade (em memória) e confere as regras
de segurança: cada pessoa só vê as próprias carteiras, anônimo não acessa nada, limite de 20, dados inválidos recusados.

```powershell
cd sql-test
npm install     # só na primeira vez
npm test
```

> Rode esse teste **sempre que mudar o `supabase/schema.sql`**. Ele existe porque uma política que consultava a própria
> tabela passou despercebida e só falhou no Supabase real (`infinite recursion detected in policy`).

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

### 4b. Entrar com o Google (opcional)

O botão **Continuar com o Google** aparece sozinho na tela de login assim que o Google estiver ligado no Supabase (o app pergunta
isso ao Supabase; não precisa de novo deploy). A conta é criada no primeiro acesso.

1. Em console.cloud.google.com, crie (ou escolha) um projeto. Em **APIs e serviços > Tela de permissão OAuth**, configure o app
   (nome, e-mail de suporte, tipo **Externo**) e publique-o.
2. Em **Credenciais > Criar credenciais > ID do cliente OAuth**, tipo **Aplicativo da Web**.
   Em **URIs de redirecionamento autorizados**, ponha: `https://SEU-PROJETO.supabase.co/auth/v1/callback`
   (o endereço está em *Authentication > Sign In / Providers > Google*, campo "Callback URL").
3. Copie o **ID do cliente** e a **chave secreta do cliente**.
4. No Supabase: **Authentication > Sign In / Providers > Google**, ligue, cole os dois valores e salve.
   A chave secreta fica só no Supabase; nunca no código nem no Render.

Dentro do Framer (iframe) o Google **não deixa** abrir o login; por isso, ali, o botão abre o app em outra aba, em tela cheia, e
a pessoa continua por lá. Se um e-mail já tem conta com senha, o Supabase junta as duas formas de entrada na mesma conta.

### 4c. Instalar no celular (app para Android e iPhone)

O site é um **PWA**: dá para instalá-lo como app, com ícone na tela inicial e abertura em tela cheia, sem loja e sem custo.
Depois do deploy, abra `https://montador-carteira.onrender.com` **direto no navegador do celular** (não dentro do Framer):

- **Android (Chrome):** aparece uma faixa "Instale o app" com o botão **Instalar**. Se não aparecer: menu ⋮ > **Instalar app**
  (ou *Adicionar à tela inicial*).
- **iPhone/iPad (Safari):** não existe botão; a faixa explica: toque em **Compartilhar** (o quadrado com a seta) >
  **Adicionar à Tela de Início**. Vale também para o Chrome do iPhone, no iOS 16.4 ou mais novo.

O que vale saber:

- **Conta:** dentro do app instalado, entre de novo com e-mail e senha. No iPhone, o app instalado e o Safari **não dividem o
  login**. O link do e-mail de confirmação abre no navegador; confirme lá e depois entre no app.
- **Google:** o login pelo botão do Google dentro do app instalado pode não funcionar em todos os aparelhos. Se der problema,
  use e-mail e senha.
- **Sem internet:** a tela abre (o service worker guarda os arquivos), mas as carteiras vêm do Supabase e precisam de internet.
- **Planilha:** no celular, **Baixar planilha** abre a folha de compartilhar (salvar em Arquivos, WhatsApp, e-mail...).
- **Atualização:** com internet o app sempre carrega a versão mais nova (estratégia "rede primeiro" em `public/sw.js`).
  Se mudar a lista de arquivos guardados, aumente `VERSAO` no `sw.js` para limpar as cópias antigas.
- **Ícones:** são gerados por `node scripts/gerar-icones.js` (sem dependências), a partir do mesmo desenho do gráfico.

**Lojas (opcional, com custo):** dá para empacotar este mesmo site. *Play Store:* conta de desenvolvedor Google (taxa única de
US$ 25) e um pacote TWA (PWABuilder), com o arquivo `/.well-known/assetlinks.json` no site. *App Store:* conta Apple Developer
(US$ 99/ano), um Mac com Xcode (ou um serviço de build na nuvem) e um empacotador (Capacitor). A Apple costuma recusar apps que
são só um site embrulhado; por isso o PWA instalável é o caminho recomendado para o iPhone.

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

- **Login obrigatório:** o app só monta a carteira depois da sessão confirmada pelo Supabase. A tela de login é uma tela à parte
  (`#telaLogin`); a do app (`#app`) fica `hidden` e vazia enquanto não há sessão. Isso esconde a carteira de quem saiu, mas quem
  protege os dados de verdade continua sendo a RLS do banco.
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
  grafico.js            rosca, barras e colunas empilhadas em SVG/HTML
  simulador.js          tela do simulador de juros compostos
  armazenamento.js      navegador (visitante) e Supabase (conta)
  app.js                tela, desfazer, metas, aporte, login, convite para instalar
  manifest.json, sw.js  app instalável (PWA) e abertura sem internet
  icones/               ícones do app (gerados por scripts/gerar-icones.js)
  vendor/supabase.js    biblioteca do Supabase (cópia local)
  config.js             gerado no build (não vai para o Git)
supabase/schema.sql     tabela, RLS e gatilho
scripts/                gerar-config.js (build), servir.js (local)
test/                   logica.test.js, config.test.js, pwa.test.js
sql-test/               testa o supabase/schema.sql num Postgres em memória (PGlite)
framer/embed.html       código para colar no Framer
render.yaml             Blueprint do Render
```

> Ferramenta de simulação, sem caráter de recomendação de investimento.
