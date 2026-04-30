-- ============================================================
-- Script 29 — Modelo de roles v3
-- Três níveis de empresa: ADMIN | GERENTE | COLABORADOR
-- OWNER permanece inalterado (plataforma Tottys).
--
-- Mapeamento:
--   profiles.role antigo → novo
--   GERENTE / ADMIN / GESTOR  → ADMIN
--   VENDEDOR / CAIXA          → COLABORADOR
--   GERENTE (novo)            → GERENTE   (novo nível intermediário)
--   OWNER                     → OWNER     (sem mudança)
--
-- Execute no SQL Editor do Supabase antes do deploy do frontend.
-- ============================================================

-- ── 1. Adicionar coluna cargo (sub-tipo descritivo de COLABORADOR) ────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cargo TEXT
  CHECK (cargo IN ('VENDEDOR','ASSISTENTE','TEMPORARIO') OR cargo IS NULL);

-- ── 2. Migrar dados existentes ────────────────────────────────────────────────
-- Todos os GERENTE/ADMIN/GESTOR atuais viram ADMIN (administrador da empresa)
UPDATE public.profiles
SET role = 'ADMIN',
    cargo = CASE WHEN cargo IS NULL AND role = 'GERENTE' THEN NULL ELSE cargo END
WHERE role IN ('GERENTE','ADMIN','GESTOR');

-- Todos os VENDEDOR/CAIXA viram COLABORADOR
UPDATE public.profiles
SET role = 'COLABORADOR',
    cargo = CASE
      WHEN role = 'VENDEDOR' AND cargo IS NULL THEN 'VENDEDOR'
      WHEN role = 'CAIXA'    AND cargo IS NULL THEN 'ASSISTENTE'
      ELSE cargo
    END
WHERE role IN ('VENDEDOR','CAIXA');

-- Atualizar default da coluna
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'COLABORADOR';

-- ── 3. current_role() — normaliza valores legados e retorna role canônico ─────
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE role
    WHEN 'GESTOR'      THEN 'ADMIN'      -- legado
    WHEN 'GERENTE_OLD' THEN 'ADMIN'      -- legado hipotético
    WHEN 'VENDEDOR'    THEN 'COLABORADOR'-- legado (não deveria restar após migração)
    WHEN 'CAIXA'       THEN 'COLABORADOR'-- legado
    ELSE role
  END
  FROM public.profiles WHERE id = auth.uid();
$$;

-- ── 4. get_my_areas() — defaults por nível ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_areas()
RETURNS TABLE(area_code text, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT public.current_role() INTO v_role;
  IF v_role IS NULL THEN RETURN; END IF;

  -- OWNER e ADMIN: acesso total a todas as áreas
  IF v_role IN ('OWNER','ADMIN') THEN
    RETURN QUERY SELECT a.code, 'role_default'::text
    FROM (VALUES
      ('PDV'),('RELATORIOS_DIA'),('RELATORIOS'),
      ('PRODUTOS'),('PRODUTOS_EDIT'),
      ('ESTOQUE_VIEW'),('ESTOQUE_ADMIN'),
      ('CLIENTES'),('CREDIARIO'),('CASHBACK'),
      ('FINANCEIRO'),('INSIGHTS'),('NPS'),
      ('FISCAL'),('CONFIG'),('USERS'),('ADM_ROOT')
    ) AS a(code);
    RETURN;
  END IF;

  -- GERENTE: acesso amplo, sem config crítica
  IF v_role = 'GERENTE' THEN
    RETURN QUERY SELECT a.code, 'role_default'::text
    FROM (VALUES
      ('PDV'),('RELATORIOS_DIA'),('RELATORIOS'),
      ('PRODUTOS'),('PRODUTOS_EDIT'),
      ('ESTOQUE_VIEW'),('ESTOQUE_ADMIN'),
      ('CLIENTES'),('CREDIARIO'),('CASHBACK'),
      ('INSIGHTS'),('NPS'),
      ('ADM_ROOT')
    ) AS a(code);
    -- GERENTE NÃO tem: FINANCEIRO, FISCAL, CONFIG, USERS por padrão
  END IF;

  -- COLABORADOR: acesso mínimo ao PDV
  IF v_role = 'COLABORADOR' THEN
    RETURN QUERY SELECT a.code, 'role_default'::text
    FROM (VALUES ('PDV'),('RELATORIOS_DIA')) AS a(code);
  END IF;

  -- Áreas explícitas concedidas na tabela user_areas (sobrepõem ou estendem)
  RETURN QUERY
    SELECT ua.area_code::text, 'explicit'::text
    FROM public.user_areas ua
    WHERE ua.user_id = auth.uid()
      AND ua.company_id = public.current_company_id();
END;
$$;

-- ── 5. user_has_store_access() — atualiza para novos roles ───────────────────
CREATE OR REPLACE FUNCTION public.user_has_store_access(p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role    text;
  v_company uuid;
BEGIN
  SELECT public.current_role(), company_id
  INTO v_role, v_company
  FROM public.profiles WHERE id = auth.uid();

  -- OWNER: acessa tudo
  IF v_role = 'OWNER' THEN RETURN true; END IF;

  -- ADMIN e GERENTE: acessa qualquer loja da empresa
  IF v_role IN ('ADMIN','GERENTE') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = p_store_id AND s.company_id = v_company
    );
  END IF;

  -- COLABORADOR: verifica user_stores; se não houver vínculo, permite (empresa c/ 1 loja)
  IF to_regclass('public.user_stores') IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = p_store_id AND s.company_id = v_company
    );
  END IF;

  -- Há vínculo explícito?
  IF EXISTS (
    SELECT 1 FROM public.user_stores us
    WHERE us.user_id = auth.uid() AND us.store_id = p_store_id
  ) THEN RETURN true; END IF;

  -- Sem vínculo, mas empresa tem só uma loja → permite
  RETURN (SELECT COUNT(*) = 1 FROM public.stores WHERE company_id = v_company);
