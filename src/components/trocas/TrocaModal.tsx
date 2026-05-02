import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatBRL } from '@/lib/currency'
import type { Customer } from '@/domain/types'
import Button from '@/ui/Button'
import CustomerSelector from '@/components/customers/CustomerSelector'

type TrocaItem = {
  product_id: string | null
  variant_id: string | null
  sku: string
  nome: string
  qtde: number
  preco_unit: number
  motivo: 'DEFEITO' | 'TAMANHO_ERRADO' | 'NAO_GOSTOU' | 'OUTRO'
}

const MOTIVOS: Record<TrocaItem['motivo'], string> = {
  DEFEITO:         'Defeito',
  TAMANHO_ERRADO:  'Tamanho errado',
  NAO_GOSTOU:      'Não gostou',
  OUTRO:           'Outro',
}

type Props = {
  companyId: string
  storeId: string
  onSuccess: (msg: string) => void
  onClose: () => void
}

type Step = 'itens' | 'finalizacao'
type SearchResult = { id: string; nome: string; sku: string; preco: number; has_variants: boolean }

export default function TrocaModal({ companyId, storeId, onSuccess, onClose }: Props) {
  const [step, setStep] = useState<Step>('itens')
  const [items, setItems] = useState<TrocaItem[]>([])

  // busca de produto
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const debounce = useRef<number | null>(null)

  // item manual
  const [manualNome, setManualNome] = useState('')
  const [manualPreco, setManualPreco] = useState('')
  const [showManual, setShowManual] = useState(false)

  // step 2
  const [tipo, setTipo] = useState<'TROCA' | 'DEVOLUCAO'>('TROCA')
  const [forma, setForma] = useState<'CREDITO' | 'DINHEIRO'>('CREDITO')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [showCustomerSelector, setShowCustomerSelector] = useState(false)
  const [obs, setObs] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valorTotal = items.reduce((a, i) => a + i.preco_unit * i.qtde, 0)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (!q.trim()) { setResults([]); return }
    debounce.current = window.setTimeout(async () => {
      setLoadingSearch(true)
      const { data } = await supabase
        .from('products')
        .select('id, nome, sku, preco, has_variants')
        .eq('company_id', companyId)
        .or(`nome.ilike.%${q}%,sku.ilike.%${q}%`)
        .limit(8)
      setResults((data || []) as SearchResult[])
      setLoadingSearch(false)
    }, 300)
  }, [q])

  function addFromSearch(p: SearchResult) {
    setItems(prev => [...prev, {
      product_id: p.id,
      variant_id: null,
      sku: p.sku,
      nome: p.nome,
      qtde: 1,
      preco_unit: p.preco,
      motivo: 'NAO_GOSTOU',
    }])
    setQ('')
    setResults([])
  }

  function addManual() {
    if (!manualNome.trim()) return
    setItems(prev => [...prev, {
      product_id: null,
      variant_id: null,
      sku: '',
      nome: manualNome.trim(),
      qtde: 1,
      preco_unit: Number(manualPreco.replace(',', '.')) || 0,
      motivo: 'NAO_GOSTOU',
    }])
    setManualNome('')
    setManualPreco('')
    setShowManual(false)
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, patch: Partial<TrocaItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  async function finalize() {
    if (items.length === 0) { setError('Adicione ao menos um item.'); return }
    if (forma === 'CREDITO' && !customer) { setError('Selecione o cliente para crédito em conta.'); return }
    setLoading(true)
    setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('registrar_troca', {
        p_company_id:      companyId,
        p_store_id:        storeId,
        p_customer_id:     customer?.id ?? null,
        p_tipo:            tipo,
        p_forma_devolucao: forma,
        p_valor_total:     valorTotal,
        p_observacoes:     obs.trim() || null,
        p_items:           items.map(i => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          sku:        i.sku,
          nome:       i.nome,
          qtde:       i.qtde,
          preco_unit: i.preco_unit,
          motivo:     i.motivo,
        })),
      })
      if (rpcErr) throw new Error(rpcErr.message)
      const msg = forma === 'CREDITO'
        ? `${tipo === 'TROCA' ? 'Troca' : 'Devolução'} registrada! Crédito de ${formatBRL(valorTotal)} adicionado ao cliente.`
        : `${tipo === 'TROCA' ? 'Troca' : 'Devolução'} registrada! Devolver ${formatBRL(valorTotal)} em dinheiro ao cliente.`
      onSuccess(msg)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Erro ao registrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md lg:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Troca / Devolução</div>
          <button onClick={onClose} className="text-slate-400 text-sm">fechar</button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 text-xs">
          <span className={`px-2 py-1 rounded-full ${step === 'itens' ? 'bg-primary text-white' : 'bg-zinc-100 text-slate-400'}`}>1. Itens</span>
          <span className="text-slate-400">→</span>
          <span className={`px-2 py-1 rounded-full ${step === 'finalizacao' ? 'bg-primary text-white' : 'bg-zinc-100 text-slate-400'}`}>2. Finalizar</span>
        </div>

        {/* STEP 1: Itens */}
        {step === 'itens' && (
          <>
            {/* Busca */}
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Buscar produto devolvido</div>
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Nome ou SKU..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
              />
              {loadingSearch && <div className="text-xs text-slate-400">Buscando…</div>}
              {results.map(r => (
                <div
                  key={r.id}
                  onClick={() => addFromSearch(r)}
                  className="flex items-center justify-between rounded-2xl border p-3 cursor-pointer hover:bg-zinc-50 text-sm"
                >
                  <div>
                    <div className="font-medium">{r.nome}</div>
                    <div className="text-xs text-slate-400">{r.sku} · {formatBRL(r.preco)}</div>
                  </div>
                  <span className="text-slate-400 text-xs">+ adicionar</span>
                </div>
              ))}
            </div>

            {/* Manual */}
            {!showManual ? (
              <button onClick={() => setShowManual(true)} className="text-sm text-slate-400 hover:text-black underline">
                + Item manual (sem cadastro)
              </button>
            ) : (
              <div className="rounded-2xl border p-3 space-y-2 bg-zinc-50">
                <div className="text-xs font-semibold text-slate-600">Item manual</div>
                <input value={manualNome} onChange={e => setManualNome(e.target.value)} placeholder="Nome do produto *" className="w-full rounded-xl border px-3 py-2 text-sm" />
                <input value={manualPreco} onChange={e => setManualPreco(e.target.value)} placeholder="Preço (ex: 89,90)" className="w-full rounded-xl border px-3 py-2 text-sm" />
                <Button onClick={addManual} disabled={!manualNome.trim()}>Adicionar</Button>
              </div>
            )}

            {/* Lista de itens adicionados */}
            {items.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-slate-400 font-medium">Itens a devolver ({items.length})</div>
                {items.map((it, i) => (
                  <div key={i} className="rounded-2xl border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm truncate">{it.nome}</div>
                      <button onClick={() => removeItem(i)} className="text-red-400 text-xs hover:text-red-600 ml-2 shrink-0">remover</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Qtde</div>
                        <input
                          type="number"
                          min={1}
                          value={it.qtde}
                          onChange={e => updateItem(i, { qtde: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="w-full rounded-xl border px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Preço unit.</div>
                        <input
                          value={String(it.preco_unit).replace('.', ',')}
                          onChange={e => updateItem(i, { preco_unit: Number(e.target.value.replace(',', '.')) || 0 })}
                          className="w-full rounded-xl border px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Motivo</div>
                        <select
                          value={it.motivo}
                          onChange={e => updateItem(i, { motivo: e.target.value as TrocaItem['motivo'] })}
                          className="w-full rounded-xl border px-2 py-1.5 text-sm"
                        >
                          {Object.entries(MOTIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold px-1">
                  <span>Total a devolver</span>
                  <span>{formatBRL(valorTotal)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sticky bottom-0 bg-white pt-2">
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button onClick={() => setStep('finalizacao')} disabled={items.length === 0}>
                Próximo
              </Button>
            </div>
          </>
        )}

        {/* STEP 2: Finalização */}
        {step === 'finalizacao' && (
          <>
            {/* Resumo */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
              <div className="text-slate-400 text-xs">{items.length} item(s)</div>
              <div className="text-xl font-semibold text-navy">{formatBRL(valorTotal)}</div>
            </div>

            {/* Tipo */}
            <div>
              <div className="text-xs text-slate-400 mb-2">Tipo</div>
              <div className="grid grid-cols-2 gap-2">
                {(['TROCA', 'DEVOLUCAO'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTipo(t)}
                    className={`py-2 rounded-xl border text-sm font-medium ${tipo === t ? 'bg-primary text-white' : 'border-zinc-200 text-slate-600'}`}
                  >
                    {t === 'TROCA' ? 'Troca' : 'Devolução'}
                  </button>
                ))}
              </div>
            </div>

            {/* Forma devolução */}
            <div>
              <div className="text-xs text-slate-400 mb-2">Como devolver o valor</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setForma('CREDITO')}
                  className={`py-2 rounded-xl border text-sm font-medium ${forma === 'CREDITO' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-200 text-zinc-600'}`}
                >
                  Crédito em conta
                </button>
                <button
                  onClick={() => { setForma('DINHEIRO'); setCustomer(null) }}
                  className={`py-2 rounded-xl border text-sm font-medium ${forma === 'DINHEIRO' ? 'bg-primary text-white' : 'border-zinc-200 text-slate-600'}`}
                >
                  Dinheiro
                </button>
              </div>
            </div>

            {/* Cliente (obrigatório para crédito) */}
            {forma === 'CREDITO' && (
              <div>
                <div className="text-xs text-slate-400 mb-2">Cliente {forma === 'CREDITO' && <span className="text-red-400">*</span>}</div>
                {customer ? (
                  <div className="rounded-2xl border bg-emerald-50 p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{customer.nome}</div>
                      <div className="text-xs text-slate-400">{customer.cpf_cnpj || 'Sem CPF'}</div>
                    </div>
                    <button onClick={() => setCustomer(null)} className="text-xs text-slate-400 hover:underline">trocar</button>
                  </div>
                ) : showCustomerSelector ? (
                  <CustomerSelector
                    companyId={companyId}
                    onSelect={c => { setCustomer(c); setShowCustomerSelector(false) }}
                    onClose={() => setShowCustomerSelector(false)}
                  />
                ) : (
                  <button
                    onClick={() => setShowCustomerSelector(true)}
                    className="w-full rounded-2xl border border-dashed p-3 text-sm text-slate-400 hover:bg-zinc-50"
                  >
                    + Selecionar cliente
                  </button>
                )}
              </div>
            )}

            {/* Observações */}
            <div>
              <div className="text-xs text-slate-400 mb-1">Observações</div>
              <textarea
                value={obs}
                onChange={e => setObs(e.target.value)}
                rows={2}
                placeholder="Ex: produto com etiqueta, nota fiscal nº..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white resize-none"
              />
            </div>

            {error && <div className="rounded-2xl border bg-amber-50 text-amber-900 p-3 text-sm">{error}</div>}

            <div className="grid grid-cols-2 gap-2 sticky bottom-0 bg-white pt-2">
              <Button variant="ghost" onClick={() => setStep('itens')}>Voltar</Button>
              <Button onClick={finalize} disabled={loading || (forma === 'CREDITO' && !customer)}>
                {loading ? 'Registrando...' : 'Confirmar'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
