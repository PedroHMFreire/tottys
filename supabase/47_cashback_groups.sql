-- ============================================================
-- 47_cashback_groups.sql
-- Sistema de grupos de cashback
-- Lojas podem pertencer a um grupo e compartilhar saldo com clientes
-- Lojas podem ter cashback desativado individualmente
-- ============================================================

-- 1. Grupos de cashback
CREATE TABLE IF NOT EXISTS public.cashback_groups (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome       text        NOT NULL,
  cor        text        NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashback_groups_company ON public.cashback_groups(company_id);

ALTER TABLE public.cashback_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashback_groups_company" ON public.cashback_groups
  FOR ALL USING (company_id = public.current_company_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashback_groups TO authenticated;

-- 2. Adiciona colunas à tabela stores
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS cashback_group_id uuid REFERENCES public.cashback_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cashback_ativo    boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_stores_cashback_group ON public.stores(cashback_group_id) WHERE cashback_group_id IS NOT NULL;

-- 3. Saldo de cashback por cliente, por grupo ou por loja
CREATE TABLE IF NOT EXISTS public.customer_cashback_balance (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id       uuid          NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  cashback_group_id uuid          REFERENCES public.cashback_groups(id) ON DELETE CASCADE,
  store_id          uuid          REFERENCES public.stores(id) ON DELETE CASCADE,
  saldo             numeric(14,2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  tier              text          NOT NULL DEFAULT 'BRONZE' CHECK (tier IN ('BRONZE','PRATA','OURO','VIP')),
  total_gasto       numeric(14,2) NOT NULL DEFAULT 0,
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

-- Unique por (cliente, grupo) e (cliente, loja sem grupo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ccb_group
  ON public.customer_cashback_balance(customer_id, cashback_group_id)
  WHERE cashback_group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ccb_store
  ON public.customer_cashback_balance(customer_id, store_id)
  WHERE store_id IS NOT NULL AND cashback_group_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ccb_customer ON public.customer_cashback_balance(customer_id);
CREATE INDEX IF NOT EXISTS idx_ccb_company  ON public.customer_cashback_balance(company_id);

ALTER TABLE public.customer_cashback_balance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccb_company" ON public.customer_cashback_balance
  FOR ALL USING (company_id = public.current_company_id());

GRANT SELECT, INSERT, UPDATE ON public.customer_cashback_balance TO authenticated;

-- 4. Migra saldos existentes: cada cliente com saldo vira uma linha legacy
-- (group_id=NULL, store_id=NULL representa o saldo "empresa" pré-grupos)
INSERT INTO public.customer_cashback_balance (company_id, customer_id, saldo, tier, total_gasto)
SELECT company_id, id, cashback_saldo, cashback_tier, cashback_total_gasto
FROM public.customers
WHERE cashback_saldo > 0
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. fn_get_cashback_saldo — saldo para uma loja específica
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_get_cashback_saldo(
  p_customer_id uuid,
  p_store_id    uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group_id    uuid;
  v_store_ativo boolean;
  v_row         record;
  v_company_id  uuid;
BEGIN
  -- Busca info da loja
  SELECT cashback_group_id, cashback_ativo, company_id
  INTO v_group_id, v_store_ativo, v_company_id
  FROM stores WHERE id = p_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('saldo', 0, 'tier', 'BRONZE', 'ativo', false);
  END IF;

  IF NOT v_store_ativo THEN
    RETURN jsonb_build_object('saldo', 0, 'tier', 'BRONZE', 'ativo', false);
  END IF;

  -- Busca saldo específico do grupo ou loja
  IF v_group_id IS NOT NULL THEN
    SELECT saldo, tier INTO v_row
    FROM customer_cashback_balance
    WHERE customer_id = p_customer_id AND cashback_group_id = v_group_id;
  ELSE
    SELECT saldo, tier INTO v_row
    FROM customer_cashback_balance
    WHERE customer_id = p_customer_id AND store_id = p_store_id AND cashback_group_id IS NULL;
  END IF;

  IF FOUND THEN
    RETURN jsonb_build_object('saldo', v_row.saldo, 'tier', v_row.tier, 'ativo', true);
  END IF;

  -- Fallback: saldo legacy (group_id NULL e store_id NULL) migrado da tabela customers
  SELECT saldo, tier INTO v_row
  FROM customer_cashback_balance
  WHERE customer_id = p_customer_id AND cashback_group_id IS NULL AND store_id IS NULL
    AND company_id = v_company_id;

  IF FOUND THEN
    RETURN jsonb_build_object('saldo', v_row.saldo, 'tier', v_row.tier, 'ativo', true);
  END IF;

  RETURN jsonb_build_object('saldo', 0, 'tier', 'BRONZE', 'ativo', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_cashback_saldo TO authenticated;

-- ============================================================
-- 6. fn_creditar_cashback — adiciona p_store_id opcional
-- ============================================================
DROP FUNCTION IF EXISTS public.fn_creditar_cashback(uuid, uuid, uuid, numeric);

CREATE FUNCTION public.fn_creditar_cashback(
  p_company_id  uuid,
  p_customer_id uuid,
  p_sale_id     uuid,
  p_valor_venda numeric,
  p_store_id    uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg         public.cashback_config%ROWTYPE;
  v_cust        public.customers%ROWTYPE;
  v_pct         numeric;
  v_credito     numeric;
  v_novo_total  numeric;
  v_novo_tier   text;
  v_saldo_ant   numeric;
  v_group_id    uuid;
  v_store_ativo boolean := true;
BEGIN
  -- Idempotência: impede duplo crédito por venda
  IF p_sale_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.cashback_transacoes
    WHERE sale_id = p_sale_id AND tipo = 'CREDITO'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cashback já creditado para esta venda');
  END IF;

  SELECT * INTO v_cfg FROM public.cashback_config WHERE company_id = p_company_id;
  IF NOT FOUND OR NOT v_cfg.ativo THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cashback não configurado ou inativo');
  END IF;

  -- Verifica se a loja permite cashback
  IF p_store_id IS NOT NULL THEN
    SELECT cashback_group_id, cashback_ativo INTO v_group_id, v_store_ativo
    FROM public.stores WHERE id = p_store_id;
    IF NOT v_store_ativo THEN
      RETURN jsonb_build_object('ok', false, 'msg', 'Cashback desativado nesta loja');
    END IF;
  END IF;

  SELECT * INTO v_cust FROM public.customers
  WHERE id = p_customer_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cliente não encontrado');
  END IF;

  -- Calcula crédito
  v_pct := CASE v_cust.cashback_tier
    WHEN 'BRONZE' THEN v_cfg.pct_bronze
    WHEN 'PRATA'  THEN v_cfg.pct_prata
    WHEN 'OURO'   THEN v_cfg.pct_ouro
    WHEN 'VIP'    THEN v_cfg.pct_vip
    ELSE v_cfg.pct_bronze
  END;

  v_credito    := ROUND(p_valor_venda * v_pct / 100, 2);
  v_saldo_ant  := v_cust.cashback_saldo;
  v_novo_total := v_cust.cashback_total_gasto + p_valor_venda;
  v_novo_tier  := public.fn_cashback_tier(v_novo_total, v_cfg.min_prata, v_cfg.min_ouro, v_cfg.min_vip);

  -- Atualiza customers (mantém compat com dashboards e busca)
  UPDATE public.customers SET
    cashback_saldo       = cashback_saldo + v_credito,
    cashback_total_gasto = v_novo_total,
    cashback_tier        = v_novo_tier
  WHERE id = p_customer_id;

  -- Upsert na tabela de saldos por grupo/loja
  IF p_store_id IS NOT NULL THEN
    IF v_group_id IS NOT NULL THEN
      INSERT INTO public.customer_cashback_balance
        (company_id, customer_id, cashback_group_id, saldo, tier, total_gasto)
      VALUES
        (p_company_id, p_customer_id, v_group_id, v_credito, v_novo_tier, p_valor_venda)
      ON CONFLICT (customer_id, cashback_group_id) WHERE cashback_group_id IS NOT NULL
      DO UPDATE SET
        saldo       = customer_cashback_balance.saldo + v_credito,
        total_gasto = customer_cashback_balance.total_gasto + p_valor_venda,
        tier        = public.fn_cashback_tier(
                        customer_cashback_balance.total_gasto + p_valor_venda,
                        v_cfg.min_prata, v_cfg.min_ouro, v_cfg.min_vip),
        updated_at  = now();
    ELSE
      INSERT INTO public.customer_cashback_balance
        (company_id, customer_id, store_id, saldo, tier, total_gasto)
      VALUES
        (p_company_id, p_customer_id, p_store_id, v_credito, v_novo_tier, p_valor_venda)
      ON CONFLICT (customer_id, store_id) WHERE store_id IS NOT NULL AND cashback_group_id IS NULL
      DO UPDATE SET
        saldo       = customer_cashback_balance.saldo + v_credito,
        total_gasto = customer_cashback_balance.total_gasto + p_valor_venda,
        tier        = public.fn_cashback_tier(
                        customer_cashback_balance.total_gasto + p_valor_venda,
                        v_cfg.min_prata, v_cfg.min_ouro, v_cfg.min_vip),
        updated_at  = now();
    END IF;
  END IF;

  -- Registra transação
  INSERT INTO public.cashback_transacoes(
    company_id, customer_id, sale_id, tipo, valor,
    saldo_anterior, saldo_posterior, descricao
  ) VALUES (
    p_company_id, p_customer_id, p_sale_id, 'CREDITO', v_credito,
    v_saldo_ant, v_saldo_ant + v_credito,
    format('Cashback %s%% sobre venda de R$ %s', v_pct::text, to_char(p_valor_venda, 'FM9999999.00'))
  );

  RETURN jsonb_build_object(
    'ok',            true,
    'credito',       v_credito,
    'novo_saldo',    v_saldo_ant + v_credito,
    'tier_anterior', v_cust.cashback_tier,
    'tier_novo',     v_novo_tier,
    'subiu_tier',    v_novo_tier <> v_cust.cashback_tier
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_creditar_cashback TO authenticated;

-- ============================================================
-- 7. fn_resgatar_cashback — adiciona p_store_id opcional
-- ============================================================
DROP FUNCTION IF EXISTS public.fn_resgatar_cashback(uuid, uuid, numeric, uuid);

CREATE FUNCTION public.fn_resgatar_cashback(
  p_company_id    uuid,
  p_customer_id   uuid,
  p_valor_resgate numeric,
  p_sale_id       uuid DEFAULT NULL,
  p_store_id      uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg         public.cashback_config%ROWTYPE;
  v_saldo_cust  numeric;
  v_group_id    uuid;
  v_store_ativo boolean := true;
  v_bal_saldo   numeric;
  v_bal_id      uuid;
  v_saldo_efetivo numeric;
BEGIN
  SELECT * INTO v_cfg FROM public.cashback_config WHERE company_id = p_company_id;
  IF NOT FOUND OR NOT v_cfg.ativo THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cashback não configurado ou inativo');
  END IF;

  IF p_valor_resgate < v_cfg.resgate_minimo THEN
    RETURN jsonb_build_object('ok', false,
      'msg', format('Resgate mínimo: R$ %.2f', v_cfg.resgate_minimo));
  END IF;

  -- Verifica se a loja permite cashback
  IF p_store_id IS NOT NULL THEN
    SELECT cashback_group_id, cashback_ativo INTO v_group_id, v_store_ativo
    FROM public.stores WHERE id = p_store_id;
    IF NOT v_store_ativo THEN
      RETURN jsonb_build_object('ok', false, 'msg', 'Cashback desativado nesta loja');
    END IF;
  END IF;

  -- Bloqueia linha do cliente
  SELECT cashback_saldo INTO v_saldo_cust FROM public.customers
  WHERE id = p_customer_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cliente não encontrado');
  END IF;

  -- Determina saldo efetivo (grupo/loja específico ou fallback global)
  IF p_store_id IS NOT NULL THEN
    IF v_group_id IS NOT NULL THEN
      SELECT id, saldo INTO v_bal_id, v_bal_saldo
      FROM public.customer_cashback_balance
      WHERE customer_id = p_customer_id AND cashback_group_id = v_group_id
      FOR UPDATE;
    ELSE
      SELECT id, saldo INTO v_bal_id, v_bal_saldo
      FROM public.customer_cashback_balance
      WHERE customer_id = p_customer_id AND store_id = p_store_id AND cashback_group_id IS NULL
      FOR UPDATE;
    END IF;

    -- Fallback: saldo legacy (NULL-NULL) se não há linha específica
    IF NOT FOUND THEN
      SELECT id, saldo INTO v_bal_id, v_bal_saldo
      FROM public.customer_cashback_balance
      WHERE customer_id = p_customer_id AND cashback_group_id IS NULL AND store_id IS NULL
        AND company_id = p_company_id
      FOR UPDATE;
    END IF;

    v_saldo_efetivo := COALESCE(v_bal_saldo, 0);
  ELSE
    v_saldo_efetivo := v_saldo_cust;
  END IF;

  IF p_valor_resgate > v_saldo_efetivo THEN
    RETURN jsonb_build_object('ok', false,
      'msg', format('Saldo insuficiente: R$ %.2f disponível', v_saldo_efetivo));
  END IF;

  -- Deduz do saldo específico (se encontrado)
  IF v_bal_id IS NOT NULL THEN
    UPDATE public.customer_cashback_balance
    SET saldo = saldo - p_valor_resgate, updated_at = now()
    WHERE id = v_bal_id;
  END IF;

  -- Atualiza customers (compat)
  UPDATE public.customers
  SET cashback_saldo = GREATEST(0, cashback_saldo - p_valor_resgate)
  WHERE id = p_customer_id;

  INSERT INTO public.cashback_transacoes(
    company_id, customer_id, sale_id, tipo, valor,
    saldo_anterior, saldo_posterior, descricao
  ) VALUES (
    p_company_id, p_customer_id, p_sale_id, 'RESGATE', p_valor_resgate,
    v_saldo_cust, GREATEST(0, v_saldo_cust - p_valor_resgate), 'Resgate de cashback no PDV'
  );

  RETURN jsonb_build_object('ok', true, 'novo_saldo', GREATEST(0, v_saldo_cust - p_valor_resgate));
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_resgatar_cashback TO authenticated;
