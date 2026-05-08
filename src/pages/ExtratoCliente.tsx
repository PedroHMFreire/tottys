import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { formatBRL } from '@/lib/currency'
import { TrendingUp, TrendingDown, Clock, ArrowUpDown, ShoppingBag, Loader2 } from 'lucide-react'

type Transacao = {
  id: string
  tipo: 'CREDITO' | 'RESGATE' | 'EXPIRACAO' | 'AJUSTE'
  valor: number
  saldo_posterior: number
  descricao: string
  created_at: string
}

type ExtratoData = {
  nome: string
  saldo: number
  tier: 'BRONZE' | 'PRATA' | 'OURO' | 'VIP'
  total_gasto: number
  empresa: string
  transacoes: Transacao[]
  tiers: { min_prata: number; min_ouro: number; min_vip: number }
}

const TIER = {
  BRONZE: {
    label: 'Bronze', emoji: '🥉',
    grad: 'from-amber-500 to-amber-300',
    bg: 'bg-amber-50', border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    bar: 'bg-amber-400',
  },
  PRATA: {
    label: 'Prata', emoji: '🥈',
    grad: 'from-zinc-500 to-zinc-300',
    bg: 'bg-zinc-50', border: 'border-zinc-200',
    badge: 'bg-zinc-200 text-zinc-700',
    bar: 'bg-zinc-400',
  },
  OURO: {
    label: 'Ouro', emoji: '🥇',
    grad: 'from-yellow-500 to-yellow-300',
    bg: 'bg-yellow-50', border: 'border-yellow-200',
    badge: 'bg-yellow-100 text-yellow-700',
    bar: 'bg-yellow-400',
  },
  VIP: {
    label: 'VIP', emoji: '💎',
    grad: 'from-purple-600 to-purple-400',
    bg: 'bg-purple-50', border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-700',
    bar: 'bg-purple-500',
  },
}

const TIPO = {
  CREDITO:   { Icon: TrendingUp,   color: 'text-green-600',  bg: 'bg-green-50',  label: 'Cashback ganho',  sign: '+' },
  RESGATE:   { Icon: TrendingDown, color: 'text-orange-500', bg: 'bg-orange-50', label: 'Resgate no PDV',  sign: '-' },
  EXPIRACAO: { Icon: Clock,        color: 'text-red-500',    bg: 'bg-red-50',    label: 'Expirado',        sign: '-' },
  AJUSTE:    { Icon: ArrowUpDown,  color: 'text-blue-500',   bg: 'bg-blue-50',   label: 'Ajuste',          sign: '±' },
}

