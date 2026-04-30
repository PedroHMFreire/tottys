import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import type { Customer, ScoreInterno, CrediarioVenda, CrediarioParcela } from '@/domain/types'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import KPI from '@/ui/KPI'
import { maskCPF, maskCNPJ, maskPhone, validateCPF, validateCNPJ } from '@/lib/validators'

function maskDoc(v: string): string {
  const digits = v.replace(/\D/g, '')
  return digits.length <= 11 ? maskCPF(v) : maskCNPJ(v)
}

const SCORE_STYLE: Record<ScoreInterno, string> = {
  BOM:      'bg-emerald-100 text-emerald-700',
  REGULAR:  'bg-amber-100 text-amber-700',
  RUIM:     'bg-red-100 text-red-600',
  BLOQUEADO:'bg-zinc-200 text-zinc-500',
}
const SCORE_LABELS: Record<ScoreInterno, string> = {
  BOM: 'Bom pagador', REGULAR: 'Regular', RUIM: 'Risco', BLOQUEADO: 'Bloqueado',
}

type CustomerForm = {
  nome: string; cpf_cnpj: string; contato: string; email: string
  data_nascimento: string; endereco: string; observacoes: string
  limite_credito: string; score_interno: ScoreInterno
}
const EMPTY_FORM: CustomerForm = {
  nome: '', cpf_cnpj: '', contato: '', email: '', data_nascimento: '', endereco: '',
  observacoes: '', limite_credito: '0', score_interno: 'BOM',
}

