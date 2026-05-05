// src/pages/NPSDashboard.tsx — NPS admin dashboard + cardápio de pesquisas
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { MessageSquare, Loader2, Check } from 'lucide-react'

type SurveyTemplate = 'NPS' | 'CSAT' | 'DIAGNOSTICO' | 'MOTIVO'

interface NPSEntry {
  id: string
  nota: number | null
  comentario: string | null
  respondido_at: string | null
  sale_id: string | null
  customer_id: string | null
  tipo_pesquisa: string | null
  dados: any
  customers: { nome: string } | null
}

// ── Cardápio ─────────────────────────────────────────────────
const TEMPLATES: Array<{
  id: SurveyTemplate
  emoji: string
  titulo: string
  subtitulo: string
  quando: string
  cor: string
  corBg: string
}> = [
  {
    id: 'NPS',
    emoji: '📊',
    titulo: 'NPS Clássico',
    subtitulo: 'De 0 a 10, o quanto recomendaria?',
    quando: 'Medir lealdade a longo prazo',
    cor: 'border-blue-400 text-blue-700',
    corBg: 'bg-blue-50',
  },
  {
    id: 'CSAT',
    emoji: '😊',
    titulo: 'Satisfação Pós-Venda',
    subtitulo: '5 emojis de satisfação (😞 a 🤩)',
    quando: 'Feedback rápido e intuitivo',
    cor: 'border-amber-400 text-amber-700',
    corBg: 'bg-amber-50',
  },
  {
    id: 'DIAGNOSTICO',
    emoji: '⭐',
    titulo: 'Diagnóstico da Equipe',
    subtitulo: 'Estrelas por Atendimento, Produto e Preço',
    quando: 'Avaliar dimensões específicas',
    cor: 'border-violet-400 text-violet-700',
    corBg: 'bg-violet-50',
  },
  {
    id: 'MOTIVO',
    emoji: '🎯',
    titulo: 'Motivo de Visita',
    subtitulo: 'Como nos conheceu? O que motivou a compra?',
    quando: 'Entender captação e comportamento',
    cor: 'border-emerald-400 text-emerald-700',
    corBg: 'bg-emerald-50',
  },
]

function scoreCategory(n: number): 'promotor' | 'neutro' | 'detrator' {
  if (n >= 9) return 'promotor'
  if (n >= 7) return 'neutro'
  return 'detrator'
}

function calcNPS(entries: NPSEntry[]): number {
  const answered = entries.filter(e => e.nota !== null)
  if (!answered.length) return 0
  const promoters  = answered.filter(e => e.nota! >= 9).length
  const detractors = answered.filter(e => e.nota! <= 6).length
  return Math.round(((promoters - detractors) / answered.length) * 100)
}

