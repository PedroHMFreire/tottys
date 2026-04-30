-- Fase 1: Segurança e RLS (aplicar após confirmar tabelas)
-- Este script usa DO blocks para evitar falhas quando tabelas ainda não existem.

-- Helper: cria policy se não existir
-- Uso: SELECT create_policy_if_missing('table', 'policy_name', 'USING (...)', 'WITH CHECK (...)');

create or replace function public.create_policy_if_missing(
  p_table text,
  p_policy text,
  p_using text,
  p_check text default null
) returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = p_table and policyname = p_policy
  ) then
    if p_check is null or length(trim(p_check)) = 0 then
      execute format('create policy %I on public.%I for all using (%s)', p_policy, p_table, p_using);
    else
      execute format('create policy %I on public.%I for all using (%s) with check (%s)', p_policy, p_table, p_using, p_check);
    end if;
  end if;
end;
$$;

-- Helper: role do usuário logado
create or replace function public.current_role()
returns text
language sql stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Helper: company_id do usuário logado
create or replace function public.current_company_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- Helper: valida acesso do usuário a uma loja específica
-- OWNER: qualquer loja
-- ADMIN/GERENTE/GESTOR: qualquer loja da própria empresa
-- Demais: apenas lojas vinculadas em user_stores (se existir)
create or replace function public.user_has_store_access(p_store_id uuid)
returns boolean
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_company uuid;
begin
  select role, company_id into v_role, v_company
  from public.profiles where id = auth.uid();

  if v_role = 'OWNER' then
    return true;
  end if;

  if v_role in ('ADMIN','GERENTE','GESTOR') then
    return exists (
      select 1 from public.stores s
      where s.id = p_store_id and s.company_id = v_company
    );
  end if;

  if to_regclass('public.user_stores') is null then
    return exists (
      select 1 from public.stores s
      where s.id = p_store_id and s.company_id = v_company
    );
  end if;

  return exists (
    select 1 from public.user_stores us
    where us.user_id = auth.uid() and us.store_id = p_store_id
  );
end;
$$;

-- Enable RLS + policies
do $$
declare
  v_cash_mov_using text;
