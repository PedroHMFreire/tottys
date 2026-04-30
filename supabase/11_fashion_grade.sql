-- ============================================================
-- Fase 11: Grade de Moda (Coleções, Variantes, Estoque por Grade)
-- Execução idempotente — seguro re-rodar a qualquer momento.
-- ============================================================

-- ============================================================
-- 1. TABELA: collections
-- ============================================================
create table if not exists public.collections (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references public.companies(id) on delete cascade,
  nome        text        not null,
  temporada   text,                                     -- 'Inverno', 'Verão', etc.
  ano         integer,
  status      text        not null default 'ATIVA',     -- ATIVA | ENCERRADA | RASCUNHO
  created_at  timestamptz default now()
);

-- ============================================================
-- 2. COLUNAS NOVAS em products
-- ============================================================
alter table public.products
  add column if not exists has_variants   boolean not null default false,
  add column if not exists collection_id  uuid    references public.collections(id) on delete set null;

-- ============================================================
-- 3. TABELA: product_variants
-- ============================================================
create table if not exists public.product_variants (
  id             uuid     primary key default gen_random_uuid(),
  product_id     uuid     not null references public.products(id) on delete cascade,
  tamanho        text     not null,
  cor            text     not null,
  sku            text,
  ean            text,
  price_override numeric,                               -- NULL = herda preço do produto pai
  created_at     timestamptz default now(),
  unique (product_id, tamanho, cor)
);

-- ============================================================
-- 4. TABELA: variant_stock
-- ============================================================
create table if not exists public.variant_stock (
  store_id   uuid    not null references public.stores(id) on delete cascade,
  variant_id uuid    not null references public.product_variants(id) on delete cascade,
  qty        numeric not null default 0,
  updated_at timestamptz default now(),
  primary key (store_id, variant_id)
);

-- ============================================================
-- 5. COLUNA variant_id em sale_items
-- ============================================================
alter table public.sale_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null;

-- ============================================================
-- 6. COLUNA variant_id em stock_movements
-- ============================================================
alter table public.stock_movements
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null;

-- ============================================================
-- 7. RLS — collections, product_variants, variant_stock
-- ============================================================

-- 7a. collections
alter table public.collections enable row level security;

do $$
begin
  -- SELECT
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'collections' and policyname = 'collections_select'
  ) then
    create policy collections_select on public.collections
      for select
      using (
        company_id = public.current_company_id()
        or public.current_role() = 'OWNER'
      );
  end if;

  -- INSERT
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'collections' and policyname = 'collections_insert'
  ) then
    create policy collections_insert on public.collections
      for insert
      with check (
        public.current_role() in ('OWNER','ADMIN','GERENTE')
        and (company_id = public.current_company_id() or public.current_role() = 'OWNER')
      );
  end if;

  -- UPDATE
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'collections' and policyname = 'collections_update'
  ) then
    create policy collections_update on public.collections
      for update
      using (
        public.current_role() in ('OWNER','ADMIN','GERENTE')
        and (company_id = public.current_company_id() or public.current_role() = 'OWNER')
      )
      with check (
        public.current_role() in ('OWNER','ADMIN','GERENTE')
        and (company_id = public.current_company_id() or public.current_role() = 'OWNER')
      );
  end if;

  -- DELETE
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'collections' and policyname = 'collections_delete'
  ) then
    create policy collections_delete on public.collections
      for delete
      using (
        public.current_role() in ('OWNER','ADMIN','GERENTE')
        and (company_id = public.current_company_id() or public.current_role() = 'OWNER')
      );
  end if;
end $$;

-- 7b. product_variants
alter table public.product_variants enable row level security;

