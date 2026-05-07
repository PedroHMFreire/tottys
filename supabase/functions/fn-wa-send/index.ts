// Edge Function: fn-wa-send
// Envia uma mensagem de texto via Evolution API e salva no banco

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Não autorizado' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Sessão inválida' }, 401)

  const body = await req.json() as {
    conversation_id: string
    text: string
  }

  if (!body.conversation_id || !body.text?.trim()) {
    return json({ error: 'conversation_id e text são obrigatórios' }, 400)
  }

  // Busca conversa + instância
  const { data: conv } = await supabase
    .from('wa_conversations')
    .select('id, remote_jid, company_id, instance_id, wa_instances(instance_name, status)')
    .eq('id', body.conversation_id)
    .maybeSingle()

  if (!conv) return json({ error: 'Conversa não encontrada' }, 404)

  const inst = (conv.wa_instances as any)
  if (inst?.status !== 'connected') {
    return json({ error: 'Instância desconectada. Reconecte o WhatsApp.' }, 400)
  }

  const evoUrl = Deno.env.get('EVOLUTION_API_URL')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey) {
    return json({ error: 'Evolution API não configurada' }, 500)
  }

  // Número sem @s.whatsapp.net
  const number = conv.remote_jid.replace('@s.whatsapp.net', '').replace('@c.us', '')

  // Envia via Evolution API
  const evoRes = await fetch(`${evoUrl}/message/sendText/${inst.instance_name}`, {
    method: 'POST',
    headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, text: body.text.trim() }),
  })

  if (!evoRes.ok) {
    const err = await evoRes.text()
    console.error('Evolution API error:', err)
    return json({ error: 'Falha ao enviar mensagem' }, 502)
  }

  const evoData = await evoRes.json() as { key?: { id?: string } }

  // Salva mensagem no banco
  const { data: msg } = await supabase.from('wa_messages').insert({
    company_id:      conv.company_id,
    conversation_id: conv.id,
    wa_message_id:   evoData?.key?.id ?? null,
    direction:       'outbound',
    content:         body.text.trim(),
    status:          'sent',
    sent_by_user_id: user.id,
  }).select('id, content, direction, status, created_at').single()

  // Atualiza last_message da conversa
  await supabase.from('wa_conversations').update({
    last_message:    body.text.trim(),
    last_message_at: new Date().toISOString(),
  }).eq('id', conv.id)

  return json({ ok: true, message: msg })
})
