-- Fase 5: Caixa e movimentos financeiros

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid references public.profiles(id),
  abertura_at timestamp with time zone default now(),
  fechamento_at timestamp with time zone,
  valor_inicial numeric not null default 0,
  valor_final numeric,
  status text not null default 'ABERTO'
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_id uuid references public.cash_sessions(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid references public.profiles(id),
  tipo text not null, -- SUPRIMENTO | SANGRIA | VENDA
  valor numeric not null,
  motivo text,
  created_at timestamp with time zone default now()
);

-- View para totais de caixa (ajuste conforme schema real)
drop view if exists public.v_cash_session_totals;
create view public.v_cash_session_totals as
select
  c.id as cash_id,
  c.valor_inicial,
  coalesce(sum(case when m.tipo = 'VENDA' and m.motivo = 'DINHEIRO' then m.valor end), 0) as dinheiro,
  coalesce(sum(case when m.tipo = 'VENDA' and m.motivo = 'PIX' then m.valor end), 0) as pix,
  coalesce(sum(case when m.tipo = 'VENDA' and m.motivo = 'CARTAO' then m.valor end), 0) as cartao,
  coalesce(sum(case when m.tipo = 'SUPRIMENTO' then m.valor end), 0) as suprimentos,
  coalesce(sum(case when m.tipo = 'SANGRIA' then m.valor end), 0) as sangrias
from public.cash_sessions c
left join public.cash_movements m on m.cash_id = c.id
group by c.id;

-- RPCs de caixa
create or replace function public.get_open_cash(p_store_id uuid)
returns table (
  id uuid,
  store_id uuid,
  user_id uuid,
  abertura_at timestamp with time zone,
  fechamento_at timestamp with time zone,
  valor_inicial numeric,
  valor_final numeric,
  status text
)
language plpgsql
security definer
as $$
begin
  if not public.user_has_store_access(p_store_id) then
    raise exception 'Sem permissão para acessar esta loja';
  end if;
  return query
    select c.id, c.store_id, c.user_id, c.abertura_at, c.fechamento_at, c.valor_inicial, c.valor_final, c.status
    from public.cash_sessions c
    where c.store_id = p_store_id and c.status = 'ABERTO'
    order by c.abertura_at desc
    limit 1;
end;
$$;

create or replace function public.abrir_caixa(p_store_id uuid, p_valor_inicial numeric)
returns table (
  id uuid,
  store_id uuid,
  user_id uuid,
  abertura_at timestamp with time zone,
  fechamento_at timestamp with time zone,
  valor_inicial numeric,
  valor_final numeric,
  status text
)
language plpgsql
security definer
as $$
begin
  if not public.user_has_store_access(p_store_id) then
    raise exception 'Sem permissão para abrir caixa nesta loja';
  end if;
  if exists (select 1 from public.cash_sessions c where c.store_id = p_store_id and c.status = 'ABERTO') then
    raise exception 'Já existe um caixa aberto para esta loja';
  end if;

  insert into public.cash_sessions (store_id, user_id, valor_inicial, status)
  values (p_store_id, auth.uid(), coalesce(p_valor_inicial, 0), 'ABERTO');

  return query
    select c.id, c.store_id, c.user_id, c.abertura_at, c.fechamento_at, c.valor_inicial, c.valor_final, c.status
    from public.cash_sessions c
    where c.store_id = p_store_id and c.status = 'ABERTO'
    order by c.abertura_at desc
    limit 1;
end;
$$;

create or replace function public.registrar_movimento(
  p_cash_id uuid,
  p_tipo text,
  p_valor numeric,
  p_motivo text default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_store_id uuid;
  v_id uuid;
begin
  select store_id into v_store_id from public.cash_sessions where id = p_cash_id and status = 'ABERTO';
  if v_store_id is null then
    raise exception 'Caixa inválido ou fechado';
  end if;
  if not public.user_has_store_access(v_store_id) then
    raise exception 'Sem permissão para movimentar este caixa';
  end if;
  insert into public.cash_movements (cash_id, store_id, user_id, tipo, valor, motivo)
  values (p_cash_id, v_store_id, auth.uid(), p_tipo, p_valor, p_motivo)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.fechar_caixa(
  p_cash_id uuid,
  p_valor_contado numeric,
  p_observacao text default null
) returns table (
  id uuid,
  diferenca numeric
)
language plpgsql
security definer
as $$
declare
  v_store_id uuid;
begin
  select store_id into v_store_id from public.cash_sessions where id = p_cash_id and status = 'ABERTO';
  if v_store_id is null then
    raise exception 'Caixa inválido ou já fechado';
  end if;
  if not public.user_has_store_access(v_store_id) then
    raise exception 'Sem permissão para fechar este caixa';
  end if;

  update public.cash_sessions
     set fechamento_at = now(),
         valor_final = coalesce(p_valor_contado, 0),
         status = 'FECHADO'
   where id = p_cash_id;

  return query
    select c.id,
      (coalesce(c.valor_final,0) - ((coalesce(c.valor_inicial,0) + coalesce(v.dinheiro,0) + coalesce(v.suprimentos,0)) - coalesce(v.sangrias,0))) as diferenca
    from public.cash_sessions c
    left join public.v_cash_session_totals v on v.cash_id = c.id
    where c.id = p_cash_id;
end;
$$;
