-- ============================================================
-- 41_report_views.sql
-- Views de relatório + fix get_corridinhas_progresso store_ids
-- ============================================================

-- ── v_report_sales_kpis ─────────────────────────────────────
CREATE OR REPLACE VIEW public.v_report_sales_kpis
WITH (security_invoker = on) AS
SELECT
  st.company_id,
  s.store_id,
  s.created_at::date                                             AS dia,
  COUNT(DISTINCT s.id)                                           AS cupons,
  COALESCE(SUM(s.total + COALESCE(s.desconto, 0)), 0)           AS faturamento_bruto,
  COALESCE(SUM(COALESCE(s.desconto, 0)), 0)                     AS descontos_total,
  COALESCE(SUM(si.qtde), 0)                                     AS itens,
  CASE WHEN COUNT(DISTINCT s.id) > 0
    THEN ROUND(SUM(s.total) / COUNT(DISTINCT s.id), 2)
    ELSE 0 END                                                   AS ticket_medio
FROM sales s
JOIN  stores     st ON st.id = s.store_id
LEFT JOIN sale_items si ON si.sale_id = s.id
WHERE s.status = 'PAGA'
GROUP BY st.company_id, s.store_id, s.created_at::date;

GRANT SELECT ON public.v_report_sales_kpis TO authenticated;

-- ── v_report_payments_method ────────────────────────────────
CREATE OR REPLACE VIEW public.v_report_payments_method
WITH (security_invoker = on) AS
SELECT
  st.company_id,
  s.store_id,
  s.created_at::date                        AS dia,
  p.meio,
  COALESCE(p.brand, '')                     AS brand,
  COALESCE(p.mode,  '')                     AS mode,
  COUNT(*)                                  AS qtd,
  COALESCE(SUM(p.gross),  SUM(p.valor))     AS total_gross,
  COALESCE(SUM(p.net),    SUM(p.valor))     AS total_net,
  COALESCE(SUM(p.fee_total), 0)             AS total_fees
FROM payments p
JOIN sales  s  ON s.id  = p.sale_id
JOIN stores st ON st.id = s.store_id
WHERE s.status = 'PAGA'
GROUP BY st.company_id, s.store_id, s.created_at::date,
  p.meio, COALESCE(p.brand, ''), COALESCE(p.mode, '');

GRANT SELECT ON public.v_report_payments_method TO authenticated;

-- ── v_report_top_products ────────────────────────────────────
CREATE OR REPLACE VIEW public.v_report_top_products
WITH (security_invoker = on) AS
SELECT
  st.company_id,
  s.store_id,
  s.created_at::date             AS dia,
  si.product_id,
  pr.sku,
  COALESCE(pr.nome, 'Produto')   AS nome,
  SUM(si.qtde)                   AS qtde_total,
  SUM(si.qtde * si.preco_unit)   AS receita
FROM sale_items si
JOIN sales    s  ON s.id   = si.sale_id
JOIN stores   st ON st.id  = s.store_id
LEFT JOIN products pr ON pr.id = si.product_id
WHERE s.status = 'PAGA'
GROUP BY st.company_id, s.store_id, s.created_at::date,
  si.product_id, pr.sku, COALESCE(pr.nome, 'Produto');

GRANT SELECT ON public.v_report_top_products TO authenticated;

-- ── v_report_seller_kpis ─────────────────────────────────────
-- Resolve o vendedor de cada venda: vendedor_id (sem conta) ou user_id (com conta)
CREATE OR REPLACE VIEW public.v_report_seller_kpis
WITH (security_invoker = on) AS
SELECT
  st.company_id,
  s.store_id,
  s.created_at::date                                            AS dia,
  COALESCE(v.user_id, s.user_id)                               AS user_id,
  COALESCE(v.nome, p.nome, 'Vendedor')                         AS vendedor,
  COUNT(DISTINCT s.id)                                         AS cupons,
  COALESCE(SUM(s.total + COALESCE(s.desconto, 0)), 0)          AS faturamento_bruto,
  COALESCE(SUM(COALESCE(s.desconto, 0)), 0)                    AS descontos_total,
  COALESCE(SUM(si.qtde), 0)                                    AS itens,
  CASE WHEN COUNT(DISTINCT s.id) > 0
    THEN ROUND(SUM(s.total) / COUNT(DISTINCT s.id), 2)
    ELSE 0 END                                                  AS ticket_medio,
  CASE WHEN SUM(s.total + COALESCE(s.desconto, 0)) > 0
    THEN ROUND(
      SUM(COALESCE(s.desconto, 0)) /
      SUM(s.total + COALESCE(s.desconto, 0)) * 100, 1)
    ELSE 0 END                                                  AS desconto_pct
FROM sales s
JOIN  stores     st ON st.id = s.store_id
LEFT JOIN sale_items si ON si.sale_id = s.id
LEFT JOIN vendedores v  ON v.id = s.vendedor_id
LEFT JOIN profiles  p  ON p.id = COALESCE(v.user_id, s.user_id)
WHERE s.status = 'PAGA'
  AND (s.vendedor_id IS NOT NULL OR s.user_id IS NOT NULL)
GROUP BY
  st.company_id, s.store_id, s.created_at::date,
  COALESCE(v.user_id, s.user_id),
  COALESCE(v.nome, p.nome, 'Vendedor');

GRANT SELECT ON public.v_report_seller_kpis TO authenticated;

