// src/pages/NPSDashboard.tsx — NPS admin dashboard
import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { MessageSquare, TrendingUp, Users, Loader2 } from 'lucide-react'

interface NPSEntry {
  id: string
  nota: number | null
  comentario: string | null
  respondido_at: string | null
  sale_id: string | null
  customer_id: string | null
  customers: { nome: string } | null
}

function scoreCategory(n: number): 'promotor' | 'neutro' | 'detrator' {
  if (n >= 9) return 'promotor'
  if (n >= 7) return 'neutro'
  return 'detrator'
}

function calcNPS(entries: NPSEntry[]): number {
  const answered = entries.filter(e => e.nota !== null)
  if (!answered.length) return 0
  const promoters = answered.filter(e => e.nota! >= 9).length
  const detractors = answered.filter(e => e.nota! <= 6).length
  return Math.round(((promoters - detractors) / answered.length) * 100)
}

export default function NPSDashboard() {
  const { company } = useApp()
  const [entries, setEntries] = useState<NPSEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d')

  useEffect(() => {
    if (!company?.id) return
    load()
  }, [company?.id, period])

  async function load() {
    if (!company?.id) return
    setLoading(true)
    try {
      let query = supabase
        .from('nps_responses')
        .select('id, nota, comentario, respondido_at, sale_id, customer_id, customers(nome)')
        .eq('company_id', company.id)
        .not('nota', 'is', null)
        .order('respondido_at', { ascending: false })
        .limit(200)

      if (period !== 'all') {
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
        const since = new Date(Date.now() - days * 86400000).toISOString()
        query = query.gte('respondido_at', since)
      }

      const { data } = await query
      setEntries((data || []) as unknown as NPSEntry[])
    } finally {
      setLoading(false)
    }
  }

  const answered = entries.filter(e => e.nota !== null)
  const nps = calcNPS(entries)
  const promoters = answered.filter(e => e.nota! >= 9).length
  const neutrals = answered.filter(e => e.nota! >= 7 && e.nota! <= 8).length
  const detractors = answered.filter(e => e.nota! <= 6).length
  const withComment = answered.filter(e => e.comentario).length

  const dist = Array.from({ length: 11 }, (_, i) => ({
    score: i,
    count: answered.filter(e => e.nota === i).length,
  }))
  const maxCount = Math.max(...dist.map(d => d.count), 1)

  const npsColor = nps >= 50 ? 'text-emerald-600' : nps >= 0 ? 'text-amber-600' : 'text-rose-600'
  const npsBg = nps >= 50 ? 'bg-emerald-50' : nps >= 0 ? 'bg-amber-50' : 'bg-rose-50'

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[#1E1B4B]">NPS — Satisfação</h1>
          <p className="text-xs text-slate-400 mt-0.5">Net Promoter Score das avaliações recebidas</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['7d', '30d', '90d', 'all'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${period === p ? 'bg-white shadow text-[#1E1B4B]' : 'text-slate-500 hover:text-slate-700'}`}
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
      ) : answered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <MessageSquare size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">Nenhuma avaliação recebida neste período.</p>
          <p className="text-xs text-slate-400 mt-1">As avaliações aparecem aqui conforme os clientes respondem.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={`rounded-2xl border p-4 text-center ${npsBg}`}>
              <p className={`text-3xl font-bold ${npsColor}`}>{nps}</p>
              <p className="text-xs text-slate-500 mt-1 font-medium">NPS Score</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{answered.length}</p>
              <p className="text-xs text-slate-400 mt-1">Respostas</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{promoters}</p>
              <p className="text-xs text-slate-400 mt-1">Promotores</p>
              <p className="text-xs text-emerald-500">{answered.length ? Math.round((promoters / answered.length) * 100) : 0}%</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-rose-500">{detractors}</p>
              <p className="text-xs text-slate-400 mt-1">Detratores</p>
              <p className="text-xs text-rose-400">{answered.length ? Math.round((detractors / answered.length) * 100) : 0}%</p>
            </div>
          </div>

          {/* Distribution bar + Comments — lado a lado no desktop */}
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

          {/* Comments */}
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
                    const cat = scoreCategory(e.nota!)
                    const badgeClass = cat === 'promotor'
                      ? 'bg-emerald-50 text-emerald-700'
                      : cat === 'neutro'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-rose-50 text-rose-700'
                    return (
                      <div key={e.id} className="rounded-xl border border-slate-100 p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-slate-500">
                            {e.customers?.nome ?? 'Anônimo'}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
                              Nota {e.nota}
                            </span>
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
        </>
      )}
    </div>
  )
}
