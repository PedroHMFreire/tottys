/// <reference types="vite/client" />
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import Card from '@/ui/Card'
import Button from '@/ui/Button'
import { useApp } from '@/state/store'

// Remove custom ImportMeta interface, Vite provides env typing automatically

type Profile = {
  id: string
  company_id: string | null
  role: 'OWNER' | 'ADMIN' | 'GERENTE' | 'VENDEDOR' | null
  nome?: string | null
  email?: string | null
}
type UA = { company_id: string; user_id: string; area_code: string }

const ALL_AREAS = [
  'PDV','RELATORIOS_DIA','RELATORIOS',
  'PRODUTOS','PRODUTOS_EDIT',
  'ESTOQUE_VIEW','ESTOQUE_ADMIN',
  'FISCAL','CONFIG','USERS','ADM_ROOT'
] as const
type AreaCode = typeof ALL_AREAS[number]

export default function AdminUsers() {
  const navigate = useNavigate()
  const { company, setCompany } = useApp()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [list, setList] = useState<Profile[]>([])
  const [userAreas, setUserAreas] = useState<UA[]>([])
  const [stores, setStores] = useState<Array<{ id: string; nome: string }>>([])
  const [userStores, setUserStores] = useState<Array<{ user_id: string; store_id: string }>>([])

  // Modal: novo usuário
  const [showNew, setShowNew] = useState(false)
  const [nEmail, setNEmail] = useState('')
  const [nName, setNName] = useState('')
  const [nRole, setNRole] = useState<'OWNER'|'ADMIN'|'GERENTE'|'VENDEDOR'>('VENDEDOR')
  const [nAreas, setNAreas] = useState<AreaCode[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const areasByUser = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const ua of userAreas) {
      if (!map.has(ua.user_id)) map.set(ua.user_id, new Set())
      map.get(ua.user_id)!.add(ua.area_code)
    }
    return map
  }, [userAreas])

  const storesByUser = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const us of userStores) {
      if (!map.has(us.user_id)) map.set(us.user_id, new Set())
      map.get(us.user_id)!.add(us.store_id)
    }
    return map
  }, [userStores])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        // empresa do logado
        const { data: { user } } = await supabase.auth.getUser()
        let comp: string | null = null
        if (user) {
          const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
          comp = company?.id ?? prof?.company_id ?? null
          if (!company && prof?.company_id) {
            const { data: compRow } = await supabase
              .from('companies')
              .select('id, nome')
              .eq('id', prof.company_id)
              .maybeSingle()
            if (compRow) setCompany(compRow as any)
          }
        }
        if (!comp) throw new Error('Defina a empresa (company_id) no seu perfil.')
        if (!mounted) return
        setCompanyId(comp)

        // perfis da empresa
        const { data: profs, error: e1 } = await supabase
          .from('profiles')
          .select('id, company_id, role, nome, email')
          .eq('company_id', comp)
          .order('nome', { ascending: true })
        if (e1) throw e1
        if (!mounted) return
        setList((profs || []) as Profile[])

        // lojas da empresa
        const { data: st, error: e3 } = await supabase
          .from('stores')
          .select('id, nome')
          .eq('company_id', comp)
          .order('nome', { ascending: true })
        if (!e3 && mounted) setStores((st || []) as any[])

        // exceções por área (todos os usuários da empresa)
        const { data: uareas, error: e2 } = await supabase
          .from('user_areas')
          .select('company_id, user_id, area_code')
          .eq('company_id', comp)
        if (e2) throw e2
        if (!mounted) return
        setUserAreas((uareas || []) as UA[])

        // vínculos usuário->loja (se tabela existir)
        try {
          const { data: us } = await supabase
            .from('user_stores')
            .select('user_id, store_id')
            .eq('company_id', comp)
          if (mounted) setUserStores((us || []) as any[])
        } catch {
          if (mounted) setUserStores([])
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Falha ao carregar usuários.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [company, setCompany])

  useEffect(() => {
    if (company?.id) setCompanyId(company.id)
  }, [company?.id])

  async function saveRole(userId: string, role: Profile['role']) {
    if (!companyId || !role) return
    setMsg(null); setError(null)
    try {
      const { error } = await supabase.rpc('set_user_role', { p_user_id: userId, p_role: role })
      if (error) throw error
      setList(prev => prev.map(p => p.id === userId ? { ...p, role } : p))
      setMsg('Papel atualizado.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível alterar o papel.')
    }
  }

  async function toggleArea(userId: string, code: AreaCode, checked: boolean) {
    if (!companyId) return
    setMsg(null); setError(null)
    try {
      if (checked) {
        const { error } = await supabase.rpc('grant_user_area', { p_user_id: userId, p_area_code: code })
        if (error) throw error
        setUserAreas(prev => [...prev, { company_id: companyId, user_id: userId, area_code: code }])
      } else {
        const { error } = await supabase.rpc('revoke_user_area', { p_user_id: userId, p_area_code: code })
        if (error) throw error
        setUserAreas(prev => prev.filter(a => !(a.user_id === userId && a.area_code === code)))
      }
      setMsg('Permissões atualizadas.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível alterar as permissões.')
    }
  }

  async function toggleStore(userId: string, storeId: string, checked: boolean) {
    if (!companyId) return
    setMsg(null); setError(null)
    try {
      if (checked) {
        const { error } = await supabase
          .from('user_stores')
          .insert({ user_id: userId, store_id: storeId, company_id: companyId })
        if (error) throw error
        setUserStores(prev => [...prev, { user_id: userId, store_id: storeId }])
      } else {
        const { error } = await supabase
          .from('user_stores')
          .delete()
          .eq('user_id', userId)
          .eq('store_id', storeId)
        if (error) throw error
        setUserStores(prev => prev.filter(s => !(s.user_id === userId && s.store_id === storeId)))
      }
      setMsg('Lojas atualizadas.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível alterar lojas.')
    }
  }

  async function createUser() {
    if (!nEmail) { setError('Informe o e-mail.'); return }
    if (!companyId) { setError('Selecione a empresa ativa.'); return }
    setSaving(true); setMsg(null); setError(null)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('Você precisa estar logado.')

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin_create_user`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: nEmail,
          name: nName || null,
          role: nRole,
          areas: nAreas,
          company_id: companyId,
          sendInvite: true, // envia convite para o colaborador definir a senha
        }),
      })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error || 'Falha ao criar usuário.')

      // Atualiza lista local
      setList(prev => [...prev, { id: out.user_id, company_id: companyId, role: nRole, nome: nName || null, email: nEmail }])
      setNAreas([])
      setNEmail(''); setNName(''); setNRole('VENDEDOR'); setShowNew(false)
      setMsg('Convite enviado. Usuário criado.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível criar o usuário.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-24 max-w-md mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuários & Acessos</h1>
        <Button onClick={() => setShowNew(true)}>Adicionar usuário</Button>
      </div>
      <div className="text-xs text-zinc-500">
        Empresa ativa: {companyId ? companyId.slice(0, 8) + '…' : 'não selecionada'}
        {!companyId && (
          <div className="mt-1">
            <Button className="bg-zinc-800" onClick={() => navigate('/company')}>Selecionar empresa</Button>
          </div>
        )}
      </div>

      {error && <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">{error}</div>}
      {msg && <div className="rounded-2xl border p-3 bg-emerald-50 text-emerald-900 text-sm">{msg}</div>}

      <Card title="Colaboradores">
        {loading ? (
          <div className="text-sm text-zinc-500">Carregando…</div>
        ) : list.length === 0 ? (
          <div className="text-sm text-zinc-500">Nenhum usuário na empresa.</div>
        ) : (
          <div className="space-y-3">
            {list.map(u => {
              const userSet = areasByUser.get(u.id) || new Set<string>()
              const storeSet = storesByUser.get(u.id) || new Set<string>()
              return (
                <div key={u.id} className="rounded-2xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{u.nome || u.email || u.id}</div>
                      <div className="text-xs text-zinc-500 truncate">{u.email || u.id}</div>
                    </div>
                    <div>
                      <select
                        className="rounded-xl border px-2 py-1 text-sm"
                        value={u.role || 'VENDEDOR'}
                        onChange={e => saveRole(u.id, e.target.value as Profile['role'])}
                      >
                        <option value="OWNER">OWNER</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="GERENTE">GERENTE</option>
                        <option value="VENDEDOR">VENDEDOR</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {ALL_AREAS.map(code => (
                      <label key={code} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={userSet.has(code)}
                          onChange={e => toggleArea(u.id, code, e.target.checked)}
                        />
                        {code}
                      </label>
                    ))}
                  </div>

                  {stores.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs text-zinc-500 mb-1">Lojas</div>
                      <div className="grid grid-cols-2 gap-2">
                        {stores.map(st => (
                          <label key={st.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={storeSet.has(st.id)}
                              onChange={e => toggleStore(u.id, st.id, e.target.checked)}
                            />
                            {st.nome}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Modal: novo usuário */}
      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Adicionar usuário</div>
              <button onClick={() => setShowNew(false)} className="text-zinc-500">fechar</button>
            </div>
            <input
              className="w-full rounded-2xl border px-3 py-2"
              placeholder="E-mail"
              value={nEmail}
              onChange={e => setNEmail(e.target.value)}
            />
            <input
              className="w-full rounded-2xl border px-3 py-2"
              placeholder="Nome (opcional)"
              value={nName}
              onChange={e => setNName(e.target.value)}
            />
            <div>
              <div className="text-sm mb-1">Papel</div>
              <select
                className="w-full rounded-2xl border px-3 py-2"
                value={nRole}
                onChange={e => setNRole(e.target.value as any)}
              >
                <option value="VENDEDOR">VENDEDOR</option>
                <option value="GERENTE">GERENTE</option>
                <option value="ADMIN">ADMIN</option>
                <option value="OWNER">OWNER</option>
              </select>
            </div>

            <div>
              <div className="text-sm mb-1">Áreas (opcional)</div>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-auto rounded-2xl border p-2">
                {ALL_AREAS.map(code => {
                  const checked = nAreas.includes(code)
                  return (
                    <label key={code} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setNAreas(prev => checked ? prev.filter(a => a !== code) : [...prev, code])}
                      />
                      {code}
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button className="bg-zinc-800" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button onClick={createUser} disabled={saving || !nEmail}>
                {saving ? 'Enviando…' : 'Convidar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
