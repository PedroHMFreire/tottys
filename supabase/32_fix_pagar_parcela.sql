-- ============================================================
-- Fix: pagar_parcela void → jsonb (com cashback integrado)
-- DROP obrigatório pois o tipo de retorno mudou de void para jsonb
-- ============================================================

DROP FUNCTION IF EXISTS public.pagar_parcela(uuid, numeric);

CREATE FUNCTION public.pagar_parcela(
  p_parcela_id  uuid,
  p_valor_pago  numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parcela      record;
  v_todas_pagas  boolean;
  v_atrasadas    integer;
  v_novo_score   text;
  v_cb_result    jsonb;
BEGIN
  SELECT * INTO v_parcela
    FROM public.crediario_parcelas WHERE id = p_parcela_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  IF v_parcela.status = 'PAGA' THEN RAISE EXCEPTION 'Parcela já foi paga'; END IF;

  UPDATE public.crediario_parcelas
     SET status     = 'PAGA',
         pago_em    = now(),
         valor_pago = p_valor_pago
   WHERE id = p_parcela_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.crediario_parcelas
     WHERE crediario_id = v_parcela.crediario_id
       AND status IN ('PENDENTE','ATRASADA')
  ) INTO v_todas_pagas;

  IF v_todas_pagas THEN
    UPDATE public.crediario_vendas SET status = 'QUITADA'
     WHERE id = v_parcela.crediario_id;
  END IF;

  SELECT COUNT(*) INTO v_atrasadas
    FROM public.crediario_parcelas
   WHERE customer_id = v_parcela.customer_id AND status = 'ATRASADA';

  v_novo_score := CASE
    WHEN v_atrasadas = 0 THEN 'BOM'
    WHEN v_atrasadas <= 2 THEN 'REGULAR'
    ELSE 'RUIM'
  END;

  UPDATE public.customers SET score_interno = v_novo_score
   WHERE id = v_parcela.customer_id;

  BEGIN
    SELECT public.fn_creditar_cashback(
      v_parcela.company_id,
      v_parcela.customer_id,
      NULL,
      p_valor_pago,
      p_parcela_id
    ) INTO v_cb_result;
  EXCEPTION WHEN OTHERS THEN
    v_cb_result := jsonb_build_object('ok', false, 'msg', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'ok',         true,
    'todas_pagas', v_todas_pagas,
    'cashback',    v_cb_result
  );
END;
$$;