-- ── v_report_sales_by_hour ───────────────────────────────────
CREATE OR REPLACE VIEW public.v_report_sales_by_hour
WITH (security_invoker = on) AS
SELECT
  st.company_id,
  s.store_id,
  date_trunc('hour', s.created_at AT TIME ZONE 'America/Sao_Paulo') AS hora_local,
  (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date             AS dia_local,
  p.meio,
  COUNT(*)                                                           AS qtd,
  COALESCE(SUM(p.gross), SUM(p.valor))                              AS total_gross
FROM payments p
JOIN sales  s  ON s.id  = p.sale_id
JOIN stores st ON st.id = s.store_id
WHERE s.status = 'PAGA'
GROUP BY
  st.company_id, s.store_id,
  date_trunc('hour', s.created_at AT TIME ZONE 'America/Sao_Paulo'),
  (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
  p.meio;

GRANT SELECT ON public.v_report_sales_by_hour TO authenticated;

-- ── v_report_cash_closures ───────────────────────────────────
CREATE OR REPLACE VIEW public.v_report_cash_closures
WITH (security_invoker = on) AS
SELECT
  st.company_id,
  cs.store_id,
  cs.id                                                          AS cash_id,
  cs.user_id                                                     AS operador_id,
  COALESCE(p.nome, p.email, 'Operador')                         AS operador,
  cs.abertura_at,
  cs.fechamento_at,
  cs.valor_inicial,
  cs.valor_final,
  t.dinheiro,
  t.pix,
  t.cartao,
  t.suprimentos,
  t.sangrias,
  cs.valor_inicial + t.dinheiro + t.suprimentos - t.sangrias    AS esperado_em_dinheiro,
  cs.valor_final - (cs.valor_inicial + t.dinheiro + t.suprimentos - t.sangrias) AS diferenca
FROM cash_sessions cs
JOIN  stores     st ON st.id = cs.store_id
LEFT JOIN profiles p ON p.id = cs.user_id
LEFT JOIN v_cash_session_totals t ON t.cash_id = cs.id
WHERE cs.fechamento_at IS NOT NULL;

GRANT SELECT ON public.v_report_cash_closures TO authenticated;

-- ── Fix get_corridinhas_progresso: store_id → store_ids[] ────
DROP FUNCTION IF EXISTS public.get_corridinhas_progresso(uuid, uuid);

CREATE FUNCTION public.get_corridinhas_progresso(
  p_user_id  uuid,
  p_store_id uuid
)
RETURNS TABLE (
  corridinha_id    uuid,
  nome             text,
  tipo             text,
  tipo_meta        text,
  valor_meta       numeric,
  bonus_valor      numeric,
  premio_descricao text,
  inicio           timestamptz,
  fim              timestamptz,
  realizado        numeric,
  pct              numeric,
  concluido        boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vendedor_id uuid;
BEGIN
  SELECT id INTO v_vendedor_id FROM vendedores WHERE user_id = p_user_id LIMIT 1;

  RETURN QUERY
  WITH c AS (
    SELECT * FROM corridinhas
    WHERE company_id = current_company_id()
      AND ativo      = true
      AND now() BETWEEN corridinhas.inicio AND corridinhas.fim
      AND (corridinhas.store_ids IS NULL OR p_store_id = ANY(corridinhas.store_ids))
  ),
  base AS (
    SELECT
      COALESCE(SUM(s.total), 0)  AS faturamento,
      COALESCE(SUM(si.qtde), 0)  AS itens,
      COUNT(DISTINCT a.id)        AS atendimentos
    FROM c
    LEFT JOIN sales s ON
      s.store_id   = p_store_id
      AND s.status = 'PAGA'
      AND s.created_at BETWEEN (SELECT MIN(inicio) FROM c) AND now()
      AND (
        s.user_id = p_user_id
        OR (v_vendedor_id IS NOT NULL AND s.vendedor_id = v_vendedor_id)
      )
    LEFT JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN atendimentos a ON
      a.store_id        = p_store_id
      AND a.user_id     = p_user_id
      AND a.registrado_at BETWEEN (SELECT MIN(inicio) FROM c) AND now()
  )
  SELECT
    c.id, c.nome, c.tipo, c.tipo_meta, c.valor_meta, c.bonus_valor,
    c.premio_descricao, c.inicio, c.fim,
    CASE c.tipo_meta
      WHEN 'FINANCEIRA'  THEN (SELECT faturamento  FROM base)
      WHEN 'VOLUME'      THEN (SELECT itens        FROM base)
      WHEN 'ATENDIMENTO' THEN (SELECT atendimentos FROM base)
      ELSE 0
    END AS realizado,
    LEAST(100, ROUND(
      CASE c.tipo_meta
        WHEN 'FINANCEIRA'  THEN (SELECT faturamento  FROM base) / NULLIF(c.valor_meta, 0) * 100
        WHEN 'VOLUME'      THEN (SELECT itens        FROM base) / NULLIF(c.valor_meta, 0) * 100
        WHEN 'ATENDIMENTO' THEN (SELECT atendimentos FROM base) / NULLIF(c.valor_meta, 0) * 100
        ELSE 0
      END, 1
    )) AS pct,
    CASE c.tipo_meta
      WHEN 'FINANCEIRA'  THEN (SELECT faturamento  FROM base) >= c.valor_meta
      WHEN 'VOLUME'      THEN (SELECT itens        FROM base) >= c.valor_meta
      WHEN 'ATENDIMENTO' THEN (SELECT atendimentos FROM base) >= c.valor_meta
      ELSE false
    END AS concluido
  FROM c;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_corridinhas_progresso TO authenticated;
