-- ============================================================
-- Fase 17: Cobrança via WhatsApp
-- Adiciona chave Pix e mensagens de cobrança por empresa.
-- Execução idempotente — seguro re-rodar a qualquer momento.
-- ============================================================

alter table public.companies
  add column if not exists pix_chave         text,
  add column if not exists msg_lembrete      text default
    'Olá {{nome}}! Passando para lembrar que sua parcela {{parcela}}ª de *{{valor}}* vence em *{{data}}*. Qualquer dúvida estamos à disposição! 😊',
  add column if not exists msg_cobranca      text default
    'Olá {{nome}}, tudo bem? Sua parcela {{parcela}}ª de *{{valor}}* venceu em {{data}} e ainda está em aberto. Para regularizar, entre em contato conosco ou pague pelo Pix: *{{pix}}*. Obrigado!';
