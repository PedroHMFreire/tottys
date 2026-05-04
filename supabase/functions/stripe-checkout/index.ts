// Edge Function: stripe-checkout
// Cria uma Stripe Checkout Session e retorna a URL de pagamento.
// Chamada pelo frontend quando o lojista escolhe assinar um plano.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'
import Stripe from 'https://esm.sh/stripe@16.2.0?target=deno'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PRICE_IDS: Record<string, string> = {
  LOJA:   Deno.env.get('STRIPE_PRICE_LOJA')   ?? '',
  GESTAO: Deno.env.get('STRIPE_PRICE_GESTAO') ?? '',
  REDE:   Deno.env.get('STRIPE_PRICE_REDE')   ?? '',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' })
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
    const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appUrl       = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

    // Autentica o usuário
    const authHeader = req.headers.get('authorization') ?? ''
    const supa  = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: { user } } = await supa.auth.getUser()
    if (!user) return json({ error: 'não autenticado' }, 401)

    const { plan } = await req.json()
    if (!plan || !PRICE_IDS[plan]) return json({ error: 'plano inválido' }, 400)

    const priceId = PRICE_IDS[plan]

    // Busca ou cria o stripe_customer_id desta empresa
    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_customer_id, company_id')
      .eq('company_id', (await supa.rpc('get_my_subscription').then(r => r.data?.[0]?.company_id)) ?? '')
      .maybeSingle()

    const { data: profile } = await supa
      .from('profiles')
      .select('company_id, email, nome')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.company_id) return json({ error: 'empresa não configurada' }, 400)

    let customerId = sub?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile.nome ?? undefined,
        metadata: { company_id: profile.company_id },
      })
      customerId = customer.id
      // Persiste o customer_id na subscription
      await admin
        .from('subscriptions')
        .upsert({ company_id: profile.company_id, stripe_customer_id: customerId, plan, status: 'trialing' })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/adm/conta?success=1`,
      cancel_url:  `${appUrl}/adm/conta?canceled=1`,
      subscription_data: {
        metadata: { company_id: profile.company_id, plan },
      },
      allow_promotion_codes: true,
      locale: 'pt-BR',
    })

    return json({ url: session.url })
  } catch (err: any) {
    console.error('stripe-checkout error:', err)
    return json({ error: err.message ?? 'erro interno' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
