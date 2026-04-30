-- Configuração de email por empresa
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS email_remetente  TEXT,
  ADD COLUMN IF NOT EXISTS email_nome       TEXT,
  ADD COLUMN IF NOT EXISTS email_senha_app  TEXT,
  ADD COLUMN IF NOT EXISTS email_smtp_host  TEXT DEFAULT 'smtp.gmail.com',
  ADD COLUMN IF NOT EXISTS email_smtp_port  INTEGER DEFAULT 587;
