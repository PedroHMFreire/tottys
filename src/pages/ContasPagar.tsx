import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import Button from '@/ui/Button'

type Conta = {
  id: string
  nome: string
  valor: number
  vencimento: string
  categoria: string
  status: 'PENDENTE' | 'PAGO' | 'CANCELADO'
  recorrente: boolean
  pago_em: string | null
  valor_pago: number | null
  observacoes: string | null
}

type ContaForm = {
  nome: string
  valor: string
  vencimento: string
  categoria: string
  recorrente: boolean
  observacoes: string
}

const CATEGORIAS = ['FORNECEDOR', 'ALUGUEL', 'FUNCIONARIOS', 'ENERGIA', 'OUTROS'] as const
const CAT_LABEL: Record<string, string> = {
  FORNECEDOR:   '🛒 Fornecedor',
  ALUGUEL:      '🏠 Aluguel',
  FUNCIONARIOS: '👥 Funcionários',
  ENERGIA:      '⚡ Energia/Água',
  OUTROS:       '📋 Outros',
}
const STATUS_STYLE: Record<string, string> = {
  PENDENTE:   'bg-amber-100 text-amber-700',
  PAGO:       'bg-emerald-100 text-emerald-700',
  CANCELADO:  'bg-zinc-100 text-zinc-500',
}

const EMPTY_FORM: ContaForm = {
  nome: '', valor: '', vencimento: new Date().toISOString().slice(0, 10),
  categoria: 'OUTROS', recorrente: false, observacoes: '',
}

function isAtrasada(c: Conta) {
  return c.status === 'PENDENTE' && c.vencimento < new Date().toISOString().slice(0, 10)
}

