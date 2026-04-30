-- ============================================================
-- 25_fix_profiles_rls_recursion.sql
--
-- Corrige "infinite recursion detected in policy for relation profiles"
--
-- Causa raiz (SQL 22 incompleto):
--   profiles_select e profiles_write_self usam subqueries inline como
--   ( SELECT p2.role FROM public.profiles p2 WHERE p2.id = auth.uid() )
--   Essas subqueries são avaliadas com RLS ativo → recursão infinita.
--
-- Solução:
--   Substituir subqueries inline pelas funções SECURITY DEFINER já
--   existentes: current_role() e current_company_id()
--   Essas funções rodam como postgres (bypass RLS) → sem recursão.
--
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor)
-- ============================================================

DROP POLICY IF EXISTS profiles_select     ON public.profiles;
DROP POLICY IF EXISTS profiles_write_self ON public.profiles;

-- Usuário vê o próprio perfil + perfis da mesma empresa
-- current_company_id() é SECURITY DEFINER → lê profiles sem acionar RLS
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR company_id = public.current_company_id()
  );

-- Usuário edita o próprio perfil; OWNER/GERENTE/ADMIN editam da própria empresa
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