export default function NPSDashboard() {
  const { company } = useApp()
  const [entries, setEntries]   = useState<NPSEntry[]>([])
  const [loading, setLoading]   = useState(false)
  const [period, setPeriod]     = useState<'7d' | '30d' | '90d' | 'all'>('30d')
  const [activeTemplate, setActiveTemplate] = useState<SurveyTemplate>('NPS')
  const [savingTemplate, setSavingTemplate] = useState(false)

  useEffect(() => {
    if (!company?.id) return
    loadTemplate()
    load()
  }, [company?.id, period])

  async function loadTemplate() {
    if (!company?.id) return
    const { data } = await supabase
      .from('companies')
      .select('survey_template')
      .eq('id', company.id)
      .maybeSingle()
    if (data?.survey_template) setActiveTemplate(data.survey_template as SurveyTemplate)
  }

  async function activateTemplate(t: SurveyTemplate) {
    if (!company?.id || t === activeTemplate) return
    setSavingTemplate(true)
    await supabase.from('companies').update({ survey_template: t }).eq('id', company.id)
    setActiveTemplate(t)
    setSavingTemplate(false)
  }

  async function load() {
    if (!company?.id) return
    setLoading(true)
    try {
      let q = supabase
        .from('nps_responses')
        .select('id, nota, comentario, respondido_at, sale_id, customer_id, tipo_pesquisa, dados, customers(nome)')
        .eq('company_id', company.id)
        .not('respondido_at', 'is', null)
        .order('respondido_at', { ascending: false })
        .limit(200)

      if (period !== 'all') {
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
        const since = new Date(Date.now() - days * 86400000).toISOString()
        q = q.gte('respondido_at', since)
      }

      const { data } = await q
      setEntries((data || []) as unknown as NPSEntry[])
    } finally {
      setLoading(false)
    }
  }

  // Aggregate for scoring entries that have a nota
  const scored   = entries.filter(e => e.nota !== null)
  const nps      = calcNPS(entries)
  const promoters  = scored.filter(e => e.nota! >= 9).length
  const neutrals   = scored.filter(e => e.nota! >= 7 && e.nota! <= 8).length
  const detractors = scored.filter(e => e.nota! <= 6).length
  const withComment = scored.filter(e => e.comentario).length
  const npsColor = nps >= 50 ? 'text-emerald-600' : nps >= 0 ? 'text-amber-600' : 'text-rose-600'
  const npsBg    = nps >= 50 ? 'bg-emerald-50'    : nps >= 0 ? 'bg-amber-50'    : 'bg-rose-50'

  const dist = Array.from({ length: 11 }, (_, i) => ({
    score: i,
    count: scored.filter(e => e.nota === i).length,
  }))
  const maxCount = Math.max(...dist.map(d => d.count), 1)

  // MOTIVO aggregation
  const motivoEntries = entries.filter(e => e.tipo_pesquisa === 'MOTIVO' && e.dados)
  const origemCounts: Record<string, number> = {}
  const comprasCounts: Record<string, number> = {}
  motivoEntries.forEach(e => {
    if (e.dados.como_conheceu) origemCounts[e.dados.como_conheceu] = (origemCounts[e.dados.como_conheceu] || 0) + 1
    if (Array.isArray(e.dados.motivacao)) {
      e.dados.motivacao.forEach((m: string) => {
        comprasCounts[m] = (comprasCounts[m] || 0) + 1
      })
    }
  })
  const primeiraVez = motivoEntries.filter(e => e.dados.primeira_vez === true).length

  // DIAGNOSTICO aggregation
  const diagEntries = entries.filter(e => e.tipo_pesquisa === 'DIAGNOSTICO' && e.dados)
  function avgDim(key: string) {
    const vals = diagEntries.map(e => e.dados[key]).filter(Boolean)
    return vals.length ? (vals.reduce((a: number, v: number) => a + v, 0) / vals.length).toFixed(1) : '—'
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">

      {/* ── Cardápio de Pesquisas ──────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-navy">Tipo de pesquisa ativa</h2>
            <p className="text-xs text-slate-400">Escolha qual pesquisa será enviada aos clientes após a venda</p>
          </div>
          {savingTemplate && <Loader2 size={14} className="animate-spin text-slate-400" />}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TEMPLATES.map(t => {
            const isActive = activeTemplate === t.id
            return (
              <button
                key={t.id}
                onClick={() => activateTemplate(t.id)}
                className={`relative text-left rounded-2xl border-2 p-4 transition-all cursor-pointer ${
                  isActive ? `${t.cor} ${t.corBg} shadow-sm` : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {isActive && (
                  <div className={`absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center ${t.corBg} border ${t.cor}`}>
                    <Check size={11} strokeWidth={3} />
                  </div>
                )}
                <div className="text-2xl mb-2">{t.emoji}</div>
                <div className="font-semibold text-sm text-slate-800 mb-0.5">{t.titulo}</div>
                <div className="text-xs text-slate-500 mb-2">{t.subtitulo}</div>
                <div className="text-xs text-slate-400 italic">Ideal: {t.quando}</div>
                {isActive && (
                  <div className={`mt-2 text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${t.corBg} ${t.cor} border ${t.cor}`}>
                    Ativa
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Header com período ────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-navy">Resultados</h1>
          <p className="text-xs text-slate-400 mt-0.5">Respostas recebidas dos clientes</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['7d', '30d', '90d', 'all'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${period === p ? 'bg-white shadow text-navy' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {p === 'all' ? 'Tudo' : p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      ) : !company?.id ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-4 text-sm">
          Selecione uma empresa para ver os resultados.
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <MessageSquare size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">Nenhuma avaliação recebida neste período.</p>
          <p className="text-xs text-slate-400 mt-1">As avaliações aparecem aqui conforme os clientes respondem.</p>
        </div>
      ) : (
        <>
          {/* ── KPIs para pesquisas com nota ─────────────── */}
          {scored.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={`rounded-2xl border p-4 text-center ${npsBg}`}>
                <p className={`text-3xl font-bold ${npsColor}`}>{nps}</p>
                <p className="text-xs text-slate-500 mt-1 font-medium">Score</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-slate-800">{scored.length}</p>
                <p className="text-xs text-slate-400 mt-1">Respostas</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{promoters}</p>
                <p className="text-xs text-slate-400 mt-1">Promotores</p>
                <p className="text-xs text-emerald-500">{scored.length ? Math.round((promoters / scored.length) * 100) : 0}%</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-rose-500">{detractors}</p>
                <p className="text-xs text-slate-400 mt-1">Detratores</p>
                <p className="text-xs text-rose-400">{scored.length ? Math.round((detractors / scored.length) * 100) : 0}%</p>
              </div>
            </div>
          )}

          {/* ── Motivo: insights ─────────────────────────── */}
          {motivoEntries.length > 0 && (
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Como nos conheceu</p>
                <div className="space-y-2">
                  {Object.entries(origemCounts).sort((a,b) => b[1]-a[1]).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{k}</span>
                      <span className="font-semibold text-slate-800">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Motivação de compra</p>
                <div className="space-y-2">
                  {Object.entries(comprasCounts).sort((a,b) => b[1]-a[1]).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{k}</span>
                      <span className="font-semibold text-slate-800">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col items-center justify-center text-center gap-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">1ª compra</p>
                <p className="text-3xl font-bold text-emerald-600">
                  {motivoEntries.length ? Math.round((primeiraVez / motivoEntries.length) * 100) : 0}%
                </p>
                <p className="text-xs text-slate-400">dos clientes são novos</p>
              </div>
            </div>
          )}

          {/* ── Diagnóstico: médias por dimensão ─────────── */}
          {diagEntries.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Diagnóstico da equipe</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { key: 'atendimento', label: '👋 Atendimento' },
                  { key: 'produto',     label: '👗 Produto' },
                  { key: 'preco',       label: '💰 Preço×Qualidade' },
                ].map(d => (
                  <div key={d.key}>
                    <p className="text-2xl font-bold text-slate-800">{avgDim(d.key)}</p>
                    <p className="text-xs text-slate-400 mt-1">{d.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Distribuição (NPS/CSAT/DIAGNOSTICO) ──────── */}
          {scored.length > 0 && (
            <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-6 lg:space-y-0">
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Distribuição de notas</p>
                <div className="flex items-end gap-1 h-20">
                  {dist.map(({ score, count }) => {
                    const h = count === 0 ? 4 : Math.max(8, (count / maxCount) * 80)
                    const cat = scoreCategory(score)
                    const color = cat === 'promotor' ? 'bg-emerald-400' : cat === 'neutro' ? 'bg-amber-400' : 'bg-rose-400'
                    return (
                      <div key={score} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-slate-400">{count || ''}</span>
                        <div
                          className={`w-full rounded-t-md ${color} transition-all`}
                          style={{ height: `${h}px` }}
                          title={`Nota ${score}: ${count} resposta(s)`}
                        />
                        <span className="text-xs text-slate-400">{score}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between text-xs mt-3">
                  <span className="text-rose-400 font-medium">Detratores (0–6)</span>
                  <span className="text-amber-400 font-medium">Neutros (7–8)</span>
                  <span className="text-emerald-400 font-medium">Promotores (9–10)</span>
                </div>
              </div>

              {/* Comentários */}
              {withComment > 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Comentários recentes ({withComment})
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {entries
                      .filter(e => e.comentario)
                      .slice(0, 20)
                      .map(e => {
                        const cat = e.nota !== null ? scoreCategory(e.nota!) : 'neutro'
                        const badgeClass = cat === 'promotor' ? 'bg-emerald-50 text-emerald-700' : cat === 'neutro' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                        return (
                          <div key={e.id} className="rounded-xl border border-slate-100 p-3 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs text-slate-500">{e.customers?.nome ?? 'Anônimo'}</div>
                              <div className="flex items-center gap-1.5">
                                {e.nota !== null && (
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
                                    Nota {e.nota}
                                  </span>
                                )}
                                {e.respondido_at && (
                                  <span className="text-xs text-slate-300">
                                    {new Date(e.respondido_at).toLocaleDateString('pt-BR')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed">{e.comentario}</p>
                          </div>
                        )
                      })}
                  </div>
                </div>
              ) : <div />}
            </div>
          )}
        </>
      )}
    </div>
  )
}
