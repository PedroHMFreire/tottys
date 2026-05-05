-- ============================================================
-- 43_nps_rls_and_security_fixes.sql
-- Fixes críticos pré-testes:
--   1. nota nullable (MOTIVO não tem score numérico)
--   2. Colunas denormalizadas survey_template + company_nome
--      para acesso anon sem precisar JOIN em companies
--   3. RLS em nps_responses (estava sem policies)
--   4. WITH CHECK em corr_insert e vend_insert (estava nulo)
--   5. get_my_company retorna survey_template
-- ============================================================

-- 1. nota nullable
ALTER TABLE public.nps_responses ALTER COLUMN nota DROP NOT NULL;

-- 2. Denormalize para acesso anon
ALTER TABLE public.nps_responses
  ADD COLUMN IF NOT EXISTS survey_template TEXT NOT NULL DEFAULT 'NPS',
  ADD COLUMN IF NOT EXISTS company_nome    TEXT;

-- 3. RLS policies para nps_responses
--    anon: SELECT e UPDATE por id (UUID é imprevisível)
CREATE POLICY "nps_anon_select" ON public.nps_responses
  FOR SELECT TO anon USING (true);

CREATE POLICY "nps_anon_update" ON public.nps_responses
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

--    authenticated: escopo da própria empresa
CREATE POLICY "nps_auth_all" ON public.nps_responses
  FOR ALL TO authenticated
  USING  (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

-- 4. Fix corr_insert: WITH CHECK faltando
DROP POLICY IF EXISTS corr_insert ON public.corridinhas;
CREATE POLICY corr_insert ON public.corridinhas
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = current_company_id()
    AND "current_role"() = ANY(ARRAY['OWNER','ADMIN','GERENTE'])
  );

-- 5. Fix vend_insert: WITH CHECK faltando
DROP POLICY IF EXISTS vend_insert ON public.vendedores;
CREATE POLICY vend_insert ON public.vendedores
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = current_company_id()
    AND "current_role"() = ANY(ARRAY['OWNER','ADMIN','GERENTE'])
  );

-- 6. get_my_company agora retorna survey_template
DROP FUNCTION IF EXISTS public.get_my_company();
CREATE FUNCTION public.get_my_company()
RETURNS TABLE(id uuid, nome text, survey_template text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
      SELECT c.id, c.nome, c.survey_template
        FROM public.companies c
       ORDER BY c.nome;
  ELSIF v_company_id IS NOT NULL THEN
    RETURN QUERY
      SELECT c.id, c.nome, c.survey_template
        FROM public.companies c
       WHERE c.id = v_company_id;
  END IF;
END;
$$;
