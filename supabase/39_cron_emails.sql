-- 39_cron_emails.sql
-- Configura pg_cron para disparar o email-trial-reminder diariamente às 10h (BRT = 13h UTC).
-- Requer extensão pg_cron habilitada no Supabase (Settings → Extensions → pg_cron).

-- Garante que a extensão está ativa
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove job anterior se existir (idempotente)
SELECT cron.unschedule('tottys-trial-reminder') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'tottys-trial-reminder'
);

-- Agenda chamada diária à 1h UTC (10h BRT) via http extension do Supabase
SELECT cron.schedule(
  'tottys-trial-reminder',
  '0 13 * * *',   -- 13h UTC = 10h BRT
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/email-trial-reminder',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- IMPORTANTE: configure as seguintes variáveis no Supabase Dashboard:
-- Settings → Configuration → Database → "Custom config" (ou via SQL):
--
--   ALTER DATABASE postgres SET app.supabase_url = 'https://SEU_PROJETO.supabase.co';
--   ALTER DATABASE postgres SET app.cron_secret  = 'SEU_CRON_SECRET';
--
-- E no Supabase secrets:
--   CRON_SECRET=SEU_CRON_SECRET   (mesmo valor acima)
--
-- Também habilite a extensão pg_net (necessária para net.http_post):
--   Settings → Extensions → pg_net → Enable
