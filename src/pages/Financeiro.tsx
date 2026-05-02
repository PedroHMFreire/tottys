import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import KPI from '@/ui/KPI'

type Hoje = {
  vendas_hoje: number
  a_receber_hoje: number
  atrasadas_total: number
  a_pagar_hoje: number
  em_aberto_pagar: number
}

type DRE = {
  periodo: string
  receita_bruta: number
  custo_cartao: number
  cashback: number
  despesas: number
  resultado: number
  crediario_recebido: number
  receita_total: number
}

type Fluxo = {
  dias: number
  a_receber: number
  a_pagar: number
  saldo_liquido: number
}

type ContaAlert = {
  id: string
  nome: string
  valor: number
  vencimento: string
  categoria: string
  status: string
}

const CATEGORIA_LABEL: Record<string, string> = {
  FORNECEDOR:   'Fornecedor',
  ALUGUEL:      'Aluguel',
  FUNCIONARIOS: 'Funcionários',
  ENERGIA:      'Energia/Água',
  OUTROS:       'Outros',
}

function mesAtual() {
  const d = new Date()
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 }
}

function sinal(v: number) {
  return v >= 0 ? '+' : ''
}

export default function Financeiro() {
  const { company } = useApp()
  const [hoje, setHoje] = useState<Hoje | null>(null)
  const [dre, setDre] = useState<DRE | null>(null)
  const [fluxo7, setFluxo7] = useState<Fluxo | null>(null)
  const [fluxo30, setFluxo30] = useState<Fluxo | null>(null)
  const [alertas, setAlertas] = useState<ContaAlert[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'hoje' | 'mes' | 'fluxo'>('hoje')
  const { ano, mes } = mesAtual()

  useEffect(() => {
    if (company?.id) load()
  }, [company?.id])

  async function load() {
    if (!company?.id) return
    setLoading(true)
    try {
      // Gera recorrentes antes de carregar
      await supabase.rpc('fn_gerar_recorrentes', { p_company_id: company.id })

      const [r1, r2, r3, r4, r5] = await Promise.all([
        supabase.rpc('fn_financeiro_hoje',  { p_company_id: company.id }),
        supabase.rpc('fn_dre_mensal',       { p_company_id: company.id, p_ano: ano, p_mes: mes }),
        supabase.rpc('fn_fluxo_projetado',  { p_company_id: company.id, p_dias: 7 }),
        supabase.rpc('fn_fluxo_projetado',  { p_company_id: company.id, p_dias: 30 }),
        // Contas vencendo nos próximos 3 dias ou já atrasadas
        supabase
          .from('contas_pagar')
          .select('id, nome, valor, vencimento, categoria, status')
          .eq('company_id', company.id)
          .eq('status', 'PENDENTE')
          .lte('vencimento', new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10))
          .order('vencimento'),
      ])

      if (r1.data) setHoje(r1.data as Hoje)
      if (r2.data) setDre(r2.data as DRE)
      if (r3.data) setFluxo7(r3.data as Fluxo)
      if (r4.data) setFluxo30(r4.data as Fluxo)
      setAlertas((r5.data || []) as ContaAlert[])
    } finally {
      setLoading(false)
    }
  }

  const dreLinhas = dre ? [
    { label: 'Receita bruta (vendas)', valor: dre.receita_bruta, cor: 'text-emerald-700', bold: false },
    { label: 'Crediário recebido', valor: dre.crediario_recebido, cor: 'text-emerald-600', bold: false },
    { label: '(-) Taxas de cartão', valor: -dre.custo_cartao, cor: 'text-red-500', bold: false },
    { label: '(-) Cashback concedido', valor: -dre.cashback, cor: 'text-purple-500', bold: false },
    { label: '(-) Despesas pagas', valor: -dre.despesas, cor: 'text-red-500', bold: false },
    { label: 'Resultado estimado', valor: dre.resultado, cor: dre.resultado >= 0 ? 'text-emerald-700' : 'text-red-600', bold: true },
  ] : []

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b px-4 py-3 z-10 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-navy">Financeiro</h1>
          <Link
            to="/contas-pagar"
            className="text-xs border rounded-xl px-3 py-1 hover:bg-zinc-50"
          >
            Contas a Pagar
          </Link>
        </div>
        <div className="flex gap-1.5">
          {(['hoje', 'mes', 'fluxo'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border cursor-pointer transition-colors ${tab === t ? 'bg-primary text-white border-azure' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {t === 'hoje' ? 'Hoje' : t === 'mes' ? `Mês (${mes}/${ano})` : 'Projeção'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 mt-3 space-y-3">
        {!company?.id && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3">
            Selecione uma empresa.
          </div>
        )}

        {loading && <div className="text-sm text-slate-400 py-4 text-center">Carregando…</div>}

        {/* Alertas de contas vencendo */}
        {alertas.length > 0 && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 space-y-1.5">
            <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
              ⚠️ Contas vencidas ou vencendo em 3 dias
            </div>
            {alertas.map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className={`text-amber-900 ${new Date(c.vencimento) < new Date(new Date().toDateString()) ? 'font-semibold text-red-700' : ''}`}>
                  {c.nome}
                  {new Date(c.vencimento) < new Date(new Date().toDateString()) && ' · ATRASADA'}
                </span>
                <span className="font-semibold text-amber-900 shrink-0 ml-2">{formatBRL(c.valor)}</span>
              </div>
            ))}
            <Link to="/contas-pagar" className="text-xs text-amber-700 underline">Ver todas →</Link>
          </div>
        )}

        {/* ===== ABA HOJE ===== */}
        {tab === 'hoje' && hoje && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <KPI label="Vendas hoje" value={formatBRL(hoje.vendas_hoje)} />
              <KPI label="A receber hoje" value={formatBRL(hoje.a_receber_hoje)} />
            </div>

            {hoje.a_pagar_hoje > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 flex items-center justify-between">
                <span className="text-sm text-red-700 font-medium">Conta(s) vencendo hoje</span>
                <span className="text-sm font-semibold text-red-700">{formatBRL(hoje.a_pagar_hoje)}</span>
              </div>
            )}

            {hoje.atrasadas_total > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm text-red-700 font-medium">Crediário atrasado</div>
                  <div className="text-xs text-red-500">
                    <Link to="/crediario" className="underline">Ver parcelas →</Link>
                  </div>
                </div>
                <span className="text-sm font-semibold text-red-700">{formatBRL(hoje.atrasadas_total)}</span>
              </div>
            )}

            {hoje.em_aberto_pagar > 0 && (
              <div className="rounded-2xl border bg-white p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Contas a pagar (30 dias)</div>
                  <Link to="/contas-pagar" className="text-xs text-zinc-400 underline">Gerenciar →</Link>
                </div>
                <span className="text-sm font-semibold">{formatBRL(hoje.em_aberto_pagar)}</span>
              </div>
            )}

            {hoje.vendas_hoje === 0 && hoje.a_receber_hoje === 0 && hoje.a_pagar_hoje === 0 && (
              <div className="rounded-2xl border p-4 text-center text-zinc-400 text-sm">
                Nenhuma movimentação registrada hoje.
              </div>
            )}

            {/* Quick links */}
            <div className="pt-2 space-y-1">
              <div className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Acesso rápido</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Link to="/contas-pagar" className="rounded-xl border p-3 text-center text-sm hover:bg-zinc-50">
                  <div className="font-medium">Contas a Pagar</div>
                  <div className="text-xs text-zinc-400">lançar despesas</div>
                </Link>
                <Link to="/crediario" className="rounded-xl border p-3 text-center text-sm hover:bg-zinc-50">
                  <div className="font-medium">Crediário</div>
                  <div className="text-xs text-zinc-400">parcelas em aberto</div>
                </Link>
                <Link to="/insights" className="rounded-xl border p-3 text-center text-sm hover:bg-zinc-50">
                  <div className="font-medium">Insights</div>
                  <div className="text-xs text-zinc-400">reposição, encalhe</div>
                </Link>
                <Link to="/adm/cashback" className="rounded-xl border p-3 text-center text-sm hover:bg-zinc-50">
                  <div className="font-medium">Cashback</div>
                  <div className="text-xs text-zinc-400">fidelidade</div>
                </Link>
              </div>
            </div>
          </>
        )}

        {/* ===== ABA MÊS (DRE) ===== */}
        {tab === 'mes' && dre && (
          <>
            <div className="rounded-2xl border bg-white p-4 space-y-2">
              <div className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                DRE · {dre.periodo}
              </div>
              {dreLinhas.map((l, i) => (
                <div
                  key={i}
                  className={`flex justify-between text-sm ${l.bold ? 'font-bold border-t pt-2 mt-1 text-base' : ''} ${l.cor}`}
                >
                  <span className={l.bold ? '' : 'text-zinc-600'}>{l.label}</span>
                  <span>{l.valor < 0 ? `- ${formatBRL(Math.abs(l.valor))}` : formatBRL(l.valor)}</span>
                </div>
              ))}
            </div>

            {/* Insight do resultado */}
            {dre.resultado !== 0 && (
              <div className={`rounded-2xl border p-3 text-sm ${dre.resultado >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                {dre.resultado >= 0
                  ? `O mês está positivo. Resultado estimado de ${formatBRL(dre.resultado)}.`
                  : `Atenção: despesas estão superando receitas em ${formatBRL(Math.abs(dre.resultado))}.`
                }
              </div>
            )}

            {/* Detalhes do cartão */}
            {dre.custo_cartao > 0 && (
              <div className="rounded-2xl border bg-white p-3 text-sm">
                <div className="text-zinc-500 text-xs mb-1">Custo das maquininhas este mês</div>
                <div className="font-semibold">{formatBRL(dre.custo_cartao)}</div>
                {dre.receita_bruta > 0 && (
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {((dre.custo_cartao / dre.receita_bruta) * 100).toFixed(1)}% da receita bruta
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ===== ABA PROJEÇÃO ===== */}
        {tab === 'fluxo' && (
          <>
            <div className="sm:grid sm:grid-cols-2 sm:gap-4">
            {[{ fluxo: fluxo7, label: 'Próximos 7 dias' }, { fluxo: fluxo30, label: 'Próximos 30 dias' }].map(({ fluxo, label }) =>
              fluxo ? (
                <div key={label} className="rounded-2xl border bg-white p-4 space-y-2">
                  <div className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">{label}</div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-600">Crediário a receber</span>
                    <span className="text-emerald-600 font-medium">{formatBRL(fluxo.a_receber)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-600">Contas a pagar</span>
                    <span className="text-red-500 font-medium">- {formatBRL(fluxo.a_pagar)}</span>
                  </div>
                  <div className={`flex justify-between text-sm font-bold border-t pt-2 ${fluxo.saldo_liquido >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    <span>Saldo líquido projetado</span>
                    <span>{sinal(fluxo.saldo_liquido)}{formatBRL(fluxo.saldo_liquido)}</span>
                  </div>
                </div>
              ) : null
            )}
            </div>

            {fluxo7 && fluxo7.saldo_liquido < 0 && (
              <div className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                ⚠️ Projeção de 7 dias negativa. Avalie adiantar cobranças do crediário ou postergar pagamentos.
              </div>
            )}

            <div className="rounded-2xl border border-zinc-100 p-3 text-xs text-zinc-400">
              A projeção considera apenas crediário a receber e contas a pagar cadastradas. Vendas futuras não são estimadas.
            </div>
          </>
        )}
      </div>


    </div>
  )
}