do $$
begin
  -- SELECT
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_variants' and policyname = 'product_variants_select'
  ) then
    create policy product_variants_select on public.product_variants
      for select
      using (
        product_id in (
          select id from public.products
          where company_id = public.current_company_id()
        )
        or public.current_role() = 'OWNER'
      );
  end if;

  -- INSERT
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_variants' and policyname = 'product_variants_insert'
  ) then
    create policy product_variants_insert on public.product_variants
      for insert
      with check (
        public.current_role() in ('OWNER','ADMIN','GERENTE')
      );
  end if;

  -- UPDATE
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_variants' and policyname = 'product_variants_update'
  ) then
    create policy product_variants_update on public.product_variants
      for update
      using  (public.current_role() in ('OWNER','ADMIN','GERENTE'))
      with check (public.current_role() in ('OWNER','ADMIN','GERENTE'));
  end if;

  -- DELETE
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_variants' and policyname = 'product_variants_delete'
  ) then
    create policy product_variants_delete on public.product_variants
      for delete
      using (public.current_role() in ('OWNER','ADMIN','GERENTE'));
  end if;
end $$;

-- 7c. variant_stock
alter table public.variant_stock enable row level security;

do $$
begin
  -- SELECT
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'variant_stock' and policyname = 'variant_stock_select'
  ) then
    create policy variant_stock_select on public.variant_stock
      for select
      using (public.user_has_store_access(store_id));
  end if;

  -- INSERT
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'variant_stock' and policyname = 'variant_stock_insert'
  ) then
    create policy variant_stock_insert on public.variant_stock
      for insert
      with check (public.user_has_store_access(store_id));
  end if;

  -- UPDATE
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'variant_stock' and policyname = 'variant_stock_update'
  ) then
    create policy variant_stock_update on public.variant_stock
      for update
      using  (public.user_has_store_access(store_id))
      with check (public.user_has_store_access(store_id));
  end if;

  -- DELETE
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'variant_stock' and policyname = 'variant_stock_delete'
  ) then
    create policy variant_stock_delete on public.variant_stock
      for delete
      using (public.user_has_store_access(store_id));
  end if;
end $$;

-- ============================================================
-- 8. ÍNDICES
-- ============================================================
create index if not exists collections_company_idx       on public.collections(company_id);
create index if not exists product_variants_product_idx  on public.product_variants(product_id);
create index if not exists product_variants_sku_idx      on public.product_variants(sku);
create index if not exists product_variants_ean_idx      on public.product_variants(ean);
create index if not exists variant_stock_variant_idx     on public.variant_stock(variant_id);

-- ============================================================
-- 9. VIEW: v_grade_stock
--    Estoque por variante × loja
-- ============================================================
create or replace view public.v_grade_stock as
select
  pv.product_id,
  pv.id                  as variant_id,
  pv.tamanho,
  pv.cor,
  pv.sku                 as variant_sku,
  pv.ean                 as variant_ean,
  pv.price_override,
  vs.store_id,
  coalesce(vs.qty, 0)    as qty
from public.product_variants pv
left join public.variant_stock vs on vs.variant_id = pv.id;

-- ============================================================
-- 10. VIEW: v_grade_ruptura
--     Variantes zeradas onde o mesmo produto tem outro tamanho/cor
--     com saldo positivo na mesma loja (grade quebrada).
-- ============================================================
create or replace view public.v_grade_ruptura as
select
  pv.product_id,
  p.nome       as produto_nome,
  p.sku        as produto_sku,
  pv.id        as variant_id,
  pv.tamanho,
  pv.cor,
  vs.store_id,
  coalesce(vs.qty, 0) as qty
from public.product_variants pv
join public.products p on p.id = pv.product_id
left join public.variant_stock vs on vs.variant_id = pv.id
where coalesce(vs.qty, 0) = 0
  and exists (
    select 1
    from public.product_variants pv2
    join public.variant_stock vs2 on vs2.variant_id = pv2.id
    where pv2.product_id = pv.product_id
      and vs2.store_id   = vs.store_id
      and vs2.qty > 0
  );

