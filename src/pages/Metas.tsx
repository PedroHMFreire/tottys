// Página de gerenciamento de metas e corridinhas — retaguarda (/adm/metas)
// Acesso: OWNER, ADMIN, GERENTE
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import { isUUID } from '@/lib/utils'
import {
  Plus, Zap, Target, Trophy, Clock, Pencil, Trash2,
  Users, TrendingUp, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────
type StoreOpt = { id: string; nome: string }
type MetaRow = {
  id: string; tipo: string; periodo: string; inicio: string; fim: string
  valor_meta: number; bonus_valor: number; descricao: string | null
  ativo: boolean; store_id: string | null; user_id: string | null
}
type CorrRow = {
  id: string; nome: string; tipo: string; tipo_meta: string
  valor_meta: number; bonus_valor: number; premio_descricao: string | null
  inicio: string; fim: string; ativo: boolean; store_id: string | null
}
type RankRow = {
  user_id: string; nome: string; faturamento: number; cupons: number; posicao: number
}
type FolhaRow = { user_id: string; nome: string; total_bonus: number; bonos: any[] }

type Tab = 'metas' | 'corridinhas' | 'ranking' | 'folha'

// ── Helpers ──────────────────────────────────────────────────
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
function fmtDatetime(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function tipoLabel(t: string) {
  return ({ FINANCEIRA:'Faturamento', VOLUME:'Peças', CONVERSAO:'Cupons', MIX:'Mix', ATENDIMENTO:'Atendimentos' })[t] ?? t
}
function periodoLabel(p: string) {
  return ({ DIARIA:'Diária', SEMANAL:'Semanal', QUINZENAL:'Quinzenal', MENSAL:'Mensal' })[p] ?? p
}
function tipoCorr(t: string) {
  return ({ INDIVIDUAL:'Individual', COLETIVA:'Coletiva', COMPETITIVA:'Competitiva' })[t] ?? t
}

// ── Meta Form ────────────────────────────────────────────────
const EMPTY_META = {
  tipo: 'FINANCEIRA', periodo: 'MENSAL', inicio: '', fim: '',
  valor_meta: '', bonus_valor: '0', descricao: '',
  store_id: '', user_id: '',
}

// ── Main ─────────────────────────────────────────────────────
export default function Metas() {
  const { company, store } = useApp()
  const [tab, setTab]           = useState<Tab>('metas')
  const [metas, setMetas]       = useState<MetaRow[]>([])
  const [corr, setCorr]         = useState<CorrRow[]>([])
  const [ranking, setRanking]   = useState<RankRow[]>([])
  const [folha, setFolha]       = useState<FolhaRow[]>([])
  const [stores, setStores]     = useState<StoreOpt[]>([])
  const [loading, setLoading]   = useState(true)
  const [showMetaForm, setShowMetaForm]   = useState(false)
  const [showCorrForm, setShowCorrForm]   = useState(false)
  const [editingMeta, setEditingMeta]     = useState<MetaRow | null>(null)
  const [editingCorr, setEditingCorrinha] = useState<CorrRow | null>(null)
  const [metaForm, setMetaForm]           = useState(EMPTY_META)
  const [corrForm, setCorrForm]           = useState({
    nome: '', tipo: 'INDIVIDUAL', tipo_meta: 'FINANCEIRA',
    valor_meta: '', bonus_valor: '0', premio_descricao: '',
    inicio: '', fim: '', store_id: '',
  })
  const [saving, setSaving]  = useState(false)
  const [folhaMes, setFolhaMes] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // Load stores + data
  useEffect(() => { loadStores() }, [company?.id])
  useEffect(() => {
    if (tab === 'metas')      loadMetas()
    if (tab === 'corridinhas') loadCorr()
    if (tab === 'ranking')    loadRanking()
    if (tab === 'folha')      loadFolha()
  }, [tab, company?.id, store?.id])

  async function loadStores() {
    if (!company?.id) return
    const { data } = await supabase.from('stores').select('id, nome').eq('company_id', company.id)
    setStores(data ?? [])
  }
  async function loadMetas() {
    setLoading(true)
    const q = supabase.from('metas').select('*').order('created_at', { ascending: false })
    const { data } = await q
    setMetas((data ?? []) as MetaRow[])
    setLoading(false)
  }
  async function loadCorr() {
    setLoading(true)
    const { data } = await supabase.from('corridinhas').select('*').order('created_at', { ascending: false })
    setCorr((data ?? []) as CorrRow[])
    setLoading(false)
  }
  async function loadRanking() {
    setLoading(true)
    const sid = store?.id && isUUID(store.id) ? store.id : stores[0]?.id
    if (!sid) { setLoading(false); return }
    const { data } = await supabase.rpc('get_ranking_vendedores', { p_store_id: sid })
    setRanking((data ?? []) as RankRow[])
    setLoading(false)
  }
  async function loadFolha() {
    setLoading(true)
    const { data } = await supabase.rpc('get_folha_bonos_mes', { p_periodo: folhaMes })
    setFolha((data ?? []) as FolhaRow[])
    setLoading(false)
  }

  // ── Save Meta ──────────────────────────────────────────────
  async function saveMeta() {
    if (!company?.id) return
    setSaving(true)
    const payload: any = {
      company_id:  company.id,
      tipo:        metaForm.tipo,
      periodo:     metaForm.periodo,
      inicio:      metaForm.inicio,
      fim:         metaForm.fim,
      valor_meta:  Number(metaForm.valor_meta),
      bonus_valor: Number(metaForm.bonus_valor),
      descricao:   metaForm.descricao || null,
      store_id:    metaForm.store_id || null,
      user_id:     metaForm.user_id  || null,
    }
    if (editingMeta) {
      await supabase.from('metas').update(payload).eq('id', editingMeta.id)
    } else {
      await supabase.from('metas').insert(payload)
    }
    setSaving(false)
    setShowMetaForm(false)
    setEditingMeta(null)
    setMetaForm(EMPTY_META)
    loadMetas()
  }

  // ── Save Corridinha ────────────────────────────────────────
  async function saveCorr() {
    if (!company?.id) return
    setSaving(true)
    const payload: any = {
      company_id:       company.id,
      nome:             corrForm.nome,
      tipo:             corrForm.tipo,
      tipo_meta:        corrForm.tipo_meta,
      valor_meta:       Number(corrForm.valor_meta),
      bonus_valor:      Number(corrForm.bonus_valor),
      premio_descricao: corrForm.premio_descricao || null,
      inicio:           corrForm.inicio,
      fim:              corrForm.fim,
      store_id:         corrForm.store_id || null,
    }
    if (editingCorr) {
      await supabase.from('corridinhas').update(payload).eq('id', editingCorr.id)
    } else {
      await supabase.from('corridinhas').insert(payload)
    }
    setSaving(false)
    setShowCorrForm(false)
    setEditingCorrinha(null)
    setCorrForm({ nome:'', tipo:'INDIVIDUAL', tipo_meta:'FINANCEIRA', valor_meta:'', bonus_valor:'0', premio_descricao:'', inicio:'', fim:'', store_id:'' })
    loadCorr()
  }

  async function deleteMeta(id: string) {
    if (!confirm('Remover esta meta?')) return
    await supabase.from('metas').delete().eq('id', id)
    loadMetas()
  }
  async function deleteCorr(id: string) {
    if (!confirm('Remover esta corridinha?')) return
    await supabase.from('corridinhas').delete().eq('id', id)
    loadCorr()
  }

  function openEditMeta(m: MetaRow) {
    setEditingMeta(m)
    setMetaForm({
      tipo:        m.tipo,
      periodo:     m.periodo,
      inicio:      m.inicio,
      fim:         m.fim,
      valor_meta:  String(m.valor_meta),
      bonus_valor: String(m.bonus_valor),
      descricao:   m.descricao ?? '',
      store_id:    m.store_id ?? '',
      user_id:     m.user_id ?? '',
    })
    setShowMetaForm(true)
  }
  function openEditCorr(c: CorrRow) {
    setEditingCorrinha(c)
    setCorrForm({
      nome:             c.nome,
      tipo:             c.tipo,
      tipo_meta:        c.tipo_meta,
      valor_meta:       String(c.valor_meta),
      bonus_valor:      String(c.bonus_valor),
      premio_descricao: c.premio_descricao ?? '',
      inicio:           c.inicio.slice(0, 16),
      fim:              c.fim.slice(0, 16),
      store_id:         c.store_id ?? '',
    })
    setShowCorrForm(true)
  }

  const tabs: { id: Tab; label: string; Icon: React.FC<any> }[] = [
    { id: 'metas',      label: 'Metas',       Icon: Target  },
    { id: 'corridinhas',label: 'Corridinhas', Icon: Zap     },
    { id: 'ranking',    label: 'Ranking',     Icon: Trophy  },
    { id: 'folha',      label: 'Folha',       Icon: Users   },
  ]

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="px-4 py-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Metas & Corridinhas</h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">Gerencie as metas e desafios da equipe</p>
          </div>
          {tab === 'metas' && (
            <button onClick={() => { setEditingMeta(null); setMetaForm(EMPTY_META); setShowMetaForm(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors">
              <Plus size={16} /> Nova meta
            </button>
          )}
          {tab === 'corridinhas' && (
            <button onClick={() => { setEditingCorrinha(null); setShowCorrForm(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold text-sm transition-colors">
              <Plus size={16} /> Nova corridinha
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-2xl mb-6">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                tab === id
                  ? 'bg-white dark:bg-slate-800 text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Metas ──────────────────────────────────── */}
        {tab === 'metas' && (
          <div className="space-y-3">
            {loading && <Skeleton />}
            {!loading && metas.length === 0 && (
              <Empty icon={<Target size={32} />} msg="Nenhuma meta criada" />
            )}
            {metas.map(m => (
              <div key={m.id} className={`bg-[var(--bg-card)] border rounded-2xl p-4 ${!m.ativo ? 'opacity-50' : 'border-[var(--border)]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-bold uppercase px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                        {tipoLabel(m.tipo)}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">{periodoLabel(m.periodo)}</span>
                      {!m.ativo && <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">Inativa</span>}
                    </div>
                    {m.descricao && <p className="text-sm font-medium text-[var(--text-primary)]">{m.descricao}</p>}
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {fmtDate(m.inicio)} → {fmtDate(m.fim)} · Meta: <strong>{m.tipo === 'FINANCEIRA' || m.tipo === 'MIX' ? formatBRL(m.valor_meta) : m.valor_meta}</strong>
                      {m.bonus_valor > 0 && <> · Bônus: <strong className="text-emerald-600">{formatBRL(m.bonus_valor)}</strong></>}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEditMeta(m)} className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => deleteMeta(m.id)} className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: Corridinhas ────────────────────────────── */}
        {tab === 'corridinhas' && (
          <div className="space-y-3">
            {loading && <Skeleton />}
            {!loading && corr.length === 0 && (
              <Empty icon={<Zap size={32} />} msg="Nenhuma corridinha criada" />
            )}
            {corr.map(c => {
              const isActive = c.ativo && new Date(c.fim) > new Date()
              return (
                <div key={c.id} className={`bg-[var(--bg-card)] border rounded-2xl p-4 ${!isActive ? 'opacity-50' : 'border-[var(--border)]'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                          c.tipo === 'COMPETITIVA' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                          c.tipo === 'COLETIVA'    ? 'bg-blue-100   dark:bg-blue-900/40   text-blue-700   dark:text-blue-300' :
                                                     'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                        }`}>
                          {tipoCorr(c.tipo)}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">{tipoLabel(c.tipo_meta)}</span>
                        {isActive && <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"><Clock size={10} /> Ativa</span>}
                      </div>
                      <p className="font-bold text-[var(--text-primary)]">{c.nome}</p>
                      {c.premio_descricao && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                          <Trophy size={11} /> {c.premio_descricao}
                        </p>
                      )}
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {fmtDatetime(c.inicio)} → {fmtDatetime(c.fim)} · Meta: <strong>{c.tipo_meta === 'FINANCEIRA' ? formatBRL(c.valor_meta) : c.valor_meta}</strong>
                        {c.bonus_valor > 0 && <> · Bônus: <strong className="text-emerald-600">{formatBRL(c.bonus_valor)}</strong></>}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEditCorr(c)} className="p-2 rounded-xl text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => deleteCorr(c.id)} className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Tab: Ranking ────────────────────────────────── */}
        {tab === 'ranking' && (
          <div className="space-y-3">
            {loading && <Skeleton />}
            {!loading && ranking.length === 0 && (
              <Empty icon={<Trophy size={32} />} msg="Sem dados de ranking para o mês" />
            )}
            {ranking.map(r => (
              <div key={r.user_id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm shrink-0 ${
                  r.posicao === 1 ? 'bg-amber-100 border-amber-400 text-amber-600' :
                  r.posicao === 2 ? 'bg-slate-100 border-slate-400 text-slate-600' :
                  r.posicao === 3 ? 'bg-orange-100 border-orange-400 text-orange-600' :
                                    'bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)]'
                }`}>
                  {r.posicao === 1 ? '🥇' : r.posicao === 2 ? '🥈' : r.posicao === 3 ? '🥉' : r.posicao}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--text-primary)] truncate">{r.nome}</p>
                  <p className="text-xs text-[var(--text-muted)]">{r.cupons} vendas</p>
                </div>
                <p className="text-base font-bold text-emerald-600 shrink-0">{formatBRL(r.faturamento)}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: Folha de Bônus ─────────────────────────── */}
        {tab === 'folha' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <input
                type="month"
                value={folhaMes}
                onChange={e => setFolhaMes(e.target.value)}
                className="border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={loadFolha} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors">
                Filtrar
              </button>
            </div>

            {loading && <Skeleton />}
            {!loading && folha.length === 0 && (
              <Empty icon={<Users size={32} />} msg="Nenhum bônus registrado para este mês" />
            )}
            <div className="space-y-3">
              {folha.map(f => (
                <FolhaCard key={f.user_id} f={f} />
              ))}
            </div>

            {folha.length > 0 && (
              <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex justify-between items-center">
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">Total de bônus</span>
                <span className="text-xl font-extrabold text-emerald-600">
                  {formatBRL(folha.reduce((a, f) => a + Number(f.total_bonus), 0))}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Nova/Editar Meta ──────────────────────────── */}
      {showMetaForm && (
        <ModalOverlay onClose={() => setShowMetaForm(false)}>
          <h2 className="text-lg font-bold mb-4">{editingMeta ? 'Editar meta' : 'Nova meta'}</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Tipo">
                <select value={metaForm.tipo} onChange={e => setMetaForm(f => ({ ...f, tipo: e.target.value }))} className={selectCls}>
                  <option value="FINANCEIRA">Faturamento</option>
                  <option value="VOLUME">Peças vendidas</option>
                  <option value="CONVERSAO">Cupons</option>
                  <option value="MIX">Mix de produtos</option>
                </select>
              </FormField>
              <FormField label="Período">
                <select value={metaForm.periodo} onChange={e => setMetaForm(f => ({ ...f, periodo: e.target.value }))} className={selectCls}>
                  <option value="DIARIA">Diária</option>
                  <option value="SEMANAL">Semanal</option>
                  <option value="QUINZENAL">Quinzenal</option>
                  <option value="MENSAL">Mensal</option>
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Início">
                <input type="date" value={metaForm.inicio} onChange={e => setMetaForm(f => ({ ...f, inicio: e.target.value }))} className={inputCls} />
              </FormField>
              <FormField label="Fim">
                <input type="date" value={metaForm.fim} onChange={e => setMetaForm(f => ({ ...f, fim: e.target.value }))} className={inputCls} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Valor da meta">
                <input type="number" placeholder="0.00" value={metaForm.valor_meta} onChange={e => setMetaForm(f => ({ ...f, valor_meta: e.target.value }))} className={inputCls} />
              </FormField>
              <FormField label="Bônus (R$)">
                <input type="number" placeholder="0.00" value={metaForm.bonus_valor} onChange={e => setMetaForm(f => ({ ...f, bonus_valor: e.target.value }))} className={inputCls} />
              </FormField>
            </div>
            <FormField label="Loja (opcional — vazio = todas)">
              <select value={metaForm.store_id} onChange={e => setMetaForm(f => ({ ...f, store_id: e.target.value }))} className={selectCls}>
                <option value="">Todas as lojas</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </FormField>
            <FormField label="Descrição (opcional)">
              <input type="text" placeholder="Ex: Meta de faturamento de maio" value={metaForm.descricao} onChange={e => setMetaForm(f => ({ ...f, descricao: e.target.value }))} className={inputCls} />
            </FormField>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowMetaForm(false)} className="flex-1 py-2.5 border border-[var(--border)] rounded-xl text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] transition-colors">
              Cancelar
            </button>
            <button onClick={saveMeta} disabled={saving || !metaForm.inicio || !metaForm.fim || !metaForm.valor_meta}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal: Nova/Editar Corridinha ──────────────────── */}
      {showCorrForm && (
        <ModalOverlay onClose={() => setShowCorrForm(false)}>
          <h2 className="text-lg font-bold mb-4">{editingCorr ? 'Editar corridinha' : 'Nova corridinha'}</h2>
          <div className="space-y-3">
            <FormField label="Nome">
              <input type="text" placeholder="Ex: Quem vender mais até sexta ganha R$50" value={corrForm.nome} onChange={e => setCorrForm(f => ({ ...f, nome: e.target.value }))} className={inputCls} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Tipo">
                <select value={corrForm.tipo} onChange={e => setCorrForm(f => ({ ...f, tipo: e.target.value }))} className={selectCls}>
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="COLETIVA">Coletiva</option>
                  <option value="COMPETITIVA">Competitiva</option>
                </select>
              </FormField>
              <FormField label="Métrica">
                <select value={corrForm.tipo_meta} onChange={e => setCorrForm(f => ({ ...f, tipo_meta: e.target.value }))} className={selectCls}>
                  <option value="FINANCEIRA">Faturamento</option>
                  <option value="VOLUME">Peças vendidas</option>
                  <option value="ATENDIMENTO">Atendimentos</option>
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Meta">
                <input type="number" placeholder="0.00" value={corrForm.valor_meta} onChange={e => setCorrForm(f => ({ ...f, valor_meta: e.target.value }))} className={inputCls} />
              </FormField>
              <FormField label="Bônus (R$)">
                <input type="number" placeholder="0.00" value={corrForm.bonus_valor} onChange={e => setCorrForm(f => ({ ...f, bonus_valor: e.target.value }))} className={inputCls} />
              </FormField>
            </div>
            <FormField label="Prêmio (descritivo, opcional)">
              <input type="text" placeholder="Ex: Jantar para 2, folga na segunda…" value={corrForm.premio_descricao} onChange={e => setCorrForm(f => ({ ...f, premio_descricao: e.target.value }))} className={inputCls} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Início">
                <input type="datetime-local" value={corrForm.inicio} onChange={e => setCorrForm(f => ({ ...f, inicio: e.target.value }))} className={inputCls} />
              </FormField>
              <FormField label="Fim">
                <input type="datetime-local" value={corrForm.fim} onChange={e => setCorrForm(f => ({ ...f, fim: e.target.value }))} className={inputCls} />
              </FormField>
            </div>
            <FormField label="Loja (opcional)">
              <select value={corrForm.store_id} onChange={e => setCorrForm(f => ({ ...f, store_id: e.target.value }))} className={selectCls}>
                <option value="">Todas as lojas</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </FormField>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowCorrForm(false)} className="flex-1 py-2.5 border border-[var(--border)] rounded-xl text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] transition-colors">
              Cancelar
            </button>
            <button onClick={saveCorr} disabled={saving || !corrForm.nome || !corrForm.valor_meta || !corrForm.inicio || !corrForm.fim}
              className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ── Reusable pieces ───────────────────────────────────────────
const inputCls  = 'w-full border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const selectCls = 'w-full border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">{label}</label>
      {children}
    </div>
  )
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-[var(--bg-card)] rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1,2,3].map(i => <div key={i} className="h-20 bg-[var(--bg-secondary)] rounded-2xl" />)}
    </div>
  )
}

function Empty({ icon, msg }: { icon: React.ReactNode; msg: string }) {
  return (
    <div className="text-center py-16 text-[var(--text-muted)]">
      <div className="flex justify-center mb-3 opacity-30">{icon}</div>
      <p className="font-semibold">{msg}</p>
    </div>
  )
}

function FolhaCard({ f }: { f: FolhaRow }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600">
            <Users size={16} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-[var(--text-primary)]">{f.nome}</p>
            <p className="text-xs text-[var(--text-muted)]">{f.bonos?.length ?? 0} bônus</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-emerald-600 text-base">{formatBRL(Number(f.total_bonus))}</span>
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>
      {open && f.bonos && (
        <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
          {f.bonos.map((b: any) => (
            <div key={b.id} className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-muted)]">{b.descricao ?? 'Bônus'}</span>
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${b.pago ? 'text-slate-400 line-through' : 'text-emerald-600'}`}>
                  {formatBRL(Number(b.valor))}
                </span>
                {b.pago && <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">Pago</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
