-- ============================================================
-- Fase 18: Sistema de Cashback / Fidelidade
-- Tiers fashion: Bronze → Prata → Ouro → VIP
-- Execução idempotente — seguro re-rodar a qualquer momento.
-- ============================================================

-- 1. Extensão da tabela de clientes
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS cashback_saldo       numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashback_total_gasto numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashback_tier        text          NOT NULL DEFAULT 'BRONZE'
    CHECK (cashback_tier IN ('BRONZE','PRATA','OURO','VIP'));

-- 2. Configuração de cashback por empresa
CREATE TABLE IF NOT EXISTS public.cashback_config (
  company_id    uuid    PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Percentuais por tier
  pct_bronze    numeric(5,2) NOT NULL DEFAULT 3,
  pct_prata     numeric(5,2) NOT NULL DEFAULT 5,
  pct_ouro      numeric(5,2) NOT NULL DEFAULT 7,
  pct_vip       numeric(5,2) NOT NULL DEFAULT 10,
  -- Thresholds de tier (total gasto acumulado em R$)
  min_prata     numeric(10,2) NOT NULL DEFAULT 500,
  min_ouro      numeric(10,2) NOT NULL DEFAULT 1500,
  min_vip       numeric(10,2) NOT NULL DEFAULT 3000,
  -- Regras gerais
  resgate_minimo  numeric(10,2) NOT NULL DEFAULT 5,
  ativo           boolean       NOT NULL DEFAULT true,
  -- Template WhatsApp para reativação
  msg_reativacao  text DEFAULT
    'Olá {{nome}}! Você tem *R$ {{saldo}}* de cashback esperando por você na {{empresa}}. Venha aproveitar! 🎉',
  updated_at    timestamptz DEFAULT now()
);

