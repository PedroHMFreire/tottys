// Hub principal do vendedor no PDV (/loja)
// Painel motivacional: ranking, meta, corridinha e bônus — direto na home.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { useRole } from '@/hooks/useRole'
import { isUUID } from '@/lib/utils'
import { formatBRL } from '@/lib/currency'
import TabBar from '@/ui/TabBar'
import {
  ShoppingCart, Landmark, Users, Package, Warehouse,
  BarChart3, CreditCard, Star, Settings, Trophy,
  ChevronRight, LogOut, LayoutDashboard, Cake, Store,
  Zap, Clock, TrendingUp, RefreshCw,
  type LucideIcon,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────
type MetaRow = {
  meta_id: string; tipo: string; periodo: string
  inicio: string; fim: string
  valor_meta: number; bonus_valor: number; descricao: string | null
  realizado: number; pct: number
}
type CorrRow = {
  corridinha_id: string; nome: string; tipo: string; tipo_meta: string
  valor_meta: number; bonus_valor: number; premio_descricao: string | null
  inicio: string; fim: string; realizado: number; pct: number; concluido: boolean
}
type RankRow = { user_id: string; nome: string; faturamento: number; posicao: number }

type ModuleItem = { label: string; to: string; Icon: LucideIcon; color: string; bg: string }

// ── Módulos disponíveis ao vendedor ──────────────────────────
const MODULES: ModuleItem[] = [
  { label: 'Clientes',      to: '/customers',         Icon: Users,      color: 'text-blue-400',   bg: 'bg-blue-900/40'   },
  { label: 'Estoque',       to: '/loja/stock',         Icon: Warehouse,  color: 'text-amber-400',  bg: 'bg-amber-900/40'  },
  { label: 'Produtos',      to: '/loja/products',      Icon: Package,    color: 'text-violet-400', bg: 'bg-violet-900/40' },
  { label: 'Crediário',     to: '/crediario',          Icon: CreditCard, color: 'text-rose-400',   bg: 'bg-rose-900/40'   },
  { label: 'Aniversários',  to: '/customers?tab=aniv', Icon: Cake,       color: 'text-pink-400',   bg: 'bg-pink-900/40'   },
  { label: 'NPS',           to: '/nps',                Icon: Star,       color: 'text-yellow-400', bg: 'bg-yellow-900/40' },
  { label: 'Configurações', to: '/loja/settings',      Icon: Settings,   color: 'text-slate-400',  bg: 'bg-slate-700/40'  },
]

// ── Helpers ──────────────────────────────────────────────────
function medal(pos: number) {
  if (pos === 1) return '🥇'
  if (pos === 2) return '🥈'
  if (pos === 3) return '🥉'
  return `${pos}º`
}

function countdown(fim: string) {
  const diff = new Date(fim).getTime() - Date.now()
  if (diff <= 0) return null
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  return `${h}h ${m}m`
}

function fmtMeta(n: number, tipo: string) {
  if (tipo === 'FINANCEIRA' || tipo === 'MIX') return formatBRL(n)
  return `${n.toLocaleString('pt-BR')} pç`
}

function periodoLabel(p: string) {
  return ({ DIARIA: 'hoje', SEMANAL: 'esta semana', QUINZENAL: 'esta quinzena', MENSAL: 'este mês' })[p] ?? p
}

// ── Main ─────────────────────────────────────────────────────
export default function Home() {
  const navigate  = useNavigate()
  const { user, store } = useApp()
  const { isGerente }   = useRole()

  // state
  const [caixaAberto, setCaixaAberto] = useState<boolean | null>(null)
  const [userName, setUserName]       = useState('')
  const [loading, setLoading]         = useState(false)

  const [vendasHoje, setVendasHoje]   = useState(0)
  const [ranking, setRanking]         = useState<RankRow[]>([])
  const [metas, setMetas]             = useState<MetaRow[]>([])
  const [corridinhas, setCorr]        = useState<CorrRow[]>([])
  const [bonusAcum, setBonusAcum]     = useState(0)
  const [bonusPotencial, setBonusPotencial] = useState(0)

  // live countdown tick
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // Nome do usuário
  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('nome').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.nome) setUserName(data.nome.split(' ')[0]) })
  }, [user?.id])

  // Status do caixa
  useEffect(() => {
    if (!store?.id) { setCaixaAberto(null); return }
    if (!isUUID(store.id)) {
      const row = JSON.parse(localStorage.getItem(`pdv_demo_cash_${store.id}`) ?? 'null')
      setCaixaAberto(!!row && row.status === 'ABERTO')
      return
    }
    supabase.rpc('get_open_cash', { p_store_id: store.id }).then(({ data, error }) => {
      const row = error ? null : (Array.isArray(data) ? data[0] : data)
      setCaixaAberto(!!row && row.status === 'ABERTO')
    })
  }, [store?.id])

  // Painel motivacional — todos os dados em paralelo
  async function loadPanel() {
    if (!store?.id || !user?.id || !isUUID(store.id)) return
    setLoading(true)

    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end   = new Date(); end.setHours(23, 59, 59, 999)
    const hoje  = new Date().toISOString().slice(0, 10)
    const mes   = hoje.slice(0, 7)        // "2026-05"
    const mesInicio = `${mes}-01`

    try {
      const [vendasRes, rankRes, metasRes, corrRes, bonusRes] = await Promise.all([
        // Minhas vendas hoje
        supabase.from('sales').select('total')
          .eq('store_id', store.id).eq('user_id', user.id).eq('status', 'PAGA')
          .gte('created_at', start.toISOString()).lte('created_at', end.toISOString()),

        // Ranking do mês
        supabase.rpc('get_ranking_vendedores', { p_store_id: store.id }),

        // Metas do período ativas
        supabase.rpc('get_metas_progresso', {
          p_user_id: user.id, p_store_id: store.id, p_data: hoje,
        }),

        // Corridinhas vigentes
        supabase.rpc('get_corridinhas_progresso', {
          p_user_id: user.id, p_store_id: store.id,
        }),

        // Bônus acumulados no mês (folha_bonos)
        supabase.from('folha_bonos').select('valor')
          .eq('user_id', user.id)
          .eq('periodo_ref', mes),
      ])

      const total  = (vendasRes.data ?? []).reduce((a: number, s: any) => a + Number(s.total || 0), 0)
      const rank   = (rankRes.data ?? []) as RankRow[]
      const mList  = (metasRes.data ?? []) as MetaRow[]
      const cList  = (corrRes.data ?? []) as CorrRow[]
      const bonus  = (bonusRes.data ?? []).reduce((a: number, b: any) => a + Number(b.valor || 0), 0)

      // Bônus potencial = soma dos bonus_valor das metas/corridinhas ainda não batidas
      const potMetas = mList.filter(m => m.pct < 100).reduce((a, m) => a + Number(m.bonus_valor), 0)
      const potCorr  = cList.filter(c => !c.concluido).reduce((a, c) => a + Number(c.bonus_valor), 0)

      setVendasHoje(total)
      setRanking(rank)
      setMetas(mList)
      setCorr(cList)
      setBonusAcum(bonus)
      setBonusPotencial(potMetas + potCorr)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPanel() }, [store?.id, user?.id])

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  }, [])

  const myRank   = ranking.find(r => r.user_id === user?.id)
  const topRank  = ranking.slice(0, 3)
  const ahead    = myRank ? ranking.find(r => r.posicao === myRank.posicao - 1) : null
  const gap      = ahead && myRank ? ahead.faturamento - myRank.faturamento : null

  // Meta mais relevante: a com menor pct (a mais urgente de bater)
  const metaPrincipal = metas.length
    ? [...metas].sort((a, b) => a.pct - b.pct)[0]
    : null

  // Corridinha mais urgente: menor tempo restante
  const corrAtiva = corridinhas.length
    ? [...corridinhas].sort((a, b) => new Date(a.fim).getTime() - new Date(b.fim).getTime())[0]
    : null

  const caixaColor = caixaAberto
    ? 'bg-emerald-900/40 border-emerald-700'
    : 'bg-amber-900/30 border-amber-800'

  const storeOk = !!store && isUUID(store.id)

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white pb-24">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="px-4 pt-6 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400 font-medium">{greeting}{userName ? `, ${userName}` : ''}!</p>
            <h1 className="text-2xl font-extrabold tracking-tight leading-none mt-0.5">Tottys PDV</h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {isGerente && (
              <Link to="/adm"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111827] border border-[#1E2D45] rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-colors">
                <LayoutDashboard size={13} /> Retaguarda
              </Link>
            )}
            <button onClick={() => navigate('/loja/store')}
              className="px-3 py-1.5 bg-[#111827] border border-[#1E2D45] rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 max-w-[130px]">
              <Store size={13} />
              <span className="truncate">{store?.nome ?? 'Loja'}</span>
            </button>
          </div>
        </div>

        {/* Caixa status */}
        {store && (
          <div className={`mt-3 flex items-center justify-between px-4 py-2.5 rounded-2xl border ${caixaColor}`}>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide">
                Caixa {caixaAberto === null ? '…' : caixaAberto ? 'aberto' : 'fechado'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {caixaAberto ? 'Pode iniciar vendas.' : 'Abra o caixa para vender.'}
              </p>
            </div>
            <Link to="/loja/cash"
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${caixaAberto ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600'} text-white`}>
              {caixaAberto ? 'Ver caixa' : 'Abrir'}
            </Link>
          </div>
        )}
      </header>

      {/* ══════════════════════════════════════════════════════
          PAINEL MOTIVACIONAL
          ══════════════════════════════════════════════════════ */}
      {storeOk && (
        <section className="px-4 space-y-3 mb-1">

          {/* ── Linha superior: vendas hoje + bônus ─────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#111827] border border-[#1E2D45] rounded-2xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Vendas hoje</p>
              <p className="text-xl font-extrabold text-emerald-400 leading-none">{formatBRL(vendasHoje)}</p>
            </div>
            <div className="bg-[#111827] border border-[#1E2D45] rounded-2xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
                {bonusAcum > 0 ? 'Bônus garantido' : 'Bônus potencial'}
              </p>
              <p className={`text-xl font-extrabold leading-none ${bonusAcum > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {bonusAcum > 0 ? formatBRL(bonusAcum) : bonusPotencial > 0 ? formatBRL(bonusPotencial) : '—'}
              </p>
              {bonusAcum > 0 && bonusPotencial > 0 && (
                <p className="text-[10px] text-amber-400 mt-1">+ {formatBRL(bonusPotencial)} possível</p>
              )}
            </div>
          </div>

          {/* ── Ranking ─────────────────────────────────────── */}
          {myRank && (
            <div className="bg-[#111827] border border-[#1E2D45] rounded-2xl overflow-hidden">
              {/* Minha posição */}
              <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Ranking do mês</p>
                  <p className="text-3xl font-extrabold mt-0.5 leading-none">
                    {medal(myRank.posicao)}
                    {typeof myRank.posicao === 'number' && myRank.posicao > 3 && (
                      <span className="ml-2 text-2xl">{myRank.posicao}º lugar</span>
                    )}
                  </p>
                  <p className="text-xs text-emerald-400 font-semibold mt-1">{formatBRL(myRank.faturamento)} este mês</p>
                </div>
                {gap !== null && gap > 0 && (
                  <div className="text-right bg-amber-900/30 border border-amber-800/50 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wide">Falta para subir</p>
                    <p className="text-base font-extrabold text-amber-300">{formatBRL(gap)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">superar {ahead?.nome?.split(' ')[0]}</p>
                  </div>
                )}
                {myRank.posicao === 1 && (
                  <div className="text-right bg-amber-900/30 border border-amber-800/50 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-amber-400 font-semibold">Você lidera!</p>
                    <p className="text-xl">🏆</p>
                  </div>
                )}
              </div>

              {/* Mini-ranking top 3 */}
              {topRank.length > 1 && (
                <div className="border-t border-[#1E2D45] divide-y divide-[#1E2D45]">
                  {topRank.map(r => (
                    <div
                      key={r.user_id}
                      className={`flex items-center gap-3 px-4 py-2.5 ${r.user_id === user?.id ? 'bg-emerald-900/20' : ''}`}
                    >
                      <span className="text-base w-6 text-center shrink-0">{medal(r.posicao)}</span>
                      <span className={`text-sm flex-1 font-medium truncate ${r.user_id === user?.id ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>
                        {r.user_id === user?.id ? `${r.nome.split(' ')[0]} (você)` : r.nome.split(' ')[0]}
                      </span>
                      <span className={`text-sm font-bold shrink-0 ${r.user_id === user?.id ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {formatBRL(r.faturamento)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Meta principal ──────────────────────────────── */}
          {metaPrincipal && (
            <div className={`rounded-2xl border overflow-hidden ${metaPrincipal.pct >= 100 ? 'border-emerald-700 bg-emerald-900/20' : 'border-[#1E2D45] bg-[#111827]'}`}>
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      Meta {periodoLabel(metaPrincipal.periodo)}
                    </p>
                    {metaPrincipal.descricao && (
                      <p className="text-sm font-medium text-slate-200 mt-0.5">{metaPrincipal.descricao}</p>
                    )}
                  </div>
                  {metaPrincipal.pct >= 100 ? (
                    <span className="text-xs bg-emerald-500 text-white px-2 py-1 rounded-full font-bold shrink-0">✓ Bateu!</span>
                  ) : metaPrincipal.bonus_valor > 0 ? (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-slate-500">bônus</p>
                      <p className="text-base font-extrabold text-amber-400">+{formatBRL(metaPrincipal.bonus_valor)}</p>
                    </div>
                  ) : null}
                </div>

                {/* Barra de progresso */}
                <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${metaPrincipal.pct >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-cyan-400'}`}
                    style={{ width: `${Math.min(100, metaPrincipal.pct)}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-semibold">{fmtMeta(metaPrincipal.realizado, metaPrincipal.tipo)}</span>
                  <span className="text-slate-500">
                    {metaPrincipal.pct >= 100
                      ? '100% atingido'
                      : `falta ${fmtMeta(metaPrincipal.valor_meta - metaPrincipal.realizado, metaPrincipal.tipo)} · ${metaPrincipal.pct}%`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Corridinha ativa ────────────────────────────── */}
          {corrAtiva && !corrAtiva.concluido && (
            <CorridinhaCard c={corrAtiva} />
          )}

          {/* Corridinha concluída */}
          {corrAtiva?.concluido && (
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-900/30 border border-emerald-700 rounded-2xl">
              <span className="text-2xl">🏆</span>
              <div>
                <p className="text-xs font-bold text-emerald-300">Corridinha concluída!</p>
                <p className="text-sm font-semibold text-white">{corrAtiva.nome}</p>
              </div>
            </div>
          )}

          {/* Refresh */}
          <button
            onClick={loadPanel}
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Atualizando…' : 'Atualizar painel'}
          </button>
        </section>
      )}

      {/* ── Ação principal — Vender ──────────────────────────── */}
      <section className="px-4 mt-2">
        <Link
          to="/loja/sell"
          className="flex items-center justify-between w-full px-6 py-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] rounded-2xl transition-all shadow-lg shadow-emerald-900/40"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-100">Iniciar</p>
            <p className="text-2xl font-extrabold leading-tight">Nova venda</p>
          </div>
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center">
            <ShoppingCart size={28} strokeWidth={1.75} />
          </div>
        </Link>
      </section>

      {/* ── Grid de módulos ──────────────────────────────────── */}
      <section className="px-4 mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-3">Módulos</p>
        <div className="grid grid-cols-4 gap-3">
          {MODULES.map(({ label, to, Icon, color, bg }) => (
            <Link key={to} to={to}
              className="flex flex-col items-center gap-2 py-4 bg-[#111827] border border-[#1E2D45] rounded-2xl hover:border-slate-600 active:scale-95 transition-all">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={20} className={color} strokeWidth={1.75} />
              </div>
              <span className="text-[10px] font-semibold text-slate-400 text-center leading-tight px-1">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Atalhos rápidos ──────────────────────────────────── */}
      <section className="px-4 mt-5 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-3">Atalhos</p>
        <QuickLink to="/loja/performance" Icon={Trophy}    label="Minha performance" sub="Metas, corridinhas e ranking completo" color="text-amber-400" bg="bg-amber-900/30" />
        <QuickLink to="/loja/reports"    Icon={BarChart3}  label="Relatórios"         sub="Vendas, produtos e histórico"          color="text-teal-400"  bg="bg-teal-900/30"  />
        <QuickLink to="/loja/cash"       Icon={Landmark}   label="Caixa"              sub="Abrir, fechar e suprimentos"           color="text-emerald-400" bg="bg-emerald-900/30" />
      </section>

      {/* ── Logout ───────────────────────────────────────────── */}
      <section className="px-4 mt-6">
        <button
          onClick={async () => { await supabase.auth.signOut(); navigate('/login') }}
          className="w-full flex items-center justify-center gap-2 py-3 border border-[#1E2D45] rounded-2xl text-sm text-slate-600 hover:text-rose-400 hover:border-rose-900 transition-colors"
        >
          <LogOut size={15} /> Sair da conta
        </button>
      </section>

      <TabBar />
    </div>
  )
}

// ── CorridinhaCard ────────────────────────────────────────────
function CorridinhaCard({ c }: { c: CorrRow }) {
  const ct    = countdown(c.fim)
  const falta = c.valor_meta - c.realizado
  const isUrgent = ct && (ct.includes('h') && !ct.includes('d') && parseInt(ct) < 3)

  return (
    <div className={`rounded-2xl border overflow-hidden ${isUrgent ? 'border-orange-700 bg-orange-900/20' : 'border-violet-800/60 bg-violet-900/20'}`}>
      <div className="px-4 pt-4 pb-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${isUrgent ? 'bg-orange-500/20 text-orange-400' : 'bg-violet-500/20 text-violet-400'}`}>
                ⚡ Corridinha
              </span>
              <span className={`text-xs font-bold flex items-center gap-1 ${isUrgent ? 'text-orange-400' : 'text-slate-400'}`}>
                <Clock size={11} /> {ct ?? 'encerrando'}
              </span>
            </div>
            <p className="text-sm font-bold text-white leading-tight">{c.nome}</p>
            {c.premio_descricao && (
              <p className="text-[11px] text-amber-400 mt-0.5 flex items-center gap-1">
                <Trophy size={11} /> {c.premio_descricao}
              </p>
            )}
          </div>
          {c.bonus_valor > 0 && (
            <div className="shrink-0 text-right">
              <p className="text-[10px] text-slate-500">bônus</p>
              <p className="text-base font-extrabold text-amber-400">+{formatBRL(c.bonus_valor)}</p>
            </div>
          )}
        </div>

        {/* Barra */}
        <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all duration-700 ${isUrgent ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-violet-500 to-pink-500'}`}
            style={{ width: `${Math.min(100, c.pct)}%` }}
          />
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-slate-300 font-semibold">
            {c.tipo_meta === 'FINANCEIRA' ? formatBRL(c.realizado) : c.realizado.toLocaleString('pt-BR')}
          </span>
          <span className={`font-bold ${isUrgent ? 'text-orange-400' : 'text-slate-400'}`}>
            falta {c.tipo_meta === 'FINANCEIRA' ? formatBRL(falta) : falta.toLocaleString('pt-BR')} · {c.pct}%
          </span>
        </div>
      </div>
    </div>
  )
}

// ── QuickLink ─────────────────────────────────────────────────
function QuickLink({ to, Icon, label, sub, color, bg }: {
  to: string; Icon: LucideIcon; label: string; sub: string; color: string; bg: string
}) {
  return (
    <Link to={to}
      className="flex items-center gap-3 px-4 py-3.5 bg-[#111827] border border-[#1E2D45] rounded-2xl hover:border-slate-600 active:scale-[0.98] transition-all">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={20} className={color} strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-none">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
      <ChevronRight size={16} className="text-slate-600 shrink-0" />
    </Link>
  )
}