export default function Customers() {
  const { company } = useApp()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Detail sheet data
  const [crediarios, setCrediarios] = useState<CrediarioVenda[]>([])
  const [parcelas, setParcelas] = useState<CrediarioParcela[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  const debounce = useRef<number | null>(null)

  useEffect(() => {
    if (!company?.id) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => loadCustomers(), 300)
  }, [q, company?.id])

  async function loadCustomers() {
    if (!company?.id) return
    setLoading(true)
    try {
      let query = supabase
        .from('customers')
        .select('*')
        .eq('company_id', company.id)
        .order('nome')
        .limit(100)
      const term = q.trim().slice(0, 100)
      if (term) {
        query = query.or(`nome.ilike.%${term}%,cpf_cnpj.ilike.%${term}%,contato.ilike.%${term}%`)
      }
      const { data } = await query
      setCustomers((data || []) as Customer[])
    } finally {
      setLoading(false)
    }
  }

  async function loadDetail(c: Customer) {
    setSelected(c)
    setLoadingDetail(true)
    const [cv, cp] = await Promise.all([
      supabase.from('crediario_vendas').select('*').eq('customer_id', c.id).order('created_at', { ascending: false }),
      supabase.from('crediario_parcelas').select('*').eq('customer_id', c.id).order('vencimento').limit(20),
    ])
    setCrediarios((cv.data || []) as CrediarioVenda[])
    setParcelas((cp.data || []) as CrediarioParcela[])
    setLoadingDetail(false)
  }

  function openNew() {
    setEditCustomer(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(c: Customer) {
    setEditCustomer(c)
    setForm({
      nome: c.nome, cpf_cnpj: c.cpf_cnpj || '', contato: c.contato || '',
      email: (c as any).email || '',
      data_nascimento: c.data_nascimento || '', endereco: c.endereco || '',
      observacoes: c.observacoes || '',
      limite_credito: String(c.limite_credito ?? 0),
      score_interno: c.score_interno || 'BOM',
    })
    setFormError(null)
    setShowForm(true)
  }

  async function deleteCustomer(id: string) {
    setDeleting(true)
    setDeleteError(null)
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) throw error
      setSelected(null)
      setConfirmDeleteId(null)
      await loadCustomers()
    } catch (e: any) {
      setDeleteError(e?.message || 'Não foi possível apagar o cliente.')
    } finally {
      setDeleting(false)
    }
  }

  async function saveCustomer() {
    if (!form.nome.trim()) { setFormError('Informe o nome.'); return }
    if (!company?.id) return

    // CPF/CNPJ
    const cpfCnpjDigits = form.cpf_cnpj.replace(/\D/g, '')
    if (cpfCnpjDigits) {
      if (cpfCnpjDigits.length === 11 && !validateCPF(cpfCnpjDigits)) {
        setFormError('CPF inválido. Verifique os dígitos.'); return
      }
      if (cpfCnpjDigits.length === 14 && !validateCNPJ(cpfCnpjDigits)) {
        setFormError('CNPJ inválido. Verifique os dígitos.'); return
      }
      if (cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
        setFormError('CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos.'); return
      }
    }

    // Limite de crédito
    const limiteRaw = form.limite_credito.replace(',', '.').trim()
    const limite = limiteRaw ? Number(limiteRaw) : 0
    if (limiteRaw && (isNaN(limite) || limite < 0)) {
      setFormError('Limite de crédito inválido. Use um valor numérico positivo.'); return
    }

    // Data de nascimento
    if (form.data_nascimento) {
      const dt = new Date(form.data_nascimento + 'T00:00:00')
      if (isNaN(dt.getTime()) || dt.getFullYear() < 1900 || dt > new Date()) {
        setFormError('Data de nascimento inválida.'); return
      }
    }

    setSaving(true)
    setFormError(null)
    const emailTrimmed = form.email.trim().toLowerCase()
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setFormError('E-mail inválido.'); return
    }

    const payload = {
      company_id: company.id,
      nome: form.nome.trim(),
      cpf_cnpj: cpfCnpjDigits || null,
      contato: form.contato.replace(/\D/g, '') ? form.contato.trim() : null,
      email: emailTrimmed || null,
      data_nascimento: form.data_nascimento || null,
      endereco: form.endereco.trim() || null,
      observacoes: form.observacoes.trim() || null,
      limite_credito: limite,
      score_interno: form.score_interno,
    }
    try {
      if (editCustomer) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editCustomer.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('customers').insert(payload)
        if (error) throw error
      }
      setShowForm(false)
      await loadCustomers()
    } catch (e: any) {
      setFormError(e?.message || 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const totalAberto = parcelas.filter(p => p.status !== 'PAGA').reduce((a, p) => a + Number(p.valor), 0)
  const atrasadas = parcelas.filter(p => p.status === 'ATRASADA').length

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="sticky top-0 bg-[#F8FAFC] pb-3 z-10 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[#1E1B4B]">Clientes</h1>
            <p className="text-xs text-slate-400 mt-0.5">Base de clientes da empresa</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/adm/cashback"
              className="text-xs border border-violet-200 rounded-xl px-3 py-1.5 text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors font-medium cursor-pointer"
            >
              Cashback
            </Link>
            <Button size="sm" onClick={openNew}>+ Novo cliente</Button>
          </div>
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar por nome, CPF ou telefone…"
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] transition-colors bg-white"
        />
      </div>

      <div className="mt-3 space-y-2">
        {!company?.id && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-3 text-sm">Selecione uma empresa.</div>
        )}
        {loading && <div className="text-sm text-slate-400 py-4 text-center">Carregando…</div>}
        {!loading && customers.length === 0 && company?.id && (
          <div className="text-sm text-slate-400 py-4 text-center">Nenhum cliente encontrado.</div>
        )}
        {customers.map(c => (
          <div
            key={c.id}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-2 hover:border-slate-300 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm text-[#1E1B4B] truncate">{c.nome}</div>
              <div className="text-xs text-slate-400 mt-0.5">{c.cpf_cnpj || c.contato || 'Sem contato'}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {c.cashback_tier && c.cashback_tier !== 'BRONZE' && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100 whitespace-nowrap">
                  {c.cashback_tier}
                </span>
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${SCORE_STYLE[c.score_interno || 'BOM']}`}>
                {SCORE_LABELS[c.score_interno || 'BOM']}
              </span>
              <Button size="sm" variant="secondary" onClick={() => loadDetail(c)}>Ver</Button>
            </div>
          </div>
        ))}
      </div>

      {/* Detail Sheet */}
      {selected && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md lg:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-base font-semibold text-[#1E1B4B]">{selected.nome}</div>
                <div className="text-xs text-slate-400 mt-0.5">{selected.cpf_cnpj || 'Sem CPF'} · {selected.contato || 'Sem contato'}</div>
              </div>
              <div className="flex gap-3 items-center shrink-0 ml-3">
                <button onClick={() => openEdit(selected)} className="text-xs text-[#1E40AF] hover:text-[#1E3A8A] font-medium cursor-pointer transition-colors">Editar</button>
                {confirmDeleteId === selected.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => deleteCustomer(selected.id)}
                      disabled={deleting}
                      className="text-xs bg-rose-500 hover:bg-rose-600 text-white px-2 py-1 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {deleting ? '…' : 'Confirmar'}
                    </button>
                    <button onClick={() => { setConfirmDeleteId(null); setDeleteError(null) }} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">Cancelar</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(selected.id)}
                    className="text-xs text-rose-500 hover:text-rose-700 font-medium cursor-pointer transition-colors"
                  >
                    Apagar
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer transition-colors">Fechar</button>
              </div>
            </div>

            {deleteError && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 text-rose-700 p-3 text-xs">{deleteError}</div>
            )}

            <section className="grid grid-cols-3 gap-2">
              <KPI label="Em aberto" value={formatBRL(totalAberto)} />
              <KPI label="Atrasadas" value={String(atrasadas)} />
              <KPI label="Limite" value={formatBRL(selected.limite_credito ?? 0)} />
            </section>
            {(selected.cashback_saldo ?? 0) > 0 || (selected.cashback_total_gasto ?? 0) > 0 ? (
              <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium text-violet-800 text-sm">
                    {selected.cashback_tier || 'BRONZE'}
                  </div>
                  <div className="text-xs text-violet-500">Total gasto: {formatBRL(selected.cashback_total_gasto ?? 0)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-purple-700">{formatBRL(selected.cashback_saldo ?? 0)}</div>
                  <div className="text-xs text-purple-500">saldo cashback</div>
                </div>
              </div>
            ) : null}

            {loadingDetail ? (
              <div className="text-sm text-zinc-500">Carregando histórico...</div>
            ) : (
              <>
                {crediarios.length > 0 && (
                  <Card title="Crediários">
                    <div className="space-y-2">
                      {crediarios.slice(0, 5).map(cv => (
                        <div key={cv.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0">
                          <div>
                            <div>{new Date(cv.created_at).toLocaleDateString('pt-BR')}</div>
                            <div className="text-xs text-zinc-500">{cv.num_parcelas}x de {formatBRL(cv.valor_parcela)}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{formatBRL(cv.valor_total)}</div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cv.status === 'QUITADA' ? 'bg-emerald-100 text-emerald-700' : cv.status === 'CANCELADA' ? 'bg-zinc-100 text-zinc-500' : 'bg-amber-100 text-amber-700'}`}>
                              {cv.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {parcelas.filter(p => p.status !== 'PAGA').length > 0 && (
                  <Card title="Parcelas em aberto">
                    <div className="space-y-1">
                      {parcelas.filter(p => p.status !== 'PAGA').slice(0, 8).map(p => (
                        <div key={p.id} className="flex items-center justify-between text-sm">
                          <div>
                            <span className="text-zinc-500">{p.num_parcela}ª</span>
                            <span className="ml-2">{new Date(p.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{formatBRL(p.valor)}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.status === 'ATRASADA' ? 'bg-red-100 text-red-600' : 'bg-zinc-100 text-zinc-600'}`}>
                              {p.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {crediarios.length === 0 && (
                  <div className="text-sm text-zinc-500">Nenhum crediário registrado para este cliente.</div>
                )}
              </>
            )}

            <Button onClick={() => setSelected(null)}>Fechar</Button>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md lg:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between sticky top-0 bg-white pb-2 border-b border-slate-100">
              <div className="text-base font-semibold text-[#1E1B4B]">{editCustomer ? 'Editar Cliente' : 'Novo Cliente'}</div>
              <button onClick={() => setShowForm(false)} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer transition-colors">Fechar</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1 block">Nome *</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Nome completo"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-300 focus:outline-none focus:border-[#1E40AF] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1 block">CPF / CNPJ</label>
                <input
                  value={form.cpf_cnpj}
                  onChange={e => setForm(p => ({ ...p, cpf_cnpj: maskDoc(e.target.value) }))}
                  placeholder="000.000.000-00"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-300 focus:outline-none focus:border-[#1E40AF] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1 block">WhatsApp / Telefone</label>
                <input
                  value={form.contato}
                  onChange={e => setForm(p => ({ ...p, contato: maskPhone(e.target.value) }))}
                  placeholder="(11) 99999-9999"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-300 focus:outline-none focus:border-[#1E40AF] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1 block">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="cliente@email.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-300 focus:outline-none focus:border-[#1E40AF] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1 block">Endereço</label>
                <input
                  value={form.endereco}
                  onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))}
                  placeholder="Rua, número, bairro"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-300 focus:outline-none focus:border-[#1E40AF] transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1 block">Nascimento</label>
                  <input type="date" value={form.data_nascimento} onChange={e => setForm(p => ({ ...p, data_nascimento: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] transition-colors" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1 block">Limite de Crédito</label>
                  <input value={form.limite_credito} onChange={e => setForm(p => ({ ...p, limite_credito: e.target.value }))} placeholder="0,00" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-300 focus:outline-none focus:border-[#1E40AF] transition-colors" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1 block">Score / Situação</label>
                <select value={form.score_interno} onChange={e => setForm(p => ({ ...p, score_interno: e.target.value as ScoreInterno }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] transition-colors bg-white">
                  <option value="BOM">Bom pagador</option>
                  <option value="REGULAR">Regular</option>
                  <option value="RUIM">Risco</option>
                  <option value="BLOQUEADO">Bloqueado</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1 block">Observações</label>
                <textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-300 focus:outline-none focus:border-[#1E40AF] transition-colors resize-none" />
              </div>
            </div>

            {formError && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-800 p-3 text-xs">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sticky bottom-0 bg-white pt-3 border-t border-slate-100">
              <Button variant="ghost" full onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button full onClick={saveCustomer} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
