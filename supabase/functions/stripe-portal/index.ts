// Edge Function: stripe-portal
// Cria uma sessão do Stripe Customer Portal para o lojista gerenciar a assinatura.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'
import Stripe from 'https://esm.sh/stripe@16.2.0?target=deno'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const stripe      = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' })
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appUrl      = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

    const authHeader = req.headers.get('authorization') ?? ''
    const supa  = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: { user } } = await supa.auth.getUser()
    if (!user) return json({ error: 'não autenticado' }, 401)

    // Busca o stripe_customer_id da empresa do usuário
    const { data: rows } = await supa.rpc('get_my_subscription')
    const customerId = rows?.[0]?.stripe_customer_id
    if (!customerId) return json({ error: 'assinatura Stripe não encontrada. Assine um plano primeiro.' }, 400)

    const portal = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${appUrl}/adm/conta`,
    })

    return json({ url: portal.url })
  } catch (err: any) {
    console.error('stripe-portal error:', err)
    return json({ error: err.message ?? 'erro interno' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
