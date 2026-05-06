import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import Button from '@/ui/Button'
import KPI from '@/ui/KPI'
import { Plus, Trash2, Store } from 'lucide-react'

type CashbackConfig = {
  pct_bronze: number
  pct_prata: number
  pct_ouro: number
  pct_vip: number
  min_prata: number
  min_ouro: number
  min_vip: number
  resgate_minimo: number
  expiracao_dias: number
  ativo: boolean
  msg_reativacao: string | null
}

type Dashboard = {
  total_distribuido: number
  total_resgatado: number
  clientes_com_saldo: number
  saldo_pendente: number
  tiers: { bronze: number; prata: number; ouro: number; vip: number }
}

type TopCliente = {
  id: string
  nome: string
  cashback_saldo: number
  cashback_tier: string
  cashback_total_gasto: number
}

type CashbackGroup = {
  id: string
  nome: string
  cor: string
}

type StoreRow = {
  id: string
  nome: string
  cashback_group_id: string | null
  cashback_ativo: boolean
}

const TIER_LABEL: Record<string, string> = {
  BRONZE: 'Bronze', PRATA: 'Prata', OURO: 'Ouro', VIP: 'VIP',
}
const TIER_COLOR: Record<string, string> = {
  BRONZE: 'bg-amber-100 text-amber-700',
  PRATA:  'bg-zinc-100 text-zinc-600',
  OURO:   'bg-yellow-100 text-yellow-700',
  VIP:    'bg-purple-100 text-purple-700',
}

const GROUP_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

const DEFAULT_MSG =
  'Olá {{nome}}! Você tem *R$ {{saldo}}* de cashback esperando por você na {{empresa}}. Venha aproveitar! 🎉'

const DEFAULT_CONFIG: CashbackConfig = {
  pct_bronze: 3, pct_prata: 5, pct_ouro: 7, pct_vip: 10,
  min_prata: 500, min_ouro: 1500, min_vip: 3000,
  resgate_minimo: 5, expiracao_dias: 365, ativo: true, msg_reativacao: DEFAULT_MSG,
}

