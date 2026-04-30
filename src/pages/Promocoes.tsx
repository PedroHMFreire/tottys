import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import Button from '@/ui/Button'
import Card from '@/ui/Card'

type Promocao = {
  id: string
  nome: string
  descricao: string | null
  tipo: 'PERCENTUAL' | 'VALOR_FIXO'
  valor: number
  aplica_em: string
  collection_id: string | null
  valor_minimo_carrinho: number
  ativo: boolean
  data_inicio: string | null
  data_fim: string | null
  requer_perfil: string
}

type FormData = Omit<Promocao, 'id'>

const EMPTY: FormData = {
  nome: '', descricao: '', tipo: 'PERCENTUAL', valor: 0,
  aplica_em: 'TUDO', collection_id: null,
  valor_minimo_carrinho: 0, ativo: true,
  data_inicio: null, data_fim: null, requer_perfil: 'TODOS',
}

export default function Promocoes() {
  const { company } = useApp()
  const [items, setItems] = useState<Promocao[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Promocao | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collections, setCollections] = useState<Array<{ id: string; nome: string }>>([])

  useEffect(() => {
    if (company?.id) { load(); loadCollections() }
  }, [company?.id])

  async function load() {
    if (!company?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('promocoes')
      .select('*')
      .eq('company_id', company.id)
      .order('nome')
    setItems((data || []) as Promocao[])
    setLoading(false)
  }

  async function loadCollections() {
    if (!company?.id) return
    const { data } = await supabase
      .from('collections')
      .select('id, nome')
      .eq('company_id', company.id)
      .order('nome')
    setCollections((data || []) as any[])
  }

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY })
    setError(null)
    setShowForm(true)
  }

  function openEdit(p: Promocao) {
    setEditing(p)
    setForm({
      nome: p.nome, descricao: p.descricao || '', tipo: p.tipo,
      valor: p.valor, aplica_em: p.aplica_em, collection_id: p.collection_id,
      valor_minimo_carrinho: p.valor_minimo_carrinho, ativo: p.ativo,
      data_inicio: p.data_inicio, data_fim: p.data_fim, requer_perfil: p.requer_perfil,
    })
    setError(null)
    setShowForm(true)
  }

  async function save() {
    if (!form.nome.trim()) { setError('Informe o nome.'); return }
    if (!company?.id) return
    setSaving(true)
    setError(null)
    const payload = {
      company_id: company.id,
      nome: form.nome.trim(),
      descricao: form.descricao?.trim() || null,
      tipo: form.tipo,
      valor: Number(form.valor) || 0,
      aplica_em: form.aplica_em,
      collection_id: form.aplica_em === 'COLECAO' ? form.collection_id : null,
      valor_minimo_carrinho: Number(form.valor_minimo_carrinho) || 0,
      ativo: form.ativo,
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
      requer_perfil: form.requer_perfil,
    }
    try {
      if (editing) {
        const { error: e } = await supabase.from('promocoes').update(payload).eq('id', editing.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('promocoes').insert(payload)
        if (e) throw e
      }
      setShowForm(false)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAtivo(p: Promocao) {
    await supabase.from('promocoes').update({ ativo: !p.ativo }).eq('id', p.id)
    await load()
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta promoção?')) return
    await supabase.from('promocoes').delete().eq('id', id)
    await load()
  }

  function isExpired(p: Promocao) {
    if (!p.data_fim) return false
    return p.data_fim < new Date().toISOString().slice(0, 10)
  }

  function statusLabel(p: Promocao) {
    if (!p.ativo) return { label: 'Inativa', cls: 'bg-zinc-100 text-zinc-500' }
    if (isExpired(p)) return { label: 'Expirada', cls: 'bg-red-100 text-red-600' }
    return { label: 'Ativa', cls: 'bg-emerald-100 text-emerald-700' }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="sticky top-0 bg-white border-b px-4 py-3 z-10 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#1E1B4B]">Promoções</h1>
        <Button onClick={openNew}>+ Nova</Button>
      </div>

      <div className="px-4 mt-3 space-y-2">
        {!company?.id && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3">Selecione uma empresa.</div>
        )}
        {loading && <div className="text-sm text-slate-400 py-4 text-center">Carregando…</div>}
        {!loading && items.length === 0 && company?.id && (
          <div className="text-sm text-slate-400">Nenhuma promoção cadastrada.</div>
        )}

        {items.map(p => {
          const st = statusLabel(p)
          return (
            <div key={p.id} className="rounded-2xl border bg-white p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.nome}</div>
                  {p.descricao && <div className="text-xs text-zinc-500 truncate">{p.descricao}</div>}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
                <span className="bg-zinc-100 px-2 py-0.5 rounded-full">
                  {p.tipo === 'PERCENTUAL' ? `${p.valor}% off` : `- ${formatBRL(p.valor)}`}
                </span>
                {p.valor_minimo_carrinho > 0 && (
                  <span className="bg-zinc-100 px-2 py-0.5 rounded-full">Mín. {formatBRL(p.valor_minimo_carrinho)}</span>
                )}
                {p.aplica_em === 'COLECAO' && (
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">Por coleção</span>
                )}
                {p.requer_perfil !== 'TODOS' && (
                  <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Requer {p.requer_perfil}</span>
                )}
                {p.data_fim && (
                  <span className="bg-zinc-100 px-2 py-0.5 rounded-full">até {new Date(p.data_fim + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleAtivo(p)} className={`text-xs hover:underline ${p.ativo ? 'text-zinc-500' : 'text-emerald-600'}`}>
                  {p.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button onClick={() => openEdit(p)} className="text-xs text-zinc-500 hover:underline">Editar</button>
                <button onClick={() => remove(p.id)} className="text-xs text-red-400 hover:underline">Excluir</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between sticky top-0 bg-white pb-2">
              <div className="text-lg font-semibold">{editing ? 'Editar Promoção' : 'Nova Promoção'}</div>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 text-sm">fechar</button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Nome *</div>
                <input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Liquidação de Inverno" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] transition-colors bg-white w-full" />
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Descrição</div>
                <input value={form.descricao || ''} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Opcional" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] transition-colors bg-white w-full" />
              </div>

              <div>
                <div className="text-xs text-zinc-500 mb-2">Tipo de desconto</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setForm(p => ({ ...p, tipo: 'PERCENTUAL' }))} className={`py-2 rounded-xl border text-sm font-medium cursor-pointer transition-colors ${form.tipo === 'PERCENTUAL' ? 'bg-[#1E40AF] text-white border-[#1E40AF]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Percentual (%)</button>
                  <button onClick={() => setForm(p => ({ ...p, tipo: 'VALOR_FIXO' }))} className={`py-2 rounded-xl border text-sm font-medium cursor-pointer transition-colors ${form.tipo === 'VALOR_FIXO' ? 'bg-[#1E40AF] text-white border-[#1E40AF]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Valor fixo (R$)</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">{form.tipo === 'PERCENTUAL' ? 'Desconto (%)' : 'Desconto (R$)'}</div>
                  <input
                    type="number" min={0} max={form.tipo === 'PERCENTUAL' ? 100 : undefined}
                    value={form.valor}
                    onChange={e => setForm(p => ({ ...p, valor: Number(e.target.value) }))}
                    className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] transition-colors bg-white w-full"
                  />
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Valor mín. carrinho (R$)</div>
                  <input
                    type="number" min={0}
                    value={form.valor_minimo_carrinho}
                    onChange={e => setForm(p => ({ ...p, valor_minimo_carrinho: Number(e.target.value) }))}
                    className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] transition-colors bg-white w-full"
                  />
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500 mb-1">Aplica em</div>
                <select value={form.aplica_em} onChange={e => setForm(p => ({ ...p, aplica_em: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] transition-colors bg-white w-full">
                  <option value="TUDO">Tudo (qualquer produto)</option>
                  <option value="COLECAO">Coleção específica</option>
                </select>
              </div>

              {form.aplica_em === 'COLECAO' && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Coleção</div>
                  <select value={form.collection_id || ''} onChange={e => setForm(p => ({ ...p, collection_id: e.target.value || null }))} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] transition-colors bg-white w-full">
                    <option value="">Selecione...</option>
                    {collections.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              )}

              <div>
                <div className="text-xs text-zinc-500 mb-1">Requer perfil para aplicar</div>
                <select value={form.requer_perfil} onChange={e => setForm(p => ({ ...p, requer_perfil: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] transition-colors bg-white w-full">
                  <option value="TODOS">Todos (qualquer vendedor)</option>
                  <option value="GERENTE">Gerente ou superior</option>
                  <option value="ADMIN">Admin ou superior</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Início</div>
                  <input type="date" value={form.data_inicio || ''} onChange={e => setForm(p => ({ ...p, data_inicio: e.target.value || null }))} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] transition-colors bg-white w-full" />
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Fim</div>
                  <input type="date" value={form.data_fim || ''} onChange={e => setForm(p => ({ ...p, data_fim: e.target.value || null }))} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] transition-colors bg-white w-full" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input type="checkbox" checked={form.ativo} onChange={e => setForm(p => ({ ...p, ativo: e.target.checked }))} />
                Promoção ativa
              </label>
            </div>

            {error && <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3">{error}</div>}

            <div className="grid grid-cols-2 gap-2 sticky bottom-0 bg-white pt-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
