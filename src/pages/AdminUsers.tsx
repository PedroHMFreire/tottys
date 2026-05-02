/// <reference types="vite/client" />
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { useRole } from '@/hooks/useRole'
import { validateEmail } from '@/lib/validators'
import { ROLE_LABELS, CARGO_LABELS, type Cargo } from '@/domain/types'
import { Shield, UserCog, Users, ChevronDown, ChevronUp, Loader2, X, Plus } from 'lucide-react'
import Button from '@/ui/Button'

type RoleDB = 'OWNER' | 'ADMIN' | 'GERENTE' | 'COLABORADOR'
type UA = { company_id: string; user_id: string; area_code: string }

interface Profile {
  id: string
  company_id: string | null
  role: RoleDB | null
  cargo: Cargo | null
  nome?: string | null
  email?: string | null
}

// ── Áreas ────────────────────────────────────────────────────────────────────

const ALL_AREAS = [
  'PDV','RELATORIOS_DIA','RELATORIOS',
  'PRODUTOS','PRODUTOS_EDIT',
  'ESTOQUE_VIEW','ESTOQUE_ADMIN',
  'CLIENTES','CREDIARIO','CASHBACK',
  'FINANCEIRO','INSIGHTS','NPS',
  'FISCAL','CONFIG','USERS','ADM_ROOT',
] as const
type AreaCode = typeof ALL_AREAS[number]

const AREA_LABELS: Record<AreaCode, string> = {
  PDV:           'PDV — realizar vendas',
  RELATORIOS_DIA:'Relatório do dia',
  RELATORIOS:    'Relatórios completos',
  PRODUTOS:      'Produtos (visualizar)',
  PRODUTOS_EDIT: 'Produtos (editar)',
  ESTOQUE_VIEW:  'Estoque (visualizar)',
  ESTOQUE_ADMIN: 'Estoque (administrar)',
  CLIENTES:      'Clientes & CRM',
  CREDIARIO:     'Crediário & cobranças',
  CASHBACK:      'Cashback & fidelidade',
  FINANCEIRO:    'Financeiro',
  INSIGHTS:      'Insights & alertas',
  NPS:           'NPS & pesquisas',
  FISCAL:        'Fiscal (NFC-e)',
  CONFIG:        'Configurações do sistema',
  USERS:         'Usuários & acessos',
  ADM_ROOT:      'Retaguarda (admin)',
}

const AREA_GROUPS: Array<{ title: string; items: AreaCode[] }> = [
  { title: 'PDV',         items: ['PDV', 'RELATORIOS_DIA'] },
  { title: 'Gestão',      items: ['RELATORIOS', 'CLIENTES', 'CREDIARIO', 'CASHBACK', 'INSIGHTS', 'NPS'] },
  { title: 'Catálogo',    items: ['PRODUTOS', 'PRODUTOS_EDIT', 'ESTOQUE_VIEW', 'ESTOQUE_ADMIN'] },
  { title: 'Financeiro',  items: ['FINANCEIRO', 'FISCAL'] },
  { title: 'Sistema',     items: ['ADM_ROOT', 'CONFIG', 'USERS'] },
]

// Áreas padrão por role (espelha get_my_areas() no banco)
const DEFAULT_AREAS: Record<RoleDB, AreaCode[]> = {
  OWNER:       [...ALL_AREAS],
  ADMIN:       [...ALL_AREAS],
  GERENTE:     ['PDV','RELATORIOS_DIA','RELATORIOS','PRODUTOS','PRODUTOS_EDIT',
                'ESTOQUE_VIEW','ESTOQUE_ADMIN','CLIENTES','CREDIARIO','CASHBACK',
                'INSIGHTS','NPS','ADM_ROOT'],
  COLABORADOR: ['PDV','RELATORIOS_DIA'],
}

// Presets de áreas explícitas (além das default do role)
const PRESET_GERENTE_EXTRA: AreaCode[] = DEFAULT_AREAS.GERENTE
const PRESET_COLAB_BASICO:  AreaCode[] = ['PDV', 'RELATORIOS_DIA']
const PRESET_COLAB_VENDAS:  AreaCode[] = ['PDV', 'RELATORIOS_DIA', 'CLIENTES', 'ESTOQUE_VIEW']

// ── Visual por nível ──────────────────────────────────────────────────────────

