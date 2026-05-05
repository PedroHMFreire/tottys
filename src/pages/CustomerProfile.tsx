// src/pages/CustomerProfile.tsx — Perfil 360° do cliente
import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import {
  ArrowLeft, MessageCircle, Phone, Mail, Trophy, Heart, TrendingUp,
  Sparkles, AlertTriangle, Clock, UserX, ShoppingBag, Star,
  CreditCard, Loader2, Plus, X, Trash2, Tag, Pencil,
} from 'lucide-react'

// ── tipos ─────────────────────────────────────────────────────
type Segmento = 'CAMPIAO' | 'FIEL' | 'PROMISSOR' | 'NOVO' | 'EM_RISCO' | 'INATIVO' | 'SEM_COMPRAS'

type RFMRow = {
  customer_id: string; nome: string; contato: string | null; email: string | null
  data_nascimento: string | null; cashback_saldo: number; cashback_tier: string
  score_interno: string | null; limite_credito: number | null; credito_disponivel: number | null
  total_compras: number; total_gasto: number; ticket_medio: number
  ultima_compra_at: string | null; dias_sem_comprar: number; segmento: Segmento
}

type Sale = {
  id: string; created_at: string; total: number; desconto: number
  store_id: string; stores?: { nome: string } | null
}

type Note = {
  id: string; nota: string; created_at: string
  user_id: string | null; profiles?: { nome: string; email: string } | null
}

type TagDef = { id: string; nome: string; cor: string }

// ── config segmentos ──────────────────────────────────────────
const SEG: Record<Segmento, { label: string; Icon: any; cls: string }> = {
  CAMPIAO:     { label: 'Campeão',    Icon: Trophy,        cls: 'text-amber-700 bg-amber-100 border-amber-200'   },
  FIEL:        { label: 'Fiel',       Icon: Heart,         cls: 'text-emerald-700 bg-emerald-100 border-emerald-200' },
  PROMISSOR:   { label: 'Promissor',  Icon: TrendingUp,    cls: 'text-blue-700 bg-blue-100 border-blue-200'      },
  NOVO:        { label: 'Novo',       Icon: Sparkles,      cls: 'text-violet-700 bg-violet-100 border-violet-200' },
  EM_RISCO:    { label: 'Em Risco',   Icon: AlertTriangle, cls: 'text-orange-700 bg-orange-100 border-orange-200' },
  INATIVO:     { label: 'Inativo',    Icon: Clock,         cls: 'text-slate-500 bg-slate-100 border-slate-200'   },
  SEM_COMPRAS: { label: 'Sem compras',Icon: UserX,         cls: 'text-slate-400 bg-slate-100 border-slate-200'   },
}

const PRESET_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#ec4899','#3b82f6','#8b5cf6','#14b8a6']

function SegBadge({ seg }: { seg: Segmento }) {
  const s = SEG[seg]
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.cls}`}>
      <s.Icon size={11} />
      {s.label}
    </span>
  )
}

function initials(nome: string) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function openWhatsApp(phone: string, nome: string) {
  const raw = phone.replace(/\D/g, '')
  const number = raw.startsWith('55') ? raw : `55${raw}`
  const msg = `Olá ${nome.split(' ')[0]}! Tudo bem? 😊`
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(msg)}`, '_blank')
}

