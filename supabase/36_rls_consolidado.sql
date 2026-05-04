-- ============================================================
-- 36_rls_consolidado.sql
--
-- Script AUTORITATIVO de RLS e funções auxiliares.
-- Substitui todos os scripts 21–29 que corrigiram recursão.
--
-- EXECUTE ESTE SCRIPT NO SQL EDITOR DO SUPABASE SEMPRE QUE:
--   - Adicionar uma nova tabela
--   - Suspeitar de vazamento de dados entre tenants
--   - Após qualquer alteração de estrutura
--
-- ARQUITETURA DE SEGURANÇA:
--   1. current_company_id() e current_role() são SECURITY DEFINER
--      → executam como 'postgres' (BYPASSRLS) → leem profiles sem
--        acionar políticas → ZERO risco de recursão.
--
--   2. profiles_select usa APENAS id = auth.uid() como âncora.
--      Quando current_company_id() lê profiles WHERE id = auth.uid(),
--      a policy avalia só esse check simples → sem loop.
--      ADMIN/GERENTE pode ver outros usuários da empresa porque a policy
--      chama current_company_id(), que por sua vez lê apenas a linha
--      do próprio usuário (id = auth.uid()) → TRUE → sem recursão.
--
--   3. Todas as outras tabelas isolam por company_id usando
--      current_company_id() → isolamento garantido por RLS.
-- ============================================================

-- ── 0. Funções auxiliares (DEVEM existir antes das policies) ─────────────────

-- current_company_id(): retorna o company_id do usuário autenticado.
-- SECURITY DEFINER → executa como postgres (BYPASSRLS).
-- Sem esta função o RLS de todas as outras tabelas quebra silenciosamente.
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;

-- current_role(): retorna o role canônico do usuário autenticado.
-- Normaliza roles legados (GESTOR, VENDEDOR, CAIXA).
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE role
    WHEN 'GESTOR'      THEN 'ADMIN'        -- legado
    WHEN 'GERENTE_OLD' THEN 'ADMIN'        -- legado hipotético
    WHEN 'VENDEDOR'    THEN 'COLABORADOR'  -- legado
    WHEN 'CAIXA'       THEN 'COLABORADOR'  -- legado
    ELSE role
  END
  FROM public.profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;

-- ── 1. Habilitar RLS em todas as tabelas (defensivo — só age se a tabela existir) ───

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles','companies','stores',
    'products','customers',
    'sales','sale_items','payments',
    'product_stock','product_variants','stock_movements',
    'cash_registers','user_areas','user_stores',
    'crediario_vendas','crediario_parcelas',
    'cashback_config','cashback_ledger',
    'trocas','promocoes','collections',
    'fiscal_docs','contas_pagar','card_rules'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      RAISE NOTICE 'RLS habilitado: %', t;
    END IF;
  END LOOP;
END $$;

-- ── 2. Remover TODAS as policies existentes (evita conflitos) ─────────────────

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
  RAISE NOTICE 'Todas as policies removidas.';
END $$;

-- ── 3. profiles ───────────────────────────────────────────────────────────────
-- SELECT: usuário vê a própria linha SEMPRE.
--         ADMIN/GERENTE veem todas as linhas da empresa via current_company_id().
--         current_company_id() lê profiles WHERE id = auth.uid()
--         → essa linha passa pela policy com id = auth.uid() → TRUE → sem recursão.
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR (
      public.current_role() IN ('OWNER', 'ADMIN', 'GERENTE')
      AND company_id = public.current_company_id()
    )
  );

