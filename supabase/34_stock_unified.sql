-- ============================================================
-- Fase 34: Estoque unificado — simples + grade
-- ============================================================

-- ============================================================
-- 1. v_stock_position_detail: inclui variant_stock
--    Produtos simples  → lê product_stock (has_variants = false)
--    Produtos com grade → agrega variant_stock por (produto × loja)
-- ============================================================
DROP VIEW IF EXISTS public.v_stock_position_detail;
CREATE VIEW public.v_stock_position_detail AS

  -- Produtos simples
  SELECT
    st.company_id,
    ps.product_id,
    p.sku,
    p.nome        AS produto,
    ps.store_id,
    st.nome       AS loja,
    ps.qty        AS saldo,
    p.has_variants,
    max(sm.created_at) AS last_move_at
  FROM public.product_stock ps
  JOIN public.products p  ON p.id  = ps.product_id
  JOIN public.stores   st ON st.id = ps.store_id
  LEFT JOIN public.stock_movements sm
    ON sm.product_id = ps.product_id
   AND sm.store_id   = ps.store_id
  WHERE COALESCE(p.has_variants, false) = false
  GROUP BY st.company_id, ps.product_id, p.sku, p.nome, ps.store_id, st.nome, ps.qty, p.has_variants

  UNION ALL

  -- Produtos com grade (soma todas as variantes por produto × loja)
  SELECT
    st.company_id,
    pv.product_id,
    p.sku,
    p.nome            AS produto,
    vs.store_id,
    st.nome           AS loja,
    SUM(vs.qty)       AS saldo,
    true              AS has_variants,
    max(sm.created_at) AS last_move_at
  FROM public.variant_stock vs
  JOIN public.product_variants pv ON pv.id  = vs.variant_id
  JOIN public.products         p  ON p.id   = pv.product_id
  JOIN public.stores           st ON st.id  = vs.store_id
  LEFT JOIN public.stock_movements sm
    ON sm.product_id = pv.product_id
   AND sm.store_id   = vs.store_id
  GROUP BY st.company_id, pv.product_id, p.sku, p.nome, vs.store_id, st.nome;

-- ============================================================
-- 2. stock_adjust: aceita p_variant_id (DEFAULT NULL)
--    Se variant_id informado → ajusta variant_stock
--    Senão                   → ajusta product_stock (legado)
-- ============================================================
DROP FUNCTION IF EXISTS public.stock_adjust(uuid, uuid, uuid, numeric, text, text);

CREATE FUNCTION public.stock_adjust(
  p_company_id  uuid,
  p_store_id    uuid,
  p_product_id  uuid,
  p_qty         numeric,
  p_type        text,
  p_reason      text    DEFAULT NULL,
  p_variant_id  uuid    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role       text;
  v_my_company uuid;
  v_current    numeric;
BEGIN
  SELECT role, company_id INTO v_role, v_my_company
  FROM public.profiles WHERE id = auth.uid();

  IF v_role NOT IN ('OWNER','ADMIN','GERENTE') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF v_role <> 'OWNER' AND v_my_company <> p_company_id THEN
    RAISE EXCEPTION 'Empresa inválida';
  END IF;

  -- Registra movimento (com variant_id quando aplicável)
  INSERT INTO public.stock_movements(company_id, store_id, product_id, variant_id, user_id, type, qty, reason)
  VALUES (p_company_id, p_store_id, p_product_id, p_variant_id, auth.uid(), p_type, p_qty, p_reason);

  IF p_variant_id IS NOT NULL THEN
    -- Ajusta variant_stock
    SELECT qty INTO v_current FROM public.variant_stock
    WHERE store_id = p_store_id AND variant_id = p_variant_id;
    v_current := COALESCE(v_current, 0) + p_qty;
    IF v_current < 0 THEN v_current := 0; END IF;

    INSERT INTO public.variant_stock(store_id, variant_id, qty, updated_at)
    VALUES (p_store_id, p_variant_id, v_current, now())
    ON CONFLICT (store_id, variant_id)
    DO UPDATE SET qty = excluded.qty, updated_at = excluded.updated_at;
  ELSE
    -- Ajusta product_stock (produto simples)
    SELECT qty INTO v_current FROM public.product_stock
    WHERE store_id = p_store_id AND product_id = p_product_id;
    v_current := COALESCE(v_current, 0) + p_qty;
    IF v_current < 0 THEN v_current := 0; END IF;

    INSERT INTO public.product_stock(store_id, product_id, qty)
    VALUES (p_store_id, p_product_id, v_current)
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET qty = excluded.qty;
  END IF;
END;
$$;
