import { useEffect, useMemo, useState } from 'react'
import Button from '@/ui/Button'
import { calcCard, type CardRule } from '@/domain/payments/calc'
import { formatBRL } from '@/lib/currency'

type Props = {
  total: number
  rules: CardRule[]
  onClose: () => void
  onConfirm: (result: {
    meio: 'PIX' | 'DINHEIRO' | 'CARTAO'
    brand?: string
    mode?: 'DEBITO' | 'CREDITO_VISTA' | 'CREDITO_PARC'
    installments?: number
    installment_value?: number
    mdr_pct?: number
    fee_fixed?: number
    fee_total?: number
    interest_pct_monthly?: number
    interest_total?: number
    gross?: number
    net?: number
  }) => void
}

export default function PayModal({ total, rules, onClose, onConfirm }: Props) {
  // Passo 1 — Meio
  const [meio, setMeio] = useState<'PIX'|'DINHEIRO'|'CARTAO'>('CARTAO')

  // Passo 2 — Detalhes do cartão (se CARTAO)
  const [brand, setBrand] = useState<string>('')
  const [mode, setMode] = useState<'DEBITO' | 'CREDITO_VISTA' | 'CREDITO_PARC'>('CREDITO_PARC')
  const [installments, setInstallments] = useState(3)
  const [whoPaysInterest, setWhoPaysInterest] = useState<'CLIENT'|'MERCHANT'>('CLIENT')

  // Novo: Pagamento misto
  const [mixed, setMixed] = useState(false)
  const [amount, setAmount] = useState<number>(total) // valor desta cobrança
  const [error, setError] = useState<string>('')

  useEffect(() => { setAmount(total) }, [total])

  // opções de bandeira e modos
  const brands = useMemo(() => Array.from(new Set(rules.map(r => r.brand))), [rules])
  const modesForBrand = useMemo(
    () => brand ? Array.from(new Set(rules.filter(r => r.brand === brand).map(r => r.mode))) : [],
    [rules, brand]
  )
  const rule = useMemo<CardRule | null>(
    () => rules.find(r => r.brand === brand && r.mode === mode) || null,
    [rules, brand, mode]
  )

  // inicia marca/modo
  useEffect(() => { if (!brand && brands[0]) setBrand(brands[0]) }, [brands, brand])
  useEffect(() => {
    if (brand && modesForBrand.length && !modesForBrand.includes(mode)) {
      setMode(modesForBrand[0] as any)
    }
  }, [brand, modesForBrand, mode])

  // força 1x quando não é parcelado
  useEffect(() => { if (mode !== 'CREDITO_PARC') setInstallments(1) }, [mode])

  // cálculo (usa "amount" quando misto; senão, total)
  const priceToCharge = mixed ? amount : total

  const card = useMemo(() => {
    if (meio !== 'CARTAO' || !rule) return null
    try {
      setError('')
      return calcCard({
        price: priceToCharge,
        installments,
        rule,
        whoPaysInterest
      })
    } catch (e: any) {
      setError(e.message || 'Erro no cálculo')
      return null
    }
  }, [meio, rule, priceToCharge, installments, whoPaysInterest])

  function isAmountValid() {
    if (!mixed) return true
    if (priceToCharge <= 0) return false
    if (priceToCharge > total) return false
    return true
  }

  function handleConfirm() {
    if (!isAmountValid()) {
      setError('Valor inválido. Ajuste o “valor desta cobrança”.')
      return
    }
    // PIX/DINHEIRO (usa o valor desta cobrança)
    if (meio === 'PIX' || meio === 'DINHEIRO') {
      onConfirm({ meio, gross: priceToCharge, net: priceToCharge })
      return
    }
    // CARTÃO
    if (!rule || !card) return
    onConfirm({
      meio: 'CARTAO',
      brand: rule.brand,
      mode: rule.mode,
      installments: card.installments,
      installment_value: card.installmentValue,
      mdr_pct: card.mdrPct,
      fee_fixed: card.feeFixed,
      fee_total: card.feeTotal,
      interest_pct_monthly: card.interestMonthlyPct,
      interest_total: card.interestTotal,
      gross: card.gross,
      net: card.net,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md lg:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Pagamento</div>
          <button onClick={onClose} className="text-slate-400">fechar</button>
        </div>

        {/* Passo 1 — Meio */}
        <div>
          <div className="text-xs text-slate-400 mb-2">1) Escolha o meio</div>
          <div className="grid grid-cols-3 gap-2">
            {(['PIX','DINHEIRO','CARTAO'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMeio(m)}
                className={`py-2 rounded-2xl border ${meio===m ? 'border-[#1E40AF] font-semibold text-[#1E40AF]' : 'border-zinc-300 text-slate-600'}`}
              >{m}</button>
            ))}
          </div>
        </div>

        {/* Pagamento misto */}
        <div className="rounded-2xl border p-3 bg-zinc-50">
          <div className="flex items-center justify-between">
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={mixed}
                onChange={e => { setMixed(e.target.checked); setAmount(total) }}
              />
              Pagamento misto (dividir em mais de 1 meio)
            </label>
            <div className="text-sm">Total restante: <b>{formatBRL(total)}</b></div>
          </div>

          {mixed && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="text-sm text-slate-600 self-center">Valor desta cobrança</div>
              <input
                type="number" step="0.01" min={0.01} max={total}
                value={amount}
                onChange={e => setAmount(Number(e.target.value))}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] transition-colors bg-white"
              />
            </div>
          )}
        </div>

        {/* Passo 2 — Detalhes */}
        {meio === 'CARTAO' ? (
          <>
            <div className="text-xs text-slate-400">2) Detalhes do cartão</div>

            {rules.length === 0 ? (
              <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">
                Nenhuma regra de cartão configurada.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <select value={brand} onChange={e=>setBrand(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 bg-white">
                    {brands.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <select value={mode} onChange={e=>setMode(e.target.value as any)} className="rounded-xl border border-slate-200 px-3 py-2 bg-white">
                    {modesForBrand.map(m => <option key={m} value={m}>{m.replace('_',' ')}</option>)}
                  </select>
                </div>

                {mode === 'CREDITO_PARC' && rule && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={1}
                        max={rule.max_installments}
                        value={installments}
                        onChange={e=>setInstallments(Number(e.target.value))}
                        className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] transition-colors bg-white"
                        placeholder="Parcelas"
                      />
                      <select value={whoPaysInterest} onChange={e=>setWhoPaysInterest(e.target.value as any)} className="rounded-xl border border-slate-200 px-3 py-2 bg-white">
                        <option value="CLIENT">Juros: Cliente</option>
                        <option value="MERCHANT">Juros: Loja</option>
                      </select>
                    </div>
                  </>
                )}

                {!!error && <div className="text-sm text-red-600">{error}</div>}

                {card && (
                  <div className="rounded-2xl border p-3 bg-zinc-50">
                    {mixed && <div className="text-xs text-slate-400 mb-1">Baseado em {formatBRL(priceToCharge)} desta cobrança</div>}
                    <div className="text-sm">Parcela: <b>{formatBRL(card.installmentValue)}</b> × {card.installments}</div>
                    <div className="text-sm">Total cobrado: <b>{formatBRL(card.gross)}</b></div>
                    <div className="text-sm">Taxas (MDR + fixo): <b>{formatBRL(card.feeTotal)}</b></div>
                    {card.interestTotal > 0 && (
                      <div className="text-sm">Custo/Juros: <b>{formatBRL(card.interestTotal)}</b></div>
                    )}
                    <div className="text-sm">Líquido estimado: <b>{formatBRL(card.net)}</b></div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="rounded-2xl border p-3 bg-zinc-50">
            <div className="text-xs text-slate-400 mb-1">2) Revisar valor</div>
            <div className="text-sm">Esta cobrança: <b>{formatBRL(priceToCharge)}</b></div>
            {!mixed && <div className="text-xs text-slate-400">Será cobrado o total desta venda.</div>}
            {mixed && !isAmountValid() && (
              <div className="text-sm text-red-600 mt-1">Valor inválido (mín. R$ 0,01 e máx. {formatBRL(total)}).</div>
            )}
          </div>
        )}

        {/* Passo 3 — Confirmar */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={meio==='CARTAO' && (!rule || !!error) || !isAmountValid()}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  )
}
