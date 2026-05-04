// Edge Function: email-welcome
// Disparada pelo frontend após onboarding concluído.
// Envia e-mail de boas-vindas via Resend.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const resendKey  = Deno.env.get('RESEND_API_KEY')!
    const fromEmail  = Deno.env.get('EMAIL_FROM') ?? 'Tottys <noreply@tottys.com.br>'
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('authorization') ?? ''
    const supa = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user } } = await supa.auth.getUser()
    if (!user) return json({ error: 'não autenticado' }, 401)

    const { data: profile } = await supa
      .from('profiles')
      .select('nome, email')
      .eq('id', user.id)
      .maybeSingle()

    const nome  = profile?.nome ?? 'Lojista'
    const email = profile?.email ?? user.email
    if (!email) return json({ error: 'e-mail não encontrado' }, 400)

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:#0F172A;padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:-0.5px;">Tottys</p>
          <p style="margin:4px 0 0;font-size:12px;color:#94A3B8;letter-spacing:0.05em;text-transform:uppercase;">Sistema de gestão para varejo de moda</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0F172A;">Bem-vindo, ${nome}! 🎉</p>
          <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
            Sua conta está ativa e você tem <strong>14 dias de teste gratuito</strong> no Plano Gestão — sem precisar cadastrar cartão.
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
            O que você já pode fazer agora:
          </p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            ${[
              ['🛍️', 'Abrir o PDV e registrar suas primeiras vendas'],
              ['📦', 'Cadastrar produtos com grade de cor e tamanho'],
              ['👥', 'Importar clientes do seu sistema anterior (CSV)'],
              ['💳', 'Configurar crediário e cashback para fidelizar'],
            ].map(([icon, text]) => `
            <tr>
              <td style="padding:6px 12px 6px 0;font-size:18px;vertical-align:top;">${icon}</td>
              <td style="padding:6px 0;font-size:14px;color:#475569;line-height:1.5;">${text}</td>
            </tr>`).join('')}
          </table>
          <a href="${Deno.env.get('APP_URL') ?? 'https://app.tottys.com.br'}/adm"
             style="display:inline-block;background:#0F172A;color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:12px;font-size:14px;font-weight:600;">
            Acessar minha conta →
          </a>
          <p style="margin:24px 0 0;font-size:13px;color:#94A3B8;line-height:1.6;">
            Qualquer dúvida, responda este e-mail ou acesse o suporte dentro do sistema.<br>
            Boa gestão!
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F8FAFC;padding:20px 32px;border-top:1px solid #E2E8F0;">
          <p style="margin:0;font-size:11px;color:#94A3B8;text-align:center;">
            © ${new Date().getFullYear()} Tottys · Você recebeu este e-mail por criar uma conta.
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
      body: JSON.stringify({
        from:    fromEmail,
        to:      [email],
        subject: `Bem-vindo ao Tottys, ${nome}! Seu trial de 14 dias começa agora.`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      console.error('resend error:', err)
      return json({ error: 'falha ao enviar e-mail' }, 500)
    }

    return json({ sent: true })
  } catch (err: any) {
    console.error('email-welcome error:', err)
    return json({ error: err.message ?? 'erro interno' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