export default function ContasPagar() {
  const { company } = useApp()
  const [contas, setContas] = useState<Conta[]>([])
  const [loading, setLoading] = useState(false)
  const [filtro, setFiltro] = useState<'PENDENTE' | 'PAGO' | 'TODAS'>('PENDENTE')
  const [showForm, setShowForm] = useState(false)
  const [editConta, setEditConta] = useState<Conta | null>(null)
  const [form, setForm] = useState<ContaForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [pagando, setPagando] = useState<Conta | null>(null)
  const [valorPago, setValorPago] = useState('')

  useEffect(() => {
    if (company?.id) load()
  }, [company?.id, filtro])

  async function load() {
    if (!company?.id) return
    setLoading(true)
    try {
      let q = supabase
        .from('contas_pagar')
        .select('*')
        .eq('company_id', company.id)
        .order('vencimento')
        .limit(200)
      if (filtro !== 'TODAS') q = q.eq('status', filtro)
      const { data } = await q
      setContas((data || []) as Conta[])
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setEditConta(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(c: Conta) {
    setEditConta(c)
    setForm({
      nome: c.nome,
      valor: String(c.valor),
      vencimento: c.vencimento,
      categoria: c.categoria,
      recorrente: c.recorrente,
      observacoes: c.observacoes || '',
    })
    setShowForm(true)
  }

  async function save() {
    if (!company?.id || !form.nome.trim() || !form.valor || !form.vencimento) return
    setSaving(true)
    try {
      const payload = {
        company_id: company.id,
        nome: form.nome.trim(),
        valor: parseFloat(form.valor.replace(',', '.')),
        vencimento: form.vencimento,
        categoria: form.categoria,
        recorrente: form.recorrente,
        observacoes: form.observacoes.trim() || null,
      }
      if (editConta) {
        await supabase.from('contas_pagar').update(payload).eq('id', editConta.id)
      } else {
        await supabase.from('contas_pagar').insert(payload)
      }
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function marcarPago(c: Conta) {
    const vp = parseFloat((valorPago || String(c.valor)).replace(',', '.'))
    await supabase.from('contas_pagar').update({
      status: 'PAGO',
      pago_em: new Date().toISOString().slice(0, 10),
      valor_pago: vp,
    }).eq('id', c.id)
    setPagando(null)
    setValorPago('')
    await load()
  }

  async function cancelar(id: string) {
    await supabase.from('contas_pagar').update({ status: 'CANCELADO' }).eq('id', id)
    await load()
  }

  const totalPendente = contas.filter(c => c.status === 'PENDENTE').reduce((a, c) => a + c.valor, 0)
  const totalAtrasado = contas.filter(isAtrasada).reduce((a, c) => a + c.valor, 0)

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b px-4 py-3 z-10 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-navy">Contas a Pagar</h1>
          <Button onClick={openNew}>+ Nova</Button>
        </div>
        <div className="flex gap-1.5">
          {(['PENDENTE', 'PAGO', 'TODAS'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border cursor-pointer transition-colors ${filtro === f ? 'bg-primary text-white border-azure' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {f === 'PENDENTE' ? 'Pendentes' : f === 'PAGO' ? 'Pagas' : 'Todas'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 mt-3 space-y-3">
        {!company?.id && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3">Selecione uma empresa.</div>
        )}

        {/* KPIs resumo */}
        {filtro === 'PENDENTE' && (totalPendente > 0 || totalAtrasado > 0) && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border bg-white p-3 text-center">
              <div className="text-xs text-zinc-500">Total pendente</div>
              <div className="font-semibold">{formatBRL(totalPendente)}</div>
            </div>
            {totalAtrasado > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-center">
                <div className="text-xs text-red-500">Em atraso</div>
                <div className="font-semibold text-red-600">{formatBRL(totalAtrasado)}</div>
              </div>
            )}
          </div>
        )}

        {loading && <div className="text-sm text-slate-400 py-4 text-center">Carregando…</div>}

        {!loading && contas.length === 0 && company?.id && (
          <div className="rounded-2xl border border-dashed p-6 text-center text-zinc-400">
            <div className="text-2xl mb-2">📋</div>
            <div className="font-medium mb-1">Nenhuma conta{filtro === 'PENDENTE' ? ' pendente' : filtro === 'PAGO' ? ' paga' : ''}</div>
            {filtro === 'PENDENTE' && (
              <div className="text-sm">
                Clique em <strong>+ Nova</strong> para lançar uma despesa.
                <br />Contas recorrentes se renovam automaticamente.
              </div>
            )}
          </div>
        )}

        {contas.map(c => (
          <div
            key={c.id}
            className={`rounded-2xl border bg-white p-3 space-y-2 ${isAtrasada(c) ? 'border-red-200' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium truncate">{c.nome}</span>
                  {c.recorrente && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">recorrente</span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {CAT_LABEL[c.categoria]} · vence {new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                  {isAtrasada(c) && <span className="ml-2 text-red-500 font-medium">ATRASADA</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold">{formatBRL(c.valor)}</div>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>
                  {c.status}
                </span>
              </div>
            </div>

            {c.status === 'PENDENTE' && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setPagando(c); setValorPago(String(c.valor)) }}
                  className="flex-1 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium"
                >
                  Marcar como pago
                </button>
                <button
                  onClick={() => openEdit(c)}
                  className="px-3 py-1.5 rounded-xl border text-xs text-zinc-600 hover:bg-zinc-50"
                >
                  Editar
                </button>
                <button
                  onClick={() => cancelar(c.id)}
                  className="px-3 py-1.5 rounded-xl border text-xs text-zinc-400 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
              </div>
            )}

            {c.status === 'PAGO' && c.pago_em && (
              <div className="text-xs text-emerald-600">
                Pago em {new Date(c.pago_em + 'T00:00:00').toLocaleDateString('pt-BR')}
                {c.valor_pago && c.valor_pago !== c.valor && ` · R$ ${formatBRL(c.valor_pago)}`}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal de pagamento */}
      {pagando && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Confirmar pagamento</div>
              <button onClick={() => setPagando(null)} className="text-zinc-500 text-sm">fechar</button>
            </div>
            <div className="text-sm">
              <div className="font-medium">{pagando.nome}</div>
              <div className="text-zinc-500">
                Vencimento: {new Date(pagando.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Valor pago (R$)</div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={valorPago}
                onChange={e => setValorPago(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-lg font-semibold text-navy text-center focus:outline-none focus:border-azure transition-colors bg-white w-full"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setPagando(null)}>Cancelar</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => marcarPago(pagando)}>
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de formulário */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{editConta ? 'Editar conta' : 'Nova conta'}</div>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 text-sm">fechar</button>
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Nome / descrição</div>
              <input
                value={form.nome}
                onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="Ex.: Aluguel junho, Fornecedor XYZ..."
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white w-full"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Valor (R$)</div>
                <input
                  type="number" min="0" step="0.01"
                  value={form.valor}
                  onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white w-full"
                  placeholder="0,00"
                />
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Vencimento</div>
                <input
                  type="date"
                  value={form.vencimento}
                  onChange={e => setForm(p => ({ ...p, vencimento: e.target.value }))}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-azure transition-colors bg-white w-full"
                />
              </div>
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Categoria</div>
              <div className="grid grid-cols-2 gap-1.5">
                {CATEGORIAS.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setForm(p => ({ ...p, categoria: cat }))}
                    className={`py-2 px-3 rounded-xl text-xs text-left border cursor-pointer transition-colors ${form.categoria === cat ? 'bg-primary text-white border-azure' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {CAT_LABEL[cat]}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.recorrente}
                onChange={e => setForm(p => ({ ...p, recorrente: e.target.checked }))}
                className="w-4 h-4"
              />
              <div>
                <div className="text-sm font-medium">Conta recorrente</div>
                <div className="text-xs text-zinc-400">Cria automaticamente no próximo mês</div>
              </div>
            </label>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Observações (opcional)</div>
              <input
                value={form.observacoes}
                onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white w-full"
                placeholder="Nota fiscal, referência..."
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.nome.trim() || !form.valor || !form.vencimento}>
                {saving ? 'Salvando...' : editConta ? 'Salvar' : 'Criar conta'}
              </Button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
