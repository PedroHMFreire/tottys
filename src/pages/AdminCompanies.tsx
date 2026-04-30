import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import { maskCNPJ, validateCNPJ, UF_LIST, REGIME_LIST } from '@/lib/validators'

type Company = {
  id: string
  nome: string
  cnpj?: string | null
  regime_tributario?: string | null
  email_remetente?: string | null
  email_nome?: string | null
  email_senha_app?: string | null
}

type EditState = { nome: string; cnpj: string; regime: string; email_remetente: string; email_nome: string; email_senha_app: string }

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

  // Edição inline por empresa
  const [editMap, setEditMap] = useState<Record<string, EditState>>({})
  const [editingId, setEditingId] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, nome, cnpj, regime_tributario, email_remetente, email_nome, email_senha_app')
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
    const cnpjDigits = cnpj.replace(/\D/g, '')
    if (cnpjDigits && !validateCNPJ(cnpjDigits)) {
      setError('CNPJ inválido. Verifique os dígitos.'); return
    }
    if (createStore && !storeUf) { setError('Selecione o estado (UF) da loja principal.'); return }

    // Verificar CNPJ duplicado
    if (cnpjDigits) {
      const { data: dup } = await supabase
        .from('companies')
        .select('id')
        .eq('cnpj', cnpjDigits)
        .maybeSingle()
      if (dup) { setError('Já existe uma empresa cadastrada com este CNPJ.'); return }
    }

    setSaving(true); setError(null); setMsg(null)
    try {
      let created: Company | null = null
      const rpc = await supabase.rpc('create_company_with_store', {
        p_nome: nome.trim(),
        p_cnpj: cnpjDigits || null,
        p_regime: regime || null,
        p_create_store: createStore,
        p_store_nome: storeName.trim() || 'Loja Principal',
        p_store_uf: storeUf,
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
        const { data, error } = await supabase
          .from('companies')
          .insert({
            nome: nome.trim(),
            cnpj: cnpjDigits || null,
            regime_tributario: regime || null,
          })
          .select('id, nome, cnpj, regime_tributario')
          .single()
        if (error) throw error
        if (createStore) {
          const { error: storeErr } = await supabase.from('stores').insert({
            company_id: data.id,
            nome: storeName.trim() || 'Loja Principal',
            uf: storeUf,
            ambiente_fiscal: 'homologacao',
          })
          if (storeErr) throw storeErr
        }
        created = data as Company
      }

      if (created) setList(prev => [...prev, created!])
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

  function startEdit(c: Company) {
    setEditingId(c.id)
    setEditMap(prev => ({
      ...prev,
      [c.id]: {
        nome: c.nome,
        cnpj: c.cnpj ? maskCNPJ(c.cnpj) : '',
        regime: c.regime_tributario || '',
        email_remetente: c.email_remetente || '',
        email_nome: c.email_nome || '',
        email_senha_app: c.email_senha_app || '',
      },
    }))
  }

  async function saveEdit(id: string) {
    const s = editMap[id]
    if (!s) return
    if (!s.nome.trim()) { setError('Nome não pode ficar vazio.'); return }
    const cnpjDigits = s.cnpj.replace(/\D/g, '')
    if (cnpjDigits && !validateCNPJ(cnpjDigits)) {
      setError('CNPJ inválido. Verifique os dígitos.'); return
    }
    setError(null); setMsg(null)
    try {
      const { error } = await supabase.from('companies').update({
        nome: s.nome.trim(),
        cnpj: cnpjDigits || null,
        regime_tributario: s.regime || null,
        email_remetente: s.email_remetente.trim() || null,
        email_nome: s.email_nome.trim() || null,
        email_senha_app: s.email_senha_app || null,
      }).eq('id', id)
      if (error) throw error
      setList(prev => prev.map(c => c.id === id
        ? { ...c, nome: s.nome.trim(), cnpj: cnpjDigits || null, regime_tributario: s.regime || null }
        : c
      ))
      setEditingId(null)
      setMsg('Empresa atualizada.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível atualizar.')
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#1E1B4B]">Empresas</h1>
        <Button onClick={() => setShowNew(true)}>Nova empresa</Button>
      </div>

      {error && <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">{error}</div>}
      {msg && <div className="rounded-2xl border p-3 bg-emerald-50 text-emerald-900 text-sm">{msg}</div>}

      <Card title="Lista">
        {loading ? (
          <div className="text-sm text-slate-400">Carregando…</div>
        ) : list.length === 0 ? (
          <div className="text-sm text-slate-400">Nenhuma empresa cadastrada.</div>
        ) : (
          <div className="space-y-3">
            {list.map(c => (
              <div key={c.id} className="rounded-2xl border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400">ID: {c.id.slice(0, 8)}…</div>
                  {editingId === c.id ? (
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(c.id)} className="text-xs font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer">Salvar</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">Cancelar</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(c)} className="text-xs text-slate-400 hover:text-[#1E40AF] cursor-pointer">Editar</button>
                  )}
                </div>

                {editingId === c.id ? (
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Nome *</div>
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-[#1E40AF]"
                        value={editMap[c.id]?.nome || ''}
                        onChange={e => setEditMap(p => ({ ...p, [c.id]: { ...p[c.id], nome: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">CNPJ</div>
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-[#1E40AF]"
                        value={editMap[c.id]?.cnpj || ''}
                        onChange={e => setEditMap(p => ({ ...p, [c.id]: { ...p[c.id], cnpj: maskCNPJ(e.target.value) } }))}
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Regime Tributário</div>
                      <select
                        className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-[#1E40AF] bg-white"
                        value={editMap[c.id]?.regime || ''}
                        onChange={e => setEditMap(p => ({ ...p, [c.id]: { ...p[c.id], regime: e.target.value } }))}
                      >
                        <option value="">— Selecione —</option>
                        {REGIME_LIST.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-xs font-medium text-slate-500 mb-2">Configuração de Email</div>
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Email remetente (Gmail)</div>
                          <input
                            type="email"
                            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-[#1E40AF]"
                            value={editMap[c.id]?.email_remetente || ''}
                            onChange={e => setEditMap(p => ({ ...p, [c.id]: { ...p[c.id], email_remetente: e.target.value } }))}
                            placeholder="loja@gmail.com"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Nome exibido no email</div>
                          <input
                            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-[#1E40AF]"
                            value={editMap[c.id]?.email_nome || ''}
                            onChange={e => setEditMap(p => ({ ...p, [c.id]: { ...p[c.id], email_nome: e.target.value } }))}
                            placeholder="Nome da Loja"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Senha de app do Gmail</div>
                          <input
                            type="password"
                            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-[#1E40AF]"
                            value={editMap[c.id]?.email_senha_app || ''}
                            onChange={e => setEditMap(p => ({ ...p, [c.id]: { ...p[c.id], email_senha_app: e.target.value } }))}
                            placeholder="xxxx xxxx xxxx xxxx"
                          />
                          <div className="text-[10px] text-slate-400 mt-1">
                            Google Account → Segurança → Verificação em 2 etapas → Senhas de app
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 text-sm">
                    <div className="font-medium text-[#1E1B4B]">{c.nome}</div>
                    <div className="text-xs text-slate-500">
                      {c.cnpj ? maskCNPJ(c.cnpj) : 'CNPJ não informado'}
                      {c.regime_tributario ? ` · ${c.regime_tributario}` : ''}
                    </div>
                    {c.email_remetente && (
                      <div className="text-xs text-emerald-600 flex items-center gap-1">
                        <svg width="10" height="10" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                        {c.email_remetente}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Nova empresa</div>
              <button className="text-slate-400 cursor-pointer" onClick={() => setShowNew(false)}>fechar</button>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Nome *</div>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-[#1E40AF]"
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Nome da empresa"
              />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">CNPJ</div>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-[#1E40AF]"
                value={cnpj}
                onChange={e => setCnpj(maskCNPJ(e.target.value))}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Regime Tributário</div>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-[#1E40AF] bg-white"
                value={regime}
                onChange={e => setRegime(e.target.value)}
              >
                <option value="">— Selecione —</option>
                {REGIME_LIST.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="rounded-2xl border p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={createStore} onChange={e => setCreateStore(e.target.checked)} />
                Criar loja principal automaticamente
              </label>
              {createStore && (
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Nome da loja</div>
                    <input
                      className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-[#1E40AF]"
                      value={storeName}
                      onChange={e => setStoreName(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Estado (UF) *</div>
                    <select
                      className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-[#1E40AF] bg-white"
                      value={storeUf}
                      onChange={e => setStoreUf(e.target.value)}
                    >
                      <option value="">— Selecione —</option>
                      {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button onClick={createCompany} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