-- ALL: usuário edita a própria linha. ADMIN/GERENTE editam da empresa.
CREATE POLICY profiles_write ON public.profiles
  FOR ALL
  USING (
    id = auth.uid()
    OR (
      public.current_role() IN ('OWNER', 'ADMIN', 'GERENTE')
      AND company_id = public.current_company_id()
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR (
      public.current_role() IN ('OWNER', 'ADMIN', 'GERENTE')
      AND company_id = public.current_company_id()
    )
  );

-- ── 4. companies ──────────────────────────────────────────────────────────────
CREATE POLICY companies_select ON public.companies
  FOR SELECT
  USING (
    public.current_role() = 'OWNER'
    OR id = public.current_company_id()
  );

CREATE POLICY companies_write ON public.companies
  FOR ALL
  USING (
    public.current_role() = 'OWNER'
    OR (
      public.current_role() IN ('ADMIN', 'GERENTE')
      AND id = public.current_company_id()
    )
  )
  WITH CHECK (
    public.current_role() = 'OWNER'
    OR (
      public.current_role() IN ('ADMIN', 'GERENTE')
      AND id = public.current_company_id()
    )
  );

-- ── 5. stores ─────────────────────────────────────────────────────────────────
CREATE POLICY stores_select ON public.stores
  FOR SELECT
  USING (
    public.current_role() = 'OWNER'
    OR company_id = public.current_company_id()
  );

CREATE POLICY stores_write ON public.stores
  FOR ALL
  USING (
    public.current_role() = 'OWNER'
    OR (
      public.current_role() IN ('ADMIN', 'GERENTE')
      AND company_id = public.current_company_id()
    )
  )
  WITH CHECK (
    public.current_role() = 'OWNER'
    OR (
      public.current_role() IN ('ADMIN', 'GERENTE')
      AND company_id = public.current_company_id()
    )
  );

-- ── 6. user_areas (condicional — criada em 08_permissions.sql) ───────────────
DO $$ BEGIN
  IF to_regclass('public.user_areas') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY user_areas_select ON public.user_areas
        FOR SELECT
        USING (
          user_id = auth.uid()
          OR public.current_role() = 'OWNER'
          OR (
            public.current_role() IN ('ADMIN', 'GERENTE')
            AND company_id = public.current_company_id()
          )
        )
    $pol$;
    EXECUTE $pol$
      CREATE POLICY user_areas_write ON public.user_areas
        FOR ALL
        USING (
          public.current_role() IN ('OWNER', 'ADMIN', 'GERENTE')
          AND (
            company_id = public.current_company_id()
            OR public.current_role() = 'OWNER'
          )
        )
        WITH CHECK (
          public.current_role() IN ('OWNER', 'ADMIN', 'GERENTE')
          AND (
            company_id = public.current_company_id()
            OR public.current_role() = 'OWNER'
          )
        )
    $pol$;
  END IF;
END $$;

-- ── 7. Macro-policy por company_id (produtos, clientes, vendas, estoque) ──────
-- Todos os usuários da empresa lêem. Apenas ADMIN/GERENTE/OWNER escrevem.

-- products
CREATE POLICY products_select ON public.products
  FOR SELECT USING (company_id = public.current_company_id() OR public.current_role() = 'OWNER');
CREATE POLICY products_write ON public.products
  FOR ALL
  USING (
    public.current_role() IN ('OWNER', 'ADMIN', 'GERENTE')
    AND (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
  )
  WITH CHECK (
    public.current_role() IN ('OWNER', 'ADMIN', 'GERENTE')
    AND (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
  );

-- customers
CREATE POLICY customers_select ON public.customers
  FOR SELECT USING (company_id = public.current_company_id() OR public.current_role() = 'OWNER');
CREATE POLICY customers_write ON public.customers
  FOR ALL
  USING (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
  WITH CHECK (company_id = public.current_company_id() OR public.current_role() = 'OWNER');

-- sales
CREATE POLICY sales_select ON public.sales
  FOR SELECT USING (
    public.current_role() = 'OWNER'
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = sales.store_id AND s.company_id = public.current_company_id())
  );
CREATE POLICY sales_write ON public.sales
  FOR ALL
  USING (
    public.current_role() = 'OWNER'
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = sales.store_id AND s.company_id = public.current_company_id())
  )
  WITH CHECK (
    public.current_role() = 'OWNER'
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = sales.store_id AND s.company_id = public.current_company_id())
  );

-- sale_items
CREATE POLICY sale_items_select ON public.sale_items
  FOR SELECT USING (
    public.current_role() = 'OWNER'
    OR EXISTS (
      SELECT 1 FROM public.sales sl
      JOIN public.stores s ON s.id = sl.store_id
      WHERE sl.id = sale_items.sale_id AND s.company_id = public.current_company_id()
    )
  );
CREATE POLICY sale_items_write ON public.sale_items
  FOR ALL
  USING (
    public.current_role() = 'OWNER'
    OR EXISTS (
      SELECT 1 FROM public.sales sl
      JOIN public.stores s ON s.id = sl.store_id
      WHERE sl.id = sale_items.sale_id AND s.company_id = public.current_company_id()
    )
  )
  WITH CHECK (
    public.current_role() = 'OWNER'
    OR EXISTS (
      SELECT 1 FROM public.sales sl
      JOIN public.stores s ON s.id = sl.store_id
      WHERE sl.id = sale_items.sale_id AND s.company_id = public.current_company_id()
    )
  );

-- payments (mesma lógica de sales)
CREATE POLICY payments_select ON public.payments
  FOR SELECT USING (
    public.current_role() = 'OWNER'
    OR EXISTS (
      SELECT 1 FROM public.sales sl
      JOIN public.stores s ON s.id = sl.store_id
      WHERE sl.id = payments.sale_id AND s.company_id = public.current_company_id()
    )
  );
CREATE POLICY payments_write ON public.payments
  FOR ALL
  USING (
    public.current_role() = 'OWNER'
    OR EXISTS (
      SELECT 1 FROM public.sales sl
      JOIN public.stores s ON s.id = sl.store_id
      WHERE sl.id = payments.sale_id AND s.company_id = public.current_company_id()
    )
  )
  WITH CHECK (
    public.current_role() = 'OWNER'
    OR EXISTS (
      SELECT 1 FROM public.sales sl
      JOIN public.stores s ON s.id = sl.store_id
      WHERE sl.id = payments.sale_id AND s.company_id = public.current_company_id()
    )
  );

-- product_stock
CREATE POLICY product_stock_select ON public.product_stock
  FOR SELECT USING (
    public.current_role() = 'OWNER'
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_stock.store_id AND s.company_id = public.current_company_id())
  );
