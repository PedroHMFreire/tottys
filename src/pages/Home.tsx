// Hub principal do vendedor no PDV (/loja)
// Acesso rápido a todos os módulos disponíveis ao perfil atual.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { useRole } from '@/hooks/useRole'
import { isUUID } from '@/lib/utils'
import { formatBRL } from '@/lib/currency'
import TabBar from '@/ui/TabBar'
import {
  ShoppingCart, Landmark, Users, Package, Warehouse,
  BarChart3, CreditCard, Star, Zap, Settings, Trophy,
  ChevronRight, LogOut, LayoutDashboard, Cake, Store,
  type LucideIcon,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────
type ModuleItem = {
  label: string
  to: string
  Icon: LucideIcon
  color: string   // text color class
  bg: string      // bg class
  adminOnly?: boolean
}

// ── Módulos disponíveis ao vendedor ──────────────────────────
const MODULES: ModuleItem[] = [
  { label: 'Clientes',     to: '/customers',          Icon: Users,       color: 'text-blue-400',   bg: 'bg-blue-900/40' },
  { label: 'Estoque',      to: '/loja/stock',          Icon: Warehouse,   color: 'text-amber-400',  bg: 'bg-amber-900/40' },
  { label: 'Produtos',     to: '/loja/products',       Icon: Package,     color: 'text-violet-400', bg: 'bg-violet-900/40' },
  { label: 'Crediário',    to: '/crediario',           Icon: CreditCard,  color: 'text-rose-400',   bg: 'bg-rose-900/40' },
  { label: 'Aniversários', to: '/customers?tab=aniv',  Icon: Cake,        color: 'text-pink-400',   bg: 'bg-pink-900/40' },
  { label: 'NPS',          to: '/nps',                 Icon: Star,        color: 'text-yellow-400', bg: 'bg-yellow-900/40' },
  { label: 'Configurações',to: '/loja/settings',       Icon: Settings,    color: 'text-slate-400',  bg: 'bg-slate-700/40' },
]

// ── Main ─────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate()
  const { user, store } = useApp()
  const { role, isGerente } = useRole()

  const [caixaAberto, setCaixaAberto] = useState<boolean | null>(null)
  const [vendasHoje, setVendasHoje]   = useState(0)
  const [rankPos, setRankPos]         = useState<number | null>(null)
  const [userName, setUserName]       = useState('')

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
      const saved = localStorage.getItem(`pdv_demo_cash_${store.id}`)
      const row = saved ? JSON.parse(saved) : null
      setCaixaAberto(!!row && row.status === 'ABERTO')
      return
    }
    supabase.rpc('get_open_cash', { p_store_id: store.id }).then(({ data, error }) => {
      const row = error ? null : (Array.isArray(data) ? data[0] : data)
      setCaixaAberto(!!row && row.status === 'ABERTO')
    })
  }, [store?.id])

  // KPIs do dia + ranking
  useEffect(() => {
    if (!store?.id || !user?.id || !isUUID(store.id)) return
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end   = new Date(); end.setHours(23, 59, 59, 999)

    Promise.all([
      supabase.from('sales').select('total')
        .eq('store_id', store.id).eq('user_id', user.id).eq('status', 'PAGA')
        .gte('created_at', start.toISOString()).lte('created_at', end.toISOString()),
      supabase.rpc('get_ranking_vendedores', { p_store_id: store.id }),
    ]).then(([vendasRes, rankRes]) => {
      const total = (vendasRes.data ?? []).reduce((a: number, s: any) => a + Number(s.total || 0), 0)
      setVendasHoje(total)
      const rank = (rankRes.data ?? []).find((r: any) => r.user_id === user.id)
      setRankPos(rank?.posicao ?? null)
    })
  }, [store?.id, user?.id])

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }, [])

  const caixaColor = caixaAberto
    ? 'bg-emerald-900/40 border-emerald-700'
    : 'bg-amber-900/30 border-amber-800'

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white pb-24">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="px-4 pt-6 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400 font-medium">{greeting}{userName ? `, ${userName}` : ''}!</p>
            <h1 className="text-2xl font-extrabold tracking-tight leading-none mt-0.5">
              Tottys PDV
            </h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {isGerente && (
              <Link
                to="/adm"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111827] border border-[#1E2D45] rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
              >
                <LayoutDashboard size={13} />
                Retaguarda
              </Link>
            )}
            <button
              onClick={() => navigate('/loja/store')}
              className="px-3 py-1.5 bg-[#111827] border border-[#1E2D45] rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-colors flex items-center gap-1.5 max-w-[130px]"
            >
              <Store size={13} />
              <span className="truncate">{store?.nome ?? 'Loja'}</span>
            </button>
          </div>
        </div>

        {/* Status do caixa */}
        {store && (
          <div className={`mt-4 flex items-center justify-between px-4 py-3 rounded-2xl border ${caixaColor}`}>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide">
                Caixa {caixaAberto === null ? '…' : caixaAberto ? 'aberto' : 'fechado'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {caixaAberto ? 'Pode iniciar vendas.' : 'Abra o caixa para vender.'}
              </p>
            </div>
            <Link
              to="/loja/cash"
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                caixaAberto
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
            >
              {caixaAberto ? 'Ver caixa' : 'Abrir caixa'}
            </Link>
          </div>
        )}
      </header>

      {/* ── KPIs do dia ─────────────────────────────────────── */}
      {store && isUUID(store.id) && (
        <section className="px-4 grid grid-cols-2 gap-3 mb-2">
          <div className="bg-[#111827] border border-[#1E2D45] rounded-2xl p-4">
            <p className="text-xs text-slate-400 mb-1">Minhas vendas hoje</p>
            <p className="text-xl font-extrabold text-emerald-400">{formatBRL(vendasHoje)}</p>
          </div>
          <div className="bg-[#111827] border border-[#1E2D45] rounded-2xl p-4">
            <p className="text-xs text-slate-400 mb-1">Ranking do mês</p>
            <p className="text-xl font-extrabold text-amber-400">
              {rankPos ? `${rankPos}º lugar` : '—'}
            </p>
          </div>
        </section>
      )}

      {/* ── Ação principal — Vender ──────────────────────────── */}
      <section className="px-4 mt-3">
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
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Módulos</p>
        <div className="grid grid-cols-4 gap-3">
          {MODULES.map(({ label, to, Icon, color, bg }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-2 py-4 bg-[#111827] border border-[#1E2D45] rounded-2xl hover:border-slate-600 active:scale-95 transition-all"
            >
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={20} className={color} strokeWidth={1.75} />
              </div>
              <span className="text-[10px] font-semibold text-slate-300 text-center leading-tight px-1">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Atalhos rápidos ──────────────────────────────────── */}
      <section className="px-4 mt-5 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Atalhos</p>

        <QuickLink
          to="/loja/performance"
          Icon={Trophy}
          label="Minha performance"
          sub="Metas, corridinhas e ranking"
          color="text-amber-400"
          bg="bg-amber-900/30"
        />
        <QuickLink
          to="/loja/reports"
          Icon={BarChart3}
          label="Relatórios"
          sub="Vendas, produtos e histórico"
          color="text-teal-400"
          bg="bg-teal-900/30"
        />
        <QuickLink
          to="/loja/cash"
          Icon={Landmark}
          label="Caixa"
          sub="Abrir, fechar e suprimentos"
          color="text-emerald-400"
          bg="bg-emerald-900/30"
        />
      </section>

      {/* ── Logout / Trocar conta ────────────────────────────── */}
      <section className="px-4 mt-6">
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            navigate('/login')
          }}
          className="w-full flex items-center justify-center gap-2 py-3 border border-[#1E2D45] rounded-2xl text-sm text-slate-500 hover:text-rose-400 hover:border-rose-900 transition-colors"
        >
          <LogOut size={15} />
          Sair da conta
        </button>
      </section>

      <TabBar />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────
function QuickLink({ to, Icon, label, sub, color, bg }: {
  to: string; Icon: LucideIcon; label: string; sub: string; color: string; bg: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3.5 bg-[#111827] border border-[#1E2D45] rounded-2xl hover:border-slate-600 active:scale-[0.98] transition-all"
    >
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
