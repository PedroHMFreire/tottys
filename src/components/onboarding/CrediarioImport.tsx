import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatBRL } from '@/lib/currency'
import Button from '@/ui/Button'

type Entry = {
  id: string
  nomeCliente: string
  total: string
  parcelas: string
  primeiroVencimento: string
}

type Props = {
  companyId: string
  storeId?: string | null
  onDone: (count: number) => void
  onSkip: () => void
}

function newEntry(): Entry {
  const next30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  return { id: crypto.randomUUID(), nomeCliente: '', total: '', parcelas: '1', primeiroVencimento: next30 }
}

function parcValor(total: number, n: number, idx: number) {
  const base = Math.floor((total / n) * 100) / 100
  const resto = Math.round((total - base * n) * 100) / 100
  return idx === n - 1 ? Math.round((base + resto) * 100) / 100 : base
}

export default function CrediarioImport({ companyId, storeId, onDone, onSkip }: Props) {
  const [entries, setEntries] = useState<Entry[]>([newEntry()])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)
  const [imported, setImported] = useState(0)

  function update(id: string, field: keyof Entry, value: string) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e))
    setErrors(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function addEntry() { setEntries(prev => [...prev, newEntry()]) }
  function removeEntry(id: string) { setEntries(prev => prev.filter(e => e.id !== id)) }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    for (const e of entries) {
      if (!e.nomeCliente.trim()) { errs[e.id] = 'Informe o nome do cliente.'; continue }
      const total = parseFloat(e.total.replace(',', '.'))
      if (!total || total <= 0) { errs[e.id] = 'Valor inválido.'; continue }
      const n = parseInt(e.parcelas, 10)
      if (!n || n < 1 || n > 60) { errs[e.id] = 'Parcelas: entre 1 e 60.'; continue }
      if (!e.primeiroVencimento) { errs[e.id] = 'Informe o primeiro vencimento.'; continue }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function doImport() {
    if (!validate()) return
    setSaving(true)
    let count = 0

    for (const e of entries) {
      try {
        const total = parseFloat(e.total.replace(',', '.'))
        const n = parseInt(e.parcelas, 10)
        const baseDate = new Date(e.primeiroVencimento + 'T00:00:00')

        // 1. Cria ou busca cliente
        let customerId: string | null = null
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('company_id', companyId)
          .ilike('nome', e.nomeCliente.trim())
          .limit(1)
          .maybeSingle()

        if (existing?.id) {
          customerId = existing.id
        } else {
          const { data: newCust } = await supabase
            .from('customers')
            .insert({ company_id: companyId, nome: e.nomeCliente.trim(), score_interno: 'BOM' })
            .select('id')
            .single()
          customerId = newCust?.id ?? null
        }

        if (!customerId) continue

        // 2. Cria crediário
        const { data: cred } = await supabase
          .from('crediario_vendas')
          .insert({
            company_id:   companyId,
            store_id:     storeId || null,
            customer_id:  customerId,
            valor_total:  total,
            entrada:      0,
            num_parcelas: n,
            valor_parcela: Math.floor((total / n) * 100) / 100,
            status:       'ATIVA',
            observacoes:  'Saldo migrado na implantação',
          })
          .select('id')
          .single()

        if (!cred?.id) continue

        // 3. Cria parcelas com vencimentos mensais
        const parcelas = Array.from({ length: n }, (_, i) => {
          const venc = new Date(baseDate)
          venc.setMonth(venc.getMonth() + i)
          return {
            crediario_id: cred.id,
            company_id:   companyId,
            customer_id:  customerId!,
            num_parcela:  i + 1,
            valor:        parcValor(total, n, i),
            vencimento:   venc.toISOString().slice(0, 10),
            status:       'PENDENTE' as const,
          }
        })

        await supabase.from('crediario_parcelas').insert(parcelas)
        count++
      } catch {
        // silencia erros individuais, continua os outros
      }
    }

    setImported(count)
    setDone(true)
    setSaving(false)
  }

  if (done) return (
    <div className="space-y-4 text-center py-2">
      <div className="text-emerald-500 font-semibold text-base">{imported} crediário{imported !== 1 ? 's' : ''} migrado{imported !== 1 ? 's' : ''}!</div>
      <div className="text-sm text-zinc-500">
        As parcelas em aberto já aparecem no módulo de Crediário.
      </div>
      <Button onClick={() => onDone(imported)}>Continuar →</Button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <div className="text-2xl">📋</div>
        <div className="font-semibold text-lg">Crediário em aberto</div>
        <div className="text-sm text-zinc-500">
          Informe os clientes que já te devem. Só o saldo atual — sem precisar saber o histórico.
        </div>
      </div>

      <div className="space-y-3">
        {entries.map((e, idx) => (
          <div key={e.id} className={`rounded-2xl border p-3 space-y-2 ${errors[e.id] ? 'border-red-300 bg-red-50' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-medium">Cliente {idx + 1}</span>
              {entries.length > 1 && (
                <button onClick={() => removeEntry(e.id)} className="text-xs text-zinc-400 hover:text-red-500">remover</button>
              )}
            </div>

            <input
              value={e.nomeCliente}
              onChange={ev => update(e.id, 'nomeCliente', ev.target.value)}
              placeholder="Nome do cliente"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />

            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-xs text-zinc-500 mb-0.5">Total em aberto (R$)</div>
                <input
                  type="number" min="0" step="0.01"
                  value={e.total}
                  onChange={ev => update(e.id, 'total', ev.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-xl border px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-0.5">Parcelas restantes</div>
                <input
                  type="number" min="1" max="60"
                  value={e.parcelas}
                  onChange={ev => update(e.id, 'parcelas', ev.target.value)}
                  className="w-full rounded-xl border px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-0.5">1º vencimento</div>
                <input
                  type="date"
                  value={e.primeiroVencimento}
                  onChange={ev => update(e.id, 'primeiroVencimento', ev.target.value)}
                  className="w-full rounded-xl border px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            {/* Preview */}
            {e.total && parseFloat(e.total.replace(',', '.')) > 0 && parseInt(e.parcelas, 10) > 0 && (
              <div className="text-xs text-zinc-500">
                {parseInt(e.parcelas, 10)}x de {formatBRL(
                  Math.floor((parseFloat(e.total.replace(',', '.')) / parseInt(e.parcelas, 10)) * 100) / 100
                )} · total {formatBRL(parseFloat(e.total.replace(',', '.')))}
              </div>
            )}

            {errors[e.id] && (
              <div className="text-xs text-red-600">{errors[e.id]}</div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addEntry}
        className="w-full rounded-2xl border-2 border-dashed border-zinc-300 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
      >
        + Adicionar outro cliente
      </button>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onSkip}>Pular</Button>
        <Button onClick={doImport} disabled={saving}>
          {saving ? 'Salvando...' : 'Confirmar e salvar'}
        </Button>
      </div>
    </div>
  )
}
