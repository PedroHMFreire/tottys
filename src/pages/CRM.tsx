// src/pages/CRM.tsx — Central de Ações CRM
import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import {
  Users, TrendingUp, AlertTriangle, Clock, Trophy, Heart,
  Star, UserX, Sparkles, MessageCircle, Search, ChevronRight,
  Cake, Loader2, RefreshCw,
} from 'lucide-react'

// ── tipos ─────────────────────────────────────────────────────
type Segmento = 'CAMPIAO' | 'FIEL' | 'PROMISSOR' | 'NOVO' | 'EM_RISCO' | 'INATIVO' | 'SEM_COMPRAS'

type CustomerRFM = {
  customer_id: string
  nome: string
  contato: string | null
  email: string | null
  data_nascimento: string | null
  cashback_saldo: number
  score_interno: string | null
  total_compras: number
  total_gasto: number
  ticket_medio: number
  ultima_compra_at: string | null
  dias_sem_comprar: number
  segmento: Segmento
}

// ── config de segmentos ───────────────────────────────────────
const SEG: Record<Segmento, { label: string; Icon: any; cls: string; bg: string }> = {
  CAMPIAO:     { label: 'Campeão',    Icon: Trophy,       cls: 'text-amber-700 bg-amber-100 border-amber-200',   bg: 'bg-amber-50'   },
  FIEL:        { label: 'Fiel',       Icon: Heart,        cls: 'text-emerald-700 bg-emerald-100 border-emerald-200', bg: 'bg-emerald-50' },
  PROMISSOR:   { label: 'Promissor',  Icon: TrendingUp,   cls: 'text-blue-700 bg-blue-100 border-blue-200',      bg: 'bg-blue-50'    },
  NOVO:        { label: 'Novo',       Icon: Sparkles,     cls: 'text-violet-700 bg-violet-100 border-violet-200', bg: 'bg-violet-50'  },
  EM_RISCO:    { label: 'Em Risco',   Icon: AlertTriangle,cls: 'text-orange-700 bg-orange-100 border-orange-200', bg: 'bg-orange-50'  },
  INATIVO:     { label: 'Inativo',    Icon: Clock,        cls: 'text-slate-500 bg-slate-100 border-slate-200',   bg: 'bg-slate-50'   },
  SEM_COMPRAS: { label: 'Sem compras',Icon: UserX,        cls: 'text-slate-400 bg-slate-100 border-slate-200',   bg: 'bg-slate-50'   },
}

const ALL_SEGS: (Segmento | 'TODOS')[] = ['TODOS','CAMPIAO','FIEL','PROMISSOR','NOVO','EM_RISCO','INATIVO','SEM_COMPRAS']

function SegBadge({ seg }: { seg: Segmento }) {
  const s = SEG[seg]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${s.cls}`}>
      <s.Icon size={9} />
      {s.label}
    </span>
  )
}

function initials(nome: string) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function daysToToday(date: string): number {
  const d = new Date(date)
  const now = new Date()
  d.setFullYear(now.getFullYear())
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000)
  if (diff < -2) d.setFullYear(now.getFullYear() + 1)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

function isBirthdaySoon(nascimento: string | null): boolean {
  if (!nascimento) return false
  const days = daysToToday(nascimento)
  return days >= 0 && days <= 7
}

function openWhatsApp(phone: string, nome: string) {
  const raw = phone.replace(/\D/g, '')
  const number = raw.startsWith('55') ? raw : `55${raw}`
  const msg = `Olá ${nome.split(' ')[0]}! Tudo bem? Passando para dizer que temos novidades esperando por você 😊`
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(msg)}`, '_blank')
}

