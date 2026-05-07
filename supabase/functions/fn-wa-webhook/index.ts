// Edge Function: fn-wa-webhook
// Recebe todos os eventos da Evolution API e salva no banco
// URL pública: sem auth JWT (Evolution API faz POST aqui)
// Segurança: verifica header x-wa-secret

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Verifica secret para evitar chamadas não autorizadas
  const secret = req.headers.get('x-wa-secret') ?? req.headers.get('apikey')
  const expected = Deno.env.get('WA_WEBHOOK_SECRET')
  if (expected && secret !== expected) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return new Response('Bad request', { status: 400 })

  const { event, instance: instanceName, data } = body as {
    event: string
    instance: string
    data: any
  }

  if (!instanceName || !event) return json({ ok: true })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Busca instância pelo nome
  const { data: inst } = await supabase
    .from('wa_instances')
    .select('id, company_id')
    .eq('instance_name', instanceName)
    .maybeSingle()

  if (!inst) return json({ ok: true }) // instância não registrada, ignora

  // ── Conexão atualizada ────────────────────────────────────
  if (event === 'connection.update') {
    const state = data?.state as string
    const status = state === 'open' ? 'connected'
      : state === 'connecting' ? 'connecting'
      : 'disconnected'

    const phone = data?.instance?.wuid
      ? String(data.instance.wuid).replace('@s.whatsapp.net', '')
      : null

    await supabase.from('wa_instances').update({
      status,
      phone: status === 'connected' ? phone : undefined,
      qr_code: status === 'connected' ? null : undefined,
      updated_at: new Date().toISOString(),
    }).eq('id', inst.id)
  }

  // ── QR Code atualizado ────────────────────────────────────
  if (event === 'qrcode.updated') {
    await supabase.from('wa_instances').update({
      status: 'connecting',
      qr_code: data?.qrcode?.base64 ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', inst.id)
  }

  // ── Nova mensagem ─────────────────────────────────────────
  if (event === 'messages.upsert') {
    const msg = Array.isArray(data) ? data[0] : data
    const key = msg?.key
    if (!key?.remoteJid) return json({ ok: true })

    const remoteJid = key.remoteJid as string
    // Ignora mensagens de grupo por enquanto
    if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) {
      return json({ ok: true })
    }

    const fromMe = Boolean(key.fromMe)
    const waMessageId = key.id as string

    // Extrai conteúdo de texto (vários tipos de mensagem)
    const content: string =
      msg?.message?.conversation ??
      msg?.message?.extendedTextMessage?.text ??
      msg?.message?.imageMessage?.caption ??
      msg?.message?.videoMessage?.caption ??
      (msg?.message?.imageMessage ? '[imagem]' : null) ??
      (msg?.message?.audioMessage ? '[áudio]' : null) ??
      (msg?.message?.documentMessage ? '[documento]' : null) ??
      '[mensagem]'

    const contactName = fromMe ? null : (msg?.pushName as string | null)
    const contactPhone = remoteJid.split('@')[0]

    // Upsert da conversa
    const { data: conv, error: convErr } = await supabase
      .from('wa_conversations')
      .upsert({
        company_id:      inst.company_id,
        instance_id:     inst.id,
        remote_jid:      remoteJid,
        contact_phone:   contactPhone,
        last_message:    content,
        last_message_at: new Date().toISOString(),
        ...(contactName ? { contact_name: contactName } : {}),
      }, { onConflict: 'instance_id,remote_jid' })
      .select('id, unread_count')
      .single()

    if (convErr || !conv) {
      console.error('conv upsert error:', convErr)
      return json({ ok: false }, 500)
    }

    // Incrementa unread só para mensagens recebidas
    if (!fromMe) {
      await supabase
        .from('wa_conversations')
        .update({ unread_count: (conv.unread_count ?? 0) + 1 })
        .eq('id', conv.id)
    }

    // Salva mensagem (ignora duplicatas via wa_message_id UNIQUE)
    await supabase.from('wa_messages').upsert({
      company_id:      inst.company_id,
      conversation_id: conv.id,
      wa_message_id:   waMessageId,
      direction:       fromMe ? 'outbound' : 'inbound',
      content,
      status:          'sent',
    }, { onConflict: 'wa_message_id', ignoreDuplicates: true })
  }

  return json({ ok: true })
})
