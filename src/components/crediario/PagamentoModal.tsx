import { useState } from 'react'
import { pagarParcela } from '@/domain/services/CrediarioService'
import { formatBRL } from '@/lib/currency'
import type { CrediarioParcela } from '@/domain/types'
import Button from '@/ui/Button'

type Props = {
  parcela: CrediarioParcela
  clienteNome: string
  onPago: (msg?: string) => void
  onClose: () => void
}

export default function PagamentoModal({ parcela, clienteNome, onPago, onClose }: Props) {
  const [valorPago, setValorPago] = useState(String(parcela.valor).replace('.', ','))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAtrasada = parcela.status === 'ATRASADA'
  const venc = new Date(parcela.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')

  async function confirm() {
    const val = Number(valorPago.replace(',', '.'))
    if (!val || val <= 0) { setError('Informe um valor válido.'); return }
    setLoading(true)
    setError(null)
    const { error: err, cashback } = await pagarParcela(parcela.id, val)
    setLoading(false)
    if (err) { setError(err); return }
    let toastMsg: string | undefined
    if (cashback?.credito) {
      toastMsg = cashback.subiu_tier
        ? `Cashback de ${formatBRL(cashback.credito)} creditado! Agora é ${cashback.tier_novo}!`
        : `Cashback de ${formatBRL(cashback.credito)} creditado.`
    }
    onPago(toastMsg)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Registrar Pagamento</div>
          <button onClick={onClose} className="text-slate-400 text-sm">fechar</button>
        </div>

        <div className="rounded-2xl border bg-zinc-50 p-3 text-sm space-y-1">
          <div><span className="text-slate-400">Cliente:</span> <b>{clienteNome}</b></div>
          <div><span className="text-slate-400">Parcela:</span> {parcela.num_parcela}ª</div>
          <div><span className="text-slate-400">Vencimento:</span> {venc}
            {isAtrasada && <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">ATRASADA</span>}
          </div>
          <div><span className="text-slate-400">Valor original:</span> <b>{formatBRL(parcela.valor)}</b></div>
        </div>

        <div>
          <div className="text-xs text-slate-400 mb-1">Valor recebido</div>
          <input
            value={valorPago}
            onChange={e => setValorPago(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-lg font-semibold text-center text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
            placeholder="0,00"
          />
        </div>

        {error && <div className="rounded-2xl border bg-amber-50 text-amber-900 p-3 text-sm">{error}</div>}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} disabled={loading}>{loading ? 'Registrando...' : 'Confirmar'}</Button>
        </div>
      </div>
    </div>
  )
}
