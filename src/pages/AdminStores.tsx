import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import Button from '@/ui/Button'
import Card from '@/ui/Card'

type StoreRow = {
  id: string
  company_id: string
  nome: string
  uf: string
  ambiente_fiscal?: string | null
}

export default function AdminStores() {
  const { company } = useApp()
  const [list, setList] = useState<StoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [showNew, setShowNew] = useState(false)
  const [nome, setNome] = useState('')
  const [uf, setUf] = useState('')
  const [ambiente, setAmbiente] = useState<'homologacao' | 'producao'>('homologacao')
  const [saving, setSaving] = useState(false)

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

  async function createStore() {
    if (!company?.id) { setError('Selecione a empresa.'); return }
    if (!nome.trim()) { setError('Informe o nome da loja.'); return }
    if (!uf.trim()) { setError('Informe o UF.'); return }
    setSaving(true); setError(null); setMsg(null)
    try {
      const rpc = await supabase.rpc('create_store', {
        p_company_id: company.id,
        p_nome: nome.trim(),
        p_uf: uf.trim().toUpperCase(),
        p_ambiente: ambiente,
      })
      if (rpc.error) {
        const { data, error } = await supabase
          .from('stores')
          .insert({
            company_id: company.id,
            nome: nome.trim(),
            uf: uf.trim().toUpperCase(),
            ambiente_fiscal: ambiente,
          })
          .select('id, company_id, nome, uf, ambiente_fiscal')
          .single()
        if (error) throw error
        setList(prev => [...prev, data as StoreRow])
      } else {
        await load()
      }
      setNome(''); setUf(''); setAmbiente('homologacao'); setShowNew(false)
      setMsg('Loja criada.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível criar a loja.')
    } finally {
      setSaving(false)
    }
  }

  async function updateStore(id: string, field: keyof StoreRow, value: string) {
    setError(null); setMsg(null)
    try {
      const payload: any = { [field]: value }
      if (field === 'nome' && !value.trim()) throw new Error('Nome não pode ficar vazio.')
      const { error } = await supabase.from('stores').update(payload).eq('id', id)
      if (error) throw error
      setList(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
      setMsg('Loja atualizada.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível atualizar.')
    }
  }

  async function removeStore(id: string) {
    if (!confirm('Remover loja? Esta ação é irreversível.')) return
    setError(null); setMsg(null)
    try {
      const { error } = await supabase.from('stores').delete().eq('id', id)
      if (error) throw error
      setList(prev => prev.filter(s => s.id !== id))
      setMsg('Loja removida.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível remover.')
    }
  }

  return (
    <div className="pb-24 max-w-md mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lojas</h1>
        <Button onClick={() => setShowNew(true)}>Nova loja</Button>
      </div>

      {error && <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">{error}</div>}
      {msg && <div className="rounded-2xl border p-3 bg-emerald-50 text-emerald-900 text-sm">{msg}</div>}

      <Card title="Lista">
        {loading ? (
          <div className="text-sm text-zinc-500">Carregando…</div>
        ) : list.length === 0 ? (
          <div className="text-sm text-zinc-500">Nenhuma loja cadastrada.</div>
        ) : (
          <div className="space-y-3">
            {list.map(s => (
              <div key={s.id} className="rounded-2xl border p-3 space-y-2">
                <div className="text-xs text-zinc-500">ID: {s.id}</div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Nome</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    defaultValue={s.nome}
                    onBlur={e => updateStore(s.id, 'nome', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">UF</div>
                    <input
                      className="w-full rounded-xl border px-3 py-2"
                      defaultValue={s.uf}
                      onBlur={e => updateStore(s.id, 'uf', e.target.value.toUpperCase())}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Ambiente</div>
                    <select
                      className="w-full rounded-xl border px-3 py-2"
                      defaultValue={s.ambiente_fiscal || 'homologacao'}
                      onChange={e => updateStore(s.id, 'ambiente_fiscal', e.target.value)}
                    >
                      <option value="homologacao">Homologação</option>
                      <option value="producao">Produção</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button className="bg-zinc-800" onClick={() => removeStore(s.id)}>Remover</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Nova loja</div>
              <button className="text-zinc-500" onClick={() => setShowNew(false)}>fechar</button>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Nome *</div>
              <input className="w-full rounded-xl border px-3 py-2" value={nome} onChange={e => setNome(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-zinc-500 mb-1">UF *</div>
                <input className="w-full rounded-xl border px-3 py-2" value={uf} onChange={e => setUf(e.target.value)} placeholder="Ex.: MA" />
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Ambiente</div>
                <select className="w-full rounded-xl border px-3 py-2" value={ambiente} onChange={e => setAmbiente(e.target.value as any)}>
                  <option value="homologacao">Homologação</option>
                  <option value="producao">Produção</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button className="bg-zinc-800" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button onClick={createStore} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
