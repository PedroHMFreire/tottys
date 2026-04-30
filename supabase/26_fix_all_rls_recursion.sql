-- ============================================================
-- 26_fix_all_rls_recursion.sql
--
-- Corrige "infinite recursion" e "stack depth limit exceeded"
-- em TODAS as tabelas de uma vez.
--
-- Causa raiz:
--   Políticas em companies, stores e profiles usam subqueries
--   inline como ( SELECT role FROM profiles WHERE id = auth.uid() )
--   que são avaliadas com RLS ativo → disparam a própria política
--   novamente → recursão infinita.
--
-- Solução:
--   Substituir todas as subqueries inline pelas funções
--   SECURITY DEFINER já existentes:
--     • public.current_role()        → role do usuário logado
--     • public.current_company_id()  → company_id do usuário logado
--   Essas funções rodam como postgres (bypass RLS) → sem recursão.
--
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor)
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_select     ON public.profiles;
DROP POLICY IF EXISTS profiles_write_self ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR company_id = public.current_company_id()
  );

CREATE POLICY profiles_write_self ON public.profiles
  FOR ALL
  USING (
    id = auth.uid()
    OR (
      public.current_role() IN ('OWNER', 'GERENTE', 'ADMIN')
      AND company_id = public.current_company_id()
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR (
      public.current_role() IN ('OWNER', 'GERENTE', 'ADMIN')
      AND company_id = public.current_company_id()
    )
  );

-- ── companies ───────────────────────────────────────────────
DROP POLICY IF EXISTS companies_select ON public.companies;
DROP POLICY IF EXISTS companies_write  ON public.companies;

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
    public.current_role() IN ('OWNER', 'ADMIN', 'GERENTE')
  );

-- ── stores ──────────────────────────────────────────────────
DROP POLICY IF EXISTS stores_select ON public.stores;
DROP POLICY IF EXISTS stores_write  ON public.stores;

CREATE POLICY stores_select ON public.stores
  FOR SELECT
  USING (
    public.current_role() = 'OWNER'
    OR company_id = public.current_company_id()
    OR (
      to_regclass('public.user_stores') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_stores us
         WHERE us.store_id = stores.id
           AND us.user_id  = auth.uid()
      )
    )
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