export default function CashbackConfig() {
  const { company } = useApp()
  const [config, setConfig] = useState<CashbackConfig | null>(null)
  const [form, setForm] = useState<CashbackConfig>(DEFAULT_CONFIG)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [topClientes, setTopClientes] = useState<TopCliente[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saved, setSaved] = useState(false)

  // Grupos e lojas
  const [groups, setGroups] = useState<CashbackGroup[]>([])
  const [stores, setStores] = useState<StoreRow[]>([])
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [newGroupNome, setNewGroupNome] = useState('')
  const [newGroupCor, setNewGroupCor] = useState(GROUP_COLORS[0])
  const [savingGroup, setSavingGroup] = useState(false)

  useEffect(() => {
    if (company?.id) {
      loadConfig()
      loadDashboard()
      loadTopClientes()
      loadGroupsAndStores()
    }
  }, [company?.id])

  async function loadConfig() {
    if (!company?.id) return
    const { data } = await supabase
      .from('cashback_config').select('*').eq('company_id', company.id).maybeSingle()
    if (data) { setConfig(data as CashbackConfig); setForm(data as CashbackConfig) }
    else setConfig(null)
  }

  async function loadDashboard() {
    if (!company?.id) return
    setLoading(true)
    try {
      await supabase.rpc('fn_expirar_cashback', { p_company_id: company.id })
      const { data } = await supabase.rpc('fn_cashback_dashboard', { p_company_id: company.id })
      if (data) setDashboard(data as Dashboard)
    } finally { setLoading(false) }
  }

  async function loadTopClientes() {
    if (!company?.id) return
    const { data } = await supabase
      .from('customers')
      .select('id, nome, cashback_saldo, cashback_tier, cashback_total_gasto')
      .eq('company_id', company.id)
      .gt('cashback_total_gasto', 0)
      .order('cashback_total_gasto', { ascending: false })
      .limit(10)
    setTopClientes((data || []) as TopCliente[])
  }

  async function loadGroupsAndStores() {
    if (!company?.id) return
    const [grpRes, stRes] = await Promise.all([
      supabase.from('cashback_groups').select('id, nome, cor').eq('company_id', company.id).order('nome'),
      supabase.from('stores').select('id, nome, cashback_group_id, cashback_ativo').eq('company_id', company.id).order('nome'),
    ])
    setGroups((grpRes.data ?? []) as CashbackGroup[])
    setStores((stRes.data ?? []) as StoreRow[])
  }

  async function saveConfig() {
    if (!company?.id) return
    setSaving(true)
    try {
      await supabase.from('cashback_config')
        .upsert({ ...form, company_id: company.id, updated_at: new Date().toISOString() })
      await loadConfig()
      await loadDashboard()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setShowForm(false)
    } finally { setSaving(false) }
  }

  async function createGroup() {
    if (!company?.id || !newGroupNome.trim()) return
    setSavingGroup(true)
    try {
      await supabase.from('cashback_groups').insert({
        company_id: company.id, nome: newGroupNome.trim(), cor: newGroupCor,
      })
      setNewGroupNome('')
      setNewGroupCor(GROUP_COLORS[0])
      setShowGroupForm(false)
      await loadGroupsAndStores()
    } finally { setSavingGroup(false) }
  }

  async function deleteGroup(id: string) {
    await supabase.from('cashback_groups').delete().eq('id', id)
    await loadGroupsAndStores()
  }

  async function updateStoreGroup(storeId: string, groupId: string | null) {
    await supabase.from('stores').update({ cashback_group_id: groupId }).eq('id', storeId)
    setStores(prev => prev.map(s => s.id === storeId ? { ...s, cashback_group_id: groupId } : s))
  }

  async function toggleStoreAtivo(storeId: string, ativo: boolean) {
    await supabase.from('stores').update({ cashback_ativo: ativo }).eq('id', storeId)
    setStores(prev => prev.map(s => s.id === storeId ? { ...s, cashback_ativo: ativo } : s))
  }

  function f(v: string | number | boolean) { return String(v) }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="sticky top-0 bg-white border-b px-4 py-3 z-10 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-navy">Cashback / Fidelidade</h1>
        <button
          onClick={() => setShowForm(true)}
          className="text-xs border rounded-xl px-3 py-1 hover:bg-zinc-50"
        >
          {config ? 'Editar config' : 'Ativar cashback'}
        </button>
      </div>

      <div className="px-4 mt-3 space-y-4">
        {!company?.id && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3">Selecione uma empresa.</div>
        )}

        {/* Status */}
        {config !== null && (
          <div className={`rounded-2xl border p-3 text-sm flex items-center justify-between ${config.ativo ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-zinc-100 border-zinc-200 text-zinc-500'}`}>
            <span className="font-medium">{config.ativo ? 'Cashback ATIVO' : 'Cashback INATIVO'}</span>
            <span className="text-xs">
              Bronze {config.pct_bronze}% · Prata {config.pct_prata}% · Ouro {config.pct_ouro}% · VIP {config.pct_vip}%
            </span>
          </div>
        )}

        {config === null && !loading && company?.id && (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-slate-400">
            <div className="font-medium mb-1 text-navy">Cashback não configurado</div>
            <div className="text-sm">Ative para fidelizar clientes com cashback automático por tier.</div>
          </div>
        )}

        {/* Dashboard KPIs */}
        {dashboard && (
          <div className="grid grid-cols-2 gap-2">
            <KPI label="Total distribuído" value={formatBRL(dashboard.total_distribuido)} />
            <KPI label="Total resgatado" value={formatBRL(dashboard.total_resgatado)} />
            <KPI label="Clientes com saldo" value={String(dashboard.clientes_com_saldo)} />
            <KPI label="Saldo a resgatar" value={formatBRL(dashboard.saldo_pendente)} />
          </div>
        )}

        {/* Distribuição de tiers */}
        {dashboard?.tiers && (
          <div className="rounded-2xl border bg-white p-3">
            <div className="text-sm font-medium mb-2">Distribuição por tier</div>
            <div className="grid grid-cols-4 gap-1 text-center">
              {(['bronze', 'prata', 'ouro', 'vip'] as const).map(t => (
                <div key={t} className="space-y-0.5">
                  <div className={`text-xs px-2 py-0.5 rounded-full ${TIER_COLOR[t.toUpperCase()]}`}>
                    {TIER_LABEL[t.toUpperCase()]}
                  </div>
                  <div className="text-sm font-semibold">{dashboard.tiers[t]}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grupos de cashback */}
        {company?.id && (
          <div className="rounded-2xl border bg-white p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Grupos de Cashback</div>
              <button
                onClick={() => setShowGroupForm(true)}
                className="flex items-center gap-1 text-xs text-azure hover:text-azure-dark transition-colors cursor-pointer"
              >
                <Plus size={12} />Novo grupo
              </button>
            </div>

            <p className="text-xs text-slate-400 -mt-1">
              Lojas no mesmo grupo compartilham saldo de cashback com o cliente.
            </p>

            {showGroupForm && (
              <div className="border border-slate-100 rounded-xl p-3 space-y-2 bg-slate-50">
                <input
                  value={newGroupNome}
                  onChange={e => setNewGroupNome(e.target.value)}
                  placeholder="Nome do grupo (ex: Matriz + Filial 1)"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-azure"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Cor:</span>
                  <div className="flex gap-1.5">
                    {GROUP_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setNewGroupCor(c)}
                        style={{ background: c }}
                        className={`w-5 h-5 rounded-full transition-all cursor-pointer ${newGroupCor === c ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowGroupForm(false)} className="flex-1 text-xs border rounded-lg py-1.5 hover:bg-white cursor-pointer">Cancelar</button>
                  <button
                    onClick={createGroup}
                    disabled={!newGroupNome.trim() || savingGroup}
                    className="flex-1 text-xs bg-primary text-white rounded-lg py-1.5 disabled:opacity-40 cursor-pointer"
                  >
                    {savingGroup ? 'Salvando…' : 'Criar grupo'}
                  </button>
                </div>
              </div>
            )}

            {groups.length === 0 && !showGroupForm && (
              <div className="text-xs text-slate-400 text-center py-2">Nenhum grupo criado ainda.</div>
            )}
            {groups.map(g => (
              <div key={g.id} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: g.cor }} />
                <span className="flex-1 font-medium">{g.nome}</span>
                <span className="text-xs text-slate-400">{stores.filter(s => s.cashback_group_id === g.id).length} loja(s)</span>
                <button
                  onClick={() => deleteGroup(g.id)}
                  className="p-1 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer"
                  title="Excluir grupo"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Lojas — grupo e ativo/inativo */}
        {company?.id && stores.length > 0 && (
          <div className="rounded-2xl border bg-white p-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Store size={14} className="text-slate-400" />
              <div className="text-sm font-medium">Configuração por loja</div>
            </div>
            {stores.map(s => (
              <div key={s.id} className="flex items-center gap-3 py-2 border-b last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.nome}</div>
                </div>

                {/* Grupo */}
                <select
                  value={s.cashback_group_id ?? ''}
                  onChange={e => updateStoreGroup(s.id, e.target.value || null)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-azure cursor-pointer"
                >
                  <option value="">Sem grupo</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.nome}</option>
                  ))}
                </select>

                {/* Toggle cashback ativo */}
                <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={s.cashback_ativo}
                    onChange={e => toggleStoreAtivo(s.id, e.target.checked)}
                    className="w-3.5 h-3.5 accent-emerald-500"
                  />
                  <span className={`text-xs font-medium ${s.cashback_ativo ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {s.cashback_ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </label>
              </div>
            ))}
          </div>
        )}

        {/* Top clientes */}
        {topClientes.length > 0 && (
          <div className="rounded-2xl border bg-white p-3">
            <div className="text-sm font-medium mb-2">Top clientes por fidelidade</div>
            <div className="space-y-2">
              {topClientes.map((c, i) => (
                <div key={c.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-zinc-400 text-xs w-4">{i + 1}.</span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.nome}</div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${TIER_COLOR[c.cashback_tier]}`}>
                        {TIER_LABEL[c.cashback_tier]}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="font-semibold text-emerald-600">{formatBRL(c.cashback_saldo)}</div>
                    <div className="text-xs text-zinc-400">gasto: {formatBRL(c.cashback_total_gasto)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de configuração */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Configurar Cashback</div>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 text-sm">fechar</button>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={e => setForm(p => ({ ...p, ativo: e.target.checked }))}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Cashback ativo</span>
            </label>

            <div>
              <div className="text-xs text-zinc-500 font-medium mb-2">Percentual de cashback por tier</div>
              <div className="grid grid-cols-2 gap-2">
                {(['bronze','prata','ouro','vip'] as const).map(t => (
                  <div key={t}>
                    <div className="text-xs text-zinc-500 mb-0.5">{TIER_LABEL[t.toUpperCase()]} (%)</div>
                    <input
                      type="number" min="0" max="50" step="0.5"
                      value={f(form[`pct_${t}` as keyof CashbackConfig])}
                      onChange={e => setForm(p => ({ ...p, [`pct_${t}`]: Number(e.target.value) }))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-navy focus:outline-none focus:border-azure transition-colors bg-white w-full"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-zinc-500 font-medium mb-2">Threshold de tier (total gasto em R$)</div>
              <div className="grid grid-cols-3 gap-2">
                {(['prata','ouro','vip'] as const).map(t => (
                  <div key={t}>
                    <div className="text-xs text-zinc-500 mb-0.5">{TIER_LABEL[t.toUpperCase()]}</div>
                    <input
                      type="number" min="0" step="100"
                      value={f(form[`min_${t}` as keyof CashbackConfig])}
                      onChange={e => setForm(p => ({ ...p, [`min_${t}`]: Number(e.target.value) }))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-navy focus:outline-none focus:border-azure transition-colors bg-white w-full"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Resgate mínimo (R$)</div>
              <input
                type="number" min="0" step="1"
                value={f(form.resgate_minimo)}
                onChange={e => setForm(p => ({ ...p, resgate_minimo: Number(e.target.value) }))}
                className="w-full rounded-xl border px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Validade do cashback (dias) — 0 = sem expiração</div>
              <input
                type="number" min="0" step="30"
                value={f(form.expiracao_dias)}
                onChange={e => setForm(p => ({ ...p, expiracao_dias: Number(e.target.value) }))}
                className="w-full rounded-xl border px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Mensagem WhatsApp de reativação</div>
              <div className="text-xs text-zinc-400 mb-1">Variáveis: {'{{nome}}'} {'{{saldo}}'} {'{{empresa}}'}</div>
              <textarea
                value={form.msg_reativacao || ''}
                onChange={e => setForm(p => ({ ...p, msg_reativacao: e.target.value }))}
                rows={3}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-azure transition-colors bg-white w-full resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={saveConfig} disabled={saving}>
                {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
