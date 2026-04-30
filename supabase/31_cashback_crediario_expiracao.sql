-- ============================================================
-- Fase 31: Cashback no crediário (B9) + Expiração lazy (B4)
-- Defensivo: adapta-se à ausência de crediario_parcelas
-- ============================================================

-- ============================================================
-- B4: Coluna de expiração na config
-- ============================================================
ALTER TABLE public.cashback_config
  ADD COLUMN IF NOT EXISTS expiracao_dias int NOT NULL DEFAULT 365;

-- ============================================================
-- B4: Coluna expira_em nas transações
-- ============================================================
ALTER TABLE public.cashback_transacoes
  ADD COLUMN IF NOT EXISTS expira_em timestamptz;

-- ============================================================
-- B9: Coluna parcela_id nas transações
-- FK para crediario_parcelas adicionada apenas se a tabela existir
-- ============================================================
ALTER TABLE public.cashback_transacoes
  ADD COLUMN IF NOT EXISTS parcela_id uuid;

DO $$
BEGIN
  -- Adiciona FK só se crediario_parcelas existir
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crediario_parcelas'
  ) THEN
    -- Adiciona a constraint somente se ainda não existe
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'cashback_transacoes_parcela_id_fkey'
        AND table_name = 'cashback_transacoes'
    ) THEN
      ALTER TABLE public.cashback_transacoes
        ADD CONSTRAINT cashback_transacoes_parcela_id_fkey
        FOREIGN KEY (parcela_id)
        REFERENCES public.crediario_parcelas(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Índice por parcela_id
CREATE INDEX IF NOT EXISTS idx_cashback_transacoes_parcela
  ON public.cashback_transacoes(parcela_id)
  WHERE parcela_id IS NOT NULL;

-- Idempotência: evita duplo crédito para a mesma parcela
CREATE UNIQUE INDEX IF NOT EXISTS uq_cashback_parcela_tipo
  ON public.cashback_transacoes(parcela_id, tipo)
  WHERE parcela_id IS NOT NULL;

-- ============================================================
-- Preenche expira_em nas transações CREDITO existentes
-- ============================================================
UPDATE public.cashback_transacoes ct
SET expira_em = ct.created_at + (
  SELECT (cc.expiracao_dias || ' days')::interval
  FROM public.cashback_config cc
  WHERE cc.company_id = ct.company_id AND cc.expiracao_dias > 0
)
WHERE ct.tipo = 'CREDITO' AND ct.expira_em IS NULL;

-- ============================================================
-- Trigger: preenche expira_em automaticamente em cada CREDITO
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_set_cashback_expiracao()
RETURNS trigger AS $$
DECLARE
  v_dias int;
BEGIN
  IF NEW.tipo = 'CREDITO' AND NEW.expira_em IS NULL THEN
    SELECT expiracao_dias INTO v_dias
    FROM public.cashback_config
    WHERE company_id = NEW.company_id;

    IF FOUND AND v_dias > 0 THEN
      NEW.expira_em := NEW.created_at + (v_dias || ' days')::interval;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cashback_expiracao ON public.cashback_transacoes;
CREATE TRIGGER trg_cashback_expiracao
  BEFORE INSERT ON public.cashback_transacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_cashback_expiracao();

-- ============================================================
-- fn_creditar_cashback: aceita parcela_id + idempotência dupla
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_creditar_cashback(
  p_company_id  uuid,
  p_customer_id uuid,
  p_sale_id     uuid,
  p_valor_venda numeric,
  p_parcela_id  uuid DEFAULT NULL
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
  IF p_sale_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.cashback_transacoes
    WHERE sale_id = p_sale_id AND tipo = 'CREDITO'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cashback já creditado para esta venda');
  END IF;

  IF p_parcela_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.cashback_transacoes
    WHERE parcela_id = p_parcela_id AND tipo = 'CREDITO'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cashback já creditado para esta parcela');
  END IF;

  SELECT * INTO v_cfg FROM public.cashback_config
  WHERE company_id = p_company_id;

  IF NOT FOUND OR NOT v_cfg.ativo THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cashback não configurado ou inativo');
  END IF;

  SELECT * INTO v_cust FROM public.customers
  WHERE id = p_customer_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Cliente não encontrado');
  END IF;

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

  UPDATE public.customers SET
    cashback_saldo       = cashback_saldo + v_credito,
    cashback_total_gasto = v_novo_total,
    cashback_tier        = v_novo_tier
  WHERE id = p_customer_id;

  INSERT INTO public.cashback_transacoes(
    company_id, customer_id, sale_id, parcela_id, tipo, valor,
    saldo_anterior, saldo_posterior, descricao
  ) VALUES (
    p_company_id, p_customer_id, p_sale_id, p_parcela_id, 'CREDITO', v_credito,
    v_saldo_ant, v_saldo_ant + v_credito,
    CASE
      WHEN p_parcela_id IS NOT NULL
        THEN format('Cashback %s%% sobre parcela de R$ %s', v_pct::text, to_char(p_valor_venda, 'FM9999999.00'))
      ELSE format('Cashback %s%% sobre venda de R$ %s', v_pct::text, to_char(p_valor_venda, 'FM9999999.00'))
    END
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

-- ============================================================
-- pagar_parcela: versão com cashback integrado
-- Só redefine se crediario_parcelas existir
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crediario_parcelas'
  ) THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION public.pagar_parcela(
        p_parcela_id  uuid,
        p_valor_pago  numeric
      ) RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $inner$
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
          'ok', true,
          'todas_pagas', v_todas_pagas,
          'cashback', v_cb_result
        );
      END;
      $inner$
    $func$;
  END IF;
END $$;

-- ============================================================
-- fn_expirar_cashback: processa créditos vencidos (lazy)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_expirar_cashback(p_company_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_rec   record;
  v_total numeric := 0;
  v_count int     := 0;
BEGIN
  FOR v_rec IN
    SELECT
      ct.customer_id,
      SUM(ct.valor) AS valor_a_expirar
    FROM public.cashback_transacoes ct
    WHERE ct.company_id = p_company_id
      AND ct.tipo = 'CREDITO'
      AND ct.expira_em IS NOT NULL
      AND ct.expira_em < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.cashback_transacoes ex
        WHERE ex.company_id  = p_company_id
          AND ex.customer_id = ct.customer_id
          AND ex.tipo        = 'EXPIRACAO'
          AND ex.created_at >= ct.expira_em - interval '1 second'
          AND ex.created_at <= ct.expira_em + interval '1 day'
      )
    GROUP BY ct.customer_id
  LOOP
    DECLARE
      v_saldo_atual numeric;
      v_expirar     numeric;
    BEGIN
      SELECT cashback_saldo INTO v_saldo_atual
      FROM public.customers
      WHERE id = v_rec.customer_id AND company_id = p_company_id
      FOR UPDATE;

      v_expirar := LEAST(v_rec.valor_a_expirar, v_saldo_atual);
      IF v_expirar > 0 THEN
        UPDATE public.customers
        SET cashback_saldo = cashback_saldo - v_expirar
        WHERE id = v_rec.customer_id;

        INSERT INTO public.cashback_transacoes(
          company_id, customer_id, tipo, valor,
          saldo_anterior, saldo_posterior, descricao
        ) VALUES (
          p_company_id, v_rec.customer_id, 'EXPIRACAO', v_expirar,
          v_saldo_atual, v_saldo_atual - v_expirar,
          format('Cashback expirado em %s', to_char(now(), 'DD/MM/YYYY'))
        );

        v_total := v_total + v_expirar;
        v_count := v_count + 1;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'clientes_expirados', v_count, 'valor_expirado', v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
