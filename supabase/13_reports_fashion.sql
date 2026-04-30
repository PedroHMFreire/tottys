-- ============================================================
-- Fase 13: Relatórios Especializados em Moda
-- Execução idempotente — seguro re-rodar a qualquer momento.
-- ============================================================

-- ============================================================
-- 1. FUNÇÃO: fn_ranking_variante
--    Ranking de vendas por tamanho × cor no período
-- ============================================================
create or replace function public.fn_ranking_variante(
  p_company_id uuid,
  p_store_id   uuid    default null,
  p_from       timestamptz default now() - interval '30 days',
  p_to         timestamptz default now()
)
returns table (
  tamanho      text,
  cor          text,
  produto_nome text,
  produto_sku  text,
  qtde_total   bigint,
  receita      numeric
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(pv.tamanho, '—') as tamanho,
    coalesce(pv.cor, '—')     as cor,
    p.nome                    as produto_nome,
    p.sku                     as produto_sku,
    sum(si.qtde)              as qtde_total,
    sum(si.qtde * si.preco_unit) as receita
  from sale_items si
  join sales s      on s.id = si.sale_id
  join products p   on p.id = si.product_id
  left join product_variants pv on pv.id = si.variant_id
  where p.company_id = p_company_id
    and (p_store_id is null or s.store_id = p_store_id)
    and s.created_at >= p_from
    and s.created_at <= p_to
    and s.status = 'PAGA'
    and si.variant_id is not null
  group by pv.tamanho, pv.cor, p.nome, p.sku
  order by qtde_total desc
  limit 50;
$$;

-- ============================================================
-- 2. FUNÇÃO: fn_giro_colecao
--    Faturamento e volume por coleção no período
-- ============================================================
create or replace function public.fn_giro_colecao(
  p_company_id uuid,
  p_store_id   uuid    default null,
  p_from       timestamptz default now() - interval '30 days',
  p_to         timestamptz default now()
)
returns table (
  collection_id uuid,
  colecao_nome  text,
  num_vendas    bigint,
  qtde_total    bigint,
  receita       numeric
)
language sql
security definer
set search_path = public
as $$
  select
    c.id                        as collection_id,
    coalesce(c.nome, 'Sem coleção') as colecao_nome,
    count(distinct s.id)        as num_vendas,
    sum(si.qtde)                as qtde_total,
    sum(si.qtde * si.preco_unit) as receita
  from sale_items si
  join sales s      on s.id = si.sale_id
  join products p   on p.id = si.product_id
  left join collections c on c.id = p.collection_id
  where p.company_id = p_company_id
    and (p_store_id is null or s.store_id = p_store_id)
    and s.created_at >= p_from
    and s.created_at <= p_to
    and s.status = 'PAGA'
  group by c.id, c.nome
  order by receita desc;
$$;

-- ============================================================
-- 3. FUNÇÃO: fn_curva_abc
--    Curva ABC de produtos por receita no período
-- ============================================================
create or replace function public.fn_curva_abc(
  p_company_id uuid,
  p_store_id   uuid    default null,
  p_from       timestamptz default now() - interval '30 days',
  p_to         timestamptz default now()
)
returns table (
  product_id uuid,
  nome       text,
  sku        text,
  qtde_total bigint,
  receita    numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.id            as product_id,
    p.nome,
    p.sku,
    sum(si.qtde)                 as qtde_total,
    sum(si.qtde * si.preco_unit) as receita
  from sale_items si
  join sales s    on s.id = si.sale_id
  join products p on p.id = si.product_id
  where p.company_id = p_company_id
    and (p_store_id is null or s.store_id = p_store_id)
    and s.created_at >= p_from
    and s.created_at <= p_to
    and s.status = 'PAGA'
  group by p.id, p.nome, p.sku
  order by receita desc
  limit 100;
$$;

-- ============================================================
-- 4. FUNÇÃO: fn_inadimplencia_resumo
--    Clientes com parcelas atrasadas (crediário)
-- ============================================================
create or replace function public.fn_inadimplencia_resumo(
  p_company_id uuid
)
returns table (
  customer_id        uuid,
  nome               text,
  contato            text,
  score_interno      text,
  parcelas_atrasadas bigint,
  total_aberto       numeric,
  total_atrasado     numeric,
  primeiro_atraso    date
)
language sql
security definer
set search_path = public
as $$
  select
    cu.id                                                                      as customer_id,
    cu.nome,
    cu.contato,
    cu.score_interno,
    count(*) filter (where cp.status = 'ATRASADA')                            as parcelas_atrasadas,
    sum(cp.valor) filter (where cp.status in ('PENDENTE','ATRASADA'))         as total_aberto,
    coalesce(sum(cp.valor) filter (where cp.status = 'ATRASADA'), 0)          as total_atrasado,
    min(cp.vencimento) filter (where cp.status = 'ATRASADA')                  as primeiro_atraso
  from customers cu
  join crediario_parcelas cp on cp.customer_id = cu.id
  where cu.company_id = p_company_id
    and cp.company_id = p_company_id
    and cp.status in ('PENDENTE','ATRASADA')
  group by cu.id, cu.nome, cu.contato, cu.score_interno
  having count(*) filter (where cp.status = 'ATRASADA') > 0
  order by total_atrasado desc
  limit 50;
$$;
