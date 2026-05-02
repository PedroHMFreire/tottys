import { useState } from 'react'
import { formatBRL } from '@/lib/currency'
import Button from '@/ui/Button'
import type { SelectedCustomer } from './CustomerPDV'

const TIER_LABEL: Record<string, string> = {
  BRONZE: 'Bronze',
  PRATA:  'Prata',
  OURO:   'Ouro',
  VIP:    'VIP',
}
const TIER_COLOR: Record<string, string> = {
  BRONZE: 'bg-amber-100 text-amber-700',
  PRATA:  'bg-zinc-200 text-zinc-600',
  OURO:   'bg-yellow-100 text-yellow-700',
  VIP:    'bg-purple-100 text-purple-700',
}

type Props = {
  customer: SelectedCustomer
  cartTotal: number
  resgateMinimo?: number
  onApply: (valorResgate: number) => void
  onClose: () => void
}

export default function ResgateModal({ customer, cartTotal, resgateMinimo = 5, onApply, onClose }: Props) {
  const maxResgate = Math.min(customer.cashback_saldo, cartTotal)
  const [valor, setValor] = useState(String(maxResgate.toFixed(2)))
  const [error, setError] = useState<string | null>(null)

  const valorNum = Math.max(0, parseFloat(valor.replace(',', '.')) || 0)

  function handleResgatar() {
    if (valorNum <= 0) { setError('Informe um valor válido.'); return }
    if (valorNum < resgateMinimo) { setError(`Resgate mínimo: ${formatBRL(resgateMinimo)}.`); return }
    if (valorNum > customer.cashback_saldo) { setError('Valor maior que o saldo disponível.'); return }
    onApply(valorNum)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Resgatar Cashback</div>
          <button onClick={onClose} className="text-slate-400 text-sm">fechar</button>
        </div>

        {/* Info do cliente */}
        <div className="rounded-2xl border p-3 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${TIER_COLOR[customer.cashback_tier]}`}>
              {TIER_LABEL[customer.cashback_tier]}
            </span>
            <span className="font-medium text-sm">{customer.nome}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Saldo disponível</span>
            <span className="font-semibold text-emerald-600">{formatBRL(customer.cashback_saldo)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Total da compra</span>
            <span className="font-semibold">{formatBRL(cartTotal)}</span>
          </div>
        </div>

        {/* Input de valor */}
        <div>
          <div className="text-xs text-slate-400 mb-1">Valor a resgatar (R$)</div>
          <input
            type="number"
            min="0"
            max={maxResgate}
            step="0.01"
            value={valor}
            onChange={e => { setValor(e.target.value); setError(null) }}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-lg text-center font-semibold text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
            autoFocus
          />
          <div className="flex justify-between mt-1">
            <button
              className="text-xs text-slate-400 hover:underline"
              onClick={() => setValor('0')}
            >
              Zerar
            </button>
            <button
              className="text-xs text-emerald-600 hover:underline"
              onClick={() => setValor(maxResgate.toFixed(2))}
            >
              Usar tudo ({formatBRL(maxResgate)})
            </button>
          </div>
        </div>

        {valorNum > 0 && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Compra</span>
              <span>{formatBRL(cartTotal)}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Desconto cashback</span>
              <span>- {formatBRL(valorNum)}</span>
            </div>
            <div className="flex justify-between font-semibold mt-1 pt-1 border-t">
              <span>Total a pagar</span>
              <span>{formatBRL(Math.max(0, cartTotal - valorNum))}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-2 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={handleResgatar}
            disabled={valorNum <= 0}
          >
            Aplicar resgate
          </Button>
        </div>
      </div>
    </div>
  )
}
