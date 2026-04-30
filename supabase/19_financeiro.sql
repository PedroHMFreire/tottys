-- ============================================================
-- Fase 19: Módulo Financeiro
-- Contas a Pagar + DRE Simplificado + Fluxo Projetado
-- Execução idempotente — seguro re-rodar a qualquer momento.
-- ============================================================

-- 1. Tabela de contas a pagar
CREATE TABLE IF NOT EXISTS public.contas_pagar (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid    NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome        text    NOT NULL,
  valor       numeric(10,2) NOT NULL CHECK (valor > 0),
  vencimento  date    NOT NULL,
  categoria   text    NOT NULL DEFAULT 'OUTROS'
    CHECK (categoria IN ('FORNECEDOR','ALUGUEL','FUNCIONARIOS','ENERGIA','OUTROS')),
  status      text    NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE','PAGO','CANCELADO')),
  recorrente  boolean NOT NULL DEFAULT false,
  pago_em     date,
  valor_pago  numeric(10,2),
  observacoes text,
  origem_id   uuid    REFERENCES public.contas_pagar(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_company    ON public.contas_pagar(company_id);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_vencimento ON public.contas_pagar(company_id, vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_status     ON public.contas_pagar(company_id, status);

ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='contas_pagar' AND policyname='company_own_contas_pagar'
  ) THEN
    CREATE POLICY company_own_contas_pagar ON public.contas_pagar
      USING (company_id = public.current_company_id());
  END IF;
END $$;

-- ============================================================
-- 2. RPC: Gerar próximo mês para contas recorrentes
--    Chamada na abertura da página — idempotente via UNIQUE implícita
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_gerar_recorrentes(p_company_id uuid)
RETURNS void AS $$
DECLARE
  v_row  public.contas_pagar%ROWTYPE;
  v_prox date;
BEGIN
  FOR v_row IN
    SELECT * FROM public.contas_pagar
    WHERE company_id = p_company_id
      AND recorrente = true
      AND status IN ('PAGO','PENDENTE')
  LOOP
    -- Próximo vencimento = mesmo dia do mês seguinte
    v_prox := (date_trunc('month', v_row.vencimento) + interval '1 month')
              + (EXTRACT(DAY FROM v_row.vencimento) - 1) * interval '1 day';

    -- Só cria se ainda não existe para aquele mês
    IF NOT EXISTS (
      SELECT 1 FROM public.contas_pagar
      WHERE company_id = p_company_id
        AND nome       = v_row.nome
        AND vencimento = v_prox
    ) AND v_prox <= CURRENT_DATE + interval '35 days' THEN
      INSERT INTO public.contas_pagar(
        company_id, nome, valor, vencimento,
        categoria, recorrente, origem_id
      ) VALUES (
        p_company_id, v_row.nome, v_row.valor, v_prox,
        v_row.categoria, true, v_row.id
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. RPC: DRE Mensal Simplificado
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_dre_mensal(
  p_company_id uuid,
  p_ano        int,
  p_mes        int
) RETURNS jsonb AS $$
DECLARE
  v_inicio  date := make_date(p_ano, p_mes, 1);
  v_fim     date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;

  v_receita_bruta   numeric := 0;
  v_custo_cartao    numeric := 0;
  v_cashback        numeric := 0;
  v_despesas        numeric := 0;
  v_a_receber_cred  numeric := 0;  -- crediário recebido no mês
BEGIN
  -- Receita bruta: vendas PAGAS no mês (via lojas da empresa)
  SELECT COALESCE(SUM(s.total), 0)
  INTO v_receita_bruta
  FROM public.sales s
  JOIN public.stores st ON st.id = s.store_id
  WHERE st.company_id = p_company_id
    AND s.status = 'PAGA'
    AND s.created_at::date BETWEEN v_inicio AND v_fim;

  -- Custo de cartão: fee_total das payments no mês
  SELECT COALESCE(SUM(p.fee_total), 0)
  INTO v_custo_cartao
  FROM public.payments p
  JOIN public.sales s    ON s.id = p.sale_id
  JOIN public.stores st  ON st.id = s.store_id
  WHERE st.company_id = p_company_id
    AND s.created_at::date BETWEEN v_inicio AND v_fim
    AND p.fee_total IS NOT NULL;

  -- Cashback concedido no mês
  SELECT COALESCE(SUM(valor), 0)
  INTO v_cashback
  FROM public.cashback_transacoes
  WHERE company_id = p_company_id
    AND tipo = 'CREDITO'
    AND created_at::date BETWEEN v_inicio AND v_fim;

  -- Despesas pagas no mês
  SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0)
  INTO v_despesas
  FROM public.contas_pagar
  WHERE company_id = p_company_id
    AND status = 'PAGO'
    AND pago_em BETWEEN v_inicio AND v_fim;

  -- Crediário recebido no mês (parcelas pagas)
  SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0)
  INTO v_a_receber_cred
  FROM public.crediario_parcelas
  WHERE company_id = p_company_id
    AND status = 'PAGA'
    AND pago_em::date BETWEEN v_inicio AND v_fim;

  RETURN jsonb_build_object(
    'periodo',         to_char(v_inicio, 'MM/YYYY'),
    'receita_bruta',   v_receita_bruta,
    'custo_cartao',    v_custo_cartao,
    'cashback',        v_cashback,
    'despesas',        v_despesas,
    'resultado',       v_receita_bruta - v_custo_cartao - v_cashback - v_despesas,
    'crediario_recebido', v_a_receber_cred,
    'receita_total',   v_receita_bruta + v_a_receber_cred
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. RPC: Fluxo projetado (próximos N dias)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_fluxo_projetado(
  p_company_id uuid,
  p_dias       int DEFAULT 7
) RETURNS jsonb AS $$
DECLARE
  v_a_receber  numeric := 0;
  v_a_pagar    numeric := 0;
  v_hoje       date    := CURRENT_DATE;
  v_fim        date    := CURRENT_DATE + p_dias;
BEGIN
  -- A receber: crediário PENDENTE/ATRASADO nos próximos N dias
  SELECT COALESCE(SUM(valor), 0)
  INTO v_a_receber
  FROM public.crediario_parcelas
  WHERE company_id = p_company_id
    AND status IN ('PENDENTE', 'ATRASADA')
    AND vencimento BETWEEN v_hoje AND v_fim;

  -- A pagar: contas PENDENTES nos próximos N dias
  SELECT COALESCE(SUM(valor), 0)
  INTO v_a_pagar
  FROM public.contas_pagar
  WHERE company_id = p_company_id
    AND status = 'PENDENTE'
    AND vencimento BETWEEN v_hoje AND v_fim;

  RETURN jsonb_build_object(
    'dias',        p_dias,
    'a_receber',   v_a_receber,
    'a_pagar',     v_a_pagar,
    'saldo_liquido', v_a_receber - v_a_pagar
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. RPC: Resumo do dia (hoje)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_financeiro_hoje(p_company_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_vendas_hoje      numeric := 0;
  v_a_receber_hoje   numeric := 0;
  v_a_pagar_hoje     numeric := 0;
  v_atrasadas_total  numeric := 0;
  v_em_aberto_pagar  numeric := 0;
BEGIN
  -- Vendas do dia
  SELECT COALESCE(SUM(s.total), 0)
  INTO v_vendas_hoje
  FROM public.sales s
  JOIN public.stores st ON st.id = s.store_id
  WHERE st.company_id = p_company_id
    AND s.status = 'PAGA'
    AND s.created_at::date = CURRENT_DATE;

  -- Crediário a receber hoje
  SELECT COALESCE(SUM(valor), 0)
  INTO v_a_receber_hoje
  FROM public.crediario_parcelas
  WHERE company_id = p_company_id
    AND status = 'PENDENTE'
    AND vencimento = CURRENT_DATE;

  -- Crediário atrasado (total em aberto)
  SELECT COALESCE(SUM(valor), 0)
  INTO v_atrasadas_total
  FROM public.crediario_parcelas
  WHERE company_id = p_company_id
    AND status = 'ATRASADA';

  -- Contas vencendo hoje
  SELECT COALESCE(SUM(valor), 0)
  INTO v_a_pagar_hoje
  FROM public.contas_pagar
  WHERE company_id = p_company_id
    AND status = 'PENDENTE'
    AND vencimento = CURRENT_DATE;

  -- Total de contas em aberto (incluindo atrasadas)
  SELECT COALESCE(SUM(valor), 0)
  INTO v_em_aberto_pagar
  FROM public.contas_pagar
  WHERE company_id = p_company_id
    AND status = 'PENDENTE'
    AND vencimento <= CURRENT_DATE + 30;

  RETURN jsonb_build_object(
    'vendas_hoje',       v_vendas_hoje,
    'a_receber_hoje',    v_a_receber_hoje,
    'atrasadas_total',   v_atrasadas_total,
    'a_pagar_hoje',      v_a_pagar_hoje,
    'em_aberto_pagar',   v_em_aberto_pagar
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
