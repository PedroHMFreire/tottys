// Página de performance do vendedor no PDV (/loja/performance)
// Mostra KPIs, progresso de metas, corridinhas ativas e ranking da equipe.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import TabBar from '@/ui/TabBar'
import { isUUID } from '@/lib/utils'
import CelebracaoModal, { type CelebracaoData } from '@/components/metas/CelebracaoModal'
import {
  Trophy, Target, TrendingUp, Clock,
  UserCheck, RefreshCw,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────
type MetaRow = {
  meta_id: string; tipo: string; periodo: string
  inicio: string; fim: string; valor_meta: number
  bonus_valor: number; descricao: string | null
  realizado: number; pct: number
}
type CorrRow = {
  corridinha_id: string; nome: string; tipo: string; tipo_meta: string
  valor_meta: number; bonus_valor: number; premio_descricao: string | null
  inicio: string; fim: string; realizado: number; pct: number; concluido: boolean
}
type RankRow = {
  user_id: string; nome: string; faturamento: number; cupons: number; posicao: number
}

// ── Helpers ──────────────────────────────────────────────────
function fmtNum(n: number, tipo: string) {
  if (tipo === 'FINANCEIRA' || tipo === 'MIX') return formatBRL(n)
  return n.toLocaleString('pt-BR')
}

function tipoLabel(tipo: string) {
  const map: Record<string, string> = {
    FINANCEIRA: 'Faturamento', VOLUME: 'Peças vendidas',
    CONVERSAO: 'Cupons', MIX: 'Mix de produtos', ATENDIMENTO: 'Atendimentos',
  }
  return map[tipo] ?? tipo
}

function periodoLabel(p: string) {
  const map: Record<string, string> = {
    DIARIA: 'Hoje', SEMANAL: 'Esta semana', QUINZENAL: 'Esta quinzena', MENSAL: 'Este mês',
  }
  return map[p] ?? p
}

function countdown(fim: string) {
  const diff = new Date(fim).getTime() - Date.now()
  if (diff <= 0) return 'Encerrada'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  return `${h}h ${m}m`
}

function medalBg(pos: number) {
  if (pos === 1) return 'bg-amber-100 text-amber-600 border-amber-300'
  if (pos === 2) return 'bg-slate-100 text-slate-500 border-slate-300'
  if (pos === 3) return 'bg-orange-100 text-orange-500 border-orange-300'
  return 'bg-white text-slate-400 border-slate-200'
}

// ── Progress bar ─────────────────────────────────────────────
function ProgressBar({ pct, color = 'bg-emerald-500' }: { pct: number; color?: string }) {
  return (
    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────
export default function Performance() {
  const { user, store } = useApp()
  const [metas, setMetas]           = useState<MetaRow[]>([])
  const [corridinhas, setCorr]      = useState<CorrRow[]>([])
  const [ranking, setRanking]       = useState<RankRow[]>([])
  const [vendasHoje, setVendasHoje] = useState(0)
  const [atendHoje, setAtendHoje]   = useState(0)
  const [loading, setLoading]       = useState(true)
  const [celebracao, setCelebracao] = useState<CelebracaoData | null>(null)

  // Track which corridinhas already triggered celebration (avoid repeat)
  const celebratedRef = useRef<Set<string>>(new Set())

  async function registrarAtendimento() {
    if (!user?.id || !store?.id || !isUUID(store.id)) return
    const { data: comp } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).single()
    if (!comp?.company_id) return
    await supabase.from('atendimentos').insert({
      company_id: comp.company_id,
      store_id:   store.id,
      user_id:    user.id,
    })
    setAtendHoje(n => n + 1)
  }

  async function load() {
    if (!user?.id || !store?.id || !isUUID(store.id)) {
      setLoading(false); return
    }
    setLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const end   = new Date(); end.setHours(23, 59, 59, 999)

      // Resolve vendedor_id vinculado ao usuário logado (pode não existir)
      const { data: vendRow } = await supabase
        .from('vendedores')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      const vendedorId = vendRow?.id ?? null

      // Filtro de vendas: crédito por user_id OU por vendedor_id atribuído
      const vendasFilter = vendedorId
        ? `user_id.eq.${user.id},vendedor_id.eq.${vendedorId}`
        : `user_id.eq.${user.id}`

      const [metasRes, corrRes, rankRes, vendasRes, atendRes] = await Promise.all([
        supabase.rpc('get_metas_progresso', {
          p_user_id: user.id, p_store_id: store.id, p_data: today,
        }),
        supabase.rpc('get_corridinhas_progresso', {
          p_user_id: user.id, p_store_id: store.id,
        }),
        supabase.rpc('get_ranking_vendedores', { p_store_id: store.id }),
        supabase.from('sales')
          .select('total')
          .eq('store_id', store.id)
          .eq('status', 'PAGA')
          .or(vendasFilter)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString()),
        supabase.from('atendimentos')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', store.id)
          .eq('user_id', user.id)
          .gte('registrado_at', start.toISOString())
          .lte('registrado_at', end.toISOString()),
      ])

      const metasList  = (metasRes.data  as MetaRow[] | null) ?? []
      const corrList   = (corrRes.data   as CorrRow[] | null) ?? []
      const rankList   = (rankRes.data   as RankRow[] | null) ?? []
      const vendasTotal = (vendasRes.data ?? []).reduce((a: number, s: any) => a + Number(s.total || 0), 0)
      const atendCount  = atendRes.count ?? 0

      setMetas(metasList)
      setCorr(corrList)
      setRanking(rankList)
      setVendasHoje(vendasTotal)
      setAtendHoje(atendCount)

      // Trigger celebration for newly completed corridinhas
      corrList.forEach(c => {
        if (c.concluido && !celebratedRef.current.has(c.corridinha_id)) {
          celebratedRef.current.add(c.corridinha_id)
          setTimeout(() => setCelebracao({
            nome:             c.nome,
            premio_descricao: c.premio_descricao,
            bonus_valor:      c.bonus_valor,
          }), 400)
        }
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [user?.id, store?.id])

  const conversao = atendHoje > 0
    ? ((vendasHoje > 0 ? 1 : 0) / atendHoje * 100).toFixed(0)
    : '—'

  const myRank = ranking.find(r => r.user_id === user?.id)

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0B0F1A]/95 backdrop-blur border-b border-[#1E2D45] px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg leading-none">Minha Performance</h1>
          <p className="text-xs text-slate-400 mt-0.5">{store?.nome ?? 'Selecione uma loja'}</p>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="px-4 pt-4 space-y-5">

        {/* KPIs do dia */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Hoje</p>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard icon={<TrendingUp size={16} />} label="Vendas" value={formatBRL(vendasHoje)} color="emerald" />
            <KpiCard icon={<UserCheck size={16} />} label="Atendimentos" value={String(atendHoje)} color="blue" />
            <KpiCard icon={<Target size={16} />} label="Conversão" value={`${conversao}%`} color="violet" />
          </div>

          {/* Botão registrar atendimento */}
          <button
            onClick={registrarAtendimento}
            className="mt-3 w-full py-3.5 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-2xl font-semibold text-sm transition-all"
          >
            <UserCheck size={18} />
            Registrar atendimento
          </button>
        </section>

        {/* Ranking */}
        {ranking.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Ranking da equipe — mês
            </p>
            <div className="space-y-2">
              {ranking.slice(0, 5).map(r => (
                <div
                  key={r.user_id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${
                    r.user_id === user?.id
                      ? 'bg-emerald-900/40 border-emerald-700'
                      : 'bg-[#111827] border-[#1E2D45]'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${medalBg(r.posicao)}`}>
                    {r.posicao === 1 ? '🥇' : r.posicao === 2 ? '🥈' : r.posicao === 3 ? '🥉' : r.posicao}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate leading-none">{r.nome}{r.user_id === user?.id ? ' (você)' : ''}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{r.cupons} vendas</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-400 shrink-0">{formatBRL(r.faturamento)}</p>
                </div>
              ))}
            </div>
            {myRank && myRank.posicao > 5 && (
              <div className="mt-2 px-4 py-2 bg-[#111827] border border-[#1E2D45] rounded-xl text-xs text-slate-400 text-center">
                Você está em {myRank.posicao}º lugar com {formatBRL(myRank.faturamento)}
              </div>
            )}
          </section>
        )}

        {/* Corridinhas ativas */}
        {corridinhas.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Corridinhas ativas
            </p>
            <div className="space-y-3">
              {corridinhas.map(c => (
                <CorridinhaCard key={c.corridinha_id} c={c} />
              ))}
            </div>
          </section>
        )}

        {/* Metas do período */}
        {metas.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Metas do período
            </p>
            <div className="space-y-3">
              {metas.map(m => (
                <MetaCard key={m.meta_id} m={m} />
              ))}
            </div>
          </section>
        )}

        {/* Estado vazio */}
        {!loading && metas.length === 0 && corridinhas.length === 0 && ranking.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <Trophy size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Nenhuma meta configurada</p>
            <p className="text-sm mt-1">O gerente ainda não criou metas para esta loja.</p>
          </div>
        )}
      </div>

      <TabBar />

      {/* Celebração */}
      <CelebracaoModal data={celebracao} onClose={() => setCelebracao(null)} />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────
function KpiCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string
  color: 'emerald' | 'blue' | 'violet'
}) {
  const colors = {
    emerald: 'text-emerald-400 bg-emerald-900/30',
    blue:    'text-blue-400    bg-blue-900/30',
    violet:  'text-violet-400  bg-violet-900/30',
  }
  return (
    <div className="bg-[#111827] border border-[#1E2D45] rounded-2xl p-3 text-center">
      <div className={`w-8 h-8 rounded-xl ${colors[color]} flex items-center justify-center mx-auto mb-2`}>
        <span className={colors[color].split(' ')[0]}>{icon}</span>
      </div>
      <p className="text-lg font-bold leading-none">{value}</p>
      <p className="text-[10px] text-slate-400 mt-1">{label}</p>
    </div>
  )
}

function MetaCard({ m }: { m: MetaRow }) {
  const done = m.pct >= 100
  return (
    <div className={`rounded-2xl border p-4 ${done ? 'bg-emerald-900/30 border-emerald-700' : 'bg-[#111827] border-[#1E2D45]'}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-slate-400">{periodoLabel(m.periodo)} · {tipoLabel(m.tipo)}</p>
          {m.descricao && <p className="text-sm font-medium mt-0.5">{m.descricao}</p>}
        </div>
        {done && <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-bold shrink-0">✓ Bateu!</span>}
        {m.bonus_valor > 0 && !done && (
          <span className="text-xs bg-amber-900/60 text-amber-400 border border-amber-700 px-2 py-0.5 rounded-full font-semibold shrink-0">
            +{formatBRL(m.bonus_valor)}
          </span>
        )}
      </div>
      <ProgressBar pct={m.pct} color={done ? 'bg-emerald-500' : 'bg-blue-500'} />
      <div className="flex justify-between mt-2 text-xs">
        <span className="text-slate-400">{fmtNum(m.realizado, m.tipo)}</span>
        <span className="font-semibold text-slate-200">{m.pct}% · meta {fmtNum(m.valor_meta, m.tipo)}</span>
      </div>
    </div>
  )
}

function CorridinhaCard({ c }: { c: CorrRow }) {
  const done = c.concluido
  const tipoColor = {
    INDIVIDUAL:   'text-violet-400 bg-violet-900/30 border-violet-800',
    COLETIVA:     'text-blue-400   bg-blue-900/30   border-blue-800',
    COMPETITIVA:  'text-amber-400  bg-amber-900/30  border-amber-800',
  }[c.tipo] ?? 'text-slate-400 bg-slate-800 border-slate-700'

  return (
    <div className={`rounded-2xl border p-4 ${done ? 'bg-emerald-900/30 border-emerald-700' : 'bg-[#111827] border-[#1E2D45]'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${tipoColor}`}>
              {c.tipo}
            </span>
            {done && <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-bold">Concluída!</span>}
          </div>
          <p className="font-bold text-base leading-tight">{c.nome}</p>
          {c.premio_descricao && (
            <p className="text-xs text-amber-400 mt-0.5 flex items-center gap-1">
              <Trophy size={11} /> {c.premio_descricao}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-400 flex items-center gap-1 justify-end">
            <Clock size={11} /> {countdown(c.fim)}
          </p>
          {c.bonus_valor > 0 && (
            <p className="text-sm font-bold text-emerald-400">+{formatBRL(c.bonus_valor)}</p>
          )}
        </div>
      </div>

      <ProgressBar
        pct={c.pct}
        color={done ? 'bg-emerald-500' : 'bg-gradient-to-r from-violet-500 to-pink-500'}
      />
      <div className="flex justify-between mt-2 text-xs">
        <span className="text-slate-400">{fmtNum(c.realizado, c.tipo_meta)}</span>
        <span className="font-semibold text-slate-200">{c.pct}% · {fmtNum(c.valor_meta, c.tipo_meta)}</span>
      </div>
    </div>
  )
}
