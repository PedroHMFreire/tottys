// @ts-nocheck — Deno runtime; Node.js TS compiler não reconhece imports Deno
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/mpeg': 'mpg',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'application/pdf': 'pdf',
}

async function fetchAndStoreMedia(
  supabase: ReturnType<typeof createClient>,
  evoUrl: string,
  evoKey: string,
  instanceName: string,
  msgKey: any,
  msgObj: any,
  companyId: string,
  convId: string,
  waMessageId: string,
): Promise<{ mediaUrl: string | null; mediaType: string | null }> {
  const isImage    = !!msgObj.imageMessage
  const isVideo    = !!msgObj.videoMessage
  const isAudio    = !!msgObj.audioMessage || !!msgObj.pttMessage
  const isDocument = !!msgObj.documentMessage
  if (!isImage && !isVideo && !isAudio && !isDocument) return { mediaUrl: null, mediaType: null }

  const mimetype: string =
    msgObj.imageMessage?.mimetype ??
    msgObj.videoMessage?.mimetype ??
    msgObj.audioMessage?.mimetype ??
    msgObj.pttMessage?.mimetype ??
    msgObj.documentMessage?.mimetype ??
    (isImage ? 'image/jpeg' : isVideo ? 'video/mp4' : isAudio ? 'audio/ogg' : 'application/octet-stream')

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20_000)
    const b64Res = await fetch(
      `${evoUrl}/message/getBase64FromMediaMessage/${instanceName}`,
      {
        method: 'POST',
        headers: { apikey: evoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { key: msgKey, message: msgObj } }),
        signal: ctrl.signal,
      },
    ).finally(() => clearTimeout(t))

    if (!b64Res.ok) return { mediaUrl: null, mediaType: null }
    const b64Data = await b64Res.json()
    const raw: string | null = b64Data?.base64 ?? b64Data?.data?.base64 ?? null
    if (!raw) return { mediaUrl: null, mediaType: null }

    const clean = raw.replace(/^data:[^;]+;base64,/, '')
    const bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0))
    const ext = EXT_MAP[mimetype] ?? mimetype.split('/')[1]?.split(';')[0] ?? 'bin'
    const path = `${companyId}/${convId}/${waMessageId}.${ext}`

    const { error } = await supabase.storage
      .from('wa-media')
      .upload(path, bytes, { contentType: mimetype, upsert: true })
    if (error) { console.error('storage upload:', error); return { mediaUrl: null, mediaType: null } }

    const { data: urlData } = supabase.storage.from('wa-media').getPublicUrl(path)
    return { mediaUrl: urlData.publicUrl, mediaType: mimetype }
  } catch (e) {
    console.error('fetchAndStoreMedia error:', e)
    return { mediaUrl: null, mediaType: null }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const secret = req.headers.get('x-wa-secret') ?? req.headers.get('apikey')
  const expected = Deno.env.get('WA_WEBHOOK_SECRET')
  if (expected && secret !== expected) return new Response('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return new Response('Bad request', { status: 400 })

  const { event, instance: instanceName, data } = body as { event: string; instance: string; data: any }
  if (!instanceName || !event) return json({ ok: true })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: inst } = await supabase
    .from('wa_instances')
    .select('id, company_id')
    .eq('instance_name', instanceName)
    .maybeSingle()
  if (!inst) return json({ ok: true })

  // ── connection.update ──────────────────────────────────────────────────────
  if (event === 'connection.update') {
    const state = data?.state as string
    const status = state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected'
    const phone = data?.instance?.wuid ? String(data.instance.wuid).replace('@s.whatsapp.net', '') : null
    await supabase.from('wa_instances').update({
      status,
      phone:      status === 'connected' ? phone : undefined,
      qr_code:    status === 'connected' ? null  : undefined,
      updated_at: new Date().toISOString(),
    }).eq('id', inst.id)

    // Ao reconectar, dispara processamento da fila de mensagens pendentes
    if (status === 'connected') {
      const queueUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/fn-wa-process-queue`
      fetch(queueUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ company_id: inst.company_id }),
      }).catch(e => console.error('queue trigger error:', e))
    }
  }

  // ── qrcode.updated ─────────────────────────────────────────────────────────
  if (event === 'qrcode.updated') {
    await supabase.from('wa_instances').update({
      status:     'connecting',
      qr_code:    data?.qrcode?.base64 ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', inst.id)
  }

  // ── messages.upsert ────────────────────────────────────────────────────────
  if (event === 'messages.upsert') {
    const msg = Array.isArray(data) ? data[0] : data
    const key = msg?.key
    if (!key?.remoteJid) return json({ ok: true })

    const remoteJid = key.remoteJid as string
    if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) return json({ ok: true })

    const fromMe      = Boolean(key.fromMe)
    const waMessageId = key.id as string
    const msgObj      = msg?.message ?? {}

    const isImage    = !!msgObj.imageMessage
    const isVideo    = !!msgObj.videoMessage
    const isAudio    = !!msgObj.audioMessage || !!msgObj.pttMessage
    const isDocument = !!msgObj.documentMessage

    const content: string =
      msgObj.conversation ??
      msgObj.extendedTextMessage?.text ??
      msgObj.imageMessage?.caption ??
      msgObj.videoMessage?.caption ??
      msgObj.documentMessage?.caption ??
      (isImage    ? '[imagem]'    : null) ??
      (isVideo    ? '[vídeo]'    : null) ??
      (isAudio    ? '[áudio]'    : null) ??
      (isDocument ? (msgObj.documentMessage?.fileName ?? '[documento]') : null) ??
      '[mensagem]'

    const contactName  = fromMe ? null : (msg?.pushName as string | null)
    const contactPhone = remoteJid.split('@')[0]

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

    if (convErr || !conv) { console.error('conv upsert:', convErr); return json({ ok: false }, 500) }

    if (!fromMe) {
      await supabase.from('wa_conversations')
        .update({ unread_count: (conv.unread_count ?? 0) + 1 })
        .eq('id', conv.id)
    }

    // Download e armazena mídia
    const evoUrl = Deno.env.get('EVOLUTION_API_URL')
    const evoKey = Deno.env.get('EVOLUTION_API_KEY')
    let mediaUrl: string | null = null
    let mediaType: string | null = null

    if (evoUrl && evoKey && (isImage || isVideo || isAudio || isDocument)) {
      const r = await fetchAndStoreMedia(
        supabase, evoUrl, evoKey, instanceName,
        key, msgObj, inst.company_id, conv.id, waMessageId,
      )
      mediaUrl  = r.mediaUrl
      mediaType = r.mediaType
    }

    await supabase.from('wa_messages').upsert({
      company_id:      inst.company_id,
      conversation_id: conv.id,
      wa_message_id:   waMessageId,
      direction:       fromMe ? 'outbound' : 'inbound',
      content,
      status:          'sent',
      media_url:       mediaUrl,
      media_type:      mediaType,
    }, { onConflict: 'wa_message_id', ignoreDuplicates: true })
  }

  return json({ ok: true })
})
