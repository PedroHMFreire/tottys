-- Fase 4: Estrutura de estoque e movimentos (não aplicar ainda)

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  user_id uuid references public.profiles(id),
  type text not null, -- ENTRADA | AJUSTE_POSITIVO | AJUSTE_NEGATIVO | SAIDA | TRANSFER_OUT | TRANSFER_IN
  qty numeric not null,
  reason text,
  created_at timestamp with time zone default now()
);

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  from_store uuid references public.stores(id),
  to_store uuid references public.stores(id),
  status text not null default 'SOLICITADA',
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default now()
);

create table if not exists public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid references public.stock_transfers(id) on delete cascade,
  product_id uuid references public.products(id),
  qty numeric not null
);

-- RPC sugerida: aplica ajuste e atualiza product_stock
create or replace function public.stock_adjust(
  p_company_id uuid,
  p_store_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_type text,
  p_reason text default null
) returns void
language plpgsql
security definer
as $$
declare
  v_role text;
  v_my_company uuid;
  v_current numeric;
begin
  select role, company_id into v_role, v_my_company from public.profiles where id = auth.uid();
  if v_role not in ('OWNER','ADMIN','GERENTE') then
    raise exception 'Sem permissão';
  end if;
  if v_role <> 'OWNER' and v_my_company <> p_company_id then
    raise exception 'Empresa inválida';
  end if;

  -- movimento
  insert into public.stock_movements(company_id, store_id, product_id, user_id, type, qty, reason)
  values (p_company_id, p_store_id, p_product_id, auth.uid(), p_type, p_qty, p_reason);

  -- saldo
  select qty into v_current from public.product_stock
   where store_id = p_store_id and product_id = p_product_id;
  v_current := coalesce(v_current, 0) + p_qty;
  if v_current < 0 then v_current := 0; end if;

  insert into public.product_stock(store_id, product_id, qty)
  values (p_store_id, p_product_id, v_current)
  on conflict (store_id, product_id) do update set qty = excluded.qty;
end;
$$;
