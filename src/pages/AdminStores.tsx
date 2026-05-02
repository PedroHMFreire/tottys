import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { UF_LIST } from '@/lib/validators'
import { Plus, Pencil, Trash2, X, Check, Store } from 'lucide-react'

type StoreRow = {
  id: string
  company_id: string
  nome: string
  uf: string
  ambiente_fiscal?: string | null
}

type EditState = { nome: string; uf: string; ambiente: string }

export default function AdminStores() {
  const { company } = useApp()
  const [list, setList]           = useState<StoreRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [msg, setMsg]             = useState<string | null>(null)
  const [showNew, setShowNew]     = useState(false)
  const [nome, setNome]           = useState('')
  const [uf, setUf]               = useState('')
  const [ambiente, setAmbiente]   = useState<'homologacao' | 'producao'>('homologacao')
  const [saving, setSaving]       = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMap, setEditMap]     = useState<Record<string, EditState>>({})
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [removingId, setRemovingId]       = useState<string | null>(null)

  async function load() {
    if (!company?.id) return
    setLoading(true); setError(null)
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('id, company_id, nome, uf, ambiente_fiscal')
        .eq('company_id', company.id)
        .order('nome', { ascending: true })
      if (error) throw error
      setList((data || []) as StoreRow[])
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar lojas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [company?.id])

  function closeNew() {
    setShowNew(false); setNome(''); setUf(''); setAmbiente('homologacao'); setError(null)
  }

  async function createStore() {
    if (!company?.id) { setError('Empresa não identificada.'); return }
    if (!nome.trim())  { setError('Informe o nome da loja.'); return }
    if (!uf)           { setError('Selecione o estado (UF).'); return }

    const dup = list.find(s => s.nome.trim().toLowerCase() === nome.trim().toLowerCase() && s.uf === uf)
    if (dup) { setError('Já existe uma loja com este nome neste estado.'); return }

    setSaving(true); setError(null); setMsg(null)
    try {
      const { error } = await supabase.rpc('create_store', {
        p_company_id: company.id,
        p_nome:       nome.trim(),
        p_uf:         uf,
        p_ambiente:   ambiente,
      })
      if (error) throw error
      await load()
      closeNew()
      setMsg('Loja criada com sucesso.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível criar a loja.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(s: StoreRow) {
    setEditingId(s.id)
    setError(null); setMsg(null)
    setEditMap(prev => ({
      ...prev,
      [s.id]: { nome: s.nome, uf: s.uf, ambiente: s.ambiente_fiscal || 'homologacao' },
    }))
  }

  async function saveEdit(id: string) {
    const s = editMap[id]
    if (!s) return
    if (!s.nome.trim()) { setError('Nome não pode ficar vazio.'); return }
    if (!s.uf)          { setError('Selecione o estado (UF).'); return }
    setError(null); setMsg(null)
    try {
      const { error } = await supabase.from('stores').update({
        nome:           s.nome.trim(),
        uf:             s.uf,
        ambiente_fiscal: s.ambiente,
      }).eq('id', id)
      if (error) throw error
      setList(prev => prev.map(r => r.id === id
        ? { ...r, nome: s.nome.trim(), uf: s.uf, ambiente_fiscal: s.ambiente }
        : r
      ))
      setEditingId(null)
      setMsg('Loja atualizada.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível atualizar.')
    }
  }

  async function removeStore(id: string) {
    setRemovingId(id); setError(null); setMsg(null)
    try {
      const { error } = await supabase.from('stores').delete().eq('id', id)
      if (error) throw error
      setList(prev => prev.filter(s => s.id !== id))
      setConfirmRemove(null)
      setMsg('Loja removida.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível remover.')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Lojas</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {list.length > 0 ? `${list.length} loja${list.length !== 1 ? 's' : ''} cadastrada${list.length !== 1 ? 's' : ''}` : 'Nenhuma loja cadastrada'}
          </p>
        </div>
        <button
          onClick={() => { setShowNew(true); setError(null); setMsg(null) }}
          className="flex items-center gap-1.5 bg-primary hover:bg-azure-dark text-white text-sm font-medium px-3 py-2 rounded-xl transition-colors cursor-pointer"
        >
          <Plus size={14} strokeWidth={2.5} />
          Nova loja
        </button>
      </div>

      {/* Notices */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 text-rose-700 text-xs p-3">
          <X size={14} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {msg && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 text-xs p-3">
          <Check size={14} className="shrink-0 mt-0.5" />
          {msg}
        </div>
      )}

      {/* List */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-14 text-sm text-slate-400">
            Carregando lojas…
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2 text-slate-400">
            <Store size={28} strokeWidth={1.5} />
            <p className="text-sm">Nenhuma loja cadastrada.</p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-1 text-xs text-azure hover:underline cursor-pointer"
            >
              Criar primeira loja →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map(s => (
              <div key={s.id} className="p-4">
                {editingId === s.id ? (
                  /* ── Edit row ── */
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-1">
                        <label className="text-xs text-slate-400 mb-1 block">Nome *</label>
                        <input
                          autoFocus
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-azure transition-colors"
                          value={editMap[s.id]?.nome || ''}
                          onChange={e => setEditMap(p => ({ ...p, [s.id]: { ...p[s.id], nome: e.target.value } }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">Estado (UF) *</label>
                        <select
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-azure bg-white transition-colors cursor-pointer"
                          value={editMap[s.id]?.uf || ''}
                          onChange={e => setEditMap(p => ({ ...p, [s.id]: { ...p[s.id], uf: e.target.value } }))}
                        >
                          <option value="">— UF —</option>
                          {UF_LIST.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">Ambiente</label>
                        <select
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-azure bg-white transition-colors cursor-pointer"
                          value={editMap[s.id]?.ambiente || 'homologacao'}
                          onChange={e => setEditMap(p => ({ ...p, [s.id]: { ...p[s.id], ambiente: e.target.value } }))}
                        >
                          <option value="homologacao">Homologação</option>
                          <option value="producao">Produção</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => saveEdit(s.id)}
                        className="flex items-center gap-1 text-xs font-medium text-white bg-primary hover:bg-azure-dark px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        <Check size={12} />
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── View row ── */
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-navy-ghost border border-blue-200 flex items-center justify-center shrink-0">
                        <Store size={14} className="text-azure" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{s.nome}</div>
                        <div className="text-xs text-slate-400">
                          {s.uf} · {s.ambiente_fiscal === 'producao' ? 'Produção' : 'Homologação'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {confirmRemove === s.id ? (
                        <>
                          <span className="text-xs text-slate-500 mr-1">Remover?</span>
                          <button
                            onClick={() => removeStore(s.id)}
                            disabled={removingId === s.id}
                            className="text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {removingId === s.id ? '…' : 'Sim'}
                          </button>
                          <button
                            onClick={() => setConfirmRemove(null)}
                            className="text-xs text-slate-400 hover:text-slate-600 px-2.5 py-1 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            Não
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(s)}
                            aria-label="Editar loja"
                            className="p-1.5 text-slate-400 hover:text-azure hover:bg-navy-ghost rounded-lg transition-colors cursor-pointer"
                          >
                            <Pencil size={14} strokeWidth={1.75} />
                          </button>
                          <button
                            onClick={() => setConfirmRemove(s.id)}
                            aria-label="Remover loja"
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 size={14} strokeWidth={1.75} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New store modal */}
      {showNew && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) closeNew() }}
        >
          <div className="w-full sm:max-w-md lg:max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="font-semibold text-slate-800">Nova loja</div>
              <button
                onClick={closeNew}
                aria-label="Fechar"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 text-rose-700 text-xs p-3">
                  <X size={14} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Nome *</label>
                <input
                  autoFocus
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure transition-colors"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Ex.: Loja Centro"
                  onKeyDown={e => e.key === 'Enter' && createStore()}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1.5 block">Estado (UF) *</label>
                  <select
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure bg-white transition-colors cursor-pointer"
                    value={uf}
                    onChange={e => setUf(e.target.value)}
                  >
                    <option value="">— Selecione —</option>
                    {UF_LIST.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1.5 block">Ambiente</label>
                  <select
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure bg-white transition-colors cursor-pointer"
                    value={ambiente}
                    onChange={e => setAmbiente(e.target.value as 'homologacao' | 'producao')}
                  >
                    <option value="homologacao">Homologação</option>
                    <option value="producao">Produção</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={closeNew}
                className="flex-1 py-2.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={createStore}
                disabled={saving}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-primary hover:bg-azure-dark rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Salvando…' : 'Criar loja'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