END;
$$;

-- ── 6. set_user_role() — hierarquia de 3 níveis ───────────────────────────────
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_company     uuid;
  v_target_company uuid;
BEGIN
  SELECT public.current_role() INTO v_caller_role;
  SELECT company_id INTO v_company FROM public.profiles WHERE id = auth.uid();
  SELECT company_id INTO v_target_company FROM public.profiles WHERE id = p_user_id;

  -- Só pode alterar usuários da mesma empresa
  IF v_company IS DISTINCT FROM v_target_company AND v_caller_role <> 'OWNER' THEN
    RAISE EXCEPTION 'Usuário pertence a outra empresa.';
  END IF;

  -- OWNER pode setar qualquer role
  IF v_caller_role = 'OWNER' THEN
    UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
    RETURN;
  END IF;

  -- ADMIN pode promover a GERENTE ou COLABORADOR (não pode criar outro ADMIN nem OWNER)
  IF v_caller_role = 'ADMIN' THEN
    IF p_role NOT IN ('GERENTE','COLABORADOR') THEN
      RAISE EXCEPTION 'ADMIN só pode definir role GERENTE ou COLABORADOR.';
    END IF;
    UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
    RETURN;
  END IF;

  -- GERENTE pode apenas rebaixar/promover COLABORADOR
  IF v_caller_role = 'GERENTE' THEN
    IF p_role NOT IN ('COLABORADOR') THEN
      RAISE EXCEPTION 'GERENTE só pode definir role COLABORADOR.';
    END IF;
    UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Sem permissão para alterar papéis.';
END;
$$;

