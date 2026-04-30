-- ============================================================
-- 23_fix_owner_role.sql
-- Corrige perfis de OWNER cujo role ficou como 'VENDEDOR'
-- por falha silenciosa do upsert antes do RLS ser corrigido.
--
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor)
-- como administrador (postgres).
-- ============================================================

-- Atualiza o role do usuário específico para OWNER
-- Substitua o email abaixo pelo e-mail da sua conta, se necessário.
UPDATE public.profiles
   SET role = 'OWNER'
 WHERE email = 'pedrohfreire@gmail.com'
   AND role  = 'VENDEDOR';

-- Confirma o resultado
SELECT id, email, role, company_id
  FROM public.profiles
 WHERE email = 'pedrohfreire@gmail.com';
