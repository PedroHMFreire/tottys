-- ============================================================
-- Fase 16: IA e Insights — Análise preditiva de estoque e vendas
-- Execução idempotente — seguro re-rodar a qualquer momento.
-- ============================================================

-- ============================================================
-- 1. FUNÇÃO: fn_reposicao_urgente
--    Variantes com estoque para menos de N dias com base na
--    velocidade de vendas dos últimos 30 dias.
-- ============================================================
create or replace function public.fn_reposicao_urgente(
  p_company_id  uuid,
  p_store_id    uuid    default null,
  p_dias_alerta integer default 14
)
returns table (
  product_id    uuid,
  produto_nome  text,
  produto_sku   text,
  variant_id    uuid,
  tamanho       text,
  cor           text,
  estoque_atual integer,
  vendas_30d    bigint,
  velocidade    numeric,
  dias_restantes integer
)
language sql
security definer
set search_path = public
as $$
  select
    p.id                                            as product_id,
    p.nome                                          as produto_nome,
    p.sku                                           as produto_sku,
    pv.id                                           as variant_id,
    coalesce(pv.tamanho, '—')                       as tamanho,
    coalesce(pv.cor, '—')                           as cor,
    vs.qty::integer                                 as estoque_atual,
    coalesce(sv.qtde_30d, 0)                        as vendas_30d,
    round(coalesce(sv.qtde_30d, 0) / 30.0, 2)      as velocidade,
    case
      when coalesce(sv.qtde_30d, 0) = 0 then 999
      else floor(vs.qty / (coalesce(sv.qtde_30d, 0) / 30.0))::integer
    end                                             as dias_restantes
  from variant_stock vs
  join product_variants pv on pv.id = vs.variant_id
  join products p           on p.id  = pv.product_id
  left join (
    select si.variant_id, sum(si.qtde) as qtde_30d
    from sale_items si
    join sales s on s.id = si.sale_id
    where s.created_at >= now() - interval '30 days'
      and s.status = 'PAGA'
    group by si.variant_id
  ) sv on sv.variant_id = vs.variant_id
  where p.company_id = p_company_id
    and (p_store_id is null or vs.store_id = p_store_id)
    and vs.qty > 0
    and coalesce(sv.qtde_30d, 0) > 0
    and (vs.qty / (coalesce(sv.qtde_30d, 0) / 30.0)) <= p_dias_alerta
  order by dias_restantes asc
  limit 30;
$$;

-- ============================================================
-- 2. FUNÇÃO: fn_produtos_encalhados
--    Produtos com estoque > 0 e sem vendas nos últimos N dias.
-- ============================================================
create or replace function public.fn_produtos_encalhados(
  p_company_id     uuid,
  p_store_id       uuid    default null,
  p_dias_sem_venda integer default 30
)
returns table (
  product_id    uuid,
  nome          text,
  sku           text,
  estoque_total bigint,
  ultima_venda  timestamptz,
  dias_parado   integer
)
language sql
security definer
set search_path = public
as $$
  select
    p.id                                                    as product_id,
    p.nome,
    p.sku,
    coalesce(st.total_qty, 0)                               as estoque_total,
    max(s.created_at)                                       as ultima_venda,
    date_part('day', now() - coalesce(
      max(s.created_at), p.created_at
    ))::integer                                             as dias_parado
  from products p
  left join (
    select product_id,
      sum(qty) as total_qty
    from product_stock
    where (p_store_id is null or store_id = p_store_id)
    group by product_id
  ) st on st.product_id = p.id
  left join (
    -- também considera estoque de variantes
    select pv2.product_id,
      sum(vs2.qty) as total_qty
    from variant_stock vs2
    join product_variants pv2 on pv2.id = vs2.variant_id
    where (p_store_id is null or vs2.store_id = p_store_id)
    group by pv2.product_id
  ) stv on stv.product_id = p.id
  left join sale_items si on si.product_id = p.id
  left join sales s
    on s.id = si.sale_id
    and s.status = 'PAGA'
    and (p_store_id is null or s.store_id = p_store_id)
  where p.company_id = p_company_id
    and (coalesce(st.total_qty, 0) + coalesce(stv.total_qty, 0)) > 0
  group by p.id, p.nome, p.sku, st.total_qty, stv.total_qty
  having coalesce(max(s.created_at), p.created_at) < now() - (p_dias_sem_venda || ' days')::interval
  order by dias_parado desc
  limit 30;
$$;

-- ============================================================
-- 3. FUNÇÃO: fn_resumo_insights
--    Contagem de alertas para o badge no dashboard.
-- ============================================================
create or replace function public.fn_resumo_insights(
  p_company_id uuid,
  p_store_id   uuid default null
)
returns table (
  reposicao_urgente  bigint,
  encalhados         bigint,
  grade_furada       bigint,
  inadimplentes      bigint
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from public.fn_reposicao_urgente(p_company_id, p_store_id, 14))  as reposicao_urgente,
    (select count(*) from public.fn_produtos_encalhados(p_company_id, p_store_id, 30)) as encalhados,
    (select count(*)
       from public.v_grade_ruptura vgr
       join public.product_variants pv on pv.id = vgr.variant_id
       join public.products pp on pp.id = pv.product_id
      where pp.company_id = p_company_id
        and (p_store_id is null or vgr.store_id = p_store_id)
    )                                                                                  as grade_furada,
    (select count(distinct customer_id)
       from public.crediario_parcelas
      where company_id = p_company_id
        and status = 'ATRASADA'
    )                                                                                  as inadimplentes;
$$;
