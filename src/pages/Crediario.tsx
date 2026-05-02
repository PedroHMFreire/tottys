import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import type { CrediarioVenda, CrediarioParcela } from '@/domain/types'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import KPI from '@/ui/KPI'
import PagamentoModal from '@/components/crediario/PagamentoModal'
import Toast, { type ToastItem } from '@/ui/Toast'

type ParcelaComCliente = CrediarioParcela & { customer_nome?: string }

export default function Crediario() {
  const { company, store } = useApp()
  const [tab, setTab] = useState<'aberto' | 'atrasado'>('aberto')
  const [parcelas, setParcelas] = useState<ParcelaComCliente[]>([])
  const [loading, setLoading] = useState(false)
  const [pagando, setPagando] = useState<ParcelaComCliente | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  function pushToast(kind: ToastItem['kind'], message: string) {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, kind, message }])
  }

  // KPIs
  const totalAberto = parcelas.filter(p => p.status !== 'PAGA').reduce((a, p) => a + Number(p.valor), 0)
  const totalAtrasado = parcelas.filter(p => p.status === 'ATRASADA').reduce((a, p) => a + Number(p.valor), 0)
  const qtdAtrasadas = parcelas.filter(p => p.status === 'ATRASADA').length

  useEffect(() => {
    if (company?.id) load()
  }, [company?.id, tab])

  async function load() {
    if (!company?.id) return
    setLoading(true)
    try {
      // Marca parcelas atrasadas antes de carregar (falha silenciosa — não bloqueia a listagem)
      const { error: rpcErr } = await supabase.rpc('atualizar_parcelas_atrasadas', { p_company_id: company.id })
      if (rpcErr) console.warn('atualizar_parcelas_atrasadas:', rpcErr.message)

      let query = supabase
        .from('crediario_parcelas')
        .select('*, customers(nome)')
        .eq('company_id', company.id)
        .order('vencimento')
        .limit(100)

      if (tab === 'aberto') {
        query = query.in('status', ['PENDENTE', 'ATRASADA'])
      } else {
        query = query.eq('status', 'ATRASADA')
      }

      const { data } = await query
      const flat = (data || []).map((r: any) => ({
        ...r,
        customer_nome: r.customers?.nome ?? 'Cliente',
      }))
      setParcelas(flat as ParcelaComCliente[])
    } finally {
      setLoading(false)
    }
  }

  const displayed = tab === 'aberto'
    ? parcelas
    : parcelas.filter(p => p.status === 'ATRASADA')

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="sticky top-0 bg-white border-b px-4 py-3 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-navy">Crediário</h1>
          <Link to="/cobranca" className="text-xs border rounded-xl px-3 py-1 text-green-700 border-green-300 bg-green-50 hover:bg-green-100">
            Cobrar WhatsApp
          </Link>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('aberto')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border cursor-pointer transition-colors ${tab === 'aberto' ? 'bg-primary text-white border-azure' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            Em Aberto
          </button>
          <button
            onClick={() => setTab('atrasado')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border ${tab === 'atrasado' ? 'bg-red-600 text-white border-red-600' : 'border-zinc-200 text-zinc-600'}`}
          >
            Atrasadas {qtdAtrasadas > 0 && `(${qtdAtrasadas})`}
          </button>
        </div>
      </div>

      <section className="px-4 mt-3 grid grid-cols-2 gap-2">
        <KPI label="Total em aberto" value={formatBRL(totalAberto)} />
        <KPI label="Total atrasado" value={formatBRL(totalAtrasado)} />
      </section>

      <div className="px-4 mt-3">
        {!company?.id && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3 mb-2">Selecione uma empresa.</div>
        )}
        {loading && <div className="text-sm text-slate-400 py-4 text-center">Carregando…</div>}
        {!loading && displayed.length === 0 && company?.id && (
          <div className="text-sm text-slate-400 mb-2">
            {tab === 'aberto' ? 'Nenhuma parcela em aberto.' : 'Nenhuma parcela atrasada.'}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {displayed.map(p => (
          <div
            key={p.id}
            className={`rounded-2xl border bg-white p-3 flex items-center justify-between gap-2 ${p.status === 'ATRASADA' ? 'border-red-200' : ''}`}
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{p.customer_nome}</div>
              <div className="text-xs text-zinc-500">
                Parcela {p.num_parcela}ª · venc. {new Date(p.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <div className="font-semibold">{formatBRL(p.valor)}</div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.status === 'ATRASADA' ? 'bg-red-100 text-red-600' : 'bg-zinc-100 text-zinc-600'}`}>
                  {p.status}
                </span>
              </div>
              <Button onClick={() => setPagando(p)}>Pagar</Button>
            </div>
          </div>
        ))}
        </div>
      </div>

      {pagando && (
        <PagamentoModal
          parcela={pagando}
          clienteNome={pagando.customer_nome || 'Cliente'}
          onPago={(msg) => {
            load()
            pushToast('success', msg ?? 'Pagamento registrado.')
          }}
          onClose={() => setPagando(null)}
        />
      )}

      <Toast toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />


    </div>
  )
}