-- ============================================================
-- 11. FUNÇÃO: variant_stock_adjust
--     Ajusta saldo de uma variante e registra movimento.
-- ============================================================
create or replace function public.variant_stock_adjust(
  p_company_id uuid,
  p_store_id   uuid,
  p_variant_id uuid,
  p_qty        numeric,
  p_type       text,
  p_reason     text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role       text;
  v_my_company uuid;
  v_product_id uuid;
  v_current    numeric;
begin
  -- Validação de papel e empresa
  select role, company_id
    into v_role, v_my_company
    from public.profiles
   where id = auth.uid();

  if v_role not in ('OWNER','ADMIN','GERENTE') then
    raise exception 'Sem permissão para ajustar estoque de variante';
  end if;

  if v_role <> 'OWNER' and v_my_company <> p_company_id then
    raise exception 'Empresa inválida';
  end if;

  -- Obtém o produto pai da variante
  select product_id into v_product_id
    from public.product_variants
   where id = p_variant_id;

  if v_product_id is null then
    raise exception 'Variante não encontrada';
  end if;

  -- Registra movimento (com variant_id)
  insert into public.stock_movements
    (company_id, store_id, product_id, variant_id, user_id, type, qty, reason)
  values
    (p_company_id, p_store_id, v_product_id, p_variant_id, auth.uid(), p_type, p_qty, p_reason);

  -- Upsert do saldo
  select qty into v_current
    from public.variant_stock
   where store_id = p_store_id and variant_id = p_variant_id;

  v_current := coalesce(v_current, 0) + p_qty;
  if v_current < 0 then
    v_current := 0;
  end if;

  insert into public.variant_stock (store_id, variant_id, qty, updated_at)
  values (p_store_id, p_variant_id, v_current, now())
  on conflict (store_id, variant_id)
  do update set
    qty        = excluded.qty,
    updated_at = excluded.updated_at;
end;
$$;

-- ============================================================
-- 12. FUNÇÃO: post_sale_stock (atualizada)
--     Baixa estoque pós-venda:
--       • variant_id IS NOT NULL → baixa variant_stock
--       • variant_id IS NULL     → baixa product_stock (comportamento original)
-- ============================================================
create or replace function public.post_sale_stock(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id   uuid;
  v_company_id uuid;
  r            record;
  v_current    numeric;
begin
  -- Obtém store e company da venda
  select s.store_id, st.company_id
    into v_store_id, v_company_id
    from public.sales s
    join public.stores st on st.id = s.store_id
   where s.id = p_sale_id;

  if v_store_id is null then
    raise exception 'Venda inválida';
  end if;

  if not public.user_has_store_access(v_store_id) then
    raise exception 'Sem permissão para baixar estoque';
  end if;

  -- Itera sobre os itens da venda
  for r in
    select product_id, variant_id, qtde
      from public.sale_items
     where sale_id = p_sale_id
  loop

    if r.variant_id is not null then
      -- ── Produto com grade: baixa variant_stock ──────────────
      select qty into v_current
        from public.variant_stock
       where store_id = v_store_id and variant_id = r.variant_id;

      v_current := coalesce(v_current, 0) - r.qtde;
      if v_current < 0 then v_current := 0; end if;

      insert into public.variant_stock (store_id, variant_id, qty, updated_at)
      values (v_store_id, r.variant_id, v_current, now())
      on conflict (store_id, variant_id)
      do update set
        qty        = excluded.qty,
        updated_at = excluded.updated_at;

      insert into public.stock_movements
        (company_id, store_id, product_id, variant_id, user_id, type, qty, reason)
      values
        (v_company_id, v_store_id, r.product_id, r.variant_id, auth.uid(), 'SAIDA', -r.qtde, 'VENDA');

    else
      -- ── Produto simples: baixa product_stock (legado) ───────
      select qty into v_current
        from public.product_stock
       where store_id = v_store_id and product_id = r.product_id;

      v_current := coalesce(v_current, 0) - r.qtde;
      if v_current < 0 then v_current := 0; end if;

      insert into public.product_stock (store_id, product_id, qty)
      values (v_store_id, r.product_id, v_current)
      on conflict (store_id, product_id)
      do update set qty = excluded.qty;

      insert into public.stock_movements
        (company_id, store_id, product_id, user_id, type, qty, reason)
      values
        (v_company_id, v_store_id, r.product_id, auth.uid(), 'SAIDA', -r.qtde, 'VENDA');

    end if;

  end loop;
end;
$$;
