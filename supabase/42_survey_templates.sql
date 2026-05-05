-- ============================================================
-- 42_survey_templates.sql
-- Cardápio de pesquisas de satisfação — 4 tipos configuráveis
-- ============================================================

-- Tipo ativo por empresa (default: NPS)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS survey_template TEXT NOT NULL DEFAULT 'NPS'
    CHECK (survey_template IN ('NPS', 'CSAT', 'DIAGNOSTICO', 'MOTIVO'));

-- Tipo registrado em cada resposta + dados estruturados extras
ALTER TABLE public.nps_responses
  ADD COLUMN IF NOT EXISTS tipo_pesquisa TEXT NOT NULL DEFAULT 'NPS'
    CHECK (tipo_pesquisa IN ('NPS', 'CSAT', 'DIAGNOSTICO', 'MOTIVO')),
  ADD COLUMN IF NOT EXISTS dados JSONB;
