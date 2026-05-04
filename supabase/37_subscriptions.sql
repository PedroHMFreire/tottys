-- ============================================================
-- 37_subscriptions.sql
-- Tabela de assinaturas + trial automático de 14 dias.
-- Execute no SQL Editor do Supabase após o deploy da Fase 2.
-- ============================================================

-- ── 1. Tabela ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan                   text        NOT NULL DEFAULT 'GESTAO'
                                     CHECK (plan IN ('LOJA','GESTAO','REDE')),
  status                 text        NOT NULL DEFAULT 'trialing'
                                     CHECK (status IN ('trialing','active','past_due','canceled','paused')),
  trial_ends_at          timestamptz,
  current_period_end     timestamptz,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

-- Uma assinatura por empresa
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_company_idx ON public.subscriptions(company_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_idx ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_sub_idx    ON public.subscriptions(stripe_subscription_id);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Empresa vê a própria assinatura; OWNER vê todas
CREATE POLICY subscriptions_select ON public.subscriptions
  FOR SELECT
  USING (
    public.current_role() = 'OWNER'
    OR company_id = public.current_company_id()
  );

-- Apenas OWNER (ou service_role via webhook) pode alterar
CREATE POLICY subscriptions_write ON public.subscriptions
  FOR ALL
  USING  (public.current_role() = 'OWNER')
  WITH CHECK (public.current_role() = 'OWNER');

-- ── 3. Funções ────────────────────────────────────────────────────────────────

-- Cria trial de 14 dias no plano GESTAO para uma empresa recém-criada.
-- Chamada pelo Onboarding após criar a empresa.
CREATE OR REPLACE FUNCTION public.create_trial_subscription(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (company_id, plan, status, trial_ends_at)
  VALUES (p_company_id, 'GESTAO', 'trialing', now() + interval '14 days')
  ON CONFLICT (company_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_trial_subscription(uuid) TO authenticated;

-- Retorna a assinatura da empresa do usuário logado (para o frontend).
CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS TABLE(
  id                     uuid,
  company_id             uuid,
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan                   text,
  status                 text,
  trial_ends_at          timestamptz,
  current_period_end     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, company_id, stripe_customer_id, stripe_subscription_id,
    plan, status, trial_ends_at, current_period_end
  FROM public.subscriptions
  WHERE company_id = public.current_company_id()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_subscription() TO authenticated;

-- ── 4. Verificação ────────────────────────────────────────────────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'subscriptions'
ORDER BY ordinal_position;
