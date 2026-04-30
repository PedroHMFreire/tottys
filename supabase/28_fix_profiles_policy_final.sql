-- ============================================================
-- 28_fix_profiles_policy_final.sql
--
-- Correção definitiva do "stack depth limit exceeded".
--
-- Causa raiz real:
--   Em Supabase, SECURITY DEFINER NÃO bypass RLS a menos que
--   o role dono da função tenha BYPASSRLS explícito.
--   Resultado: current_role() e current_company_id() disparam
--   profiles_select → que chama current_company_id() → loop infinito.
--
-- Solução:
--   profiles_select = APENAS id = auth.uid()
--   Sem chamar nenhuma função. Sem cross-row lookup.
--   Quando current_company_id() lê profiles WHERE id = auth.uid(),
--   a policy avalia só id = auth.uid() → TRUE → sem recursão.
--
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor)
-- ============================================================

-- Dropa as policies de profiles (qualquer nome)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

-- Política de leitura: usuário vê apenas o próprio perfil
-- Sem chamadas de função → sem recursão possível
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- Política de escrita: usuário edita apenas o próprio perfil
CREATE POLICY profiles_write_self ON public.profiles
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Confirma
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;