function tierProgress(data: ExtratoData): { pct: number; label: string; next: string } | null {
  const { tier, total_gasto, tiers } = data
  if (tier === 'BRONZE') {
    const pct = Math.min(100, (total_gasto / tiers.min_prata) * 100)
    const falta = Math.max(0, tiers.min_prata - total_gasto)
    return { pct, label: falta > 0 ? `Faltam ${formatBRL(falta)} para Prata` : 'Quase lá!', next: 'Prata' }
  }
  if (tier === 'PRATA') {
    const pct = Math.min(100, ((total_gasto - tiers.min_prata) / (tiers.min_ouro - tiers.min_prata)) * 100)
    const falta = Math.max(0, tiers.min_ouro - total_gasto)
    return { pct, label: falta > 0 ? `Faltam ${formatBRL(falta)} para Ouro` : 'Quase lá!', next: 'Ouro' }
  }
  if (tier === 'OURO') {
    const pct = Math.min(100, ((total_gasto - tiers.min_ouro) / (tiers.min_vip - tiers.min_ouro)) * 100)
    const falta = Math.max(0, tiers.min_vip - total_gasto)
    return { pct, label: falta > 0 ? `Faltam ${formatBRL(falta)} para VIP` : 'Quase lá!', next: 'VIP' }
  }
  return null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function ExtratoCliente() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<ExtratoData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setError('Link inválido.'); setLoading(false); return }
    supabase.rpc('fn_extrato_cliente', { p_token: token })
      .then(({ data: res, error: err }) => {
        if (err || !res?.ok) {
          setError(res?.msg ?? err?.message ?? 'Erro ao carregar extrato.')
        } else {
          setData(res as ExtratoData)
        }
      })
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="size-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50 px-6 text-center">
        <ShoppingBag className="size-12 text-gray-300" />
        <p className="text-gray-500 text-sm">{error ?? 'Extrato não encontrado.'}</p>
      </div>
    )
  }

  const t = TIER[data.tier]
  const progress = tierProgress(data)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-[430px]">

        {/* Header */}
        <div className="bg-white border-b px-5 py-3 flex items-center justify-between">
          <span className="font-semibold text-sm text-gray-800">{data.empresa}</span>
          <ShoppingBag className="size-5 text-gray-400" />
        </div>

        {/* Saldo card */}
        <div className={`m-4 rounded-2xl bg-gradient-to-br ${t.grad} p-5 text-white shadow-md`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white/80 text-xs font-medium uppercase tracking-wide">Olá,</p>
              <p className="text-lg font-bold leading-tight">{data.nome.split(' ')[0]}</p>
            </div>
            <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
              {t.emoji} {t.label}
            </span>
          </div>

          <p className="text-white/70 text-xs mb-1">Saldo disponível</p>
          <p className="text-4xl font-bold tracking-tight">{formatBRL(data.saldo)}</p>

          {/* Progresso de tier */}
          {progress ? (
            <div className="mt-4">
              <div className="flex justify-between text-white/70 text-xs mb-1">
                <span>{progress.label}</span>
                <span>{Math.round(progress.pct)}%</span>
              </div>
              <div className="h-1.5 bg-white/25 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-white/80 text-xs">
              💎 Você é VIP! Aproveite os melhores benefícios.
            </p>
          )}
        </div>

        {/* Resumo rápido */}
        <div className="mx-4 mb-4 grid grid-cols-2 gap-3">
          <div className={`rounded-xl border ${t.border} ${t.bg} p-3`}>
            <p className="text-xs text-gray-500 mb-1">Total gasto</p>
            <p className="font-bold text-gray-800 text-sm">{formatBRL(data.total_gasto)}</p>
          </div>
          <div className={`rounded-xl border ${t.border} ${t.bg} p-3`}>
            <p className="text-xs text-gray-500 mb-1">Nível atual</p>
            <p className={`font-bold text-sm inline-flex items-center gap-1 ${t.badge.replace('bg-', 'text-').split(' ')[0]}`}>
              {t.emoji} {t.label}
            </p>
          </div>
        </div>

        {/* Transações */}
        <div className="mx-4 mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Movimentações
          </h2>

          {data.transacoes.length === 0 ? (
            <div className="rounded-xl border bg-white p-8 text-center text-gray-400 text-sm">
              Nenhuma movimentação ainda.
            </div>
          ) : (
            <div className="rounded-xl border bg-white divide-y overflow-hidden">
              {data.transacoes.map((tx) => {
                const tp = TIPO[tx.tipo] ?? TIPO.AJUSTE
                const { Icon } = tp
                const isCredit = tx.tipo === 'CREDITO'
                return (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`size-8 rounded-full flex items-center justify-center shrink-0 ${tp.bg}`}>
                      <Icon className={`size-4 ${tp.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{tp.label}</p>
                      {tx.descricao && (
                        <p className="text-xs text-gray-400 truncate">{tx.descricao}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${isCredit ? 'text-green-600' : 'text-orange-500'}`}>
                        {tp.sign}{formatBRL(tx.valor)}
                      </p>
                      <p className="text-xs text-gray-400">{fmtDate(tx.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pb-8 text-center">
          <p className="text-xs text-gray-400">🔒 Seus dados estão protegidos</p>
        </div>

      </div>
    </div>
  )
}
