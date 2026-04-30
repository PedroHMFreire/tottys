-- ============================================================
-- 27_nuclear_rls_reset.sql
--
-- Drop TODAS as policies de profiles, companies e stores
-- (qualquer nome) e recria apenas as corretas.
--
-- Use quando scripts anteriores (22, 25, 26) não eliminaram
-- todas as policies conflitantes.
--
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor)
-- ============================================================

-- ── 1. Drop dinâmico: remove TODAS as policies dessas tabelas ──
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'companies', 'stores')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'Dropped policy % on %', r.policyname, r.tablename;
  END LOOP;
END $$;

-- ── 2. Garante RLS ativo nas 3 tabelas ───────────────────────
ALTER TABLE public.profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores    ENABLE ROW LEVEL SECURITY;

-- ── 3. profiles ──────────────────────────────────────────────
-- Usuário vê o próprio perfil + perfis da mesma empresa
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR company_id = public.current_company_id()
  );

-- Usuário edita o próprio perfil; OWNER/GERENTE editam da empresa
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

-- ── 4. companies ─────────────────────────────────────────────
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

-- ── 5. stores ────────────────────────────────────────────────
CREATE POLICY stores_select ON public.stores
  FOR SELECT
  USING (
    public.current_role() = 'OWNER'
    OR company_id = public.current_company_id()
    OR (
      to_regclass('public.user_stores') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_stores us
         WHERE us.store_id = stores.id AND us.user_id = auth.uid()
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

-- ── 6. Confirmação: lista policies criadas ───────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'companies', 'stores')
ORDER BY tablename, policyname;
