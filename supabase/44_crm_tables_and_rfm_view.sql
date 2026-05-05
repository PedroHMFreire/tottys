-- ============================================================
-- 44_crm_tables_and_rfm_view.sql
-- CRM: anotações, tags e segmentação RFM automática
-- ============================================================

-- ── customer_notes ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  nota        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cn_select" ON public.customer_notes
  FOR SELECT USING (company_id = current_company_id());
CREATE POLICY "cn_insert" ON public.customer_notes
  FOR INSERT WITH CHECK (company_id = current_company_id());
CREATE POLICY "cn_delete" ON public.customer_notes
  FOR DELETE USING (
    company_id = current_company_id()
    AND ("current_role"() = ANY(ARRAY['OWNER','ADMIN','GERENTE'])
         OR user_id = auth.uid())
  );
GRANT SELECT, INSERT, DELETE ON public.customer_notes TO authenticated;

-- ── customer_tag_defs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_tag_defs (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome       TEXT  NOT NULL,
  cor        TEXT  NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, nome)
);
ALTER TABLE public.customer_tag_defs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ctd_select" ON public.customer_tag_defs
  FOR SELECT USING (company_id = current_company_id());
CREATE POLICY "ctd_write"  ON public.customer_tag_defs
  FOR ALL
  USING  (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_tag_defs TO authenticated;

-- ── customer_tags (junction) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_tags (
  customer_id UUID NOT NULL REFERENCES customers(id)          ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES customer_tag_defs(id)  ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id)          ON DELETE CASCADE,
  PRIMARY KEY (customer_id, tag_id)
);
ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_select" ON public.customer_tags
  FOR SELECT USING (company_id = current_company_id());
CREATE POLICY "ct_write" ON public.customer_tags
  FOR ALL
  USING  (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
GRANT SELECT, INSERT, DELETE ON public.customer_tags TO authenticated;

-- ── v_customer_rfm ───────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_customer_rfm
WITH (security_invoker = on) AS
SELECT
  c.company_id,
  c.id                                                              AS customer_id,
  c.nome,
  c.contato,
  c.email,
  c.data_nascimento,
  c.cashback_saldo,
  c.cashback_tier,
  c.score_interno,
  c.limite_credito,
  c.credito_disponivel,
  COUNT(DISTINCT s.id)                                             AS total_compras,
  COALESCE(SUM(s.total), 0)                                        AS total_gasto,
  CASE WHEN COUNT(DISTINCT s.id) > 0
    THEN ROUND(SUM(s.total) / COUNT(DISTINCT s.id), 2)
    ELSE 0 END                                                      AS ticket_medio,
  MAX(s.created_at)                                                AS ultima_compra_at,
  COALESCE(
    EXTRACT(DAY FROM now() - MAX(s.created_at))::int,
    9999
  )                                                                AS dias_sem_comprar,
  CASE
    WHEN COUNT(DISTINCT s.id) = 0
         THEN 'SEM_COMPRAS'
    WHEN EXTRACT(DAY FROM now() - MAX(s.created_at)) > 180
         THEN 'INATIVO'
    WHEN EXTRACT(DAY FROM now() - MAX(s.created_at)) > 60
         AND COUNT(DISTINCT s.id) >= 2
         THEN 'EM_RISCO'
    WHEN EXTRACT(DAY FROM now() - MAX(s.created_at)) <= 30
         AND COUNT(DISTINCT s.id) >= 4
         THEN 'CAMPIAO'
    WHEN EXTRACT(DAY FROM now() - MAX(s.created_at)) <= 60
         AND COUNT(DISTINCT s.id) >= 3
         THEN 'FIEL'
    WHEN COUNT(DISTINCT s.id) = 1
         AND EXTRACT(DAY FROM now() - MAX(s.created_at)) <= 45
         THEN 'NOVO'
    ELSE 'PROMISSOR'
  END                                                              AS segmento
FROM customers c
LEFT JOIN sales s ON s.customer_id = c.id AND s.status = 'PAGA'
WHERE c.company_id IS NOT NULL
GROUP BY
  c.company_id, c.id, c.nome, c.contato, c.email, c.data_nascimento,
  c.cashback_saldo, c.cashback_tier, c.score_interno,
  c.limite_credito, c.credito_disponivel;

GRANT SELECT ON public.v_customer_rfm TO authenticated;
