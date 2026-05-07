// @ts-nocheck — Deno runtime; Node.js TS compiler não reconhece imports Deno
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Não autorizado' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Sessão inválida' }, 401)

  const body = await req.json() as {
    conversation_id: string
    text?: string
    media?: { base64: string; mimetype: string; filename?: string }
  }
  if (!body.conversation_id || (!body.text?.trim() && !body.media)) {
    return json({ error: 'conversation_id e text ou media são obrigatórios' }, 400)
  }

  const { data: conv } = await supabase
    .from('wa_conversations')
    .select('id, remote_jid, company_id, instance_id, wa_instances(instance_name, status)')
    .eq('id', body.conversation_id)
    .maybeSingle()
  if (!conv) return json({ error: 'Conversa não encontrada' }, 404)

  const inst = conv.wa_instances as any
  if (inst?.status !== 'connected') return json({ error: 'Instância desconectada. Reconecte o WhatsApp.' }, 400)

  const evoUrl = Deno.env.get('EVOLUTION_API_URL')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey) return json({ error: 'Evolution API não configurada' }, 500)

  const number = conv.remote_jid.replace('@s.whatsapp.net', '').replace('@c.us', '')

  let evoRes: Response
  let mediaUrl:  string | null = null
  const mediaType: string | null = body.media?.mimetype ?? null

  if (body.media) {
    const { base64, mimetype, filename } = body.media
    const isAudio = mimetype.startsWith('audio/')
    const isVideo = mimetype.startsWith('video/')
    const isImage = mimetype.startsWith('image/')

    if (isAudio) {
      // Envia como nota de voz (player WA nativo com forma de onda)
      evoRes = await fetch(`${evoUrl}/message/sendWhatsAppAudio/${inst.instance_name}`, {
        method: 'POST',
        headers: { apikey: evoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, audio: base64, encoding: true }),
      })
    } else {
      const mediatype = isVideo ? 'video' : isImage ? 'image' : 'document'
      evoRes = await fetch(`${evoUrl}/message/sendMedia/${inst.instance_name}`, {
        method: 'POST',
        headers: { apikey: evoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number,
          mediatype,
          mimetype,
          media: base64,
          caption:  body.text?.trim() ?? '',
          fileName: filename ?? `file.${EXT_MAP[mimetype] ?? 'bin'}`,
        }),
      })
    }

    if (!evoRes.ok) {
      console.error('Evolution media error:', await evoRes.text())
      return json({ error: 'Falha ao enviar mídia' }, 502)
    }

    // Salva mídia no storage para exibir no inbox
    try {
      const clean = base64.replace(/^data:[^;]+;base64,/, '')
      const bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0))
      const ext   = EXT_MAP[mimetype] ?? mimetype.split('/')[1] ?? 'bin'
      const path  = `${conv.company_id}/${conv.id}/out_${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabaseAdmin.storage
        .from('wa-media')
        .upload(path, bytes, { contentType: mimetype, upsert: true })
      if (!upErr) {
        const { data: urlData } = supabaseAdmin.storage.from('wa-media').getPublicUrl(path)
        mediaUrl = urlData.publicUrl
      }
    } catch (e) { console.error('storage upload (outbound):', e) }

  } else {
    evoRes = await fetch(`${evoUrl}/message/sendText/${inst.instance_name}`, {
      method: 'POST',
      headers: { apikey: evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, text: body.text!.trim() }),
    })
    if (!evoRes.ok) {
      console.error('Evolution text error:', await evoRes.text())
      return json({ error: 'Falha ao enviar mensagem' }, 502)
    }
  }

  const evoData = await evoRes.json() as { key?: { id?: string } }
  const content = body.text?.trim() || (
    mediaType?.startsWith('image/') ? '[imagem]' :
    mediaType?.startsWith('video/') ? '[vídeo]'  :
    mediaType?.startsWith('audio/') ? '[áudio]'  : '[arquivo]'
  )

  const { data: msg } = await supabase.from('wa_messages').insert({
    company_id:      conv.company_id,
    conversation_id: conv.id,
    wa_message_id:   evoData?.key?.id ?? null,
    direction:       'outbound',
    content,
    status:          'sent',
    sent_by_user_id: user.id,
    media_url:       mediaUrl,
    media_type:      mediaType,
  }).select('id, content, direction, status, created_at, media_url, media_type').single()

  await supabase.from('wa_conversations').update({
    last_message:    content,
    last_message_at: new Date().toISOString(),
  }).eq('id', conv.id)

  return json({ ok: true, message: msg })
})
