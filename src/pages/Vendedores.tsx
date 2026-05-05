// src/pages/Vendedores.tsx
// /adm/vendedores — Cadastro de vendedores (sem auth obrigatório)
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { Plus, Pencil, ToggleLeft, ToggleRight, Trash2, X, Loader2 } from 'lucide-react'

type Store    = { id: string; nome: string }
type Vendedor = {
  id: string; nome: string; apelido: string | null
  store_id: string | null; ativo: boolean; user_id: string | null
  stores?: { nome: string } | null
}

const EMPTY_FORM = { nome: '', apelido: '', store_id: '', ativo: true }

export default function Vendedores() {
  const { company } = useApp()
  const [list, setList]       = useState<Vendedor[]>([])
  const [stores, setStores]   = useState<Store[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<Vendedor | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function load() {
    if (!company?.id) { setList([]); return }
    setLoading(true)
    const { data } = await supabase
      .from('vendedores')
      .select('id, nome, apelido, store_id, ativo, user_id, stores(nome)')
      .eq('company_id', company.id)
      .order('nome')
    setList((data ?? []) as unknown as Vendedor[])
    setLoading(false)
  }

  useEffect(() => {
    if (!company?.id) { setStores([]); return }
    supabase.from('stores').select('id, nome').eq('company_id', company.id).order('nome')
      .then(({ data }) => setStores((data ?? []) as Store[]))
  }, [company?.id])

  useEffect(() => { load() }, [company?.id])

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }

  function openEdit(v: Vendedor) {
    setEditing(v)
    setForm({ nome: v.nome, apelido: v.apelido ?? '', store_id: v.store_id ?? '', ativo: v.ativo })
    setError(null)
    setShowForm(true)
  }

  async function save() {
    if (!form.nome.trim() || !company?.id) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        company_id: company.id,
        nome: form.nome.trim(),
        apelido: form.apelido.trim() || null,
        store_id: form.store_id || null,
        ativo: form.ativo,
      }
      if (editing) {
        const { error: e } = await supabase.from('vendedores').update(payload).eq('id', editing.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('vendedores').insert(payload)
        if (e) throw e
      }
      setShowForm(false)
      load()
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAtivo(v: Vendedor) {
    await supabase.from('vendedores').update({ ativo: !v.ativo }).eq('id', v.id)
    load()
  }

  async function confirmDelete() {
    if (!deleteId) return
    await supabase.from('vendedores').delete().eq('id', deleteId)
    setDeleteId(null)
    load()
  }

  if (!company?.id) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        Selecione uma empresa para gerenciar vendedores.
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Vendedores</h1>
          <p className="text-sm text-slate-500 mt-0.5">Cadastre vendedores sem necessidade de conta no sistema.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-azure-dark transition-colors cursor-pointer shadow-sm"
        >
          <Plus size={15} /> Novo vendedor
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-slate-200 rounded-2xl">
          Nenhum vendedor cadastrado ainda.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
          <div className="divide-y divide-slate-100">
            {list.map(v => (
              <div key={v.id} className={`flex items-center gap-3 px-4 py-3.5 ${!v.ativo ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 text-sm">{v.nome}</span>
                    {v.apelido && (
                      <span className="text-xs text-slate-400">({v.apelido})</span>
                    )}
                    {!v.ativo && (
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">
                        Inativo
                      </span>
                    )}
                    {v.user_id && (
                      <span className="text-[10px] font-semibold bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded-full">
                        Com acesso
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {(v.stores as any)?.nome ?? 'Todas as lojas'}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleAtivo(v)}
                    aria-label={v.ativo ? 'Desativar' : 'Ativar'}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {v.ativo ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} />}
                  </button>
                  <button
                    onClick={() => openEdit(v)}
                    aria-label="Editar"
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteId(v.id)}
                    aria-label="Excluir"
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de formulário */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4">
          <div className="w-full sm:max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                {editing ? 'Editar vendedor' : 'Novo vendedor'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Nome completo *</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex.: João Silva"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-azure transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Apelido / Nome PDV</label>
                <input
                  value={form.apelido}
                  onChange={e => setForm(f => ({ ...f, apelido: e.target.value }))}
                  placeholder="Ex.: João (aparece no PDV)"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-azure transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Loja</label>
                <select
                  value={form.store_id}
                  onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-azure cursor-pointer transition-colors"
                >
                  <option value="">Todas as lojas</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-slate-700">Vendedor ativo</span>
              </label>
            </div>

            {error && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={!form.nome.trim() || saving}
                className="flex-1 h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-azure-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {editing ? 'Salvar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {deleteId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="w-full sm:max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <p className="text-sm font-medium text-slate-800">Excluir este vendedor? As vendas já registradas não serão afetadas.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 h-11 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 h-11 rounded-xl bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 cursor-pointer transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
