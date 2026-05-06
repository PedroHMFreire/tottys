// Edge Function: fn-paulo
// Paulo — Gerente Geral de Vendas com IA
// Recebe mensagem do usuário, busca contexto real da loja, chama Claude e retorna resposta.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'
import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3'

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

// ── Formata o contexto JSON em texto legível para o prompt ──
function formatContext(ctx: Record<string, any>): string {
  const brl = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

  const vendHoje = ctx.vendas_hoje || {}
  const vendMes  = ctx.vendas_mes  || {}
  const vendAnt  = ctx.vendas_mes_anterior || {}

  const varPct = vendAnt.faturamento > 0
    ? ((vendMes.faturamento - vendAnt.faturamento) / vendAnt.faturamento * 100).toFixed(1)
    : null

  const ranking = (ctx.ranking || []) as any[]
  const metas   = (ctx.metas_ativas || []) as any[]
  const corr    = (ctx.corridinhas_ativas || []) as any[]
  const segs    = ctx.clientes_segmentos || {}

  let lines: string[] = []

  lines.push(`📅 ${ctx.dia_semana}, ${ctx.data_hoje} | ${ctx.hora_atual} | ${ctx.dias_restantes_mes} dias até o fim do mês`)
  lines.push('')

  lines.push('VENDAS HOJE:')
  lines.push(`  Faturamento: ${brl(vendHoje.faturamento)} | ${vendHoje.cupons || 0} vendas | Ticket médio: ${brl(vendHoje.ticket_medio)}`)
  lines.push('')

  lines.push('VENDAS NO MÊS:')
  lines.push(`  Faturamento: ${brl(vendMes.faturamento)} | ${vendMes.cupons || 0} vendas | Ticket médio: ${brl(vendMes.ticket_medio)}`)
  if (varPct !== null) {
    const sinal = Number(varPct) >= 0 ? '+' : ''
    lines.push(`  Comparado ao mês anterior (${brl(vendAnt.faturamento)}): ${sinal}${varPct}%`)
  }
  lines.push('')

  if (metas.length > 0) {
    lines.push('METAS ATIVAS:')
    for (const m of metas) {
      const falta = Math.max(0, m.valor_meta - m.realizado)
      const emoji = m.pct >= 100 ? '✅' : m.pct >= 70 ? '🟡' : '🔴'
      lines.push(`  ${emoji} ${m.descricao} (${m.periodo}): ${brl(m.realizado)} / ${brl(m.valor_meta)} — ${m.pct}% | Faltam ${brl(falta)} | Até ${m.fim}`)
    }
    lines.push('')
  }

  if (ranking.length > 0) {
    lines.push('RANKING DO MÊS:')
    for (const r of ranking) {
      const medal = r.posicao === 1 ? '🥇' : r.posicao === 2 ? '🥈' : r.posicao === 3 ? '🥉' : `${r.posicao}º`
      const com = r.comissao > 0 ? ` | Comissão: ${brl(r.comissao)}` : ''
      lines.push(`  ${medal} ${r.nome}: ${brl(r.faturamento)} (${r.cupons} vendas, ticket ${brl(r.ticket_medio)})${com}`)
    }
    lines.push('')
  }

  if (corr.length > 0) {
    lines.push('CORRIDINHAS ATIVAS:')
    for (const c of corr) {
      lines.push(`  • ${c.nome} (${c.tipo}) — Meta: ${brl(c.valor_meta)} | Até: ${c.fim}`)
    }
    lines.push('')
  }

  const totalClientes = Object.values(segs).reduce((a: number, v: any) => a + Number(v), 0)
  lines.push('CLIENTES:')
  lines.push(`  Total: ${totalClientes} | Campeões: ${segs.CAMPIAO || 0} | Fiéis: ${segs.FIEL || 0} | Em risco: ${ctx.clientes_em_risco || 0} | Inativos: ${ctx.clientes_inativos || 0}`)
  if ((ctx.aniversariantes_hoje || 0) > 0) {
    lines.push(`  ⚠️  ${ctx.aniversariantes_hoje} aniversariante(s) hoje — entre em contato!`)
  }

  return lines.join('\n')
}

// ── System prompt do Paulo ───────────────────────────────────
function buildSystemPrompt(ctx: Record<string, any>, companyNome: string): string {
  return `Você é o Paulo, gerente geral de vendas da ${companyNome}.

QUEM VOCÊ É:
- 20 anos de experiência em varejo de moda brasileiro
- Direto e objetivo — sem enrolação, sem papo filosófico
- Motivador quando o time merece, exigente quando a situação pede
- Usa os dados reais para embasar cada análise, nunca inventa números
- Fala como gente, não como sistema. Usa "R$", não "reais". Usa "vendas" não "transações"
- Tem humor seco e honesto — celebra conquistas, cobra resultados sem drama

COMO VOCÊ RESPONDE:
- Respostas curtas por padrão (3-6 linhas). Relatório completo só quando pedido
- Sempre termina com UMA recomendação concreta quando há problema
- Se não tiver dado suficiente, diz claramente. Nunca fabrica informação
- Usa emojis com moderação — só quando reforça o ponto (✅🔴🥇 etc.)
- Quando a meta estiver em risco, diz sem rodeios e propõe ação

DADOS ATUAIS DA LOJA (tempo real):
${formatContext(ctx)}

Responda sempre em português brasileiro.`
}

// ── Handler principal ────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autorizado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'Sessão inválida' }, 401)

    const body = await req.json() as {
      conversation_id?: string
      message: string
      store_id: string
      company_id: string
      company_nome: string
    }

    const { message, store_id, company_id, company_nome } = body
    if (!message?.trim() || !store_id || !company_id) {
      return json({ error: 'Parâmetros incompletos' }, 400)
    }

    // 1. Busca ou cria conversa
    let conversationId = body.conversation_id
    if (!conversationId) {
      const { data: conv } = await supabase
        .from('paulo_conversations')
        .insert({ company_id, store_id, user_id: user.id })
        .select('id')
        .single()
      conversationId = conv?.id
    }
    if (!conversationId) return json({ error: 'Erro ao criar conversa' }, 500)

    // 2. Busca histórico (últimas 20 mensagens)
    const { data: history } = await supabase
      .from('paulo_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: true })
      .limit(20)

    // 3. Salva mensagem do usuário
    await supabase.from('paulo_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: message.trim(),
    })

    // 4. Busca contexto real da loja
    const { data: ctx } = await supabase.rpc('get_paulo_context', { p_store_id: store_id })

    // 5. Chama Claude
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const messages: Anthropic.MessageParam[] = [
      ...((history || []) as Array<{ role: string; content: string }>).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message.trim() },
    ]

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     buildSystemPrompt(ctx || {}, company_nome),
      messages,
    })

    const assistantText = response.content[0].type === 'text'
      ? response.content[0].text
      : 'Não consegui processar sua pergunta agora.'

    // 6. Salva resposta do Paulo
    await supabase.from('paulo_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: assistantText,
    })

    return json({ conversation_id: conversationId, message: assistantText })

  } catch (err) {
    console.error('fn-paulo error:', err)
    return json({ error: 'Erro interno do Paulo' }, 500)
  }
})
