-- ============================================================
-- 40_vendedores.sql
-- Vendedores independentes de conta auth
-- ============================================================

-- ── Tabela principal ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendedores (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id   uuid        REFERENCES public.stores(id)             ON DELETE SET NULL,
  nome       text        NOT NULL,
  apelido    text,
  ativo      boolean     NOT NULL DEFAULT true,
  user_id    uuid        REFERENCES auth.users(id)                ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendedores_company ON public.vendedores(company_id);
CREATE INDEX IF NOT EXISTS idx_vendedores_store   ON public.vendedores(store_id);
CREATE INDEX IF NOT EXISTS idx_vendedores_user    ON public.vendedores(user_id);

ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vend_select" ON public.vendedores FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY "vend_insert" ON public.vendedores FOR INSERT
  WITH CHECK (company_id = public.current_company_id()
    AND public.current_role() IN ('OWNER','ADMIN','GERENTE'));

CREATE POLICY "vend_update" ON public.vendedores FOR UPDATE
  USING (company_id = public.current_company_id()
    AND public.current_role() IN ('OWNER','ADMIN','GERENTE'));

CREATE POLICY "vend_delete" ON public.vendedores FOR DELETE
  USING (company_id = public.current_company_id()
    AND public.current_role() IN ('OWNER','ADMIN','GERENTE'));

-- ── Adicionar vendedor_id em sales ───────────────────────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS vendedor_id uuid
    REFERENCES public.vendedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_vendedor ON public.sales(vendedor_id);

-- ── Ranking: usa vendedor_id quando disponível ────────────────
CREATE OR REPLACE FUNCTION public.get_ranking_vendedores(
  p_store_id uuid,
  p_inicio   date DEFAULT (date_trunc('month', CURRENT_DATE))::date,
  p_fim      date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  vendedor_id  uuid,
  user_id      uuid,
  nome         text,
  faturamento  numeric,
  cupons       bigint,
  posicao      bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH resolved AS (
    -- Resolve o vendedor efetivo de cada venda:
    -- se vendedor_id preenchido → usa; senão tenta achar pelo user_id
    SELECT
      COALESCE(
        s.vendedor_id,
        (SELECT vv.id FROM vendedores vv
         WHERE vv.user_id = s.user_id
           AND vv.company_id = s.company_id
         LIMIT 1)
      ) AS eff_vid,
      s.user_id,
      s.total,
      s.id AS sale_id
    FROM sales s
    WHERE s.store_id   = p_store_id
      AND s.status     = 'PAGA'
      AND s.created_at::date BETWEEN p_inicio AND p_fim
      AND s.company_id = current_company_id()
      AND (s.vendedor_id IS NOT NULL OR s.user_id IS NOT NULL)
  )
  SELECT
    r.eff_vid                                          AS vendedor_id,
    COALESCE(v.user_id, r.user_id)                     AS user_id,
    COALESCE(v.nome, p.nome, 'Vendedor')               AS nome,
    COALESCE(SUM(r.total), 0)                          AS faturamento,
    COUNT(DISTINCT r.sale_id)                           AS cupons,
    RANK() OVER (ORDER BY SUM(r.total) DESC)           AS posicao
  FROM resolved r
  LEFT JOIN vendedores v ON v.id = r.eff_vid
  LEFT JOIN profiles   p ON p.id = CASE
    WHEN r.eff_vid IS NULL THEN r.user_id
    ELSE v.user_id
  END
  GROUP BY
    r.eff_vid,
    COALESCE(v.user_id, r.user_id),
    COALESCE(v.nome, p.nome, 'Vendedor')
  ORDER BY faturamento DESC;
END;
$$;

-- ── Metas: conta vendas por user_id OU por vendedor_id ───────
CREATE OR REPLACE FUNCTION public.get_metas_progresso(
  p_user_id  uuid,
  p_store_id uuid,
  p_data     date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  meta_id     uuid,  tipo        text,  periodo     text,
  inicio      date,  fim         date,
  valor_meta  numeric,  bonus_valor numeric,
  descricao   text,  realizado   numeric,  pct         numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vendedor_id uuid;
BEGIN
  SELECT id INTO v_vendedor_id FROM vendedores WHERE user_id = p_user_id LIMIT 1;

  RETURN QUERY
  WITH m AS (
    SELECT * FROM metas
    WHERE company_id = current_company_id()
      AND ativo = true
      AND p_data BETWEEN metas.inicio AND metas.fim
      AND (metas.store_id IS NULL OR metas.store_id = p_store_id)
      AND (metas.user_id  IS NULL OR metas.user_id  = p_user_id)
  ),
  vendas AS (
    SELECT
      COALESCE(SUM(s.total), 0)   AS faturamento,
      COUNT(DISTINCT s.id)         AS cupons,
      COALESCE(SUM(si.qtde), 0)   AS itens
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.store_id = p_store_id
      AND s.status   = 'PAGA'
      AND s.created_at::date BETWEEN (SELECT MIN(inicio) FROM m) AND (SELECT MAX(fim) FROM m)
      AND (
        s.user_id = p_user_id
        OR (v_vendedor_id IS NOT NULL AND s.vendedor_id = v_vendedor_id)
      )
  ),
  atend AS (
    SELECT COUNT(*) AS total
    FROM atendimentos
    WHERE user_id  = p_user_id
      AND store_id = p_store_id
      AND registrado_at::date BETWEEN (SELECT MIN(inicio) FROM m) AND (SELECT MAX(fim) FROM m)
  )
  SELECT
    m.id, m.tipo, m.periodo, m.inicio, m.fim, m.valor_meta, m.bonus_valor, m.descricao,
    CASE m.tipo
      WHEN 'FINANCEIRA' THEN (SELECT faturamento FROM vendas)
      WHEN 'VOLUME'     THEN (SELECT itens       FROM vendas)
      WHEN 'CONVERSAO'  THEN (SELECT cupons      FROM vendas)
      WHEN 'MIX'        THEN (SELECT faturamento FROM vendas)
      ELSE 0
    END AS realizado,
    LEAST(100, ROUND(
      CASE m.tipo
        WHEN 'FINANCEIRA' THEN (SELECT faturamento FROM vendas) / NULLIF(m.valor_meta,0) * 100
        WHEN 'VOLUME'     THEN (SELECT itens       FROM vendas) / NULLIF(m.valor_meta,0) * 100
        WHEN 'CONVERSAO'  THEN (SELECT cupons      FROM vendas) / NULLIF(m.valor_meta,0) * 100
        WHEN 'MIX'        THEN (SELECT faturamento FROM vendas) / NULLIF(m.valor_meta,0) * 100
        ELSE 0
      END, 1
    )) AS pct
  FROM m;
END;
$$;

-- ── Corridinhas: idem ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_corridinhas_progresso(
  p_user_id  uuid,
  p_store_id uuid
)
RETURNS TABLE (
  corridinha_id    uuid,  nome             text,
  tipo             text,  tipo_meta        text,
  valor_meta       numeric,  bonus_valor      numeric,
  premio_descricao text,
  inicio           timestamptz,  fim              timestamptz,
  realizado        numeric,  pct              numeric,
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
      AND ativo = true
      AND now() BETWEEN corridinhas.inicio AND corridinhas.fim
      AND (corridinhas.store_id IS NULL OR corridinhas.store_id = p_store_id)
  ),
  base AS (
    SELECT
      COALESCE(SUM(s.total), 0)  AS faturamento,
      COALESCE(SUM(si.qtde), 0)  AS itens,
      COUNT(DISTINCT a.id)        AS atendimentos
    FROM c
    LEFT JOIN sales s ON
      s.store_id = p_store_id
      AND s.status = 'PAGA'
      AND s.created_at BETWEEN (SELECT MIN(inicio) FROM c) AND now()
      AND (
        s.user_id = p_user_id
        OR (v_vendedor_id IS NOT NULL AND s.vendedor_id = v_vendedor_id)
      )
    LEFT JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN atendimentos a ON
      a.store_id = p_store_id AND a.user_id = p_user_id
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
        WHEN 'FINANCEIRA'  THEN (SELECT faturamento  FROM base) / NULLIF(c.valor_meta,0) * 100
        WHEN 'VOLUME'      THEN (SELECT itens        FROM base) / NULLIF(c.valor_meta,0) * 100
        WHEN 'ATENDIMENTO' THEN (SELECT atendimentos FROM base) / NULLIF(c.valor_meta,0) * 100
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

GRANT EXECUTE ON FUNCTION public.get_ranking_vendedores     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_metas_progresso        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_corridinhas_progresso  TO authenticated;
