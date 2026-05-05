// src/pages/CRM.tsx — Central de Ações CRM
import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import {
  Users, TrendingUp, AlertTriangle, Clock, Trophy, Heart,
  UserX, Sparkles, MessageCircle, Search, ChevronRight,
  Cake, Loader2, RefreshCw, Check, ChevronDown, ChevronUp,
  Send,
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

type BdBucket = 'hoje' | 'semana' | 'quinzena' | 'mes'

// ── config de segmentos ───────────────────────────────────────
const SEG: Record<Segmento, { label: string; Icon: any; cls: string; bg: string }> = {
  CAMPIAO:     { label: 'Campeão',    Icon: Trophy,        cls: 'text-amber-700 bg-amber-100 border-amber-200',      bg: 'bg-amber-50'   },
  FIEL:        { label: 'Fiel',       Icon: Heart,         cls: 'text-emerald-700 bg-emerald-100 border-emerald-200', bg: 'bg-emerald-50' },
  PROMISSOR:   { label: 'Promissor',  Icon: TrendingUp,    cls: 'text-blue-700 bg-blue-100 border-blue-200',         bg: 'bg-blue-50'    },
  NOVO:        { label: 'Novo',       Icon: Sparkles,      cls: 'text-violet-700 bg-violet-100 border-violet-200',   bg: 'bg-violet-50'  },
  EM_RISCO:    { label: 'Em Risco',   Icon: AlertTriangle, cls: 'text-orange-700 bg-orange-100 border-orange-200',   bg: 'bg-orange-50'  },
  INATIVO:     { label: 'Inativo',    Icon: Clock,         cls: 'text-slate-500 bg-slate-100 border-slate-200',      bg: 'bg-slate-50'   },
  SEM_COMPRAS: { label: 'Sem compras',Icon: UserX,         cls: 'text-slate-400 bg-slate-100 border-slate-200',      bg: 'bg-slate-50'   },
}

const ALL_SEGS: (Segmento | 'TODOS')[] = [
  'TODOS','CAMPIAO','FIEL','PROMISSOR','NOVO','EM_RISCO','INATIVO','SEM_COMPRAS',
]

const BD_BUCKETS: { key: BdBucket; label: string; maxDays: number; dot: string }[] = [
  { key: 'hoje',     label: 'Hoje',              maxDays: 0,  dot: 'bg-rose-500'   },
  { key: 'semana',   label: 'Esta semana',        maxDays: 7,  dot: 'bg-orange-400' },
  { key: 'quinzena', label: 'Próximos 15 dias',   maxDays: 15, dot: 'bg-amber-400'  },
  { key: 'mes',      label: 'Até 30 dias',        maxDays: 30, dot: 'bg-slate-400'  },
]

// ── helpers ───────────────────────────────────────────────────
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

function daysUntilBirthday(nascimento: string): number {
  const today = new Date()
  const bday  = new Date(nascimento + 'T12:00:00')
  bday.setFullYear(today.getFullYear())
  let diff = Math.round((bday.getTime() - today.getTime()) / 86400000)
  if (diff < 0) {
    bday.setFullYear(today.getFullYear() + 1)
    diff = Math.round((bday.getTime() - today.getTime()) / 86400000)
  }
  return diff
}

function getBirthdayBucket(nascimento: string | null): BdBucket | null {
  if (!nascimento) return null
  const days = daysUntilBirthday(nascimento)
  if (days === 0)        return 'hoje'
  if (days <= 7)         return 'semana'
  if (days <= 15)        return 'quinzena'
  if (days <= 30)        return 'mes'
  return null
}

function birthdayMsg(nome: string, seg: Segmento, companyNome: string): string {
  const first = nome.split(' ')[0]
  if (seg === 'CAMPIAO' || seg === 'FIEL') {
    return `Parabéns, ${first}! 🎉🎂 Você é uma cliente muito especial para a ${companyNome}. No seu aniversário, queremos te ver por aqui — temos novidades lindas esperando por você! 🥳`
  }
  if (seg === 'EM_RISCO' || seg === 'INATIVO') {
    return `Parabéns, ${first}! 🎂 Saudades de você por aqui! No seu aniversário, que tal nos dar uma visita? A ${companyNome} tem novidades e adoraria te ver! 😊`
  }
  return `Parabéns, ${first}! 🎂🎉 A equipe da ${companyNome} deseja um aniversário incrível para você! Venha nos visitar e celebrar juntos! 😊`
}

// ── BirthdayPanel ─────────────────────────────────────────────
function BirthdayPanel({
  customers, companyId, companyNome,
}: {
  customers: CustomerRFM[]
  companyId: string
  companyNome: string
}) {
  const [msgOpenId, setMsgOpenId]   = useState<string | null>(null)
  const [msgs, setMsgs]             = useState<Record<string, string>>({})
  const [contacted, setContacted]   = useState<Set<string>>(new Set())
  const [registering, setRegistering] = useState<string | null>(null)

  const buckets = useMemo(() => {
    const grouped: Record<BdBucket, (CustomerRFM & { daysUntil: number })[]> = {
      hoje: [], semana: [], quinzena: [], mes: [],
    }
    customers.forEach(c => {
      const bucket = getBirthdayBucket(c.data_nascimento)
      if (!bucket) return
      const days = daysUntilBirthday(c.data_nascimento!)
      grouped[bucket].push({ ...c, daysUntil: days })
    })
    // Sort each bucket by days ascending
    Object.values(grouped).forEach(arr => arr.sort((a, b) => a.daysUntil - b.daysUntil))
    return grouped
  }, [customers])

  function getMsg(c: CustomerRFM): string {
    return msgs[c.customer_id] ?? birthdayMsg(c.nome, c.segmento, companyNome)
  }

  function sendWhatsApp(c: CustomerRFM) {
    if (!c.contato) return
    const raw    = c.contato.replace(/\D/g, '')
    const number = raw.startsWith('55') ? raw : `55${raw}`
    const text   = getMsg(c)
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank')
  }

  async function registerContact(c: CustomerRFM) {
    setRegistering(c.customer_id)
    await supabase.from('customer_notes').insert({
      company_id:  companyId,
      customer_id: c.customer_id,
      nota: `🎂 Parabéns de aniversário enviados via WhatsApp.`,
    })
    setContacted(prev => new Set(prev).add(c.customer_id))
    setRegistering(null)
  }

  const hasAny = BD_BUCKETS.some(b => buckets[b.key].length > 0)
  if (!hasAny) return null

  return (
    <div className="bg-pink-50 border border-pink-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-pink-200">
        <Cake size={15} className="text-pink-600" />
        <span className="text-sm font-semibold text-pink-700">Aniversariantes</span>
        <span className="ml-auto bg-pink-200 text-pink-800 text-xs font-bold px-2 py-0.5 rounded-full">
          {customers.length}
        </span>
      </div>

      {/* Buckets */}
      <div className="divide-y divide-pink-100">
        {BD_BUCKETS.map(({ key, label, dot }) => {
          const group = buckets[key]
          if (!group.length) return null
          return (
            <div key={key} className="px-4 py-3 space-y-2">
              {/* Bucket label */}
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                <span className="text-xs font-semibold text-pink-600 uppercase tracking-wider">{label}</span>
                <span className="text-xs text-pink-400">{group.length}</span>
              </div>

              {/* Customer cards */}
              <div className="space-y-2">
                {group.map(c => {
                  const isOpen      = msgOpenId === c.customer_id
                  const isDone      = contacted.has(c.customer_id)
                  const isReg       = registering === c.customer_id
                  const currentMsg  = getMsg(c)
                  const bdDate      = new Date(c.data_nascimento! + 'T12:00:00')
                    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

                  return (
                    <div
                      key={c.customer_id}
                      className="bg-white rounded-xl border border-pink-100 shadow-sm overflow-hidden"
                    >
                      {/* Card principal */}
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-xs font-bold text-pink-700 shrink-0">
                          {initials(c.nome)}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link
                              to={`/customers/${c.customer_id}`}
                              className="text-sm font-semibold text-slate-800 hover:text-azure truncate"
                            >
                              {c.nome}
                            </Link>
                            <SegBadge seg={c.segmento} />
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>🎂 {bdDate}{c.daysUntil > 0 ? ` — em ${c.daysUntil}d` : ' — Hoje!'}</span>
                            {c.total_compras > 0 && (
                              <span className="hidden sm:inline">· {formatBRL(c.total_gasto)} em {c.total_compras} compra{c.total_compras > 1 ? 's' : ''}</span>
                            )}
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Registrar contato */}
                          {isDone ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium px-2">
                              <Check size={11} /> Contatado
                            </span>
                          ) : (
                            <button
                              onClick={() => registerContact(c)}
                              disabled={isReg}
                              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                              title="Registrar contato"
                            >
                              {isReg ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                              <span className="hidden sm:inline">Registrar</span>
                            </button>
                          )}

                          {/* Toggle editor */}
                          {c.contato && (
                            <button
                              onClick={() => setMsgOpenId(isOpen ? null : c.customer_id)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-pink-500 hover:bg-pink-600 transition-colors cursor-pointer"
                            >
                              <MessageCircle size={11} />
                              <span className="hidden sm:inline">Parabéns</span>
                              {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Mensagem editável */}
                      {isOpen && c.contato && (
                        <div className="px-3 pb-3 space-y-2 border-t border-pink-50 pt-2.5">
                          <textarea
                            value={currentMsg}
                            onChange={e => setMsgs(m => ({ ...m, [c.customer_id]: e.target.value }))}
                            rows={4}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-pink-400 transition-colors resize-none bg-slate-50"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setMsgs(m => ({ ...m, [c.customer_id]: birthdayMsg(c.nome, c.segmento, companyNome) }))}
                              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                            >
                              Restaurar padrão
                            </button>
                            <button
                              onClick={() => { sendWhatsApp(c); setMsgOpenId(null) }}
                              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                            >
                              <Send size={11} />
                              Abrir WhatsApp
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
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

  const birthdays = useMemo(
    () => data.filter(c => getBirthdayBucket(c.data_nascimento) !== null),
    [data],
  )
  const emRisco = useMemo(() => data.filter(c => c.segmento === 'EM_RISCO').slice(0, 5), [data])
  const novos   = useMemo(() => data.filter(c => c.segmento === 'NOVO').slice(0, 5),    [data])

  const statsCards = [
    { label: 'Clientes',  value: counts.TODOS    ?? 0, Icon: Users,          color: 'text-slate-700', bg: 'bg-slate-50'  },
    { label: 'Campeões',  value: counts.CAMPIAO   ?? 0, Icon: Trophy,         color: 'text-amber-600', bg: 'bg-amber-50'  },
    { label: 'Fiéis',     value: counts.FIEL       ?? 0, Icon: Heart,          color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Em Risco',  value: counts.EM_RISCO  ?? 0, Icon: AlertTriangle,  color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Inativos',  value: counts.INATIVO   ?? 0, Icon: Clock,          color: 'text-slate-500', bg: 'bg-slate-100' },
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

      {/* Ações de hoje */}
      {(birthdays.length > 0 || emRisco.length > 0 || novos.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Ações de hoje</h2>
          <div className="grid md:grid-cols-3 gap-3 items-start">

            {/* Aniversariantes — painel expandido */}
            {birthdays.length > 0 && (
              <BirthdayPanel
                customers={birthdays}
                companyId={company?.id ?? ''}
                companyNome={company?.nome ?? 'a loja'}
              />
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
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail…"
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-azure transition-colors"
          />
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
          onClick={() => {
            const raw    = c.contato!.replace(/\D/g, '')
            const number = raw.startsWith('55') ? raw : `55${raw}`
            const msg    = `Olá ${c.nome.split(' ')[0]}! Tudo bem? Passando para dizer que temos novidades esperando por você 😊`
            window.open(`https://wa.me/${number}?text=${encodeURIComponent(msg)}`, '_blank')
          }}
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
      <div className={`w-9 h-9 rounded-full ${seg.bg} flex items-center justify-center text-xs font-bold text-slate-600 shrink-0`}>
        {initials(c.nome)}
      </div>

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

      <div className="text-right shrink-0 hidden sm:block">
        <div className="text-sm font-semibold text-slate-800">{formatBRL(c.total_gasto)}</div>
        <div className="text-xs text-slate-400">ticket {formatBRL(c.ticket_medio)}</div>
      </div>

      {c.contato && (
        <button
          onClick={e => {
            e.preventDefault()
            const raw    = c.contato!.replace(/\D/g, '')
            const number = raw.startsWith('55') ? raw : `55${raw}`
            const msg    = `Olá ${c.nome.split(' ')[0]}! Tudo bem? Passando para dizer que temos novidades esperando por você 😊`
            window.open(`https://wa.me/${number}?text=${encodeURIComponent(msg)}`, '_blank')
          }}
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
