-- ============================================================
-- 22_fix_rls_recursion.sql
-- Corrige "stack depth limit exceeded" causado por recursão nas
-- políticas RLS de companies e stores.
--
-- Causa raiz:
--   stores_select → user_has_store_access() → SELECT stores → stores_select → ...
--   companies_select → current_role() → profiles → (profiles_select) → ...
--
-- Solução:
--   1. Cria get_my_company() SECURITY DEFINER — bypassa RLS, usado pelo frontend
--   2. Reescreve stores_select sem chamar funções que relêem stores
--   3. Reescreve companies_select sem dependência de cadeia recursiva
--   4. Garante profiles_select com subquery direta (sem funções que lêem profiles)
--
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor)
-- ============================================================

-- ── 1. RPC segura: retorna empresa(s) do usuário logado ──────────────────
-- Roda como postgres (SECURITY DEFINER), ignora RLS em companies e profiles.
-- OWNER → todas as empresas; demais → só a própria.
CREATE OR REPLACE FUNCTION public.get_my_company()
RETURNS TABLE(id uuid, nome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       text;
  v_company_id uuid;
BEGIN
  SELECT p.role, p.company_id
    INTO v_role, v_company_id
    FROM public.profiles p
   WHERE p.id = auth.uid();

  IF v_role = 'OWNER' THEN
    RETURN QUERY
      SELECT c.id, c.nome
        FROM public.companies c
       ORDER BY c.nome;
  ELSIF v_company_id IS NOT NULL THEN
    RETURN QUERY
      SELECT c.id, c.nome
        FROM public.companies c
       WHERE c.id = v_company_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_company() TO authenticated;

-- ── 2. Reescreve companies_select sem cadeia recursiva ────────────────────
-- Usa subquery inline em vez de chamar current_company_id()/current_role()
-- para evitar que o planner construa ciclos de dependência RLS.

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select ON public.companies;
DROP POLICY IF EXISTS companies_write  ON public.companies;

CREATE POLICY companies_select ON public.companies
  FOR SELECT
  USING (
    -- OWNER vê todas
    ( SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() ) = 'OWNER'
    OR
    -- Demais vêem apenas a própria empresa
    id = ( SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid() )
  );

CREATE POLICY companies_write ON public.companies
  FOR ALL
  USING (
    ( SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() ) = 'OWNER'
    OR (
      ( SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() ) IN ('ADMIN','GERENTE')
      AND id = ( SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid() )
    )
  )
  WITH CHECK (
    ( SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() ) IN ('OWNER','ADMIN','GERENTE')
  );

-- ── 3. Reescreve stores_select sem chamar user_has_store_access() ─────────
-- user_has_store_access() consulta stores internamente → recursão infinita.
-- Substituímos por subqueries inline que o planner consegue avaliar sem loop.

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stores_select ON public.stores;
DROP POLICY IF EXISTS stores_write  ON public.stores;

CREATE POLICY stores_select ON public.stores
  FOR SELECT
  USING (
    -- OWNER vê todas as lojas
    ( SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() ) = 'OWNER'
    OR
    -- GERENTE/ADMIN/VENDEDOR vêem lojas da própria empresa
    company_id = ( SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid() )
    OR
    -- VENDEDOR com acesso específico via user_stores (se a tabela existir)
    (
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
    ( SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() ) = 'OWNER'
    OR (
      ( SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() ) IN ('ADMIN','GERENTE')
      AND company_id = ( SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid() )
    )
  )
  WITH CHECK (
    ( SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() ) = 'OWNER'
    OR (
      ( SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() ) IN ('ADMIN','GERENTE')
      AND company_id = ( SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid() )
    )
  );

-- ── 4. Garante profiles com política simples (sem funções que relêem profiles)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select       ON public.profiles;
DROP POLICY IF EXISTS profiles_write_self   ON public.profiles;
DROP POLICY IF EXISTS profiles_rw           ON public.profiles;

-- Usuário vê: o próprio perfil + perfis da mesma empresa
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR company_id = ( SELECT p2.company_id FROM public.profiles p2 WHERE p2.id = auth.uid() )
  );

-- Usuário edita apenas o próprio perfil; OWNER/GERENTE editam da empresa
CREATE POLICY profiles_write_self ON public.profiles
  FOR ALL
  USING (
    id = auth.uid()
    OR (
      ( SELECT p2.role FROM public.profiles p2 WHERE p2.id = auth.uid() ) IN ('OWNER','GERENTE','ADMIN')
      AND company_id = ( SELECT p2.company_id FROM public.profiles p2 WHERE p2.id = auth.uid() )
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR (
      ( SELECT p2.role FROM public.profiles p2 WHERE p2.id = auth.uid() ) IN ('OWNER','GERENTE','ADMIN')
      AND company_id = ( SELECT p2.company_id FROM public.profiles p2 WHERE p2.id = auth.uid() )
    )
  );
