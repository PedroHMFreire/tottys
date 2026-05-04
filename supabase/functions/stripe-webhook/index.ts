// Edge Function: stripe-webhook
// Recebe eventos do Stripe e atualiza a tabela subscriptions.
// URL configurada no Stripe Dashboard → Webhooks.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'
import Stripe from 'https://esm.sh/stripe@16.2.0?target=deno'

const RESEND_KEY  = Deno.env.get('RESEND_API_KEY') ?? ''
const EMAIL_FROM  = Deno.env.get('EMAIL_FROM') ?? 'Tottys <noreply@tottys.com.br>'
const APP_URL     = Deno.env.get('APP_URL') ?? 'https://app.tottys.com.br'

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
  })
}

async function getOwnerEmail(admin: ReturnType<typeof createClient>, companyId: string) {
  const { data } = await admin
    .from('profiles')
    .select('nome, email')
    .eq('company_id', companyId)
    .eq('role', 'OWNER')
    .maybeSingle()
  return data
}

serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' })
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('missing signature', { status: 400 })

  let event: Stripe.Event
  try {
    const body = await req.text()
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err: any) {
    console.error('webhook signature failed:', err.message)
    return new Response(`webhook error: ${err.message}`, { status: 400 })
  }

  console.log('stripe event:', event.type)

  try {
    switch (event.type) {

      // Checkout concluído → assinatura criada com sucesso
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break
        const companyId = session.subscription_data?.metadata?.company_id
                       ?? (session.metadata as any)?.company_id
        const plan      = session.subscription_data?.metadata?.plan ?? 'GESTAO'
        if (!companyId) { console.warn('company_id ausente no checkout'); break }

        const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string)
        await admin.from('subscriptions').upsert({
          company_id:             companyId,
          stripe_customer_id:     session.customer as string,
          stripe_subscription_id: stripeSub.id,
          plan,
          status:                 'active',
          trial_ends_at:          null,
          current_period_end:     new Date(stripeSub.current_period_end * 1000).toISOString(),
          updated_at:             new Date().toISOString(),
        }, { onConflict: 'company_id' })
        break
      }

      // Assinatura atualizada (mudança de plano, renovação, etc.)
      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription
        const companyId = stripeSub.metadata?.company_id
        if (!companyId) break

        const plan   = (stripeSub.metadata?.plan as string) ?? 'GESTAO'
        const status = stripeStatusToLocal(stripeSub.status)

        await admin.from('subscriptions').upsert({
          company_id:             companyId,
          stripe_customer_id:     stripeSub.customer as string,
          stripe_subscription_id: stripeSub.id,
          plan,
          status,
          current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
          updated_at:         new Date().toISOString(),
        }, { onConflict: 'company_id' })
        break
      }

      // Assinatura cancelada
      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription
        const companyId = stripeSub.metadata?.company_id
        if (!companyId) break

        await admin.from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('company_id', companyId)
        break
      }

      // Pagamento confirmado → garante status active + email de confirmação
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break
        const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription as string)
        const companyId = stripeSub.metadata?.company_id
        if (!companyId) break

        await admin.from('subscriptions')
          .update({
            status:             'active',
            current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
            updated_at:         new Date().toISOString(),
          })
          .eq('company_id', companyId)

        // E-mail de cobrança confirmada (apenas renovações, não primeira ativação)
        if ((invoice.billing_reason as string) === 'subscription_cycle') {
          const owner = await getOwnerEmail(admin, companyId)
          if (owner?.email) {
            const valor = ((invoice.amount_paid ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            await sendEmail(
              owner.email,
              `Cobrança confirmada — Tottys`,
              `<p>Olá, ${owner.nome ?? 'Lojista'}!</p>
               <p>Sua assinatura foi renovada com sucesso. Valor cobrado: <strong>${valor}</strong>.</p>
               <p>Acesse o sistema: <a href="${APP_URL}/adm">${APP_URL}/adm</a></p>`,
            )
          }
        }
        break
      }

      // Pagamento falhou → past_due + email de alerta
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break
        const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription as string)
        const companyId = stripeSub.metadata?.company_id
        if (!companyId) break

        await admin.from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('company_id', companyId)

        const owner = await getOwnerEmail(admin, companyId)
        if (owner?.email) {
          await sendEmail(
            owner.email,
            `⚠️ Pagamento não processado — Tottys`,
            `<p>Olá, ${owner.nome ?? 'Lojista'}!</p>
             <p>Não conseguimos processar o pagamento da sua assinatura Tottys.</p>
             <p>Atualize seu cartão para continuar usando o sistema sem interrupção:</p>
             <p><a href="${APP_URL}/adm/conta">Atualizar forma de pagamento →</a></p>`,
          )
        }
        break
      }
    }
  } catch (err: any) {
    console.error('webhook handler error:', err)
    return new Response('handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

function stripeStatusToLocal(s: Stripe.Subscription.Status): string {
  switch (s) {
    case 'active':   return 'active'
    case 'trialing': return 'trialing'
    case 'past_due': return 'past_due'
    case 'canceled': return 'canceled'
    case 'paused':   return 'paused'
    default:         return 'past_due'
  }
}