const ROLE_STYLE: Record<RoleDB, { badge: string; icon: typeof Shield; label: string }> = {
  OWNER:       { badge: 'bg-violet-100 text-violet-700 border-violet-200',  icon: Shield,  label: 'Super Admin'    },
  ADMIN:       { badge: 'bg-blue-100 text-blue-700 border-blue-200',        icon: Shield,  label: 'Administrador'  },
  GERENTE:     { badge: 'bg-sky-100 text-sky-700 border-sky-200',           icon: UserCog, label: 'Gerente'        },
  COLABORADOR: { badge: 'bg-slate-100 text-slate-600 border-slate-200',     icon: Users,   label: 'Colaborador'    },
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AdminUsers() {
  const navigate = useNavigate()
  const { company, setCompany } = useApp()
  const { role: callerRole, isAdmin: callerIsAdmin } = useRole()

  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [msg,     setMsg]     = useState<string | null>(null)

  const [companyId,  setCompanyId]  = useState<string | null>(null)
  const [list,       setList]       = useState<Profile[]>([])
  const [userAreas,  setUserAreas]  = useState<UA[]>([])
  const [stores,     setStores]     = useState<Array<{ id: string; nome: string }>>([])
  const [userStores, setUserStores] = useState<Array<{ user_id: string; store_id: string }>>([])
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set())

  // Modal novo usuário
  const [showNew,  setShowNew]  = useState(false)
  const [nEmail,   setNEmail]   = useState('')
  const [nName,    setNName]    = useState('')
  const [nRole,    setNRole]    = useState<RoleDB>('COLABORADOR')
  const [nCargo,   setNCargo]   = useState<Cargo>('VENDEDOR')
  const [nAreas,   setNAreas]   = useState<AreaCode[]>([])
  const [saving,   setSaving]   = useState(false)

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
    load()
  }, [company])

  useEffect(() => {
    if (company?.id) setCompanyId(company.id)
  }, [company?.id])

  async function load() {
    setLoading(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let comp: string | null = null
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
        comp = company?.id ?? prof?.company_id ?? null
        if (!company && prof?.company_id) {
          const { data: compRow } = await supabase.from('companies').select('id, nome').eq('id', prof.company_id).maybeSingle()
          if (compRow) setCompany(compRow as any)
        }
      }
      if (!comp) throw new Error('Defina a empresa no seu perfil.')
      setCompanyId(comp)

      const [profsRes, stRes, uaRes] = await Promise.all([
        supabase.from('profiles').select('id, company_id, role, cargo, nome, email').eq('company_id', comp).order('nome'),
        supabase.from('stores').select('id, nome').eq('company_id', comp).order('nome'),
        supabase.from('user_areas').select('company_id, user_id, area_code').eq('company_id', comp),
      ])
      if (profsRes.error) throw profsRes.error
      setList((profsRes.data || []) as Profile[])
      setStores((stRes.data || []) as any[])
      setUserAreas((uaRes.data || []) as UA[])

      try {
        const { data: us } = await supabase.from('user_stores').select('user_id, store_id').eq('company_id', comp)
        setUserStores((us || []) as any[])
      } catch { setUserStores([]) }
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar.')
    } finally {
      setLoading(false)
    }
  }

  function flash(m: string, isError = false) {
    if (isError) { setError(m); setTimeout(() => setError(null), 4000) }
    else         { setMsg(m);   setTimeout(() => setMsg(null),   3000) }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function saveRole(userId: string, role: RoleDB) {
    try {
      const { error } = await supabase.rpc('set_user_role', { p_user_id: userId, p_role: role })
      if (error) throw error
      setList(prev => prev.map(p => p.id === userId ? { ...p, role } : p))
      flash('Papel atualizado.')
    } catch (e: any) { flash(e?.message || 'Erro ao alterar papel.', true) }
  }

  async function saveCargo(userId: string, cargo: Cargo | null) {
    try {
      const { error } = await supabase.from('profiles').update({ cargo }).eq('id', userId)
      if (error) throw error
      setList(prev => prev.map(p => p.id === userId ? { ...p, cargo } : p))
      flash('Cargo atualizado.')
    } catch (e: any) { flash(e?.message || 'Erro ao alterar cargo.', true) }
  }

  async function toggleArea(userId: string, code: AreaCode, checked: boolean) {
    try {
      if (checked) {
        const { error } = await supabase.rpc('grant_user_area', { p_user_id: userId, p_area_code: code })
        if (error) throw error
        setUserAreas(prev => [...prev, { company_id: companyId!, user_id: userId, area_code: code }])
      } else {
        const { error } = await supabase.rpc('revoke_user_area', { p_user_id: userId, p_area_code: code })
        if (error) throw error
        setUserAreas(prev => prev.filter(a => !(a.user_id === userId && a.area_code === code)))
      }
      flash('Permissões atualizadas.')
    } catch (e: any) { flash(e?.message || 'Erro ao alterar permissão.', true) }
  }

  async function applyPreset(userId: string, preset: AreaCode[]) {
    if (!companyId) return
    const current = areasByUser.get(userId) || new Set<string>()
    const next = new Set(preset)
    try {
      for (const code of ALL_AREAS) {
        const has = current.has(code)
        const want = next.has(code)
        if (has === want) continue
        if (want) {
          const { error } = await supabase.rpc('grant_user_area', { p_user_id: userId, p_area_code: code })
          if (error) throw error
        } else {
          const { error } = await supabase.rpc('revoke_user_area', { p_user_id: userId, p_area_code: code })
          if (error) throw error
        }
      }
      setUserAreas(prev => {
        const rest = prev.filter(a => a.user_id !== userId)
        return [...rest, ...preset.map(area_code => ({ company_id: companyId, user_id: userId, area_code }))]
      })
      flash('Preset aplicado.')
    } catch (e: any) { flash(e?.message || 'Erro ao aplicar preset.', true) }
  }

  async function toggleStore(userId: string, storeId: string, checked: boolean) {
    if (!companyId) return
    try {
      if (checked) {
        const { error } = await supabase.from('user_stores').insert({ user_id: userId, store_id: storeId, company_id: companyId })
        if (error) throw error
        setUserStores(prev => [...prev, { user_id: userId, store_id: storeId }])
      } else {
        const { error } = await supabase.from('user_stores').delete().eq('user_id', userId).eq('store_id', storeId)
        if (error) throw error
        setUserStores(prev => prev.filter(s => !(s.user_id === userId && s.store_id === storeId)))
      }
      flash('Lojas atualizadas.')
    } catch (e: any) { flash(e?.message || 'Erro ao alterar lojas.', true) }
  }

  async function createUser() {
    if (!nEmail.trim()) { flash('Informe o e-mail.', true); return }
    if (!validateEmail(nEmail)) { flash('E-mail inválido.', true); return }
    if (!companyId) { flash('Selecione a empresa.', true); return }
    const dup = list.find(u => u.email?.toLowerCase() === nEmail.trim().toLowerCase())
    if (dup) { flash('E-mail já cadastrado.', true); return }

    setSaving(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('Você precisa estar logado.')

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin_create_user`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: nEmail.trim(),
          name: nName.trim() || null,
          role: nRole,
          cargo: nRole === 'COLABORADOR' ? nCargo : null,
          areas: nAreas,
          company_id: companyId,
          sendInvite: true,
        }),
      })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error || 'Falha ao criar usuário.')

      setList(prev => [...prev, {
        id: out.user_id, company_id: companyId,
        role: nRole, cargo: nRole === 'COLABORADOR' ? nCargo : null,
        nome: nName.trim() || null, email: nEmail.trim(),
      }])
      setNEmail(''); setNName(''); setNRole('COLABORADOR'); setNCargo('VENDEDOR'); setNAreas([])
      setShowNew(false)
      flash('Convite enviado.')
    } catch (e: any) {
      flash(e?.message || 'Falha ao criar usuário.', true)
    } finally {
      setSaving(false)
    }
  }

  // Roles que o caller pode atribuir
  function assignableRoles(): RoleDB[] {
    if (callerRole === 'OWNER') return ['ADMIN','GERENTE','COLABORADOR']
    if (callerRole === 'ADMIN') return ['GERENTE','COLABORADOR']
    return ['COLABORADOR']
  }

  // Agrupa usuários por nível para exibição
  const grouped = useMemo(() => {
    const order: RoleDB[] = ['OWNER','ADMIN','GERENTE','COLABORADOR']
    return order
      .map(r => ({ role: r, users: list.filter(u => (u.role ?? 'COLABORADOR') === r) }))
      .filter(g => g.users.length > 0)
  }, [list])

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-navy">Usuários & Acessos</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {company?.nome ?? 'Carregando empresa…'} · {list.length} usuário{list.length !== 1 ? 's' : ''}
          </p>
        </div>
        {callerIsAdmin && (
          <Button onClick={() => setShowNew(true)}>
            <Plus size={14} className="mr-1" /> Convidar
          </Button>
        )}
      </div>

      {/* Feedbacks */}
      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3">{error}</div>}
      {msg   && <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-4 py-3">{msg}</div>}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={22} className="animate-spin text-slate-400" />
        </div>
      ) : !companyId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-4 text-sm">
          Selecione a empresa para ver usuários.
          <button onClick={() => navigate('/company')} className="ml-2 underline cursor-pointer">Selecionar</button>
        </div>
      ) : (
        grouped.map(({ role: groupRole, users }) => {
          const style = ROLE_STYLE[groupRole]
          const Icon  = style.icon
          return (
            <div key={groupRole} className="space-y-2">
              {/* Cabeçalho do grupo */}
              <div className="flex items-center gap-2 px-1">
                <Icon size={13} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{style.label}</span>
                <span className="text-xs text-slate-300">({users.length})</span>
              </div>

              {users.map(u => {
                const userSet   = areasByUser.get(u.id) || new Set<string>()
                const storeSet  = storesByUser.get(u.id) || new Set<string>()
                const isOpen    = expanded.has(u.id)
                const userRole  = (u.role ?? 'COLABORADOR') as RoleDB
                const defaults  = new Set(DEFAULT_AREAS[userRole])

                return (
                  <div key={u.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">

                    {/* Row */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => toggleExpand(u.id)}
                    >
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                        {(u.nome || u.email || '?').charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {u.nome || u.email || u.id}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {u.email}
                          {u.cargo && <span className="ml-2 text-slate-300">· {CARGO_LABELS[u.cargo]}</span>}
                        </div>
                      </div>

                      {/* Badge role */}
                      <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${style.badge}`}>
                        {style.label}
                      </span>

                      {isOpen ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
                    </div>

                    {/* Painel expandido */}
                    {isOpen && (
                      <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4">

                        {/* Nível + cargo */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nível</label>
                            <select
                              value={userRole}
                              onChange={e => saveRole(u.id, e.target.value as RoleDB)}
                              disabled={!callerIsAdmin || userRole === 'OWNER'}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-azure disabled:opacity-50 cursor-pointer"
                            >
                              {assignableRoles().map(r => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                              ))}
                              {/* Mostra o role atual se fora dos assignable (ex: OWNER vendo a si mesmo) */}
                              {!assignableRoles().includes(userRole) && (
                                <option value={userRole}>{ROLE_LABELS[userRole]}</option>
                              )}
                            </select>
                          </div>

                          {userRole === 'COLABORADOR' && (
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Função</label>
                              <select
                                value={u.cargo ?? 'VENDEDOR'}
                                onChange={e => saveCargo(u.id, e.target.value as Cargo)}
                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-azure cursor-pointer"
                              >
                                {(Object.keys(CARGO_LABELS) as Cargo[]).map(c => (
                                  <option key={c} value={c}>{CARGO_LABELS[c]}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        {/* Presets de áreas (só mostra para GERENTE e COLABORADOR) */}
                        {callerIsAdmin && userRole !== 'OWNER' && userRole !== 'ADMIN' && (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Presets de acesso</div>
                            <div className="flex flex-wrap gap-2">
                              {userRole === 'GERENTE' && (
                                <button
                                  onClick={() => applyPreset(u.id, PRESET_GERENTE_EXTRA)}
                                  className="text-xs px-3 py-1.5 rounded-full border border-sky-200 text-sky-700 hover:bg-sky-50 cursor-pointer transition-colors"
                                >
                                  Gerente padrão
                                </button>
                              )}
                              {userRole === 'COLABORADOR' && (
                                <>
                                  <button
                                    onClick={() => applyPreset(u.id, PRESET_COLAB_BASICO)}
                                    className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                                  >
                                    Somente PDV
                                  </button>
                                  <button
                                    onClick={() => applyPreset(u.id, PRESET_COLAB_VENDAS)}
                                    className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                                  >
                                    PDV + Clientes
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => applyPreset(u.id, [])}
                                className="text-xs px-3 py-1.5 rounded-full border border-rose-100 text-rose-500 hover:bg-rose-50 cursor-pointer transition-colors"
                              >
                                Limpar extras
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Áreas — ADMIN e OWNER não precisam de toggles (acesso total) */}
                        {userRole !== 'OWNER' && userRole !== 'ADMIN' && (
                          <div className="space-y-3">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Permissões por módulo</div>
                            {AREA_GROUPS.map(group => (
                              <div key={group.title}>
                                <div className="text-xs text-slate-400 mb-1.5 font-medium">{group.title}</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                                  {group.items.map(code => {
                                    const isDefault  = defaults.has(code)
                                    const isExplicit = userSet.has(code)
                                    const isActive   = isDefault || isExplicit
                                    return (
                                      <label
                                        key={code}
                                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                                          isActive ? 'bg-navy-ghost' : 'bg-slate-50 hover:bg-slate-100'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isActive}
                                          disabled={isDefault || !callerIsAdmin}
                                          onChange={e => toggleArea(u.id, code, e.target.checked)}
                                          className="accent-azure"
                                        />
                                        <span className={`text-xs ${isActive ? 'text-azure font-medium' : 'text-slate-500'}`}>
                                          {AREA_LABELS[code]}
                                        </span>
                                        {isDefault && (
                                          <span className="ml-auto text-[10px] text-slate-300">padrão</span>
                                        )}
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {userRole === 'ADMIN' && (
                          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
                            Administradores têm acesso total ao sistema. Não é necessário configurar permissões individuais.
                          </div>
                        )}

                        {/* Lojas vinculadas (só para COLABORADOR) */}
                        {stores.length > 1 && userRole === 'COLABORADOR' && (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                              Lojas vinculadas
                              <span className="ml-1 font-normal text-slate-400">(sem vínculo = acesso a todas)</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {stores.map(st => (
                                <label key={st.id} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={storeSet.has(st.id)}
                                    onChange={e => toggleStore(u.id, st.id, e.target.checked)}
                                    className="accent-azure"
                                  />
                                  {st.nome}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })
      )}

      {/* Modal: novo usuário */}
      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col">

            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
              <span className="text-sm font-semibold text-slate-800">Convidar usuário</span>
              <button onClick={() => setShowNew(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer">
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">E-mail *</label>
                <input
                  type="email"
                  value={nEmail}
                  onChange={e => setNEmail(e.target.value)}
                  placeholder="colaborador@empresa.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure transition-colors"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nome</label>
                <input
                  value={nName}
                  onChange={e => setNName(e.target.value)}
                  placeholder="Nome completo (opcional)"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nível</label>
                  <select
                    value={nRole}
                    onChange={e => setNRole(e.target.value as RoleDB)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-azure cursor-pointer"
                  >
                    {assignableRoles().map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
                {nRole === 'COLABORADOR' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Função</label>
                    <select
                      value={nCargo}
                      onChange={e => setNCargo(e.target.value as Cargo)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-azure cursor-pointer"
                    >
                      {(Object.keys(CARGO_LABELS) as Cargo[]).map(c => (
                        <option key={c} value={c}>{CARGO_LABELS[c]}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Presets + áreas extras para GERENTE/COLABORADOR */}
              {nRole !== 'ADMIN' && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Permissões extras</div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {nRole === 'GERENTE' && (
                      <button type="button" onClick={() => setNAreas(PRESET_GERENTE_EXTRA)}
                        className="px-3 py-1.5 rounded-full border border-sky-200 text-sky-700 hover:bg-sky-50 cursor-pointer">
                        Gerente padrão
                      </button>
                    )}
                    {nRole === 'COLABORADOR' && (
                      <>
                        <button type="button" onClick={() => setNAreas(PRESET_COLAB_VENDAS)}
                          className="px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
                          PDV + Clientes
                        </button>
                      </>
                    )}
                    <button type="button" onClick={() => setNAreas([])}
                      className="px-3 py-1.5 rounded-full border border-slate-200 text-slate-400 hover:bg-slate-50 cursor-pointer">
                      Limpar
                    </button>
                  </div>
                  <div className="rounded-2xl border border-slate-100 p-3 grid grid-cols-1 gap-1 max-h-40 overflow-y-auto">
                    {ALL_AREAS.filter(c => !DEFAULT_AREAS[nRole].includes(c as any)).map(code => (
                      <label key={code} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer py-0.5">
                        <input
                          type="checkbox"
                          checked={nAreas.includes(code)}
                          onChange={() => setNAreas(prev => prev.includes(code) ? prev.filter(a => a !== code) : [...prev, code])}
                          className="accent-azure"
                        />
                        {AREA_LABELS[code]}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400">As áreas padrão do nível selecionado já são incluídas automaticamente.</p>
                </div>
              )}

              {nRole === 'ADMIN' && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
                  Administradores têm acesso total. Nenhuma permissão adicional é necessária.
                </div>
              )}
            </div>

            <div className="px-4 pb-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 flex-shrink-0">
              <button onClick={() => setShowNew(false)} className="h-11 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer">Cancelar</button>
              <button
                onClick={createUser}
                disabled={saving || !nEmail.trim()}
                className="h-11 flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-azure-dark disabled:opacity-50 text-white text-sm font-semibold cursor-pointer transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saving ? 'Enviando…' : 'Enviar convite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
