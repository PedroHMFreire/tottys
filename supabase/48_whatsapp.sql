-- ============================================================
-- 48_whatsapp.sql
-- Infraestrutura de WhatsApp (Evolution API)
-- ============================================================

-- Instâncias: uma por empresa ou por loja
CREATE TABLE IF NOT EXISTS public.wa_instances (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id      uuid        REFERENCES public.stores(id) ON DELETE CASCADE,
  instance_name text        NOT NULL UNIQUE, -- nome único na Evolution API
  label         text        NOT NULL,        -- nome de exibição
  status        text        NOT NULL DEFAULT 'disconnected'
                CHECK (status IN ('disconnected','connecting','connected')),
  phone         text,        -- número conectado (preenchido após conexão)
  qr_code       text,        -- base64 do QR atual (limpo após conexão)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_instances_company ON public.wa_instances(company_id);

ALTER TABLE public.wa_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_instances_company" ON public.wa_instances
  FOR ALL USING (company_id = public.current_company_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_instances TO authenticated;

-- Conversas: uma por contato por instância
CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_id     uuid        NOT NULL REFERENCES public.wa_instances(id) ON DELETE CASCADE,
  customer_id     uuid        REFERENCES public.customers(id) ON DELETE SET NULL,
  remote_jid      text        NOT NULL, -- ex: 5511999990000@s.whatsapp.net
  contact_name    text,
  contact_phone   text,
  last_message    text,
  last_message_at timestamptz,
  unread_count    int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(instance_id, remote_jid)
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_company     ON public.wa_conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_instance    ON public.wa_conversations(instance_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg    ON public.wa_conversations(instance_id, last_message_at DESC);

ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_conversations_company" ON public.wa_conversations
  FOR ALL USING (company_id = public.current_company_id());
GRANT SELECT, INSERT, UPDATE ON public.wa_conversations TO authenticated;

-- Mensagens individuais
CREATE TABLE IF NOT EXISTS public.wa_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid        NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  wa_message_id   text        UNIQUE, -- ID original do WA (evita duplicatas)
  direction       text        NOT NULL CHECK (direction IN ('inbound','outbound')),
  content         text        NOT NULL,
  media_url       text,
  media_type      text,
  status          text        NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('pending','sent','delivered','read','failed')),
  sent_by_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_conv    ON public.wa_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wa_messages_company ON public.wa_messages(company_id);

ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_messages_company" ON public.wa_messages
  FOR ALL USING (company_id = public.current_company_id());
GRANT SELECT, INSERT, UPDATE ON public.wa_messages TO authenticated;

-- Habilita Realtime nas tabelas de WA para updates ao vivo no inbox
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_instances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;
