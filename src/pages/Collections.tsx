import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import KPI from '@/ui/KPI'
import type { Collection } from '@/domain/types'

type CollectionWithStats = Collection & {
  produto_count?: number
  sell_through?: number
}

const STATUS_LABELS: Record<string, string> = {
  ATIVA: 'Ativa',
  ENCERRADA: 'Encerrada',
  RASCUNHO: 'Rascunho',
}
const STATUS_STYLE: Record<string, string> = {
  ATIVA: 'bg-emerald-100 text-emerald-700',
  ENCERRADA: 'bg-zinc-100 text-zinc-500',
  RASCUNHO: 'bg-amber-100 text-amber-700',
}

const TEMPORADAS = ['Verão', 'Inverno', 'Primavera/Outono', 'Carnaval', 'Natal', 'Volta às Aulas', 'Dia das Mães', 'Dia dos Pais', 'Black Friday']
const ANOS = [2024, 2025, 2026, 2027]

type FormState = {
  nome: string
  temporada: string
  ano: string
  status: 'ATIVA' | 'ENCERRADA' | 'RASCUNHO'
}

const EMPTY_FORM: FormState = { nome: '', temporada: '', ano: '', status: 'ATIVA' }

export default function Collections() {
  const { company } = useApp()
  const [collections, setCollections] = useState<CollectionWithStats[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!company?.id) return
    load()
  }, [company?.id])

  async function load() {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('collections')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
      setCollections((data || []) as Collection[])
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }

  function openEdit(col: Collection) {
    setEditId(col.id)
    setForm({
      nome: col.nome,
      temporada: col.temporada || '',
      ano: col.ano ? String(col.ano) : '',
      status: col.status,
    })
    setError(null)
    setShowForm(true)
  }

  async function save() {
    if (!form.nome.trim()) { setError('Informe o nome da coleção.'); return }
    if (!company?.id) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        company_id: company.id,
        nome: form.nome.trim(),
        temporada: form.temporada || null,
        ano: form.ano ? Number(form.ano) : null,
        status: form.status,
      }
      if (editId) {
        const { error } = await supabase.from('collections').update(payload).eq('id', editId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('collections').insert(payload)
        if (error) throw error
      }
      setShowForm(false)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta coleção? Os produtos vinculados não serão excluídos.')) return
    const { error } = await supabase.from('collections').delete().eq('id', id)
    if (!error) load()
  }

  const ativas = collections.filter(c => c.status === 'ATIVA').length
  const encerradas = collections.filter(c => c.status === 'ENCERRADA').length

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-navy">Coleções</h1>
        <Button onClick={openNew}>+ Nova Coleção</Button>
      </div>

      {!company?.id && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3">
          Selecione uma empresa para gerenciar coleções.
        </div>
      )}

      <section className="grid grid-cols-2 gap-2">
        <KPI label="Coleções ativas" value={String(ativas)} />
        <KPI label="Encerradas" value={String(encerradas)} />
      </section>

      {loading ? (
        <div className="text-sm text-slate-400 py-4 text-center">Carregando…</div>
      ) : collections.length === 0 ? (
        <Card title="Sem coleções">
          <div className="text-sm text-slate-400">
            Crie coleções para organizar seus produtos por temporada (Verão 2026, Inverno 2025, etc.) e acompanhar o desempenho de cada uma.
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {collections.map(col => (
            <div key={col.id} className="rounded-2xl border bg-white p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{col.nome}</div>
                  <div className="text-xs text-zinc-500">
                    {[col.temporada, col.ano].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[col.status]}`}>
                  {STATUS_LABELS[col.status]}
                </span>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => openEdit(col)}>Editar</Button>
                <button
                  onClick={() => remove(col.id)}
                  className="text-xs text-red-500 hover:underline"
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">{editId ? 'Editar Coleção' : 'Nova Coleção'}</div>
              <button onClick={() => setShowForm(false)} className="text-zinc-500">fechar</button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Nome *</div>
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white w-full"
                  placeholder="Ex.: Verão 2026"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Temporada</div>
                  <select
                    value={form.temporada}
                    onChange={e => setForm(f => ({ ...f, temporada: e.target.value }))}
                    className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-azure transition-colors bg-white w-full"
                  >
                    <option value="">Selecione</option>
                    {TEMPORADAS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Ano</div>
                  <select
                    value={form.ano}
                    onChange={e => setForm(f => ({ ...f, ano: e.target.value }))}
                    className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-azure transition-colors bg-white w-full"
                  >
                    <option value="">—</option>
                    {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500 mb-1">Status</div>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-azure transition-colors bg-white w-full"
                >
                  <option value="RASCUNHO">Rascunho</option>
                  <option value="ATIVA">Ativa</option>
                  <option value="ENCERRADA">Encerrada</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3">{error}</div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
