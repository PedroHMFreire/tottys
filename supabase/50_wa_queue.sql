-- Fila de mensagens WhatsApp automáticas (cashback e outras notificações)
CREATE TABLE IF NOT EXISTS wa_message_queue (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_phone  text        NOT NULL,
  customer_name   text,
  message         text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'sent', 'failed')),
  attempts        int         NOT NULL DEFAULT 0,
  last_error      text,
  scheduled_after timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

ALTER TABLE wa_message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_own_company" ON wa_message_queue
  FOR ALL USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS wa_message_queue_pending_idx
  ON wa_message_queue (company_id, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS wa_message_queue_sent_idx
  ON wa_message_queue (company_id, sent_at DESC)
  WHERE status = 'sent';
