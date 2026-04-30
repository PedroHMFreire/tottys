-- ============================================================
-- 21_fix_companies_rls.sql
-- Corrige o RLS de companies e cria a RPC create_company_with_store
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor)
-- ============================================================

-- ── 1. Recriar policies de companies sem conflito ─────────────
alter table public.companies enable row level security;

drop policy if exists companies_select on public.companies;
drop policy if exists companies_write  on public.companies;

-- SELECT: vê sua empresa (pelo company_id do perfil) OU é OWNER global
create policy companies_select on public.companies
  for select
  using (
    id = public.current_company_id()
    or public.current_role() = 'OWNER'
  );

-- INSERT / UPDATE / DELETE: OWNER pode tudo; GERENTE/ADMIN só sua empresa
create policy companies_write on public.companies
  for all
  using (
    public.current_role() = 'OWNER'
    or (
      public.current_role() in ('ADMIN','GERENTE')
      and id = public.current_company_id()
    )
  )
  with check (
    public.current_role() = 'OWNER'
    or public.current_role() in ('ADMIN','GERENTE')
  );

-- ── 2. RPC create_company_with_store (SECURITY DEFINER) ──────
-- Roda como postgres, bypassa RLS. Retorna o UUID da nova empresa.
create or replace function public.create_company_with_store(
  p_nome         text,
  p_cnpj         text    default null,
  p_regime       text    default null,
  p_create_store boolean default true,
  p_store_nome   text    default 'Loja Principal',
  p_store_uf     text    default 'SP',
  p_ambiente     text    default 'homologacao'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_store_id   uuid;
begin
  -- Cria a empresa
  insert into public.companies (nome, cnpj, regime_tributario)
  values (
    trim(p_nome),
    nullif(trim(coalesce(p_cnpj,'')), ''),
    nullif(trim(coalesce(p_regime,'')), '')
  )
  returning id into v_company_id;

  -- Cria a loja principal se solicitado
  if p_create_store then
    insert into public.stores (company_id, nome, uf, ambiente_fiscal)
    values (
      v_company_id,
      coalesce(nullif(trim(p_store_nome),''), 'Loja Principal'),
      upper(trim(p_store_uf)),
      coalesce(nullif(trim(p_ambiente),''), 'homologacao')
    )
    returning id into v_store_id;
  end if;

  return v_company_id;
end;
$$;

-- Garante que qualquer usuário autenticado pode chamar a RPC
-- (o SECURITY DEFINER já protege; a própria função pode checar o role)
grant execute on function public.create_company_with_store(
  text, text, text, boolean, text, text, text
) to authenticated;

-- ── 3. Corrige policy de stores também (mesma lógica) ────────
drop policy if exists stores_select on public.stores;
drop policy if exists stores_write  on public.stores;

create policy stores_select on public.stores
  for select
  using (
    public.user_has_store_access(id)
    or public.current_role() = 'OWNER'
  );

create policy stores_write on public.stores
  for all
  using (
    public.current_role() = 'OWNER'
    or (
      public.current_role() in ('ADMIN','GERENTE')
      and company_id = public.current_company_id()
    )
  )
  with check (
    public.current_role() = 'OWNER'
    or (
      public.current_role() in ('ADMIN','GERENTE')
      and company_id = public.current_company_id()
    )
  );
