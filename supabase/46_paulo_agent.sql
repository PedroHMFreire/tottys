-- ============================================================
-- 46_paulo_agent.sql
-- Paulo — Gerente Geral de Vendas com IA
-- ============================================================

-- ── Histórico de conversas ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paulo_conversations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id    UUID        REFERENCES public.stores(id) ON DELETE SET NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.paulo_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        NOT NULL REFERENCES public.paulo_conversations(id) ON DELETE CASCADE,
  role             TEXT        NOT NULL CHECK (role IN ('user','assistant','system')),
  content          TEXT        NOT NULL,
  is_proactive     BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paulo_conv_company  ON public.paulo_conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_paulo_msg_conv      ON public.paulo_messages(conversation_id, created_at);

ALTER TABLE public.paulo_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paulo_messages      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paulo_conv_select" ON public.paulo_conversations
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "paulo_conv_insert" ON public.paulo_conversations
  FOR INSERT WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "paulo_conv_update" ON public.paulo_conversations
  FOR UPDATE USING (company_id = public.current_company_id());

CREATE POLICY "paulo_msg_select" ON public.paulo_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM public.paulo_conversations
      WHERE company_id = public.current_company_id()
    )
  );

CREATE POLICY "paulo_msg_insert" ON public.paulo_messages
  FOR INSERT WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.paulo_conversations
      WHERE company_id = public.current_company_id()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.paulo_conversations TO authenticated;
GRANT SELECT, INSERT         ON public.paulo_messages      TO authenticated;

-- ── Contexto em tempo real para o Paulo ─────────────────────
-- Retorna um JSON com snapshot completo da loja para alimentar o prompt
CREATE OR REPLACE FUNCTION public.get_paulo_context(p_store_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id  uuid;
  v_mes_inicio  date := date_trunc('month', CURRENT_DATE)::date;
  v_mes_ant_ini date := date_trunc('month', CURRENT_DATE - interval '1 month')::date;
  v_mes_ant_fim date := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;
  v_dias_uteis_mes int := 22; -- aproximação
BEGIN
  SELECT company_id INTO v_company_id FROM stores WHERE id = p_store_id;

  RETURN json_build_object(

    -- Cabeçalho temporal
    'data_hoje',    to_char(CURRENT_DATE, 'DD/MM/YYYY'),
    'hora_atual',   to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
    'dia_semana',   to_char(CURRENT_DATE, 'TMDay'),
    'dias_restantes_mes', (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date - CURRENT_DATE,

    -- Vendas hoje
    'vendas_hoje', (
      SELECT json_build_object(
        'faturamento',  COALESCE(SUM(total), 0),
        'cupons',       COUNT(*),
        'ticket_medio', CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(total) / COUNT(*), 2) ELSE 0 END
      )
      FROM sales
      WHERE store_id   = p_store_id
        AND status     = 'PAGA'
        AND created_at::date = CURRENT_DATE
        AND company_id = v_company_id
    ),

    -- Vendas este mês
    'vendas_mes', (
      SELECT json_build_object(
        'faturamento',  COALESCE(SUM(total), 0),
        'cupons',       COUNT(*),
        'ticket_medio', CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(total) / COUNT(*), 2) ELSE 0 END
      )
      FROM sales
      WHERE store_id   = p_store_id
        AND status     = 'PAGA'
        AND created_at::date BETWEEN v_mes_inicio AND CURRENT_DATE
        AND company_id = v_company_id
    ),

    -- Mês anterior (período cheio)
    'vendas_mes_anterior', (
      SELECT json_build_object(
        'faturamento', COALESCE(SUM(total), 0),
        'cupons',      COUNT(*)
      )
      FROM sales
      WHERE store_id   = p_store_id
        AND status     = 'PAGA'
        AND created_at::date BETWEEN v_mes_ant_ini AND v_mes_ant_fim
        AND company_id = v_company_id
    ),

    -- Ranking do mês (top 5)
    'ranking', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'posicao',      r.posicao,
          'nome',         r.nome,
          'faturamento',  r.faturamento,
          'cupons',       r.cupons,
          'ticket_medio', r.ticket_medio,
          'comissao',     r.comissao
        ) ORDER BY r.posicao
      ), '[]'::json)
      FROM get_ranking_vendedores(p_store_id) r
      WHERE r.posicao <= 5
    ),

    -- Metas ativas (da loja — sem filtro por user)
    'metas_ativas', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'descricao',  COALESCE(m.descricao, m.tipo),
          'tipo',       m.tipo,
          'periodo',    m.periodo,
          'valor_meta', m.valor_meta,
          'realizado',  COALESCE(SUM(s.total), 0),
          'pct', LEAST(100, ROUND(COALESCE(SUM(s.total), 0) / NULLIF(m.valor_meta, 0) * 100, 1)),
          'fim',        m.fim
        )
      ), '[]'::json)
      FROM metas m
      LEFT JOIN sales s ON
        s.store_id     = p_store_id
        AND s.status   = 'PAGA'
        AND s.created_at::date BETWEEN m.inicio AND m.fim
        AND s.company_id = v_company_id
      WHERE m.company_id = v_company_id
        AND m.ativo      = true
        AND CURRENT_DATE BETWEEN m.inicio AND m.fim
        AND (m.store_id IS NULL OR m.store_id = p_store_id)
        AND m.tipo = 'FINANCEIRA'
      GROUP BY m.id
    ),

    -- Corridinhas ativas
    'corridinhas_ativas', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'nome',       c.nome,
          'tipo',       c.tipo,
          'valor_meta', c.valor_meta,
          'fim',        c.fim
        )
      ), '[]'::json)
      FROM corridinhas c
      WHERE c.company_id = v_company_id
        AND c.ativo      = true
        AND now() BETWEEN c.inicio AND c.fim
        AND (c.store_id IS NULL OR c.store_id = p_store_id)
    ),

    -- Segmentos de clientes (CRM)
    'clientes_segmentos', (
      SELECT COALESCE(json_object_agg(segmento, total), '{}'::json)
      FROM (
        SELECT segmento, COUNT(*) AS total
        FROM v_customer_rfm
        WHERE company_id = v_company_id
        GROUP BY segmento
      ) s
    ),

    -- Aniversariantes hoje e esta semana
    'aniversariantes_hoje', (
      SELECT COUNT(*)
      FROM customers
      WHERE company_id = v_company_id
        AND data_nascimento IS NOT NULL
        AND EXTRACT(MONTH FROM data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(DAY   FROM data_nascimento) = EXTRACT(DAY   FROM CURRENT_DATE)
    ),

    'aniversariantes_semana', (
      SELECT COUNT(*)
      FROM customers
      WHERE company_id = v_company_id
        AND data_nascimento IS NOT NULL
        AND to_char(data_nascimento, 'MM-DD') BETWEEN
            to_char(CURRENT_DATE, 'MM-DD') AND
            to_char(CURRENT_DATE + 7, 'MM-DD')
    ),

    -- Clientes em risco e inativos (para alertas)
    'clientes_em_risco', (
      SELECT COUNT(*) FROM v_customer_rfm
      WHERE company_id = v_company_id AND segmento = 'EM_RISCO'
    ),
    'clientes_inativos', (
      SELECT COUNT(*) FROM v_customer_rfm
      WHERE company_id = v_company_id AND segmento = 'INATIVO'
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_paulo_context TO authenticated;