-- 3. Histórico de transações de cashback
CREATE TABLE IF NOT EXISTS public.cashback_transacoes (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid    NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id   uuid    NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id       uuid    REFERENCES public.sales(id) ON DELETE SET NULL,
  tipo          text    NOT NULL CHECK (tipo IN ('CREDITO','RESGATE','EXPIRACAO','AJUSTE')),
  valor         numeric(10,2) NOT NULL,
  saldo_anterior  numeric(10,2) NOT NULL DEFAULT 0,
  saldo_posterior numeric(10,2) NOT NULL DEFAULT 0,
  descricao     text,
  created_at    timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cashback_transacoes_company   ON public.cashback_transacoes(company_id);
CREATE INDEX IF NOT EXISTS idx_cashback_transacoes_customer  ON public.cashback_transacoes(customer_id);
CREATE INDEX IF NOT EXISTS idx_cashback_transacoes_created   ON public.cashback_transacoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_cashback_tier       ON public.customers(company_id, cashback_tier);

-- 4. RLS
ALTER TABLE public.cashback_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashback_transacoes  ENABLE ROW LEVEL SECURITY;

-- cashback_config: empresa lê/edita a própria
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cashback_config' AND policyname='company_own_cashback_config') THEN
    CREATE POLICY company_own_cashback_config ON public.cashback_config
      USING (company_id = public.current_company_id());
  END IF;
END $$;

-- cashback_transacoes: empresa lê as próprias
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cashback_transacoes' AND policyname='company_own_cashback_tx') THEN
    CREATE POLICY company_own_cashback_tx ON public.cashback_transacoes
      USING (company_id = public.current_company_id());
  END IF;
END $$;

-- ============================================================
-- 5. Funções auxiliares
-- ============================================================

-- Calcula tier a partir do total gasto e thresholds da empresa
CREATE OR REPLACE FUNCTION public.fn_cashback_tier(
  p_total_gasto numeric,
  p_min_prata   numeric,
  p_min_ouro    numeric,
  p_min_vip     numeric
) RETURNS text AS $$
BEGIN
  IF p_total_gasto >= p_min_vip  THEN RETURN 'VIP';
  ELSIF p_total_gasto >= p_min_ouro  THEN RETURN 'OURO';
  ELSIF p_total_gasto >= p_min_prata THEN RETURN 'PRATA';
  ELSE RETURN 'BRONZE';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 6. RPC: Creditar cashback após venda
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_creditar_cashback(
  p_company_id  uuid,
  p_customer_id uuid,
  p_sale_id     uuid,
  p_valor_venda numeric
) RETURNS jsonb AS $$
DECLARE
  v_cfg     public.cashback_config%ROWTYPE;
  v_cust    public.customers%ROWTYPE;
  v_pct     numeric;
  v_credito numeric;
  v_novo_total  numeric;
  v_novo_tier   text;
  v_saldo_ant   numeric;
BEGIN
  SELECT * INTO v_cfg FROM public.cashback_config
  WHERE company_id = p_company_id;

  IF NOT FOUND OR NOT v_cfg.ativo THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cashback não configurado ou inativo');
  END IF;

  SELECT * INTO v_cust FROM public.customers
  WHERE id = p_customer_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cliente não encontrado');
  END IF;

  -- Percentual do tier atual
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

  -- Atualiza cliente
  UPDATE public.customers SET
    cashback_saldo       = cashback_saldo + v_credito,
    cashback_total_gasto = v_novo_total,
    cashback_tier        = v_novo_tier
  WHERE id = p_customer_id;

  -- Registra transação
  INSERT INTO public.cashback_transacoes(
    company_id, customer_id, sale_id, tipo, valor,
    saldo_anterior, saldo_posterior, descricao
  ) VALUES (
    p_company_id, p_customer_id, p_sale_id, 'CREDITO', v_credito,
    v_saldo_ant, v_saldo_ant + v_credito,
    format('Cashback %s%% sobre venda de R$ %s',
      v_pct::text, to_char(p_valor_venda, 'FM9999999.00'))
  );

  RETURN jsonb_build_object(
    'ok',           true,
    'credito',      v_credito,
    'novo_saldo',   v_saldo_ant + v_credito,
    'tier_anterior', v_cust.cashback_tier,
    'tier_novo',    v_novo_tier,
    'subiu_tier',   v_novo_tier <> v_cust.cashback_tier
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. RPC: Resgatar cashback no PDV
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_resgatar_cashback(
  p_company_id   uuid,
  p_customer_id  uuid,
  p_valor_resgate numeric,
  p_sale_id      uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_cfg    public.cashback_config%ROWTYPE;
  v_saldo  numeric;
BEGIN
  SELECT * INTO v_cfg FROM public.cashback_config
  WHERE company_id = p_company_id;

  IF NOT FOUND OR NOT v_cfg.ativo THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cashback não configurado ou inativo');
  END IF;

  IF p_valor_resgate < v_cfg.resgate_minimo THEN
    RETURN jsonb_build_object('ok', false,
      'msg', format('Resgate mínimo: R$ %.2f', v_cfg.resgate_minimo));
  END IF;

  SELECT cashback_saldo INTO v_saldo FROM public.customers
  WHERE id = p_customer_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cliente não encontrado');
  END IF;

  IF p_valor_resgate > v_saldo THEN
    RETURN jsonb_build_object('ok', false,
      'msg', format('Saldo insuficiente: R$ %.2f disponível', v_saldo));
  END IF;

  UPDATE public.customers
  SET cashback_saldo = cashback_saldo - p_valor_resgate
  WHERE id = p_customer_id;

  INSERT INTO public.cashback_transacoes(
    company_id, customer_id, sale_id, tipo, valor,
    saldo_anterior, saldo_posterior, descricao
  ) VALUES (
    p_company_id, p_customer_id, p_sale_id, 'RESGATE', p_valor_resgate,
    v_saldo, v_saldo - p_valor_resgate, 'Resgate de cashback no PDV'
  );

  RETURN jsonb_build_object('ok', true, 'novo_saldo', v_saldo - p_valor_resgate);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. RPC: Dashboard de cashback
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_cashback_dashboard(p_company_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_total_distribuido numeric;
  v_total_resgatado   numeric;
  v_clientes_com_saldo bigint;
  v_saldo_pendente    numeric;
  v_bronze bigint; v_prata bigint; v_ouro bigint; v_vip bigint;
BEGIN
  SELECT COALESCE(SUM(valor), 0) INTO v_total_distribuido
  FROM public.cashback_transacoes
  WHERE company_id = p_company_id AND tipo = 'CREDITO';

  SELECT COALESCE(SUM(valor), 0) INTO v_total_resgatado
  FROM public.cashback_transacoes
  WHERE company_id = p_company_id AND tipo = 'RESGATE';

  SELECT COUNT(*), COALESCE(SUM(cashback_saldo), 0)
  INTO v_clientes_com_saldo, v_saldo_pendente
  FROM public.customers
  WHERE company_id = p_company_id AND cashback_saldo > 0;

  SELECT
    COUNT(*) FILTER (WHERE cashback_tier = 'BRONZE'),
    COUNT(*) FILTER (WHERE cashback_tier = 'PRATA'),
    COUNT(*) FILTER (WHERE cashback_tier = 'OURO'),
    COUNT(*) FILTER (WHERE cashback_tier = 'VIP')
  INTO v_bronze, v_prata, v_ouro, v_vip
  FROM public.customers
  WHERE company_id = p_company_id AND cashback_total_gasto > 0;

  RETURN jsonb_build_object(
    'total_distribuido',   v_total_distribuido,
    'total_resgatado',     v_total_resgatado,
    'clientes_com_saldo',  v_clientes_com_saldo,
    'saldo_pendente',      v_saldo_pendente,
    'tiers', jsonb_build_object(
      'bronze', v_bronze, 'prata', v_prata,
      'ouro', v_ouro, 'vip', v_vip
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. RPC: Clientes inativos com saldo (para reativação WhatsApp)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_clientes_inativos_cashback(
  p_company_id uuid,
  p_dias       int DEFAULT 30
) RETURNS TABLE(
  customer_id    uuid,
  nome           text,
  contato        text,
  cashback_saldo numeric,
  cashback_tier  text,
  ultima_compra  date
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.nome::text,
    c.contato::text,
    c.cashback_saldo,
    c.cashback_tier::text,
    MAX(s.created_at::date) AS ultima_compra
  FROM public.customers c
  LEFT JOIN public.sales s
    ON s.customer_id = c.id AND s.status = 'PAGA'
  WHERE c.company_id = p_company_id
    AND c.cashback_saldo > 0
  GROUP BY c.id, c.nome, c.contato, c.cashback_saldo, c.cashback_tier
  HAVING
    MAX(s.created_at) < NOW() - (p_dias || ' days')::interval
    OR MAX(s.created_at) IS NULL
  ORDER BY c.cashback_saldo DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