CREATE POLICY product_stock_write ON public.product_stock
  FOR ALL
  USING (
    public.current_role() IN ('OWNER', 'ADMIN', 'GERENTE')
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_stock.store_id AND s.company_id = public.current_company_id())
  )
  WITH CHECK (
    public.current_role() IN ('OWNER', 'ADMIN', 'GERENTE')
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_stock.store_id AND s.company_id = public.current_company_id())
  );

-- product_variants
CREATE POLICY product_variants_select ON public.product_variants
  FOR SELECT USING (
    public.current_role() = 'OWNER'
    OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.company_id = public.current_company_id())
  );
CREATE POLICY product_variants_write ON public.product_variants
  FOR ALL
  USING (
    public.current_role() IN ('OWNER', 'ADMIN', 'GERENTE')
    OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.company_id = public.current_company_id())
  )
  WITH CHECK (
    public.current_role() IN ('OWNER', 'ADMIN', 'GERENTE')
    OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.company_id = public.current_company_id())
  );

-- stock_movements
CREATE POLICY stock_movements_select ON public.stock_movements
  FOR SELECT USING (
    public.current_role() = 'OWNER'
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = stock_movements.store_id AND s.company_id = public.current_company_id())
  );
CREATE POLICY stock_movements_write ON public.stock_movements
  FOR ALL
  USING (
    public.current_role() = 'OWNER'
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = stock_movements.store_id AND s.company_id = public.current_company_id())
  )
  WITH CHECK (
    public.current_role() = 'OWNER'
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = stock_movements.store_id AND s.company_id = public.current_company_id())
  );

-- ── 8. Tabelas opcionais (só cria policy se a tabela existir) ─────────────────

