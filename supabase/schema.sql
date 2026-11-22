-- Montador de Carteira: tabela de carteiras + regras de segurança (RLS).
--
-- Como usar: no painel do Supabase, SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Segurança em uma frase: o navegador usa a chave pública (anon), e é ESTE arquivo que impede
-- uma pessoa de ler ou alterar a carteira de outra (cada política compara user_id com auth.uid()).

create table if not exists public.carteiras (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome          text not null default 'Minha carteira' check (char_length(nome) between 1 and 60),
  dados         jsonb not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint carteiras_dados_objeto  check (jsonb_typeof(dados) = 'object'),
  constraint carteiras_dados_tamanho check (octet_length(dados::text) <= 100000)
);

create index if not exists carteiras_user_atualizado_idx
  on public.carteiras (user_id, atualizado_em desc);

-- Nada de acesso anônimo; só quem fez login mexe na tabela, e só nas próprias linhas.
alter table public.carteiras enable row level security;

revoke all on public.carteiras from anon;
revoke all on public.carteiras from public;
grant select, insert, update, delete on public.carteiras to authenticated;

drop policy if exists carteiras_ver_proprias on public.carteiras;
create policy carteiras_ver_proprias on public.carteiras
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ATENÇÃO: uma política NÃO pode consultar a própria tabela (dá "infinite recursion detected in
-- policy"). Por isso o limite de 20 carteiras fica num gatilho, mais abaixo, e não aqui.
drop policy if exists carteiras_criar_proprias on public.carteiras;
create policy carteiras_criar_proprias on public.carteiras
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists carteiras_alterar_proprias on public.carteiras;
create policy carteiras_alterar_proprias on public.carteiras
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists carteiras_apagar_proprias on public.carteiras;
create policy carteiras_apagar_proprias on public.carteiras
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Atualiza "atualizado_em" sozinho e impede trocar o dono ou a data de criação.
create or replace function public.carteiras_antes_de_atualizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.user_id := old.user_id;
  new.criado_em := old.criado_em;
  return new;
end;
$$;

drop trigger if exists carteiras_atualizado_em on public.carteiras;
create trigger carteiras_atualizado_em
  before update on public.carteiras
  for each row execute function public.carteiras_antes_de_atualizar();

-- Limite de 20 carteiras por pessoa (o app mostra o mesmo limite). A contagem roda com os direitos
-- de quem está inserindo, então enxerga só as próprias carteiras (RLS), e nada vaza.
create or replace function public.carteiras_limite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.carteiras where user_id = new.user_id) >= 20 then
    raise exception 'Limite de 20 carteiras por pessoa' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists carteiras_limite_insercao on public.carteiras;
create trigger carteiras_limite_insercao
  before insert on public.carteiras
  for each row execute function public.carteiras_limite();

-- Conferência rápida (opcional): deve listar 4 políticas e rowsecurity = true.
-- select policyname, cmd from pg_policies where tablename = 'carteiras';
-- select relrowsecurity from pg_class where oid = 'public.carteiras'::regclass;