// ── componente principal ──────────────────────────────────────
export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { company } = useApp()

  const [rfm, setRfm]         = useState<RFMRow | null>(null)
  const [sales, setSales]     = useState<Sale[]>([])
  const [notes, setNotes]     = useState<Note[]>([])
  const [tags, setTags]       = useState<TagDef[]>([])        // tags do cliente
  const [allTags, setAllTags] = useState<TagDef[]>([])        // todas tags da empresa
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<'compras' | 'notas'>('compras')

  // notes state
  const [noteText, setNoteText]   = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // tags state
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [newTagNome, setNewTagNome]       = useState('')
  const [newTagCor, setNewTagCor]         = useState(PRESET_COLORS[0])
  const [savingTag, setSavingTag]         = useState(false)

  useEffect(() => { if (id && company?.id) loadAll() }, [id, company?.id])

  async function loadAll() {
    if (!id || !company?.id) return
    setLoading(true)
    const [rfmRes, salesRes, notesRes, tagsRes, allTagsRes] = await Promise.all([
      supabase.from('v_customer_rfm').select('*').eq('customer_id', id).maybeSingle(),
      supabase.from('sales').select('id, created_at, total, desconto, store_id, stores(nome)')
        .eq('customer_id', id).eq('status', 'PAGA').order('created_at', { ascending: false }).limit(20),
      supabase.from('customer_notes').select('id, nota, created_at, user_id, profiles(nome, email)')
        .eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('customer_tags').select('tag_id, customer_tag_defs(id, nome, cor)')
        .eq('customer_id', id),
      supabase.from('customer_tag_defs').select('id, nome, cor').eq('company_id', company.id).order('nome'),
    ])
    setRfm(rfmRes.data as RFMRow | null)
    setSales((salesRes.data ?? []) as unknown as Sale[])
    setNotes((notesRes.data ?? []) as unknown as Note[])
    setTags(((tagsRes.data ?? []).map((r: any) => r.customer_tag_defs).filter(Boolean)) as TagDef[])
    setAllTags((allTagsRes.data ?? []) as TagDef[])
    setLoading(false)
  }

  async function addNote() {
    if (!noteText.trim() || !id || !company?.id) return
    setSavingNote(true)
    await supabase.from('customer_notes').insert({
      company_id: company.id, customer_id: id, nota: noteText.trim(),
    })
    setNoteText('')
    await loadAll()
    setSavingNote(false)
  }

  async function deleteNote(noteId: string) {
    await supabase.from('customer_notes').delete().eq('id', noteId)
    setNotes(n => n.filter(x => x.id !== noteId))
  }

  async function toggleTag(tag: TagDef) {
    if (!id || !company?.id) return
    const has = tags.some(t => t.id === tag.id)
    if (has) {
      await supabase.from('customer_tags').delete().eq('customer_id', id).eq('tag_id', tag.id)
      setTags(t => t.filter(x => x.id !== tag.id))
    } else {
      await supabase.from('customer_tags').insert({ customer_id: id, tag_id: tag.id, company_id: company.id })
      setTags(t => [...t, tag])
    }
  }

  async function createTag() {
    if (!newTagNome.trim() || !company?.id) return
    setSavingTag(true)
    const { data } = await supabase.from('customer_tag_defs').insert({
      company_id: company.id, nome: newTagNome.trim(), cor: newTagCor,
    }).select().single()
    if (data) {
      setAllTags(t => [...t, data as TagDef].sort((a, b) => a.nome.localeCompare(b.nome)))
      setNewTagNome('')
    }
    setSavingTag(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin text-slate-300" />
      </div>
    )
  }

  if (!rfm) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-slate-500 text-sm">Cliente não encontrado.</p>
        <button onClick={() => navigate(-1)} className="text-azure text-sm underline cursor-pointer">Voltar</button>
      </div>
    )
  }

  const tierColors: Record<string, string> = {
    BRONZE: 'text-amber-700 bg-amber-100', PRATA: 'text-slate-600 bg-slate-200',
    OURO: 'text-yellow-700 bg-yellow-100', DIAMANTE: 'text-blue-700 bg-blue-100',
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* Breadcrumb + back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
      >
        <ArrowLeft size={14} />
        Voltar
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-full bg-navy-ghost border-2 border-blue-200 flex items-center justify-center text-lg font-bold text-azure shrink-0">
            {initials(rfm.nome)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900">{rfm.nome}</h1>
              <SegBadge seg={rfm.segmento} />
              {rfm.cashback_tier && rfm.cashback_tier !== 'BRONZE' && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tierColors[rfm.cashback_tier] ?? 'text-slate-600 bg-slate-100'}`}>
                  {rfm.cashback_tier}
                </span>
              )}
            </div>

            {/* Contatos */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {rfm.contato && (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Phone size={11} />
                    {rfm.contato}
                  </span>
                  <button
                    onClick={() => openWhatsApp(rfm.contato!, rfm.nome)}
                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                    title="WhatsApp"
                  >
                    <MessageCircle size={13} />
                  </button>
                </div>
              )}
              {rfm.email && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Mail size={11} />
                  {rfm.email}
                </span>
              )}
              {rfm.data_nascimento && (
                <span className="text-xs text-slate-400">
                  🎂 {new Date(rfm.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                </span>
              )}
            </div>

            {/* Tags */}
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {tags.map(t => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: t.cor }}
                  onClick={() => toggleTag(t)}
                  title="Clique para remover"
                >
                  {t.nome}
                  <X size={8} />
                </span>
              ))}
              <button
                onClick={() => setShowTagPicker(p => !p)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-slate-400 border border-dashed border-slate-300 hover:border-azure hover:text-azure transition-colors cursor-pointer"
              >
                <Tag size={9} />
                Tag
              </button>
            </div>

            {/* Tag picker */}
            {showTagPicker && (
              <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {allTags.filter(t => !tags.some(x => x.id === t.id)).map(t => (
                    <button
                      key={t.id}
                      onClick={() => { toggleTag(t); }}
                      className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-white cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: t.cor }}
                    >
                      + {t.nome}
                    </button>
                  ))}
                  {allTags.filter(t => !tags.some(x => x.id === t.id)).length === 0 && (
                    <span className="text-xs text-slate-400">Todas as tags já foram adicionadas.</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setNewTagCor(c)}
                        className={`w-4 h-4 rounded-full cursor-pointer border-2 transition-all ${newTagCor === c ? 'border-slate-700 scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <input
                    value={newTagNome}
                    onChange={e => setNewTagNome(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createTag()}
                    placeholder="Nova tag…"
                    className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-azure"
                  />
                  <button
                    onClick={createTag}
                    disabled={!newTagNome.trim() || savingTag}
                    className="px-2.5 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold disabled:opacity-40 cursor-pointer hover:bg-azure-dark transition-colors"
                  >
                    {savingTag ? <Loader2 size={11} className="animate-spin" /> : 'Criar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Compras', value: rfm.total_compras.toString(), sub: 'no total', Icon: ShoppingBag, color: 'text-blue-600' },
          { label: 'Total gasto', value: formatBRL(rfm.total_gasto), sub: rfm.total_compras > 0 ? `ticket ${formatBRL(rfm.ticket_medio)}` : '—', Icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'Cashback', value: formatBRL(rfm.cashback_saldo), sub: rfm.cashback_tier ?? '—', Icon: Star, color: 'text-amber-600' },
          {
            label: rfm.dias_sem_comprar === 9999 ? 'Nunca comprou' : 'Última compra',
            value: rfm.dias_sem_comprar === 9999 ? '—' : `${rfm.dias_sem_comprar}d`,
            sub: rfm.ultima_compra_at
              ? new Date(rfm.ultima_compra_at).toLocaleDateString('pt-BR')
              : 'sem compras',
            Icon: Clock,
            color: rfm.dias_sem_comprar > 60 ? 'text-orange-500' : 'text-slate-600',
          },
        ].map(({ label, value, sub, Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className={`flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1`}>
              <Icon size={12} className={color} />
              {label}
            </div>
            <div className={`text-xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Crediário */}
      {(rfm.limite_credito ?? 0) > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
          <CreditCard size={18} className="text-slate-400 shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">Crediário</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Limite: {formatBRL(rfm.limite_credito ?? 0)} · Disponível: {formatBRL(rfm.credito_disponivel ?? 0)}
            </div>
          </div>
          <Link to="/crediario" className="text-xs text-azure underline">Ver parcelas</Link>
        </div>
      )}

      {/* Tabs: Compras / Notas */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-100">
          {(['compras', 'notas'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                tab === t
                  ? 'text-azure border-b-2 border-azure bg-navy-ghost'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t === 'compras' ? `Histórico (${sales.length})` : `Anotações (${notes.length})`}
            </button>
          ))}
        </div>

        {/* Compras */}
        {tab === 'compras' && (
          <div className="divide-y divide-slate-50">
            {sales.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">Nenhuma compra registrada.</div>
            ) : sales.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <ShoppingBag size={14} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">
                    {new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                  <div className="text-xs text-slate-400">
                    {(s.stores as any)?.nome ?? 'Loja'}
                    {s.desconto > 0 && ` · desc. ${formatBRL(s.desconto)}`}
                  </div>
                </div>
                <div className="text-sm font-semibold text-slate-800 shrink-0">{formatBRL(s.total)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Notas */}
        {tab === 'notas' && (
          <div>
            {/* Add note */}
            <div className="p-4 border-b border-slate-50">
              <div className="flex gap-2">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Adicionar anotação… (tamanho, preferências, observações)"
                  rows={2}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-azure transition-colors resize-none"
                />
                <button
                  onClick={addNote}
                  disabled={!noteText.trim() || savingNote}
                  className="px-3 py-2 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-40 cursor-pointer hover:bg-azure-dark transition-colors flex items-center gap-1"
                >
                  {savingNote ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                </button>
              </div>
            </div>

            {/* Notes list */}
            <div className="divide-y divide-slate-50">
              {notes.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">
                  Nenhuma anotação ainda. Registre preferências, tamanhos e observações.
                </div>
              ) : notes.map(n => (
                <div key={n.id} className="flex items-start gap-3 px-4 py-3.5">
                  <Pencil size={13} className="text-slate-300 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 whitespace-pre-line">{n.nota}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {(n.profiles as any)?.nome ?? (n.profiles as any)?.email ?? 'Usuário'} ·{' '}
                      {new Date(n.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteNote(n.id)}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
