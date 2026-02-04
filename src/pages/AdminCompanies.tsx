import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Button from '@/ui/Button'
import Card from '@/ui/Card'

type Company = {
  id: string
  nome: string
  cnpj?: string | null
  regime_tributario?: string | null
}

export default function AdminCompanies() {
  const [list, setList] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [showNew, setShowNew] = useState(false)
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [regime, setRegime] = useState('')
  const [createStore, setCreateStore] = useState(true)
  const [storeName, setStoreName] = useState('Loja Principal')
  const [storeUf, setStoreUf] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, nome, cnpj, regime_tributario')
        .order('nome', { ascending: true })
      if (error) throw error
      setList((data || []) as Company[])
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar empresas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function createCompany() {
    if (!nome.trim()) { setError('Informe o nome da empresa.'); return }
    if (createStore && !storeUf.trim()) { setError('Informe o UF da loja principal.'); return }
    setSaving(true); setError(null); setMsg(null)
    try {
      // Prefer RPC segura; fallback para insert direto se a função ainda não existir.
      let created: Company | null = null
      const rpc = await supabase.rpc('create_company_with_store', {
        p_nome: nome.trim(),
        p_cnpj: cnpj.trim() || null,
        p_regime: regime.trim() || null,
        p_create_store: createStore,
        p_store_nome: storeName.trim() || 'Loja Principal',
        p_store_uf: storeUf.trim().toUpperCase(),
        p_ambiente: 'homologacao',
      })
      if (!rpc.error && rpc.data) {
        const { data: comp } = await supabase
          .from('companies')
          .select('id, nome, cnpj, regime_tributario')
          .eq('id', rpc.data)
          .maybeSingle()
        created = (comp || null) as Company | null
      } else {
        // fallback direto
        const { data, error } = await supabase
          .from('companies')
          .insert({
            nome: nome.trim(),
            cnpj: cnpj.trim() || null,
            regime_tributario: regime.trim() || null,
          })
          .select('id, nome, cnpj, regime_tributario')
          .single()
        if (error) throw error
        if (createStore) {
          const { error: storeErr } = await supabase.from('stores').insert({
            company_id: data.id,
            nome: storeName.trim() || 'Loja Principal',
            uf: storeUf.trim().toUpperCase(),
            ambiente_fiscal: 'homologacao',
          })
          if (storeErr) throw storeErr
        }
        created = data as Company
      }

      if (created) setList(prev => [...prev, created])
      setNome(''); setCnpj(''); setRegime('')
      setStoreName('Loja Principal'); setStoreUf(''); setCreateStore(true)
      setShowNew(false)
      setMsg('Empresa criada com sucesso.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível criar a empresa.')
    } finally {
      setSaving(false)
    }
  }

  async function updateCompany(id: string, field: keyof Company, value: string) {
    setError(null); setMsg(null)
    try {
      const payload: any = { [field]: value.trim() || null }
      if (field === 'nome' && !value.trim()) throw new Error('Nome não pode ficar vazio.')
      const { error } = await supabase.from('companies').update(payload).eq('id', id)
      if (error) throw error
      setList(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
      setMsg('Empresa atualizada.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível atualizar.')
    }
  }

  return (
    <div className="pb-24 max-w-md mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Empresas</h1>
        <Button onClick={() => setShowNew(true)}>Nova empresa</Button>
      </div>

      {error && <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">{error}</div>}
      {msg && <div className="rounded-2xl border p-3 bg-emerald-50 text-emerald-900 text-sm">{msg}</div>}

      <Card title="Lista">
        {loading ? (
          <div className="text-sm text-zinc-500">Carregando…</div>
        ) : list.length === 0 ? (
          <div className="text-sm text-zinc-500">Nenhuma empresa cadastrada.</div>
        ) : (
          <div className="space-y-3">
            {list.map(c => (
              <div key={c.id} className="rounded-2xl border p-3 space-y-2">
                <div className="text-xs text-zinc-500">ID: {c.id}</div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Nome</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    defaultValue={c.nome}
                    onBlur={e => updateCompany(c.id, 'nome', e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">CNPJ</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    defaultValue={c.cnpj || ''}
                    onBlur={e => updateCompany(c.id, 'cnpj', e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Regime</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    defaultValue={c.regime_tributario || ''}
                    onBlur={e => updateCompany(c.id, 'regime_tributario', e.target.value)}
                  />
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
              <div className="text-lg font-semibold">Nova empresa</div>
              <button className="text-zinc-500" onClick={() => setShowNew(false)}>fechar</button>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Nome *</div>
              <input className="w-full rounded-xl border px-3 py-2" value={nome} onChange={e => setNome(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">CNPJ</div>
              <input className="w-full rounded-xl border px-3 py-2" value={cnpj} onChange={e => setCnpj(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Regime</div>
              <input className="w-full rounded-xl border px-3 py-2" value={regime} onChange={e => setRegime(e.target.value)} />
            </div>
            <div className="rounded-2xl border p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createStore}
                  onChange={e => setCreateStore(e.target.checked)}
                />
                Criar loja principal
              </label>
              {createStore && (
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Nome da loja</div>
                    <input className="w-full rounded-xl border px-3 py-2" value={storeName} onChange={e => setStoreName(e.target.value)} />
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">UF *</div>
                    <input className="w-full rounded-xl border px-3 py-2" value={storeUf} onChange={e => setStoreUf(e.target.value)} placeholder="Ex.: MA" />
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button className="bg-zinc-800" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button onClick={createCompany} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
