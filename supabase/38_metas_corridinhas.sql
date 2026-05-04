-- ============================================================
-- 38_metas_corridinhas.sql
-- Metas de vendas, corridinhas e contagem de atendimentos
-- ============================================================

-- ── Grupos de categorias (para meta de mix de produtos) ──────
CREATE TABLE IF NOT EXISTS category_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  categorias text[] NOT NULL DEFAULT '{}',
  cor        text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Metas por período ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id          uuid REFERENCES stores(id) ON DELETE CASCADE,     -- null = todas
  user_id           uuid REFERENCES profiles(id) ON DELETE CASCADE,   -- null = meta da loja
  tipo              text NOT NULL CHECK (tipo IN ('FINANCEIRA','VOLUME','CONVERSAO','MIX')),
  periodo           text NOT NULL CHECK (periodo IN ('DIARIA','SEMANAL','QUINZENAL','MENSAL')),
  inicio            date NOT NULL,
  fim               date NOT NULL,
  valor_meta        numeric(14,2) NOT NULL,
  bonus_valor       numeric(14,2) NOT NULL DEFAULT 0,
  category_group_id uuid REFERENCES category_groups(id),
  descricao         text,
  ativo             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── Corridinhas (desafios rápidos) ──────────────────────────
CREATE TABLE IF NOT EXISTS corridinhas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id        uuid REFERENCES stores(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  descricao       text,
  tipo            text NOT NULL CHECK (tipo IN ('INDIVIDUAL','COLETIVA','COMPETITIVA')),
  tipo_meta       text NOT NULL CHECK (tipo_meta IN ('FINANCEIRA','VOLUME','ATENDIMENTO')),
  valor_meta      numeric(14,2) NOT NULL,
  bonus_valor     numeric(14,2) NOT NULL DEFAULT 0,
  premio_descricao text,
  inicio          timestamptz NOT NULL,
  fim             timestamptz NOT NULL,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Atendimentos (para métrica de conversão) ─────────────────
CREATE TABLE IF NOT EXISTS atendimentos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  store_id     uuid NOT NULL,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  registrado_at timestamptz NOT NULL DEFAULT now()
);

-- ── Bônus para folha de pagamento ────────────────────────────
CREATE TABLE IF NOT EXISTS folha_bonos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL,
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  meta_id        uuid REFERENCES metas(id),
  corridinha_id  uuid REFERENCES corridinhas(id),
  valor          numeric(14,2) NOT NULL,
  descricao      text,
  periodo_ref    text,   -- "2026-05" para agrupar na folha do mês
  pago           boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Índices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_metas_company       ON metas(company_id);
