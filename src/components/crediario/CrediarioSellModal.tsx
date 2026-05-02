import { useState, useMemo } from 'react'
import { criarCrediario } from '@/domain/services/CrediarioService'
import { createSaleWithItems } from '@/domain/services/SaleService'
import { formatBRL } from '@/lib/currency'
import type { Customer } from '@/domain/types'
import Button from '@/ui/Button'
import CustomerSelector from '@/components/customers/CustomerSelector'

type CartItem = {
  product_id: string | null
  variant_id?: string | null
  sku: string
  nome: string
  preco: number
  qtde: number
}

type Props = {
  cart: CartItem[]
  total: number
  companyId: string
  storeId: string
  onSuccess: () => void
  onClose: () => void
}

type Step = 'cliente' | 'parcelas'

export default function CrediarioSellModal({ cart, total, companyId, storeId, onSuccess, onClose }: Props) {
  const [step, setStep] = useState<Step>('cliente')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [entrada, setEntrada] = useState('0')
  const [numParcelas, setNumParcelas] = useState('3')
  const [primeiraVenc, setPrimeiraVenc] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const entradaNum = useMemo(() => {
    const v = Number(entrada.replace(',', '.'))
    return isNaN(v) ? 0 : v
  }, [entrada])

  const parcelasNum = useMemo(() => Math.max(1, parseInt(numParcelas) || 1), [numParcelas])
  const valorParc = useMemo(() => {
    const restante = total - entradaNum
    if (restante <= 0 || parcelasNum <= 0) return 0
    return restante / parcelasNum
  }, [total, entradaNum, parcelasNum])

  async function finalize() {
    if (!customer) return
    setLoading(true)
    setError(null)
    try {
      const { saleId, persisted } = await createSaleWithItems({
        storeId,
        customerId: customer.id,
        total,
        status: 'PENDENTE',
        items: cart.map(i => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? null,
          qtde: i.qtde,
          preco_unit: i.preco,
          desconto: 0,
        })),
      })

      if (persisted) {
        const { error: credErr } = await criarCrediario({
          companyId,
          storeId,
          customerId: customer.id,
          valorTotal: total,
          entrada: entradaNum,
          numParcelas: parcelasNum,
          primeiraVenc,
        })
        if (credErr) throw new Error(credErr)
      }

      onSuccess()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Falha ao criar crediário.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md lg:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Venda no Crediário</div>
          <button onClick={onClose} className="text-slate-400 text-sm">fechar</button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className={`px-2 py-1 rounded-full ${step === 'cliente' ? 'bg-primary text-white' : 'bg-zinc-100 text-slate-400'}`}>1. Cliente</span>
          <span className="text-slate-400">→</span>
          <span className={`px-2 py-1 rounded-full ${step === 'parcelas' ? 'bg-primary text-white' : 'bg-zinc-100 text-slate-400'}`}>2. Parcelas</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-slate-400 text-xs mb-1">Total da venda</div>
          <div className="text-xl font-semibold text-navy">{formatBRL(total)}</div>
        </div>

        {step === 'cliente' && (
          <>
            <CustomerSelector
              companyId={companyId}
              onSelect={c => { setCustomer(c); setStep('parcelas') }}
              onClose={onClose}
            />
          </>
        )}

        {step === 'parcelas' && customer && (
          <>
            <div className="rounded-2xl border p-3 bg-emerald-50 text-sm space-y-1">
              <div className="font-semibold">{customer.nome}</div>
              <div className="text-slate-400">{customer.cpf_cnpj || 'Sem CPF'}</div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-400 mb-1">Entrada (R$)</div>
                <input
                  value={entrada}
                  onChange={e => setEntrada(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                  placeholder="0,00"
                />
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Número de parcelas</div>
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 6, 10, 12].map(n => (
                    <button
                      key={n}
                      onClick={() => setNumParcelas(String(n))}
                      className={`flex-1 py-2 rounded-xl border text-sm font-medium ${parcelasNum === n ? 'bg-primary text-white' : 'hover:bg-zinc-50'}`}
                    >
                      {n}x
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">1ª parcela em</div>
                <input
                  type="date"
                  value={primeiraVenc}
                  onChange={e => setPrimeiraVenc(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                />
              </div>
            </div>

            <div className="rounded-2xl border bg-zinc-50 p-3 text-sm space-y-1">
              {entradaNum > 0 && <div className="flex justify-between"><span className="text-slate-400">Entrada</span><b>{formatBRL(entradaNum)}</b></div>}
              <div className="flex justify-between"><span className="text-slate-400">Restante</span><b>{formatBRL(total - entradaNum)}</b></div>
              <div className="flex justify-between text-base font-semibold">
                <span>{parcelasNum}x de</span>
                <span className="text-emerald-700">{formatBRL(valorParc)}</span>
              </div>
            </div>

            {error && <div className="rounded-2xl border bg-amber-50 text-amber-900 p-3 text-sm">{error}</div>}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setStep('cliente')}>Voltar</Button>
              <Button onClick={finalize} disabled={loading || valorParc <= 0}>
                {loading ? 'Salvando...' : 'Confirmar'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
