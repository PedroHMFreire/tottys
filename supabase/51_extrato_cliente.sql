-- ============================================================
-- 51_extrato_cliente.sql
-- Token de acesso público para extrato de cashback do cliente
-- ============================================================

-- 1. Coluna de token único por cliente
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS access_token uuid UNIQUE DEFAULT gen_random_uuid();

-- Garante que clientes existentes têm token
UPDATE public.customers
SET access_token = gen_random_uuid()
WHERE access_token IS NULL;

-- 2. RPC pública: retorna extrato completo via token
CREATE OR REPLACE FUNCTION public.fn_extrato_cliente(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cust       record;
  v_empresa    text;
  v_config     record;
  v_transacoes jsonb;
BEGIN
  SELECT c.id, c.nome, c.cashback_saldo, c.cashback_tier,
         c.cashback_total_gasto, c.company_id
  INTO v_cust
  FROM public.customers c
  WHERE c.access_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Link inválido ou expirado');
  END IF;

  SELECT nome INTO v_empresa FROM public.companies WHERE id = v_cust.company_id;

  SELECT min_prata, min_ouro, min_vip
  INTO v_config
  FROM public.cashback_config
  WHERE company_id = v_cust.company_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',             t.id,
      'tipo',           t.tipo,
      'valor',          t.valor,
      'saldo_posterior', t.saldo_posterior,
      'descricao',      t.descricao,
      'created_at',     t.created_at
    ) ORDER BY t.created_at DESC
  ) INTO v_transacoes
  FROM (
    SELECT id, tipo, valor, saldo_posterior, descricao, created_at
    FROM public.cashback_transacoes
    WHERE customer_id = v_cust.id
    ORDER BY created_at DESC
    LIMIT 50
  ) t;

  RETURN jsonb_build_object(
    'ok',          true,
    'nome',        v_cust.nome,
    'saldo',       v_cust.cashback_saldo,
    'tier',        v_cust.cashback_tier,
    'total_gasto', v_cust.cashback_total_gasto,
    'empresa',     COALESCE(v_empresa, 'Loja'),
    'transacoes',  COALESCE(v_transacoes, '[]'::jsonb),
    'tiers', jsonb_build_object(
      'min_prata', COALESCE(v_config.min_prata, 500),
      'min_ouro',  COALESCE(v_config.min_ouro,  1500),
      'min_vip',   COALESCE(v_config.min_vip,   3000)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_extrato_cliente TO anon, authenticated;