begin
  -- companies
  if to_regclass('public.companies') is not null then
    execute 'alter table public.companies enable row level security';
    perform public.create_policy_if_missing(
      'companies',
      'companies_select',
      'id = public.current_company_id() or public.current_role() = ''OWNER'''
    );
    perform public.create_policy_if_missing(
      'companies',
      'companies_write',
      'public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'')',
      'public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'')'
    );
  end if;

  -- stores
  if to_regclass('public.stores') is not null then
    execute 'alter table public.stores enable row level security';
    perform public.create_policy_if_missing(
      'stores',
      'stores_select',
      'public.user_has_store_access(id)'
    );
    perform public.create_policy_if_missing(
      'stores',
      'stores_write',
      'public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and (company_id = public.current_company_id() or public.current_role() = ''OWNER'')',
      'public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and (company_id = public.current_company_id() or public.current_role() = ''OWNER'')'
    );
  end if;

  -- profiles
  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles enable row level security';
    perform public.create_policy_if_missing(
      'profiles',
      'profiles_select',
      'company_id = public.current_company_id() or id = auth.uid() or public.current_role() = ''OWNER'''
    );
    perform public.create_policy_if_missing(
      'profiles',
      'profiles_write_self',
      'id = auth.uid()',
      'id = auth.uid()'
    );
  end if;

  -- user_areas
  if to_regclass('public.user_areas') is not null then
    execute 'alter table public.user_areas enable row level security';
    perform public.create_policy_if_missing(
      'user_areas',
      'user_areas_select',
      'company_id = public.current_company_id() or public.current_role() = ''OWNER'''
    );
    perform public.create_policy_if_missing(
      'user_areas',
      'user_areas_write',
      'public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and (company_id = public.current_company_id() or public.current_role() = ''OWNER'')',
      'public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and (company_id = public.current_company_id() or public.current_role() = ''OWNER'')'
    );
  end if;

  -- products
  if to_regclass('public.products') is not null then
    execute 'alter table public.products enable row level security';
    perform public.create_policy_if_missing(
      'products',
      'products_select',
      'company_id = public.current_company_id() or public.current_role() = ''OWNER'''
    );
    perform public.create_policy_if_missing(
      'products',
      'products_write',
      'public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and (company_id = public.current_company_id() or public.current_role() = ''OWNER'')',
      'public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and (company_id = public.current_company_id() or public.current_role() = ''OWNER'')'
    );
  end if;

  -- customers
  if to_regclass('public.customers') is not null then
    execute 'alter table public.customers enable row level security';
    perform public.create_policy_if_missing(
      'customers',
      'customers_select',
      'company_id = public.current_company_id() or public.current_role() = ''OWNER'''
    );
    perform public.create_policy_if_missing(
      'customers',
      'customers_write',
      'public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and (company_id = public.current_company_id() or public.current_role() = ''OWNER'')',
      'public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and (company_id = public.current_company_id() or public.current_role() = ''OWNER'')'
    );
  end if;

  -- sales
  if to_regclass('public.sales') is not null then
    execute 'alter table public.sales enable row level security';
    perform public.create_policy_if_missing(
      'sales',
      'sales_select',
      'public.user_has_store_access(store_id)'
    );
    perform public.create_policy_if_missing(
      'sales',
      'sales_write',
      'public.user_has_store_access(store_id)',
      'public.user_has_store_access(store_id)'
    );
  end if;

  -- sale_items
  if to_regclass('public.sale_items') is not null then
    execute 'alter table public.sale_items enable row level security';
    perform public.create_policy_if_missing(
      'sale_items',
      'sale_items_select',
      'sale_id in (select id from public.sales where public.user_has_store_access(store_id))'
    );
    perform public.create_policy_if_missing(
      'sale_items',
      'sale_items_write',
      'sale_id in (select id from public.sales where public.user_has_store_access(store_id))',
      'sale_id in (select id from public.sales where public.user_has_store_access(store_id))'
    );
  end if;

  -- payments
  if to_regclass('public.payments') is not null then
    execute 'alter table public.payments enable row level security';
    perform public.create_policy_if_missing(
      'payments',
      'payments_select',
      'sale_id in (select id from public.sales where public.user_has_store_access(store_id))'
    );
    perform public.create_policy_if_missing(
      'payments',
      'payments_write',
      'sale_id in (select id from public.sales where public.user_has_store_access(store_id))',
      'sale_id in (select id from public.sales where public.user_has_store_access(store_id))'
    );
  end if;

  -- cash_sessions
  if to_regclass('public.cash_sessions') is not null then
    execute 'alter table public.cash_sessions enable row level security';
    perform public.create_policy_if_missing(
      'cash_sessions',
      'cash_sessions_select',
      'public.user_has_store_access(store_id)'
    );
    perform public.create_policy_if_missing(
      'cash_sessions',
      'cash_sessions_write',
      'public.user_has_store_access(store_id)',
      'public.user_has_store_access(store_id)'
    );
  end if;

  -- cash_movements
  if to_regclass('public.cash_movements') is not null then
    execute 'alter table public.cash_movements enable row level security';
    -- detect best column to enforce store access
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'cash_movements' and column_name = 'store_id'
    ) then
      v_cash_mov_using := 'public.user_has_store_access(store_id)';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'cash_movements' and column_name = 'cash_id'
    ) then
      v_cash_mov_using := 'cash_id in (select id from public.cash_sessions where public.user_has_store_access(store_id))';
    else
      v_cash_mov_using := 'public.current_role() = ''OWNER''';
    end if;
    perform public.create_policy_if_missing(
      'cash_movements',
      'cash_movements_select',
      v_cash_mov_using
    );
    perform public.create_policy_if_missing(
      'cash_movements',
      'cash_movements_write',
      v_cash_mov_using,
      v_cash_mov_using
    );
  end if;

  -- product_stock
  if to_regclass('public.product_stock') is not null then
    execute 'alter table public.product_stock enable row level security';
    perform public.create_policy_if_missing(
      'product_stock',
      'product_stock_select',
      'public.user_has_store_access(store_id)'
    );
    perform public.create_policy_if_missing(
      'product_stock',
      'product_stock_write',
      'public.user_has_store_access(store_id)',
      'public.user_has_store_access(store_id)'
    );
  end if;

  -- card_rules
  if to_regclass('public.card_rules') is not null then
    execute 'alter table public.card_rules enable row level security';
    perform public.create_policy_if_missing(
      'card_rules',
      'card_rules_select',
      'public.user_has_store_access(store_id)'
    );
    perform public.create_policy_if_missing(
      'card_rules',
      'card_rules_write',
      'public.user_has_store_access(store_id)',
      'public.user_has_store_access(store_id)'
    );
  end if;

  -- stock_movements
  if to_regclass('public.stock_movements') is not null then
    execute 'alter table public.stock_movements enable row level security';
    perform public.create_policy_if_missing(
      'stock_movements',
      'stock_movements_select',
      'public.user_has_store_access(store_id)'
    );
    perform public.create_policy_if_missing(
      'stock_movements',
      'stock_movements_write',
      'public.user_has_store_access(store_id)',
      'public.user_has_store_access(store_id)'
    );
  end if;

  -- stock_transfers
  if to_regclass('public.stock_transfers') is not null then
    execute 'alter table public.stock_transfers enable row level security';
    perform public.create_policy_if_missing(
      'stock_transfers',
      'stock_transfers_select',
      'company_id = public.current_company_id() or public.current_role() = ''OWNER'''
    );
    perform public.create_policy_if_missing(
      'stock_transfers',
      'stock_transfers_write',
      'public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and (company_id = public.current_company_id() or public.current_role() = ''OWNER'')',
      'public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and (company_id = public.current_company_id() or public.current_role() = ''OWNER'')'
    );
  end if;

  -- stock_transfer_items
  if to_regclass('public.stock_transfer_items') is not null then
    execute 'alter table public.stock_transfer_items enable row level security';
    perform public.create_policy_if_missing(
      'stock_transfer_items',
      'stock_transfer_items_select',
      'transfer_id in (select id from public.stock_transfers where company_id = public.current_company_id()) or public.current_role() = ''OWNER'''
    );
    perform public.create_policy_if_missing(
      'stock_transfer_items',
      'stock_transfer_items_write',
      'transfer_id in (select id from public.stock_transfers where company_id = public.current_company_id()) or public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'')',
      'transfer_id in (select id from public.stock_transfers where company_id = public.current_company_id()) or public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'')'
    );
  end if;

  -- user_stores
  if to_regclass('public.user_stores') is not null then
    execute 'alter table public.user_stores enable row level security';
    perform public.create_policy_if_missing(
      'user_stores',
      'user_stores_select',
      'user_id = auth.uid() or (public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and company_id = public.current_company_id())'
    );
    perform public.create_policy_if_missing(
      'user_stores',
      'user_stores_write',
      '(public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and company_id = public.current_company_id())',
      '(public.current_role() in (''OWNER'',''ADMIN'',''GERENTE'') and company_id = public.current_company_id())'
    );
  end if;
end $$;
