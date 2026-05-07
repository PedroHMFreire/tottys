// @ts-nocheck — Deno runtime; Node.js TS compiler não reconhece imports Deno
// Edge Function: fn-wa-process-queue
// Processa a fila de mensagens WhatsApp pendentes (1 mensagem por chamada)
// POST body: { company_id }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function isBusinessHour(): boolean {
  // Horário comercial Brasil: 9h-21h (UTC-3)
  const localMs = Date.now() - 3 * 60 * 60 * 1000
  const localHour = new Date(localMs).getUTCHours()
  return localHour >= 9 && localHour < 21
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // Adiciona DDI do Brasil se ausente
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function isServiceRole(authHeader: string): boolean {
  try {
    const payload = JSON.parse(atob(authHeader.replace('Bearer ', '').split('.')[1]))
    return payload.role === 'service_role'
  } catch { return false }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Não autorizado' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { company_id } = await req.json() as { company_id: string }
  if (!company_id) return json({ error: 'company_id obrigatório' }, 400)

  // Se não for service role, verifica se o usuário pertence à empresa
  if (!isServiceRole(authHeader)) {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Sessão inválida' }, 401)

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile || profile.company_id !== company_id) {
      return json({ error: 'Acesso negado' }, 403)
    }
  }

  // Verificação de horário comercial
  if (!isBusinessHour()) {
    return json({ ok: true, skipped: true, reason: 'outside_business_hours' })
  }

  // Instância conectada da empresa
  const { data: inst } = await supabase
    .from('wa_instances')
    .select('id, instance_name')
    .eq('company_id', company_id)
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()

  if (!inst) {
    return json({ ok: true, skipped: true, reason: 'no_connected_instance' })
  }

  const evoUrl = Deno.env.get('EVOLUTION_API_URL')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey) return json({ error: 'Evolution API não configurada' }, 500)

  // Rate limit: mínimo 30s entre mensagens
  const { data: lastSent } = await supabase
    .from('wa_message_queue')
    .select('sent_at')
    .eq('company_id', company_id)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastSent?.sent_at) {
    const elapsed = Date.now() - new Date(lastSent.sent_at).getTime()
    if (elapsed < 30_000) {
      return json({ ok: true, skipped: true, reason: 'rate_limited' })
    }
  }

  // Mensagem mais antiga pendente com menos de 3 tentativas
  const { data: msg } = await supabase
    .from('wa_message_queue')
    .select('id, customer_phone, message, attempts')
    .eq('company_id', company_id)
    .eq('status', 'pending')
    .lt('attempts', 3)
    .or(`scheduled_after.is.null,scheduled_after.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!msg) {
    return json({ ok: true, processed: 0, reason: 'empty_queue' })
  }

  const number = normalizePhone(msg.customer_phone)

  const evoRes = await fetch(`${evoUrl}/message/sendText/${inst.instance_name}`, {
    method: 'POST',
    headers: { apikey: evoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, text: msg.message }),
  })

  if (evoRes.ok) {
    await supabase.from('wa_message_queue').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      attempts: msg.attempts + 1,
    }).eq('id', msg.id)
    return json({ ok: true, processed: 1 })
  } else {
    const errText = await evoRes.text()
    const newAttempts = msg.attempts + 1
    await supabase.from('wa_message_queue').update({
      attempts: newAttempts,
      last_error: errText.slice(0, 500),
      status: newAttempts >= 3 ? 'failed' : 'pending',
    }).eq('id', msg.id)
    console.error('Queue send error:', errText)
    return json({ ok: false, error: 'send_failed' }, 502)
  }
})
