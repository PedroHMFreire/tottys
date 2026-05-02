import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Customer, ScoreInterno } from '@/domain/types'
import Button from '@/ui/Button'

const SCORE_STYLE: Record<ScoreInterno, string> = {
  BOM:      'bg-emerald-100 text-emerald-700',
  REGULAR:  'bg-amber-100 text-amber-700',
  RUIM:     'bg-red-100 text-red-600',
  BLOQUEADO:'bg-zinc-200 text-zinc-500',
}

type Props = {
  companyId: string
  onSelect: (customer: Customer) => void
  onClose: () => void
}

export default function CustomerSelector({ companyId, onSelect, onClose }: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newCpf, setNewCpf] = useState('')
  const [newContato, setNewContato] = useState('')
  const [saving, setSaving] = useState(false)
  const debounce = useRef<number | null>(null)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (!q.trim()) { setResults([]); return }
    debounce.current = window.setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('customers')
        .select('id, nome, cpf_cnpj, contato, score_interno, limite_credito')
        .eq('company_id', companyId)
        .or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%`)
        .limit(10)
      setResults((data || []) as Customer[])
      setLoading(false)
    }, 300)
  }, [q, companyId])

  async function createAndSelect() {
    if (!newNome.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('customers')
      .insert({ company_id: companyId, nome: newNome.trim(), cpf_cnpj: newCpf.trim() || null, contato: newContato.trim() || null })
      .select()
      .single()
    setSaving(false)
    if (!error && data) onSelect(data as Customer)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          autoFocus
          placeholder="Buscar por nome ou CPF..."
          className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
        />
        <button onClick={onClose} className="text-slate-400 text-sm">cancelar</button>
      </div>

      {loading && <div className="text-xs text-slate-400">Buscando…</div>}

      {results.map(c => (
        <div
          key={c.id}
          onClick={() => onSelect(c)}
          className="flex items-center justify-between rounded-2xl border p-3 cursor-pointer hover:bg-zinc-50"
        >
          <div>
            <div className="font-medium text-sm">{c.nome}</div>
            <div className="text-xs text-slate-400">{c.cpf_cnpj || 'Sem CPF'}</div>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SCORE_STYLE[c.score_interno || 'BOM']}`}>
            {c.score_interno || 'BOM'}
          </span>
        </div>
      ))}

      {!showNew ? (
        <button
          onClick={() => setShowNew(true)}
          className="text-sm text-slate-400 hover:text-black underline"
        >
          + Cadastrar novo cliente
        </button>
      ) : (
        <div className="rounded-2xl border p-3 space-y-2 bg-zinc-50">
          <div className="text-xs font-semibold text-slate-600">Novo cliente</div>
          <input value={newNome} onChange={e => setNewNome(e.target.value)} placeholder="Nome *" className="w-full rounded-xl border px-3 py-2 text-sm" />
          <input value={newCpf} onChange={e => setNewCpf(e.target.value)} placeholder="CPF (opcional)" className="w-full rounded-xl border px-3 py-2 text-sm" />
          <input value={newContato} onChange={e => setNewContato(e.target.value)} placeholder="WhatsApp / Telefone" className="w-full rounded-xl border px-3 py-2 text-sm" />
          <Button onClick={createAndSelect} disabled={!newNome.trim() || saving}>
            {saving ? 'Salvando...' : 'Criar e Selecionar'}
          </Button>
        </div>
      )}
    </div>
  )
}
