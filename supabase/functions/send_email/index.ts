// supabase/functions/send_email/index.ts
// Edge Function (Deno) — sends transactional emails
// Uses company SMTP config (Gmail) when available, falls back to Resend

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'
import { SmtpClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type EmailType = 'receipt' | 'nps_request' | 'cashback_update' | 'birthday'

interface BasePayload {
  type: EmailType
  to: string
  data: Record<string, unknown>
}

// ── HTML builders ─────────────────────────────────────────────────────────────

function fmtBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function wrapper(title: string, body: string, companyNome = 'Loja'): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="background:#1E40AF;border-radius:16px 16px 0 0;padding:24px 32px;">
        <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">${companyNome}</p>
      </td></tr>
      <tr><td style="background:#ffffff;padding:28px 32px;border-radius:0 0 16px 16px;">
        ${body}
      </td></tr>
      <tr><td style="padding:16px 0;text-align:center;">
        <p style="margin:0;font-size:11px;color:#94A3B8;">Este email foi enviado automaticamente. Não responda.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

function buildReceiptEmail(data: Record<string, unknown>): { subject: string; html: string } {
  const companyNome = String(data.company_nome ?? 'Loja')
  const saleId = String(data.sale_id ?? '').slice(0, 8).toUpperCase()
  const total = Number(data.total ?? 0)
  const subtotal = Number(data.subtotal ?? 0)
  const desconto = Number(data.desconto ?? 0)
  const items = (data.items as Array<{ nome: string; qtde: number; preco_unit: number }>) ?? []
  const payments = (data.payments as Array<{ meio: string; valor: number }>) ?? []
  const customerNome = String(data.customer_nome ?? 'Cliente')
  const npsUrl = String(data.nps_url ?? '')
  const createdAt = data.created_at ? new Date(String(data.created_at)).toLocaleString('pt-BR') : ''

  const itemsHtml = items.map(it => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#334155;">${it.nome}</td>
      <td style="padding:6px 0;font-size:13px;color:#334155;text-align:center;">${it.qtde}x</td>
      <td style="padding:6px 0;font-size:13px;color:#334155;text-align:right;">${fmtBRL(it.qtde * it.preco_unit)}</td>
    </tr>`).join('')

  const paymentsHtml = payments.map(p => `
    <tr>
      <td style="font-size:12px;color:#64748B;padding:3px 0;">${p.meio}</td>
      <td style="font-size:12px;color:#64748B;text-align:right;padding:3px 0;">${fmtBRL(p.valor)}</td>
    </tr>`).join('')

  const npsSection = npsUrl ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;background:#F8FAFC;border-radius:12px;padding:20px;">
      <tr><td style="text-align:center;">
        <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1E1B4B;">Como foi sua experiência?</p>
        <p style="margin:0 0 16px;font-size:12px;color:#64748B;">Responda em 1 minuto. Sua opinião é muito importante!</p>
        <a href="${npsUrl}" style="display:inline-block;background:#1E40AF;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 24px;border-radius:8px;">
          Avaliar compra
        </a>
      </td></tr>
    </table>` : ''

  const body = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#1E1B4B;">Obrigado pela compra, ${customerNome}!</p>
    <p style="margin:0 0 20px;font-size:12px;color:#94A3B8;">Pedido #${saleId} · ${createdAt}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E2E8F0;margin-bottom:12px;">
      <tr>
        <th style="padding:8px 0;font-size:11px;color:#64748B;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Item</th>
        <th style="padding:8px 0;font-size:11px;color:#64748B;text-align:center;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Qtd</th>
        <th style="padding:8px 0;font-size:11px;color:#64748B;text-align:right;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Total</th>
      </tr>
      ${itemsHtml}
    </table>
    ${desconto > 0 ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;"><tr><td style="font-size:12px;color:#64748B;">Subtotal</td><td style="font-size:12px;color:#64748B;text-align:right;">${fmtBRL(subtotal)}</td></tr><tr><td style="font-size:12px;color:#059669;">Desconto</td><td style="font-size:12px;color:#059669;text-align:right;">-${fmtBRL(desconto)}</td></tr></table>` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #1E40AF;padding-top:8px;margin-bottom:20px;">
      <tr>
        <td style="font-size:16px;font-weight:700;color:#1E1B4B;">Total</td>
        <td style="font-size:16px;font-weight:700;color:#1E40AF;text-align:right;">${fmtBRL(total)}</td>
      </tr>
    </table>
    <p style="margin:0 0 6px;font-size:12px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Pagamento</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${paymentsHtml}
    </table>
    ${npsSection}
  `

  return {
    subject: `Comprovante de compra — ${companyNome} #${saleId}`,
    html: wrapper(`Comprovante ${companyNome}`, body, companyNome),
  }
}

function buildNPSEmail(data: Record<string, unknown>): { subject: string; html: string } {
  const companyNome = String(data.company_nome ?? 'Loja')
  const customerNome = String(data.customer_nome ?? 'Cliente')
  const npsUrl = String(data.nps_url ?? '')
  const body = `
    <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1E1B4B;">Olá, ${customerNome}!</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">Sua opinião ajuda a melhorarmos cada vez mais. Quanto você nos recomendaria para um amigo ou familiar?</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:12px;padding:20px;margin-bottom:20px;">
      <tr><td style="text-align:center;">
        <p style="margin:0 0 16px;font-size:13px;color:#64748B;">De 0 (nada provável) a 10 (muito provável)</p>
        <a href="${npsUrl}" style="display:inline-block;background:#1E40AF;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 32px;border-radius:10px;">Responder pesquisa</a>
        <p style="margin:12px 0 0;font-size:11px;color:#94A3B8;">Leva menos de 1 minuto</p>
      </td></tr>
    </table>
  `
  return {
    subject: `Como foi sua experiência em ${companyNome}?`,
    html: wrapper(`Pesquisa ${companyNome}`, body, companyNome),
  }
}

function buildCashbackEmail(data: Record<string, unknown>): { subject: string; html: string } {
  const companyNome = String(data.company_nome ?? 'Loja')
  const customerNome = String(data.customer_nome ?? 'Cliente')
  const saldo = Number(data.saldo ?? 0)
  const ganho = Number(data.ganho ?? 0)
  const body = `
    <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1E1B4B;">Você ganhou cashback, ${customerNome}!</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3FF;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;">
      <tr><td>
        <p style="margin:0 0 4px;font-size:12px;color:#7C3AED;font-weight:600;text-transform:uppercase;">Ganho nesta compra</p>
        <p style="margin:0 0 16px;font-size:28px;font-weight:700;color:#7C3AED;">${fmtBRL(ganho)}</p>
        <p style="margin:0 0 4px;font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;">Saldo total disponível</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:#1E1B4B;">${fmtBRL(saldo)}</p>
      </td></tr>
    </table>
  `
  return {
    subject: `Você ganhou ${fmtBRL(ganho)} de cashback em ${companyNome}!`,
    html: wrapper(`Cashback ${companyNome}`, body, companyNome),
  }
}

// ── Send via SMTP (Gmail) ─────────────────────────────────────────────────────

async function sendViaSmtp(opts: {
  host: string; port: number
  user: string; pass: string
  fromName: string; to: string
  subject: string; html: string
}): Promise<void> {
  const client = new SmtpClient({ debug: false })
  await client.connectTLS({ hostname: opts.host, port: opts.port, username: opts.user, password: opts.pass })
  await client.send({
    from: `${opts.fromName} <${opts.user}>`,
    to: opts.to,
    subject: opts.subject,
    content: 'auto',
    html: opts.html,
  })
  await client.close()
}

// ── Send via Resend (fallback) ────────────────────────────────────────────────

async function sendViaResend(opts: {
  apiKey: string; from: string; to: string; subject: string; html: string
}): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: opts.from, to: [opts.to], subject: opts.subject, html: opts.html }),
  })
  if (!res.ok) {
    const j = await res.json()
    throw new Error(j.message ?? JSON.stringify(j))
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const db = createClient(supabaseUrl, serviceKey)

    // Auth
    const authHeader = req.headers.get('authorization') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'não autenticado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: BasePayload = await req.json()
    const { type, to, data } = body

    if (!to || !type) {
      return new Response(JSON.stringify({ error: 'to e type são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build content
    let subject = '', html = ''
    if (type === 'receipt')         ({ subject, html } = buildReceiptEmail(data))
    else if (type === 'nps_request') ({ subject, html } = buildNPSEmail(data))
    else if (type === 'cashback_update') ({ subject, html } = buildCashbackEmail(data))
    else return new Response(JSON.stringify({ error: `tipo desconhecido: ${type}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

    // Fetch company email config
    let usedSmtp = false
    if (data.company_id) {
      const { data: comp } = await db
        .from('companies')
        .select('email_remetente, email_nome, email_senha_app, email_smtp_host, email_smtp_port')
        .eq('id', data.company_id)
        .maybeSingle()

      if (comp?.email_remetente && comp?.email_senha_app) {
        await sendViaSmtp({
          host: comp.email_smtp_host || 'smtp.gmail.com',
          port: comp.email_smtp_port || 587,
          user: comp.email_remetente,
          pass: comp.email_senha_app,
          fromName: comp.email_nome || String(data.company_nome ?? 'Loja'),
          to, subject, html,
        })
        usedSmtp = true
      }
    }

    // Fallback: Resend
    if (!usedSmtp) {
      const resendKey = Deno.env.get('RESEND_API_KEY')
      if (!resendKey) {
        return new Response(JSON.stringify({ error: 'Email não configurado para esta empresa.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const fromAddress = String(data.from_email ?? Deno.env.get('FROM_EMAIL') ?? 'onboarding@resend.dev')
      const fromName = String(data.company_nome ?? 'Loja')
      await sendViaResend({ apiKey: resendKey, from: `${fromName} <${fromAddress}>`, to, subject, html })
    }

    // Log silencioso
    if (data.company_id) {
      db.from('email_log').insert({
        company_id: data.company_id,
        sale_id: data.sale_id ?? null,
        customer_id: data.customer_id ?? null,
        tipo: type,
        destinatario: to,
        status: 'enviado',
        enviado_at: new Date().toISOString(),
      }).then(() => {}).catch(() => {})
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
