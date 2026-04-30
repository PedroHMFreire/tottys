-- ============================================================
-- Fase 20: Modelo de permissões v2
-- - Remove GESTOR/CAIXA: apenas OWNER, GERENTE, VENDEDOR
-- - Adiciona 5 novas área-codes: CLIENTES, CREDIARIO, CASHBACK, FINANCEIRO, INSIGHTS
-- - Atualiza get_my_areas para retornar defaults por papel
-- - Atualiza user_has_store_access (remove GESTOR)
-- Execução idempotente — seguro re-rodar.
-- ============================================================

-- 1. Atualiza user_has_store_access removendo GESTOR
CREATE OR REPLACE FUNCTION public.user_has_store_access(p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role    text;
  v_company uuid;
BEGIN
  SELECT role, company_id INTO v_role, v_company
  FROM public.profiles WHERE id = auth.uid();

  IF v_role = 'OWNER' THEN RETURN true; END IF;

  -- ADMIN tratado como GERENTE (legado)
  IF v_role IN ('ADMIN','GERENTE') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = p_store_id AND s.company_id = v_company
    );
  END IF;

  -- VENDEDOR: verifica user_stores se existir, senão permite a empresa
  IF to_regclass('public.user_stores') IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = p_store_id AND s.company_id = v_company
    );
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_stores us
    WHERE us.user_id = auth.uid() AND us.store_id = p_store_id
  );
END;
$$;

-- 2. Atualiza current_role para normalizar GESTOR → GERENTE (legado)
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE role
    WHEN 'GESTOR' THEN 'GERENTE'
    WHEN 'ADMIN'  THEN 'GERENTE'
    ELSE role
  END
  FROM public.profiles WHERE id = auth.uid();
$$;

-- 3. Atualiza get_my_areas para incluir defaults por papel
--    (retorna tanto áreas explícitas de user_areas quanto defaults do papel)
CREATE OR REPLACE FUNCTION public.get_my_areas()
RETURNS TABLE(area_code text, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT CASE p.role WHEN 'GESTOR' THEN 'GERENTE' WHEN 'ADMIN' THEN 'GERENTE' ELSE p.role END
  INTO v_role
  FROM public.profiles p WHERE p.id = auth.uid();

  IF v_role IS NULL THEN RETURN; END IF;

  -- OWNER: retorna tudo
  IF v_role = 'OWNER' THEN
    RETURN QUERY SELECT a.code, 'role_default'::text
    FROM (VALUES
      ('PDV'),('RELATORIOS_DIA'),('RELATORIOS'),
      ('PRODUTOS'),('PRODUTOS_EDIT'),
      ('ESTOQUE_VIEW'),('ESTOQUE_ADMIN'),
      ('CLIENTES'),('CREDIARIO'),('CASHBACK'),('FINANCEIRO'),('INSIGHTS'),
      ('FISCAL'),('CONFIG'),('USERS'),('ADM_ROOT')
    ) AS a(code);
    RETURN;
  END IF;

  -- GERENTE: defaults amplos + áreas explícitas
  IF v_role = 'GERENTE' THEN
    RETURN QUERY SELECT a.code, 'role_default'::text
    FROM (VALUES
      ('PDV'),('RELATORIOS_DIA'),('RELATORIOS'),
      ('PRODUTOS'),('PRODUTOS_EDIT'),
      ('ESTOQUE_VIEW'),('ESTOQUE_ADMIN'),
      ('CLIENTES'),('CREDIARIO'),('CASHBACK'),('FINANCEIRO'),('INSIGHTS'),
      ('ADM_ROOT')
    ) AS a(code);
  END IF;

  -- VENDEDOR: defaults mínimos
  IF v_role = 'VENDEDOR' THEN
    RETURN QUERY SELECT a.code, 'role_default'::text
    FROM (VALUES ('PDV'),('RELATORIOS_DIA')) AS a(code);
  END IF;

  -- Áreas explícitas da tabela user_areas (adicionais ou sobreposições)
  RETURN QUERY
    SELECT ua.area_code::text, 'explicit'::text
    FROM public.user_areas ua
    WHERE ua.user_id = auth.uid()
      AND ua.company_id = public.current_company_id();
END;
$$;

-- 4. Garante que grant_user_area aceita os novos códigos
--    (recria validação se houver CHECK constraint — na maioria não há, mas garante)
CREATE OR REPLACE FUNCTION public.grant_user_area(p_user_id uuid, p_area_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_valid_codes text[] := ARRAY[
    'PDV','RELATORIOS_DIA','RELATORIOS',
    'PRODUTOS','PRODUTOS_EDIT',
    'ESTOQUE_VIEW','ESTOQUE_ADMIN',
    'CLIENTES','CREDIARIO','CASHBACK','FINANCEIRO','INSIGHTS',
    'FISCAL','CONFIG','USERS','ADM_ROOT'
  ];
BEGIN
  IF NOT (p_area_code = ANY(v_valid_codes)) THEN
    RAISE EXCEPTION 'Código de área inválido: %', p_area_code;
  END IF;

  SELECT company_id INTO v_company FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.user_areas(company_id, user_id, area_code)
  VALUES (v_company, p_user_id, p_area_code)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_user_area(p_user_id uuid, p_area_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.profiles WHERE id = auth.uid();
  DELETE FROM public.user_areas
  WHERE company_id = v_company AND user_id = p_user_id AND area_code = p_area_code;
END;
$$;

-- 5. set_user_role: atualiza papel de um usuário da empresa
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_company     uuid;
BEGIN
  SELECT public.current_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('OWNER','GERENTE') THEN
    RAISE EXCEPTION 'Sem permissão para alterar papéis.';
  END IF;

  SELECT company_id INTO v_company FROM public.profiles WHERE id = auth.uid();

  UPDATE public.profiles
  SET role = p_role
  WHERE id = p_user_id AND company_id = v_company;
END;
$$;
