-- ============================================================
-- Fase 30: Correções do sistema de cashback
-- B2: Constraint de idempotência (impede duplo crédito por venda)
-- B3: SELECT FOR UPDATE em fn_creditar_cashback (elimina race condition)
-- ============================================================

-- B2: Unique por (sale_id, tipo) quando sale_id não é nulo
-- Permite: 1 CREDITO + 1 RESGATE por sale_id
-- Impede: 2 CREDITOs ou 2 RESGATEs para a mesma venda
CREATE UNIQUE INDEX IF NOT EXISTS uq_cashback_sale_tipo
  ON public.cashback_transacoes(sale_id, tipo)
  WHERE sale_id IS NOT NULL;

-- ============================================================
-- B3: Adiciona SELECT FOR UPDATE em fn_creditar_cashback
-- Evita double-credit em chamadas concorrentes para o mesmo cliente
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
  -- Verifica idempotência: se já existe crédito para esta venda, retorna sem duplicar
  IF p_sale_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.cashback_transacoes
    WHERE sale_id = p_sale_id AND tipo = 'CREDITO'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cashback já creditado para esta venda');
  END IF;

  SELECT * INTO v_cfg FROM public.cashback_config
  WHERE company_id = p_company_id;

  IF NOT FOUND OR NOT v_cfg.ativo THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cashback não configurado ou inativo');
  END IF;

  -- Bloqueia a linha do cliente para evitar race condition
  SELECT * INTO v_cust FROM public.customers
  WHERE id = p_customer_id AND company_id = p_company_id
  FOR UPDATE;

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
    'ok',            true,
    'credito',       v_credito,
    'novo_saldo',    v_saldo_ant + v_credito,
    'tier_anterior', v_cust.cashback_tier,
    'tier_novo',     v_novo_tier,
    'subiu_tier',    v_novo_tier <> v_cust.cashback_tier
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
