import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatBRL } from '@/lib/currency'
import { maskCPF, maskPhone, validateCPF } from '@/lib/validators'
import { UserPlus, Loader2, X } from 'lucide-react'

export type SelectedCustomer = {
  id: string
  nome: string
  contato?: string | null
  email?: string | null
  cashback_saldo: number
  cashback_tier: string | null
}

const TIER_LABEL: Record<string, string> = {
  BRONZE: 'B',
  PRATA:  'P',
  OURO:   'O',
  VIP:    'V',
}

const TIER_COLOR: Record<string, string> = {
  BRONZE: 'bg-amber-100 text-amber-700',
  PRATA:  'bg-zinc-200 text-zinc-600',
  OURO:   'bg-yellow-100 text-yellow-700',
  VIP:    'bg-purple-100 text-purple-700',
}

type QuickForm = { nome: string; contato: string; cpf: string; email: string }
const EMPTY: QuickForm = { nome: '', contato: '', cpf: '', email: '' }

type Props = {
  companyId: string
  value: SelectedCustomer | null
  onChange: (c: SelectedCustomer | null) => void
}

export default function CustomerPDV({ companyId, value, onChange }: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SelectedCustomer[]>([])
  const [open, setOpen] = useState(false)
  const [showQuick, setShowQuick] = useState(false)
  const [form, setForm] = useState<QuickForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const debounceRef = useRef<number | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    if (!q.trim()) { setResults([]); return }
    debounceRef.current = window.setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, nome, contato, email, cashback_saldo, cashback_tier')
        .eq('company_id', companyId)
        .or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%,contato.ilike.%${q}%`)
        .limit(8)
      setResults((data || []) as SelectedCustomer[])
      setOpen(true)
    }, 300)
  }, [q, companyId])

  function select(c: SelectedCustomer) {
    onChange(c)
    setQ('')
    setResults([])
    setOpen(false)
    setShowQuick(false)
  }

  function clear() {
    onChange(null)
    setQ('')
  }

  function openQuick() {
    setOpen(false)
    setForm({ ...EMPTY, nome: q.trim() })
    setSaveError(null)
    setShowQuick(true)
    setTimeout(() => nameRef.current?.focus(), 50)
  }

  function closeQuick() {
    setShowQuick(false)
    setSaveError(null)
  }

  async function handleSave() {
    const nome = form.nome.trim()
    if (!nome) { setSaveError('Informe o nome.'); return }

    const cpfDigits = form.cpf.replace(/\D/g, '')
    if (cpfDigits && !validateCPF(cpfDigits)) {
      setSaveError('CPF inválido.'); return
    }

    const email = form.email.trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSaveError('E-mail inválido.'); return
    }

    setSaving(true)
    setSaveError(null)
    const { data, error } = await supabase
      .from('customers')
      .insert({
        company_id: companyId,
        nome,
        contato: form.contato.trim() || null,
        cpf_cnpj: cpfDigits || null,
        email: email || null,
        score_interno: 'BOM',
        limite_credito: 0,
        cashback_saldo: 0,
      })
      .select('id, nome, contato, email, cashback_saldo, cashback_tier')
      .single()

    setSaving(false)
    if (error) { setSaveError(error.message); return }
    select(data as SelectedCustomer)
    setForm(EMPTY)
  }

  // ── Selected state ────────────────────────────────────────────────────────
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-2xl border bg-white px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {value.cashback_tier && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${TIER_COLOR[value.cashback_tier] ?? ''}`}>
                {TIER_LABEL[value.cashback_tier]} {value.cashback_tier}
              </span>
            )}
            <span className="font-medium text-sm truncate">{value.nome}</span>
          </div>
          {value.cashback_saldo > 0 && (
            <div className="text-xs text-emerald-600 font-medium mt-0.5">
              Saldo: {formatBRL(value.cashback_saldo)} disponível
            </div>
          )}
        </div>
        <button
          onClick={clear}
          className="text-xs text-zinc-400 hover:text-zinc-600 ml-2 shrink-0 cursor-pointer"
        >
          trocar
        </button>
      </div>
    )
  }

  // ── Search + quick form ───────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} className="space-y-2">

      {/* Search input */}
      {!showQuick && (
        <div className="relative">
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => q.trim() && setOpen(true)}
            placeholder="Buscar cliente (nome, CPF ou telefone)..."
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] transition-colors bg-white"
          />

          {/* Dropdown */}
          {open && (
            <div className="absolute left-0 top-full z-20 w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 overflow-hidden">
              {results.map(c => (
                <div
                  key={c.id}
                  onMouseDown={() => select(c)}
                  className="px-3 py-2.5 cursor-pointer hover:bg-slate-50 flex items-center justify-between border-b border-slate-100 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-slate-800 truncate">{c.nome}</div>
                    <div className="text-xs text-slate-400">{c.contato}</div>
                  </div>
                  <div className="shrink-0 text-right ml-2">
                    {c.cashback_tier && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${TIER_COLOR[c.cashback_tier] ?? ''}`}>
                        {TIER_LABEL[c.cashback_tier]} {c.cashback_tier}
                      </span>
                    )}
                    {c.cashback_saldo > 0 && (
                      <div className="text-xs text-emerald-600 font-medium">{formatBRL(c.cashback_saldo)}</div>
                    )}
                  </div>
                </div>
              ))}

              {/* New customer button always visible when dropdown is open */}
              <div
                onMouseDown={e => { e.preventDefault(); openQuick() }}
                className="px-3 py-2.5 cursor-pointer hover:bg-[#EFF6FF] flex items-center gap-2 text-[#1E40AF] border-t border-slate-100"
              >
                <UserPlus size={14} />
                <span className="text-sm font-medium">
                  {q.trim() ? `Cadastrar "${q.trim()}"` : 'Cadastrar novo cliente'}
                </span>
              </div>
            </div>
          )}

          {/* Show "novo" button also when no dropdown yet */}
          {!open && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); openQuick() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-slate-400 hover:text-[#1E40AF] transition-colors cursor-pointer"
            >
              <UserPlus size={13} />
              <span>novo</span>
            </button>
          )}
        </div>
      )}

      {/* Quick registration form */}
      {showQuick && (
        <div className="rounded-2xl border-2 border-[#1E40AF]/20 bg-[#F8FAFF] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#1E40AF] flex items-center justify-center">
                <UserPlus size={13} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-800">Novo cliente</span>
            </div>
            <button
              onClick={closeQuick}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          {/* Nome */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
              Nome *
            </label>
            <input
              ref={nameRef}
              value={form.nome}
              onChange={e => { setForm(f => ({ ...f, nome: e.target.value })); setSaveError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Nome completo"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1E40AF] transition-colors"
            />
          </div>

          {/* Telefone + CPF lado a lado */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                Telefone
              </label>
              <input
                type="tel"
                value={form.contato}
                onChange={e => setForm(f => ({ ...f, contato: maskPhone(e.target.value) }))}
                placeholder="(11) 99999-9999"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1E40AF] transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                CPF
              </label>
              <input
                value={form.cpf}
                onChange={e => setForm(f => ({ ...f, cpf: maskCPF(e.target.value) }))}
                placeholder="000.000.000-00"
                maxLength={14}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1E40AF] transition-colors font-mono"
              />
            </div>
          </div>

          {/* E-mail */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
              E-mail
            </label>
            <input
              type="email"
              value={form.email}
              onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setSaveError(null) }}
              placeholder="cliente@email.com"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1E40AF] transition-colors"
            />
          </div>

          {saveError && (
            <div className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
              {saveError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={closeQuick}
              className="h-10 flex-1 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-white transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.nome.trim()}
              className="h-10 flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A] disabled:opacity-50 text-white text-sm font-semibold cursor-pointer transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? 'Salvando…' : 'Cadastrar e selecionar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