-- ── 7. grant_user_area() — GERENTE só concede áreas que possui ───────────────
CREATE OR REPLACE FUNCTION public.grant_user_area(p_user_id uuid, p_area_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_company     uuid;
  -- Áreas restritas que apenas ADMIN/OWNER podem conceder
  v_admin_only  text[] := ARRAY['FISCAL','CONFIG','USERS','FINANCEIRO'];
  v_valid_codes text[] := ARRAY[
    'PDV','RELATORIOS_DIA','RELATORIOS',
    'PRODUTOS','PRODUTOS_EDIT',
    'ESTOQUE_VIEW','ESTOQUE_ADMIN',
    'CLIENTES','CREDIARIO','CASHBACK',
    'FINANCEIRO','INSIGHTS','NPS',
    'FISCAL','CONFIG','USERS','ADM_ROOT'
  ];
BEGIN
  IF NOT (p_area_code = ANY(v_valid_codes)) THEN
    RAISE EXCEPTION 'Código de área inválido: %', p_area_code;
  END IF;

  SELECT public.current_role(), company_id
  INTO v_caller_role, v_company
  FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role NOT IN ('OWNER','ADMIN','GERENTE') THEN
    RAISE EXCEPTION 'Sem permissão para conceder áreas.';
  END IF;

  -- GERENTE não pode conceder áreas administrativas
  IF v_caller_role = 'GERENTE' AND p_area_code = ANY(v_admin_only) THEN
    RAISE EXCEPTION 'GERENTE não pode conceder a área %', p_area_code;
  END IF;

  INSERT INTO public.user_areas(company_id, user_id, area_code)
  VALUES (v_company, p_user_id, p_area_code)
  ON CONFLICT DO NOTHING;
END;
$$;

-- ── 8. revoke_user_area() — mesmas regras do grant ───────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_user_area(p_user_id uuid, p_area_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_company     uuid;
  v_admin_only  text[] := ARRAY['FISCAL','CONFIG','USERS','FINANCEIRO'];
BEGIN
  SELECT public.current_role(), company_id
  INTO v_caller_role, v_company
  FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role NOT IN ('OWNER','ADMIN','GERENTE') THEN
    RAISE EXCEPTION 'Sem permissão para revogar áreas.';
  END IF;

  IF v_caller_role = 'GERENTE' AND p_area_code = ANY(v_admin_only) THEN
    RAISE EXCEPTION 'GERENTE não pode revogar a área %', p_area_code;
  END IF;

  DELETE FROM public.user_areas
  WHERE company_id = v_company AND user_id = p_user_id AND area_code = p_area_code;
END;
$$;

-- ── 9. RLS — atualiza policies para aceitar ADMIN e GERENTE ──────────────────
-- A função current_role() já retorna os novos valores.
-- As policies que verificam ('OWNER','ADMIN','GERENTE') já estão corretas
-- porque ADMIN = administrador e GERENTE = gerente (ambos devem ter acesso a dados).
-- Abaixo apenas garantimos que as policies existentes usem current_role() corretamente.

-- profiles: ADMIN e GERENTE podem ver/editar perfis da empresa
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_write  ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR (
      public.current_role() IN ('OWNER','ADMIN','GERENTE')
      AND company_id = public.current_company_id()
    )
  );

CREATE POLICY profiles_write ON public.profiles
  FOR ALL
  USING (
    id = auth.uid()
    OR (
      public.current_role() IN ('OWNER','ADMIN','GERENTE')
      AND company_id = public.current_company_id()
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR (
      public.current_role() IN ('OWNER','ADMIN','GERENTE')
      AND company_id = public.current_company_id()
    )
  );

-- user_areas: ADMIN e GERENTE podem ver/editar áreas da empresa
DROP POLICY IF EXISTS user_areas_select ON public.user_areas;
DROP POLICY IF EXISTS user_areas_write  ON public.user_areas;

CREATE POLICY user_areas_select ON public.user_areas
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.current_role() = 'OWNER'
    OR (
      public.current_role() IN ('ADMIN','GERENTE')
      AND company_id = public.current_company_id()
    )
  );

CREATE POLICY user_areas_write ON public.user_areas
  FOR ALL
  USING (
    public.current_role() IN ('OWNER','ADMIN','GERENTE')
    AND (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
  )
  WITH CHECK (
    public.current_role() IN ('OWNER','ADMIN','GERENTE')
    AND (company_id = public.current_company_id() OR public.current_role() = 'OWNER')
  );

-- ── 10. Adicionar NPS aos códigos válidos de user_areas (se houver CHECK) ─────
-- Apenas preventivo — a constraint de user_areas.area_code geralmente não existe
DO $$
BEGIN
  -- Garante que NPS é tratado como área válida no grant_user_area (já incluído acima)
  RAISE NOTICE 'Área NPS incluída nos defaults de ADMIN e GERENTE.';
END $$;

-- ── 11. Verificação final ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_admins     int;
  v_gerentes   int;
  v_colab      int;
  v_owners     int;
  v_legado     int;
BEGIN
  SELECT COUNT(*) INTO v_admins    FROM public.profiles WHERE role = 'ADMIN';
  SELECT COUNT(*) INTO v_gerentes  FROM public.profiles WHERE role = 'GERENTE';
  SELECT COUNT(*) INTO v_colab     FROM public.profiles WHERE role = 'COLABORADOR';
  SELECT COUNT(*) INTO v_owners    FROM public.profiles WHERE role = 'OWNER';
  SELECT COUNT(*) INTO v_legado    FROM public.profiles WHERE role IN ('VENDEDOR','CAIXA','GESTOR');

  RAISE NOTICE '=== Migração roles v3 ===';
  RAISE NOTICE 'OWNER:       %', v_owners;
  RAISE NOTICE 'ADMIN:       %', v_admins;
  RAISE NOTICE 'GERENTE:     %', v_gerentes;
  RAISE NOTICE 'COLABORADOR: %', v_colab;
  IF v_legado > 0 THEN
    RAISE WARNING 'Roles legados ainda presentes: % perfis', v_legado;
  ELSE
    RAISE NOTICE 'Nenhum role legado restante. OK.';
  END IF;
END $$;