CREATE INDEX IF NOT EXISTS idx_metas_store         ON metas(store_id);
CREATE INDEX IF NOT EXISTS idx_metas_user          ON metas(user_id);
CREATE INDEX IF NOT EXISTS idx_corridinhas_company ON corridinhas(company_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_user   ON atendimentos(user_id, registrado_at);
CREATE INDEX IF NOT EXISTS idx_atendimentos_store  ON atendimentos(store_id, registrado_at);
CREATE INDEX IF NOT EXISTS idx_folha_bonos_user    ON folha_bonos(user_id, periodo_ref);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE category_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE corridinhas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE atendimentos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE folha_bonos     ENABLE ROW LEVEL SECURITY;

-- category_groups: leitura para todos da empresa, escrita para admin/gerente
CREATE POLICY cg_select ON category_groups FOR SELECT
  USING (company_id = current_company_id());

CREATE POLICY cg_insert ON category_groups FOR INSERT
  WITH CHECK (company_id = current_company_id()
    AND current_role() IN ('OWNER','ADMIN','GERENTE'));

CREATE POLICY cg_update ON category_groups FOR UPDATE
  USING (company_id = current_company_id()
    AND current_role() IN ('OWNER','ADMIN','GERENTE'));

CREATE POLICY cg_delete ON category_groups FOR DELETE
  USING (company_id = current_company_id()
    AND current_role() IN ('OWNER','ADMIN','GERENTE'));

-- metas
CREATE POLICY metas_select ON metas FOR SELECT
  USING (company_id = current_company_id());

CREATE POLICY metas_insert ON metas FOR INSERT
  WITH CHECK (company_id = current_company_id()
    AND current_role() IN ('OWNER','ADMIN','GERENTE'));

CREATE POLICY metas_update ON metas FOR UPDATE
  USING (company_id = current_company_id()
    AND current_role() IN ('OWNER','ADMIN','GERENTE'));

CREATE POLICY metas_delete ON metas FOR DELETE
  USING (company_id = current_company_id()
    AND current_role() IN ('OWNER','ADMIN','GERENTE'));

-- corridinhas
CREATE POLICY corr_select ON corridinhas FOR SELECT
  USING (company_id = current_company_id());

CREATE POLICY corr_insert ON corridinhas FOR INSERT
  WITH CHECK (company_id = current_company_id()
    AND current_role() IN ('OWNER','ADMIN','GERENTE'));

CREATE POLICY corr_update ON corridinhas FOR UPDATE
  USING (company_id = current_company_id()
    AND current_role() IN ('OWNER','ADMIN','GERENTE'));

CREATE POLICY corr_delete ON corridinhas FOR DELETE
  USING (company_id = current_company_id()
    AND current_role() IN ('OWNER','ADMIN','GERENTE'));

-- atendimentos: vendedor registra os próprios, admin vê todos
CREATE POLICY atend_select ON atendimentos FOR SELECT
  USING (company_id = current_company_id());

CREATE POLICY atend_insert ON atendimentos FOR INSERT
  WITH CHECK (company_id = current_company_id()
    AND user_id = auth.uid());

-- folha_bonos: leitura própria para vendedores, admins veem todos
CREATE POLICY folha_select_own ON folha_bonos FOR SELECT
  USING (company_id = current_company_id()
    AND (user_id = auth.uid() OR current_role() IN ('OWNER','ADMIN','GERENTE')));

CREATE POLICY folha_insert ON folha_bonos FOR INSERT
  WITH CHECK (company_id = current_company_id()
    AND current_role() IN ('OWNER','ADMIN','GERENTE'));

CREATE POLICY folha_update ON folha_bonos FOR UPDATE
  USING (company_id = current_company_id()
    AND current_role() IN ('OWNER','ADMIN','GERENTE'));

-- ── RPC: progresso das metas de um vendedor ──────────────────
CREATE OR REPLACE FUNCTION get_metas_progresso(
  p_user_id  uuid,
  p_store_id uuid,
  p_data     date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  meta_id     uuid,
  tipo        text,
  periodo     text,
  inicio      date,
  fim         date,
  valor_meta  numeric,
  bonus_valor numeric,
  descricao   text,
  realizado   numeric,
  pct         numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH m AS (
    SELECT * FROM metas
    WHERE company_id = current_company_id()
      AND ativo = true
      AND p_data BETWEEN metas.inicio AND metas.fim
      AND (metas.store_id IS NULL OR metas.store_id = p_store_id)
      AND (metas.user_id IS NULL OR metas.user_id = p_user_id)
  ),
  vendas AS (
    SELECT
      COALESCE(SUM(s.total), 0)                     AS faturamento,
      COUNT(DISTINCT s.id)                           AS cupons,
      COALESCE(SUM(si.qtde), 0)                     AS itens
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.store_id = p_store_id
      AND s.user_id  = p_user_id
      AND s.status   = 'PAGA'
      AND s.created_at::date BETWEEN (SELECT MIN(inicio) FROM m) AND (SELECT MAX(fim) FROM m)
  ),
  atend AS (
    SELECT COUNT(*) AS total
    FROM atendimentos
    WHERE user_id  = p_user_id
      AND store_id = p_store_id
      AND registrado_at::date BETWEEN (SELECT MIN(inicio) FROM m) AND (SELECT MAX(fim) FROM m)
  )
  SELECT
    m.id,
    m.tipo,
    m.periodo,
    m.inicio,
    m.fim,
    m.valor_meta,
    m.bonus_valor,
    m.descricao,
    CASE m.tipo
      WHEN 'FINANCEIRA'  THEN (SELECT faturamento FROM vendas)
      WHEN 'VOLUME'      THEN (SELECT itens       FROM vendas)
      WHEN 'CONVERSAO'   THEN (SELECT cupons       FROM vendas)
      WHEN 'MIX'         THEN (SELECT faturamento FROM vendas)
      ELSE 0
    END AS realizado,
    LEAST(100, ROUND(
      CASE m.tipo
        WHEN 'FINANCEIRA'  THEN (SELECT faturamento FROM vendas) / NULLIF(m.valor_meta,0) * 100
        WHEN 'VOLUME'      THEN (SELECT itens       FROM vendas) / NULLIF(m.valor_meta,0) * 100
        WHEN 'CONVERSAO'   THEN (SELECT cupons       FROM vendas) / NULLIF(m.valor_meta,0) * 100
        WHEN 'MIX'         THEN (SELECT faturamento FROM vendas) / NULLIF(m.valor_meta,0) * 100
        ELSE 0
      END, 1
    )) AS pct
  FROM m;
END;
$$;

-- ── RPC: progresso das corridinhas ──────────────────────────
CREATE OR REPLACE FUNCTION get_corridinhas_progresso(
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
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
      s.store_id = p_store_id AND s.user_id = p_user_id AND s.status = 'PAGA'
      AND s.created_at BETWEEN (SELECT MIN(inicio) FROM c) AND now()
    LEFT JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN atendimentos a ON
      a.store_id = p_store_id AND a.user_id = p_user_id
      AND a.registrado_at BETWEEN (SELECT MIN(inicio) FROM c) AND now()
  )
  SELECT
    c.id,
    c.nome,
    c.tipo,
    c.tipo_meta,
    c.valor_meta,
    c.bonus_valor,
    c.premio_descricao,
    c.inicio,
    c.fim,
    CASE c.tipo_meta
      WHEN 'FINANCEIRA'   THEN (SELECT faturamento    FROM base)
      WHEN 'VOLUME'       THEN (SELECT itens          FROM base)
      WHEN 'ATENDIMENTO'  THEN (SELECT atendimentos   FROM base)
      ELSE 0
    END AS realizado,
    LEAST(100, ROUND(
      CASE c.tipo_meta
        WHEN 'FINANCEIRA'   THEN (SELECT faturamento    FROM base) / NULLIF(c.valor_meta,0) * 100
        WHEN 'VOLUME'       THEN (SELECT itens          FROM base) / NULLIF(c.valor_meta,0) * 100
        WHEN 'ATENDIMENTO'  THEN (SELECT atendimentos   FROM base) / NULLIF(c.valor_meta,0) * 100
        ELSE 0
      END, 1
    )) AS pct,
    CASE c.tipo_meta
      WHEN 'FINANCEIRA'   THEN (SELECT faturamento    FROM base) >= c.valor_meta
      WHEN 'VOLUME'       THEN (SELECT itens          FROM base) >= c.valor_meta
      WHEN 'ATENDIMENTO'  THEN (SELECT atendimentos   FROM base) >= c.valor_meta
      ELSE false
    END AS concluido
  FROM c;
END;
$$;

-- ── RPC: ranking de vendedores na loja ───────────────────────
CREATE OR REPLACE FUNCTION get_ranking_vendedores(
  p_store_id uuid,
  p_inicio   date DEFAULT (date_trunc('month', CURRENT_DATE))::date,
  p_fim      date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  user_id    uuid,
  nome       text,
  faturamento numeric,
  cupons     bigint,
  posicao    bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.user_id,
    COALESCE(p.nome, 'Vendedor') AS nome,
    COALESCE(SUM(s.total), 0)   AS faturamento,
    COUNT(DISTINCT s.id)         AS cupons,
    RANK() OVER (ORDER BY SUM(s.total) DESC) AS posicao
  FROM sales s
  JOIN profiles p ON p.id = s.user_id
  WHERE s.store_id = p_store_id
    AND s.status = 'PAGA'
    AND s.created_at::date BETWEEN p_inicio AND p_fim
    AND s.company_id = current_company_id()
  GROUP BY s.user_id, p.nome
  ORDER BY faturamento DESC;
END;
$$;

-- ── RPC: folha de bônus do mês ───────────────────────────────
CREATE OR REPLACE FUNCTION get_folha_bonos_mes(p_periodo text)
RETURNS TABLE (
  user_id     uuid,
  nome        text,
  total_bonus numeric,
  bonos       json
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fb.user_id,
    COALESCE(p.nome, 'Vendedor') AS nome,
    SUM(fb.valor) AS total_bonus,
    json_agg(json_build_object(
      'id',            fb.id,
      'descricao',     fb.descricao,
      'valor',         fb.valor,
      'pago',          fb.pago,
      'created_at',    fb.created_at
    ) ORDER BY fb.created_at) AS bonos
  FROM folha_bonos fb
  JOIN profiles p ON p.id = fb.user_id
  WHERE fb.company_id  = current_company_id()
    AND fb.periodo_ref = p_periodo
  GROUP BY fb.user_id, p.nome
  ORDER BY total_bonus DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_metas_progresso     TO authenticated;
GRANT EXECUTE ON FUNCTION get_corridinhas_progresso TO authenticated;
GRANT EXECUTE ON FUNCTION get_ranking_vendedores  TO authenticated;
GRANT EXECUTE ON FUNCTION get_folha_bonos_mes     TO authenticated;
