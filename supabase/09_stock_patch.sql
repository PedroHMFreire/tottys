-- Fase 9: Ajustes completos de estoque e views

create table if not exists public.product_stock (
  store_id uuid references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  qty numeric not null default 0,
  updated_at timestamp with time zone default now(),
  primary key (store_id, product_id)
);

-- Ajuste de coluna opcional para notas em transferências
alter table public.stock_transfers
  add column if not exists notes text;

-- View: posição de estoque por loja/produto
create or replace view public.v_stock_position_detail as
select
  st.company_id,
  ps.product_id,
  p.sku,
  p.nome as produto,
  ps.store_id,
  st.nome as loja,
  ps.qty as saldo,
  max(sm.created_at) as last_move_at
from public.product_stock ps
join public.products p on p.id = ps.product_id
join public.stores st on st.id = ps.store_id
left join public.stock_movements sm
  on sm.product_id = ps.product_id and sm.store_id = ps.store_id
group by st.company_id, ps.product_id, p.sku, p.nome, ps.store_id, st.nome, ps.qty;

-- RPC: solicita transferência
create or replace function public.request_transfer(
  p_company_id uuid,
  p_from_store uuid,
  p_to_store uuid,
  p_notes text default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_role text;
  v_my_company uuid;
  v_id uuid;
begin
  select role, company_id into v_role, v_my_company from public.profiles where id = auth.uid();
  if v_role not in ('OWNER','ADMIN','GERENTE') then
    raise exception 'Sem permissão';
  end if;
  if v_role <> 'OWNER' and v_my_company <> p_company_id then
    raise exception 'Empresa inválida';
  end if;
  insert into public.stock_transfers (company_id, from_store, to_store, status, created_by, notes)
  values (p_company_id, p_from_store, p_to_store, 'SOLICITADA', auth.uid(), p_notes)
  returning id into v_id;
  return v_id;
end;
$$;

-- RPC: adiciona item à transferência
create or replace function public.add_transfer_item(
  p_transfer_id uuid,
  p_product_id uuid,
  p_qty numeric
) returns void
language plpgsql
security definer
as $$
declare
  v_company uuid;
  v_role text;
begin
  select role, company_id into v_role, v_company from public.profiles where id = auth.uid();
  if v_role not in ('OWNER','ADMIN','GERENTE') then
    raise exception 'Sem permissão';
  end if;

  if not exists (
    select 1 from public.stock_transfers t
    where t.id = p_transfer_id and (v_role = 'OWNER' or t.company_id = v_company)
  ) then
    raise exception 'Transferência inválida';
  end if;

  insert into public.stock_transfer_items (transfer_id, product_id, qty)
  values (p_transfer_id, p_product_id, p_qty);
end;
$$;

-- RPC: baixa estoque após venda
create or replace function public.post_sale_stock(p_sale_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_store_id uuid;
  v_company_id uuid;
  r record;
  v_current numeric;
begin
  select s.store_id, st.company_id into v_store_id, v_company_id
  from public.sales s
  join public.stores st on st.id = s.store_id
  where s.id = p_sale_id;

  if v_store_id is null then
    raise exception 'Venda inválida';
  end if;

  if not public.user_has_store_access(v_store_id) then
    raise exception 'Sem permissão para baixar estoque';
  end if;

  for r in
    select product_id, qtde from public.sale_items where sale_id = p_sale_id
  loop
    select qty into v_current from public.product_stock
     where store_id = v_store_id and product_id = r.product_id;
    v_current := coalesce(v_current, 0) - r.qtde;
    if v_current < 0 then v_current := 0; end if;

    insert into public.product_stock(store_id, product_id, qty)
    values (v_store_id, r.product_id, v_current)
    on conflict (store_id, product_id) do update set qty = excluded.qty;

    insert into public.stock_movements(company_id, store_id, product_id, user_id, type, qty, reason)
    values (v_company_id, v_store_id, r.product_id, auth.uid(), 'SAIDA', -r.qtde, 'VENDA');
  end loop;
end;
$$;