DO $$ BEGIN

  -- cash_registers (caixa por loja — criado em 06_cash_phase5.sql)
  IF to_regclass('public.cash_registers') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY cash_registers_select ON public.cash_registers
        FOR SELECT USING (
          public.current_role() = 'OWNER'
          OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = cash_registers.store_id AND s.company_id = public.current_company_id())
        )
    $pol$;
    EXECUTE $pol$
      CREATE POLICY cash_registers_write ON public.cash_registers
        FOR ALL
        USING (
          public.current_role() = 'OWNER'
          OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = cash_registers.store_id AND s.company_id = public.current_company_id())
        )
        WITH CHECK (
          public.current_role() = 'OWNER'
          OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = cash_registers.store_id AND s.company_id = public.current_company_id())
        )
    $pol$;
  END IF;

  -- crediario_vendas
  IF to_regclass('public.crediario_vendas') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY crediario_vendas_all ON public.crediario_vendas
        FOR ALL
        USING (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
        WITH CHECK (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
    $pol$;
  END IF;

  -- crediario_parcelas
  IF to_regclass('public.crediario_parcelas') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY crediario_parcelas_all ON public.crediario_parcelas
        FOR ALL
        USING (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
        WITH CHECK (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
    $pol$;
  END IF;

  -- cashback_config
  IF to_regclass('public.cashback_config') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY cashback_config_all ON public.cashback_config
        FOR ALL
        USING (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
        WITH CHECK (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
    $pol$;
  END IF;

  -- cashback_ledger
  IF to_regclass('public.cashback_ledger') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY cashback_ledger_all ON public.cashback_ledger
        FOR ALL
        USING (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
        WITH CHECK (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
    $pol$;
  END IF;

  -- trocas
  IF to_regclass('public.trocas') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY trocas_all ON public.trocas
        FOR ALL
        USING (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
        WITH CHECK (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
    $pol$;
  END IF;

  -- promocoes
  IF to_regclass('public.promocoes') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY promocoes_all ON public.promocoes
        FOR ALL
        USING (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
        WITH CHECK (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
    $pol$;
  END IF;

  -- collections
  IF to_regclass('public.collections') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY collections_all ON public.collections
        FOR ALL
        USING (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
        WITH CHECK (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
    $pol$;
  END IF;

  -- fiscal_docs (sem store_id/company_id — acessa empresa via sale_id → sales → stores)
  IF to_regclass('public.fiscal_docs') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY fiscal_docs_all ON public.fiscal_docs
        FOR ALL
        USING (
          public.current_role() = 'OWNER'
          OR EXISTS (
            SELECT 1
            FROM public.sales sl
            JOIN public.stores st ON st.id = sl.store_id
            WHERE sl.id = fiscal_docs.sale_id
              AND st.company_id = public.current_company_id()
          )
        )
        WITH CHECK (
          public.current_role() = 'OWNER'
          OR EXISTS (
            SELECT 1
            FROM public.sales sl
            JOIN public.stores st ON st.id = sl.store_id
            WHERE sl.id = fiscal_docs.sale_id
              AND st.company_id = public.current_company_id()
          )
        )
    $pol$;
  END IF;

  -- contas_pagar
  IF to_regclass('public.contas_pagar') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY contas_pagar_all ON public.contas_pagar
        FOR ALL
        USING (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
        WITH CHECK (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
    $pol$;
  END IF;

  -- card_rules (sem company_id — acessa empresa via store_id → stores)
  IF to_regclass('public.card_rules') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY card_rules_select ON public.card_rules
        FOR SELECT USING (
          public.current_role() = 'OWNER'
          OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = card_rules.store_id AND s.company_id = public.current_company_id())
        )
    $pol$;
    EXECUTE $pol$
      CREATE POLICY card_rules_write ON public.card_rules
        FOR ALL
        USING (
          public.current_role() = 'OWNER'
          OR (
            public.current_role() IN ('ADMIN','GERENTE')
            AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = card_rules.store_id AND s.company_id = public.current_company_id())
          )
        )
        WITH CHECK (
          public.current_role() = 'OWNER'
          OR (
            public.current_role() IN ('ADMIN','GERENTE')
            AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = card_rules.store_id AND s.company_id = public.current_company_id())
          )
        )
    $pol$;
  END IF;

  -- user_stores
  IF to_regclass('public.user_stores') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY user_stores_select ON public.user_stores
        FOR SELECT USING (
          user_id = auth.uid()
          OR public.current_role() = 'OWNER'
          OR (
            public.current_role() IN ('ADMIN','GERENTE')
            AND company_id = public.current_company_id()
          )
        )
    $pol$;
    EXECUTE $pol$
      CREATE POLICY user_stores_write ON public.user_stores
        FOR ALL
        USING (
          public.current_role() IN ('OWNER','ADMIN','GERENTE')
          AND (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
        )
        WITH CHECK (
          public.current_role() IN ('OWNER','ADMIN','GERENTE')
          AND (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
        )
    $pol$;
  END IF;

END $$;

-- ── 9. Verificação final ──────────────────────────────────────────────────────

SELECT
  tablename,
  COUNT(*) AS num_policies,
  string_agg(policyname, ', ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

DO $$
DECLARE
  v_missing_company_id int;
BEGIN
  -- Verifica se current_company_id() existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_company_id'
  ) THEN
    RAISE WARNING 'ATENÇÃO: current_company_id() não existe! RLS está quebrado.';
  ELSE
    RAISE NOTICE '✓ current_company_id() definida.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_role'
  ) THEN
    RAISE WARNING 'ATENÇÃO: current_role() não existe! RLS está quebrado.';
  ELSE
    RAISE NOTICE '✓ current_role() definida.';
  END IF;

  RAISE NOTICE '✓ RLS consolidado aplicado com sucesso.';
  RAISE NOTICE '  Execute como OWNER no Supabase SQL Editor.';
  RAISE NOTICE '  Teste: cada tenant deve ver APENAS seus dados.';
END $$;
