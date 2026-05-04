// Edge Function: email-trial-reminder
// Chamada diariamente pelo pg_cron (via supabase/39_cron_emails.sql).
// Envia avisos de trial expirando para quem está no dia 10 ou dia 13.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

serve(async (req) => {
  // Aceita POST sem auth (chamado internamente pelo cron via service_role)
  const cronSecret = Deno.env.get('CRON_SECRET')
  const authHeader = req.headers.get('authorization') ?? ''
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('unauthorized', { status: 401 })
  }

  try {
    const resendKey   = Deno.env.get('RESEND_API_KEY')!
    const fromEmail   = Deno.env.get('EMAIL_FROM') ?? 'Tottys <noreply@tottys.com.br>'
    const appUrl      = Deno.env.get('APP_URL') ?? 'https://app.tottys.com.br'
    const admin       = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const now = new Date()

    // Busca trials que expiram em exatamente 4 dias (dia 10) ou 1 dia (dia 13)
    const targets = [4, 1] // dias restantes que disparam o e-mail
    const results: { email: string; days: number; sent: boolean }[] = []

    for (const daysLeft of targets) {
      const targetDate = new Date(now)
      targetDate.setDate(targetDate.getDate() + daysLeft)
      const dateStr = targetDate.toISOString().slice(0, 10) // YYYY-MM-DD

      // Assinaturas em trial com vencimento na data alvo
      const { data: subs } = await admin
        .from('subscriptions')
        .select('company_id, trial_ends_at')
        .eq('status', 'trialing')
        .gte('trial_ends_at', `${dateStr}T00:00:00Z`)
        .lt('trial_ends_at',  `${dateStr}T23:59:59Z`)

      if (!subs?.length) continue

      for (const sub of subs) {
        // Busca o OWNER da empresa
        const { data: profile } = await admin
          .from('profiles')
          .select('nome, email')
          .eq('company_id', sub.company_id)
          .eq('role', 'OWNER')
          .maybeSingle()

        const email = profile?.email
        const nome  = profile?.nome ?? 'Lojista'
        if (!email) continue

        const isLastDay = daysLeft === 1
        const subject = isLastDay
          ? `⏰ Último dia do seu trial no Tottys`
          : `Seu trial no Tottys termina em ${daysLeft} dias`

        const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;overflow:hidden;">
        <tr><td style="background:#0F172A;padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#FFFFFF;">Tottys</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0F172A;">
            ${isLastDay ? '⏰ Último dia, ' : '⚡ '}${nome}${isLastDay ? '!' : `, seu trial termina em ${daysLeft} dias.`}
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
            ${isLastDay
              ? 'Seu período de teste gratuito encerra hoje. Para continuar com acesso completo ao PDV, estoque e crediário, assine um plano agora.'
              : `Restam apenas <strong>${daysLeft} dias</strong> do seu teste gratuito. Não perca o acesso — assine antes que o trial expire.`
            }
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
            <tr style="background:#F8FAFC;">
              <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#475569;">Plano Gestão</td>
              <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#0F172A;text-align:right;">R$ 249/mês</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:12px 16px;font-size:13px;color:#64748B;border-top:1px solid #E2E8F0;">
                PDV · Crediário · Cashback · Financeiro · Insights · Multi-usuário
              </td>
            </tr>
          </table>
          <a href="${appUrl}/adm/conta"
             style="display:inline-block;background:${isLastDay ? '#DC2626' : '#0F172A'};color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:12px;font-size:14px;font-weight:600;">
            ${isLastDay ? 'Assinar agora para não perder acesso' : 'Ver planos e assinar →'}
          </a>
          <p style="margin:20px 0 0;font-size:13px;color:#94A3B8;">
            Sem cartão durante o trial — você só paga se escolher continuar.
          </p>
        </td></tr>
        <tr><td style="background:#F8FAFC;padding:20px 32px;border-top:1px solid #E2E8F0;">
          <p style="margin:0;font-size:11px;color:#94A3B8;text-align:center;">
            © ${new Date().getFullYear()} Tottys · <a href="${appUrl}/adm/conta" style="color:#94A3B8;">Gerenciar assinatura</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: fromEmail, to: [email], subject, html }),
        })

        results.push({ email, days: daysLeft, sent: res.ok })
        if (!res.ok) console.error('resend error for', email, await res.text())
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('email-trial-reminder error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
