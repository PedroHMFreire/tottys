-- ============================================================
-- 45_comissao_ranking_upgrade.sql
-- Comissão por vendedor + ranking completo + seletor no PDV
-- ============================================================

-- 1. Campo de comissão no cadastro de vendedores
ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS percentual_comissao numeric(5,2) NOT NULL DEFAULT 0;

-- 2. vendedor_id em metas (metas individuais por vendedor, sem necessitar user_id)
ALTER TABLE public.metas
  ADD COLUMN IF NOT EXISTS vendedor_id uuid
    REFERENCES public.vendedores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_metas_vendedor ON public.metas(vendedor_id);

-- 3. Ranking completo: ticket médio e comissão
-- DROP das versões antigas (assinaturas mudam — CREATE OR REPLACE não suporta)
DROP FUNCTION IF EXISTS public.get_ranking_vendedores(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_metas_progresso(uuid, uuid, date);
DROP FUNCTION IF EXISTS public.get_corridinhas_progresso(uuid, uuid);

CREATE FUNCTION public.get_ranking_vendedores(
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
  ticket_medio numeric,
  comissao     numeric,
  posicao      bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH resolved AS (
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
  ),
  agg AS (
    SELECT
      r.eff_vid,
      COALESCE(v.user_id, r.user_id)                     AS uid,
      COALESCE(v.apelido, v.nome, p.nome, 'Vendedor')    AS nome,
      COALESCE(v.percentual_comissao, 0)                 AS pct_com,
      COALESCE(SUM(r.total), 0)                          AS fat,
      COUNT(DISTINCT r.sale_id)                          AS cup
    FROM resolved r
    LEFT JOIN vendedores v ON v.id = r.eff_vid
    LEFT JOIN profiles   p ON p.id = CASE
      WHEN r.eff_vid IS NULL THEN r.user_id
      ELSE v.user_id
    END
    GROUP BY
      r.eff_vid,
      COALESCE(v.user_id, r.user_id),
      COALESCE(v.apelido, v.nome, p.nome, 'Vendedor'),
      COALESCE(v.percentual_comissao, 0)
  )
  SELECT
    agg.eff_vid                                                           AS vendedor_id,
    agg.uid                                                               AS user_id,
    agg.nome,
    agg.fat                                                               AS faturamento,
    agg.cup                                                               AS cupons,
    CASE WHEN agg.cup > 0 THEN ROUND(agg.fat / agg.cup::numeric, 2)
         ELSE 0 END                                                       AS ticket_medio,
    ROUND(agg.fat * agg.pct_com / 100, 2)                                AS comissao,
    RANK() OVER (ORDER BY agg.fat DESC)                                   AS posicao
  FROM agg
  ORDER BY faturamento DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ranking_vendedores TO authenticated;

-- 4. get_metas_progresso: aceita p_vendedor_id explícito
CREATE FUNCTION public.get_metas_progresso(
  p_user_id     uuid,
  p_store_id    uuid,
  p_data        date DEFAULT CURRENT_DATE,
  p_vendedor_id uuid DEFAULT NULL
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
  v_vendedor_id := COALESCE(
    p_vendedor_id,
    (SELECT id FROM vendedores WHERE user_id = p_user_id LIMIT 1)
  );

  RETURN QUERY
  WITH m AS (
    SELECT * FROM metas
    WHERE company_id = current_company_id()
      AND ativo = true
      AND p_data BETWEEN metas.inicio AND metas.fim
      AND (metas.store_id IS NULL OR metas.store_id = p_store_id)
      AND (
        -- Meta genérica da loja (sem user nem vendedor)
        (metas.user_id IS NULL AND metas.vendedor_id IS NULL)
        -- Meta atribuída ao usuário logado
        OR metas.user_id = p_user_id
        -- Meta atribuída ao vendedor selecionado
        OR (v_vendedor_id IS NOT NULL AND metas.vendedor_id = v_vendedor_id)
      )
  ),
  vendas AS (
    SELECT
      COALESCE(SUM(s.total), 0)  AS faturamento,
      COUNT(DISTINCT s.id)        AS cupons,
      COALESCE(SUM(si.qtde), 0)  AS itens
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

GRANT EXECUTE ON FUNCTION public.get_metas_progresso TO authenticated;

-- 5. get_corridinhas_progresso: aceita p_vendedor_id explícito
CREATE FUNCTION public.get_corridinhas_progresso(
  p_user_id     uuid,
  p_store_id    uuid,
  p_vendedor_id uuid DEFAULT NULL
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
  v_vendedor_id := COALESCE(
    p_vendedor_id,
    (SELECT id FROM vendedores WHERE user_id = p_user_id LIMIT 1)
  );

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

GRANT EXECUTE ON FUNCTION public.get_corridinhas_progresso TO authenticated;