// ── componente principal ──────────────────────────────────────
export default function CRM() {
  const { company } = useApp()
  const [data, setData]       = useState<CustomerRFM[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ]             = useState('')
  const [seg, setSeg]         = useState<Segmento | 'TODOS'>('TODOS')

  useEffect(() => { load() }, [company?.id])

  async function load() {
    if (!company?.id) return
    setLoading(true)
    const { data: rows } = await supabase
      .from('v_customer_rfm')
      .select('*')
      .eq('company_id', company.id)
      .order('total_gasto', { ascending: false })
    setData((rows ?? []) as CustomerRFM[])
    setLoading(false)
  }

  // ── derived ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = data
    if (seg !== 'TODOS') list = list.filter(c => c.segmento === seg)
    if (q.trim()) {
      const term = q.trim().toLowerCase()
      list = list.filter(c =>
        c.nome.toLowerCase().includes(term) ||
        (c.contato ?? '').includes(term) ||
        (c.email ?? '').toLowerCase().includes(term)
      )
    }
    return list
  }, [data, seg, q])

  const counts = useMemo(() => {
    const r: Record<string, number> = { TODOS: data.length }
    data.forEach(c => { r[c.segmento] = (r[c.segmento] ?? 0) + 1 })
    return r
  }, [data])

  const birthdays  = useMemo(() => data.filter(c => isBirthdaySoon(c.data_nascimento)), [data])
  const emRisco    = useMemo(() => data.filter(c => c.segmento === 'EM_RISCO').slice(0, 5), [data])
  const novos      = useMemo(() => data.filter(c => c.segmento === 'NOVO').slice(0, 5), [data])

  const statsCards = [
    { label: 'Clientes', value: counts.TODOS ?? 0, Icon: Users, color: 'text-slate-700', bg: 'bg-slate-50' },
    { label: 'Campeões', value: counts.CAMPIAO ?? 0, Icon: Trophy, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Fiéis', value: counts.FIEL ?? 0, Icon: Heart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Em Risco', value: counts.EM_RISCO ?? 0, Icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Inativos', value: counts.INATIVO ?? 0, Icon: Clock, color: 'text-slate-500', bg: 'bg-slate-100' },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">CRM</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestão de relacionamento e fidelização</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {statsCards.map(({ label, value, Icon, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl p-4 space-y-1`}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${color}`}>
              <Icon size={12} />
              {label}
            </div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Action Alerts */}
      {(birthdays.length > 0 || emRisco.length > 0 || novos.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Ações de hoje</h2>
          <div className="grid md:grid-cols-3 gap-3">

            {/* Aniversariantes */}
            {birthdays.length > 0 && (
              <div className="bg-pink-50 border border-pink-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-pink-700 font-semibold text-sm">
                  <Cake size={14} />
                  Aniversariantes esta semana
                  <span className="ml-auto bg-pink-200 text-pink-800 text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {birthdays.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {birthdays.slice(0, 4).map(c => (
                    <ActionRow key={c.customer_id} customer={c} accent="pink" />
                  ))}
                </div>
              </div>
            )}

            {/* Em risco */}
            {emRisco.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-orange-700 font-semibold text-sm">
                  <AlertTriangle size={14} />
                  Em risco — reativar
                  <span className="ml-auto bg-orange-200 text-orange-800 text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {counts.EM_RISCO ?? 0}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {emRisco.map(c => (
                    <ActionRow key={c.customer_id} customer={c} accent="orange" />
                  ))}
                </div>
              </div>
            )}

            {/* Novos */}
            {novos.length > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-violet-700 font-semibold text-sm">
                  <Sparkles size={14} />
                  Novos — fidelizar
                  <span className="ml-auto bg-violet-200 text-violet-800 text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {counts.NOVO ?? 0}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {novos.map(c => (
                    <ActionRow key={c.customer_id} customer={c} accent="violet" />
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Lista de clientes */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar por nome, telefone ou e-mail…"
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-azure transition-colors"
            />
          </div>
        </div>

        {/* Segment tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {ALL_SEGS.map(s => (
            <button
              key={s}
              onClick={() => setSeg(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                seg === s
                  ? 'bg-primary text-white border-primary'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {s === 'TODOS' ? 'Todos' : SEG[s].label}
              {counts[s] !== undefined && (
                <span className={`ml-1.5 ${seg === s ? 'text-blue-200' : 'text-slate-400'}`}>
                  {counts[s]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-slate-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-slate-200 rounded-2xl">
            {q || seg !== 'TODOS' ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-50">
              {filtered.map(c => (
                <CustomerRow key={c.customer_id} customer={c} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ActionRow — linha compacta nos cards de alerta ────────────
function ActionRow({ customer: c, accent }: { customer: CustomerRFM; accent: string }) {
  const accentBtn: Record<string, string> = {
    pink:   'text-pink-600 hover:bg-pink-100',
    orange: 'text-orange-600 hover:bg-orange-100',
    violet: 'text-violet-600 hover:bg-violet-100',
  }
  return (
    <div className="flex items-center gap-2">
      <Link
        to={`/customers/${c.customer_id}`}
        className="flex-1 min-w-0 text-sm font-medium text-slate-800 hover:text-azure truncate"
      >
        {c.nome}
      </Link>
      {c.contato && (
        <button
          onClick={() => openWhatsApp(c.contato!, c.nome)}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${accentBtn[accent]}`}
          title="Enviar WhatsApp"
        >
          <MessageCircle size={13} />
        </button>
      )}
    </div>
  )
}

// ── CustomerRow — linha na lista principal ────────────────────
function CustomerRow({ customer: c }: { customer: CustomerRFM }) {
  const seg = SEG[c.segmento]
  return (
    <Link
      to={`/customers/${c.customer_id}`}
      className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors"
    >
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-full ${seg.bg} flex items-center justify-center text-xs font-bold text-slate-600 shrink-0`}>
        {initials(c.nome)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-900">{c.nome}</span>
          <SegBadge seg={c.segmento} />
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {c.total_compras > 0
            ? `${c.total_compras} compra${c.total_compras > 1 ? 's' : ''} · ${c.dias_sem_comprar === 9999 ? '—' : `${c.dias_sem_comprar}d sem comprar`}`
            : 'Nunca comprou'
          }
        </div>
      </div>

      {/* Valor */}
      <div className="text-right shrink-0 hidden sm:block">
        <div className="text-sm font-semibold text-slate-800">{formatBRL(c.total_gasto)}</div>
        <div className="text-xs text-slate-400">ticket {formatBRL(c.ticket_medio)}</div>
      </div>

      {/* WhatsApp */}
      {c.contato && (
        <button
          onClick={e => { e.preventDefault(); openWhatsApp(c.contato!, c.nome) }}
          className="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer shrink-0"
          title="Enviar WhatsApp"
        >
          <MessageCircle size={15} />
        </button>
      )}

      <ChevronRight size={14} className="text-slate-300 shrink-0" />
    </Link>
  )
}
