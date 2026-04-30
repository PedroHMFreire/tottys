-- ============================================================
-- Fase 14: Troca e Devolução
-- Execução idempotente — seguro re-rodar a qualquer momento.
-- ============================================================

-- ============================================================
-- 1. Adicionar crédito disponível na tabela customers
-- ============================================================
alter table public.customers
  add column if not exists credito_disponivel numeric default 0;

-- ============================================================
-- 2. TABELA: trocas
-- ============================================================
create table if not exists public.trocas (
  id               uuid        primary key default gen_random_uuid(),
  company_id       uuid        not null references public.companies(id) on delete cascade,
  store_id         uuid        references public.stores(id),
  customer_id      uuid        references public.customers(id),
  user_id          uuid        references public.profiles(id),
  tipo             text        not null default 'TROCA',   -- TROCA | DEVOLUCAO
  status           text        not null default 'CONCLUIDA',
  valor_total      numeric     not null default 0,
  forma_devolucao  text        not null default 'CREDITO', -- CREDITO | DINHEIRO
  observacoes      text,
  created_at       timestamptz default now()
);

create index if not exists idx_trocas_company  on public.trocas(company_id);
create index if not exists idx_trocas_customer on public.trocas(customer_id);

-- ============================================================
-- 3. TABELA: troca_items
-- ============================================================
create table if not exists public.troca_items (
  id          uuid     primary key default gen_random_uuid(),
  troca_id    uuid     not null references public.trocas(id) on delete cascade,
  product_id  uuid     references public.products(id),
  variant_id  uuid     references public.product_variants(id),
  sku         text,
  nome        text     not null,
  qtde        integer  not null default 1,
  preco_unit  numeric  not null default 0,
  motivo      text     default 'NAO_GOSTOU' -- DEFEITO | TAMANHO_ERRADO | NAO_GOSTOU | OUTRO
);

create index if not exists idx_troca_items_troca on public.troca_items(troca_id);

-- ============================================================
-- 4. RLS — trocas
-- ============================================================
alter table public.trocas enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trocas' and policyname='tr_select') then
    create policy tr_select on public.trocas for select
      using (company_id = public.current_company_id() or public.current_role() = 'OWNER');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trocas' and policyname='tr_insert') then
    create policy tr_insert on public.trocas for insert
      with check (company_id = public.current_company_id() or public.current_role() = 'OWNER');
  end if;
end $$;

-- ============================================================
-- 5. RLS — troca_items
-- ============================================================
alter table public.troca_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='troca_items' and policyname='ti_select') then
    create policy ti_select on public.troca_items for select
      using (exists (
        select 1 from public.trocas t
         where t.id = troca_id
           and (t.company_id = public.current_company_id() or public.current_role() = 'OWNER')
      ));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='troca_items' and policyname='ti_insert') then
    create policy ti_insert on public.troca_items for insert
      with check (exists (
        select 1 from public.trocas t
         where t.id = troca_id
           and (t.company_id = public.current_company_id() or public.current_role() = 'OWNER')
      ));
  end if;
end $$;

-- ============================================================
-- 6. FUNÇÃO: registrar_troca
-- ============================================================
create or replace function public.registrar_troca(
  p_company_id      uuid,
  p_store_id        uuid,
  p_customer_id     uuid,
  p_tipo            text,
  p_forma_devolucao text,
  p_valor_total     numeric,
  p_observacoes     text,
  p_items           jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_troca_id  uuid;
  v_item      jsonb;
  v_vid       uuid;
  v_role      text;
  v_company   uuid;
begin
  select role, company_id into v_role, v_company
    from public.profiles where id = auth.uid();

  if v_role not in ('OWNER','ADMIN','GERENTE','GESTOR','VENDEDOR','CAIXA') then
    raise exception 'Sem permissão para registrar troca';
  end if;
  if v_role <> 'OWNER' and v_company <> p_company_id then
    raise exception 'Empresa inválida';
  end if;

  insert into public.trocas (
    company_id, store_id, customer_id, user_id,
    tipo, status, valor_total, forma_devolucao, observacoes
  ) values (
    p_company_id, p_store_id, p_customer_id, auth.uid(),
    p_tipo, 'CONCLUIDA', p_valor_total, p_forma_devolucao, p_observacoes
  )
  returning id into v_troca_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_vid := case
      when (v_item->>'variant_id') is not null
        and (v_item->>'variant_id') not in ('', 'null')
      then (v_item->>'variant_id')::uuid
      else null
    end;

    insert into public.troca_items (
      troca_id, product_id, variant_id, sku, nome, qtde, preco_unit, motivo
    ) values (
      v_troca_id,
      case when (v_item->>'product_id') is not null and (v_item->>'product_id') not in ('','null')
           then (v_item->>'product_id')::uuid else null end,
      v_vid,
      v_item->>'sku',
      v_item->>'nome',
      (v_item->>'qtde')::integer,
      (v_item->>'preco_unit')::numeric,
      coalesce(v_item->>'motivo', 'NAO_GOSTOU')
    );

    -- Repõe estoque: variante tem prioridade sobre produto simples
    if v_vid is not null and p_store_id is not null then
      update public.variant_stock
         set qty = qty + (v_item->>'qtde')::integer
       where store_id = p_store_id and variant_id = v_vid;
    elsif (v_item->>'product_id') is not null
       and (v_item->>'product_id') not in ('','null')
       and p_store_id is not null then
      update public.product_stock
         set qty = qty + (v_item->>'qtde')::integer
       where store_id = p_store_id
         and product_id = (v_item->>'product_id')::uuid;
    end if;
  end loop;

  -- Crédito em conta
  if p_forma_devolucao = 'CREDITO'
     and p_customer_id is not null
     and p_valor_total > 0 then
    update public.customers
       set credito_disponivel = coalesce(credito_disponivel, 0) + p_valor_total
     where id = p_customer_id;
  end if;

  return v_troca_id;
end;
$$;
