-- Permite criar perfil antes de vincular empresa (onboarding)
alter table public.profiles
  alter column company_id drop not null;

-- Opcional: garantir default de role
alter table public.profiles
  alter column role set default 'VENDEDOR';
