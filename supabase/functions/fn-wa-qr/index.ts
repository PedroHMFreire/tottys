// @ts-nocheck — Deno runtime; Node.js TS compiler não reconhece imports Deno
// Edge Function: fn-wa-qr
// Cria/conecta instância na Evolution API e retorna QR code
// POST body: { instance_id }

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

  const { instance_id } = await req.json() as { instance_id: string }
  if (!instance_id) return json({ error: 'instance_id obrigatório' }, 400)

  const evoUrl = Deno.env.get('EVOLUTION_API_URL')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  const webhookUrl = Deno.env.get('SUPABASE_URL')
    ? `${Deno.env.get('SUPABASE_URL')}/functions/v1/fn-wa-webhook`
    : null
  const webhookSecret = Deno.env.get('WA_WEBHOOK_SECRET') ?? ''

  if (!evoUrl || !evoKey) {
    return json({ error: 'Evolution API não configurada. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY.' }, 500)
  }

  // Busca instância no banco
  const { data: inst } = await supabase
    .from('wa_instances')
    .select('id, instance_name, status, company_id')
    .eq('id', instance_id)
    .maybeSingle()

  if (!inst) return json({ error: 'Instância não encontrada' }, 404)

  const instanceName = inst.instance_name

  // Verifica se já existe na Evolution API
  const fetchRes = await fetch(`${evoUrl}/instance/fetchInstances`, {
    headers: { 'apikey': evoKey },
  }).catch(() => null)

  const fetchData = fetchRes?.ok ? await fetchRes.json().catch(() => []) : []
  const existsInEvo = Array.isArray(fetchData)
    ? fetchData.some((i: any) => i.instance?.instanceName === instanceName || i.name === instanceName)
    : false

  // Cria instância na Evolution API se não existir
  if (!existsInEvo) {
    const createBody: Record<string, any> = {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }

    if (webhookUrl) {
      createBody.webhook = {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      }
      createBody.webhookRaw = false
      // Header de segurança
      if (webhookSecret) {
        createBody.webhook.headers = { 'x-wa-secret': webhookSecret }
      }
    }

    const createRes = await fetch(`${evoUrl}/instance/create`, {
      method: 'POST',
      headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody),
    })

    if (!createRes.ok) {
      const err = await createRes.text()
      console.error('Erro ao criar instância:', err)
      return json({ error: 'Falha ao criar instância na Evolution API' }, 502)
    }
  }

  // Atualiza status para connecting
  await supabase.from('wa_instances').update({
    status: 'connecting',
    updated_at: new Date().toISOString(),
  }).eq('id', inst.id)

  // Conecta e obtém QR
  const connectRes = await fetch(`${evoUrl}/instance/connect/${instanceName}`, {
    headers: { 'apikey': evoKey },
  })

  if (!connectRes.ok) {
    const err = await connectRes.text()
    console.error('Erro ao conectar instância:', err)
    // Pode ser que já está conectado — tenta buscar status
    const infoRes = await fetch(`${evoUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
      headers: { 'apikey': evoKey },
    })
    const info = infoRes.ok ? await infoRes.json() : null
    const connected = Array.isArray(info) && info[0]?.instance?.state === 'open'
    if (connected) {
      await supabase.from('wa_instances').update({ status: 'connected' }).eq('id', inst.id)
      return json({ ok: true, status: 'connected', qr: null })
    }
    return json({ error: 'Falha ao obter QR code' }, 502)
  }

  const connectData = await connectRes.json()
  const qrBase64: string | null = connectData?.base64 ?? connectData?.qrcode?.base64 ?? null

  // Salva QR no banco (para Realtime no frontend)
  if (qrBase64) {
    await supabase.from('wa_instances').update({
      qr_code: qrBase64,
      updated_at: new Date().toISOString(),
    }).eq('id', inst.id)
  }

  return json({ ok: true, status: 'connecting', qr: qrBase64 })
})
