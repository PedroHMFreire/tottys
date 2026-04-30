-- ============================================================
-- 24_ensure_profile_rpc.sql
-- Cria ensure_my_profile() SECURITY DEFINER para que o login
-- possa criar/atualizar o perfil do usuário sem depender de RLS.
--
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor)
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_my_profile(
  p_role      text    DEFAULT NULL,
  p_nome      text    DEFAULT NULL,
  p_email     text    DEFAULT NULL,
  p_company   uuid    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_ex_role  text;
  v_ex_nome  text;
  v_ex_email text;
  v_ex_cid   uuid;
  v_role     text;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT role, nome, email, company_id
    INTO v_ex_role, v_ex_nome, v_ex_email, v_ex_cid
    FROM public.profiles WHERE id = v_uid;

  -- Resolve role:
  --   1. Usa p_role se fornecido explicitamente (signup forçado como OWNER)
  --   2. Mantém role existente se não for o default 'VENDEDOR'
  --   3. Cai em 'OWNER' como padrão seguro para novos usuários
  v_role := COALESCE(
    p_role,
    CASE WHEN v_ex_role IS NOT NULL AND v_ex_role <> 'VENDEDOR'
         THEN v_ex_role ELSE NULL END,
    'OWNER'
  );

  INSERT INTO public.profiles (id, role, nome, email, company_id)
  VALUES (
    v_uid,
    v_role,
    COALESCE(p_nome,    v_ex_nome),
    COALESCE(p_email,   v_ex_email),
    COALESCE(p_company, v_ex_cid)
  )
  ON CONFLICT (id) DO UPDATE
    SET role       = v_role,
        nome       = COALESCE(p_nome,    profiles.nome),
        email      = COALESCE(p_email,   profiles.email),
        company_id = COALESCE(p_company, profiles.company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_my_profile(text, text, text, uuid) TO authenticated;
