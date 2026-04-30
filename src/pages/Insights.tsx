import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import KPI from '@/ui/KPI'

type ReposicaoRow = {
  product_id: string; produto_nome: string; produto_sku: string
  variant_id: string; tamanho: string; cor: string
  estoque_atual: number; vendas_30d: number; velocidade: number; dias_restantes: number
}
type EncalhadoRow = {
  product_id: string; nome: string; sku: string
  estoque_total: number; ultima_venda: string | null; dias_parado: number
}
type GradeFuradaRow = {
  product_id: string; produto_nome: string; produto_sku: string
  variant_id: string; tamanho: string; cor: string; store_id: string; qty: number
}
type Resumo = {
  reposicao_urgente: number; encalhados: number; grade_furada: number; inadimplentes: number
}

export default function Insights() {
  const { company, store } = useApp()
  const [loading, setLoading] = useState(false)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [reposicao, setReposicao] = useState<ReposicaoRow[]>([])
  const [encalhados, setEncalhados] = useState<EncalhadoRow[]>([])
  const [gradeFurada, setGradeFurada] = useState<GradeFuradaRow[]>([])
  const [diasAlerta, setDiasAlerta] = useState(14)
  const [diasEncalhado, setDiasEncalhado] = useState(30)

  useEffect(() => {
    if (company?.id) load()
  }, [company?.id, store?.id])

  async function load() {
    if (!company?.id) return
    setLoading(true)
    const storeId = store?.id ?? null
    try {
      const [res, rep, enc, grade] = await Promise.all([
        supabase.rpc('fn_resumo_insights',       { p_company_id: company.id, p_store_id: storeId }),
        supabase.rpc('fn_reposicao_urgente',     { p_company_id: company.id, p_store_id: storeId, p_dias_alerta: diasAlerta }),
        supabase.rpc('fn_produtos_encalhados',   { p_company_id: company.id, p_store_id: storeId, p_dias_sem_venda: diasEncalhado }),
        (() => {
          const q = supabase.from('v_grade_ruptura').select('*').order('produto_nome')
          return storeId ? q.eq('store_id', storeId) : q
        })(),
      ])
      setResumo(res.data?.[0] ?? null)
      setReposicao((rep.data || []) as ReposicaoRow[])
      setEncalhados((enc.data || []) as EncalhadoRow[])
      setGradeFurada((grade.data || []) as GradeFuradaRow[])
    } finally {
      setLoading(false)
    }
  }

  function urgencyColor(dias: number) {
    if (dias <= 3)  return 'bg-red-100 text-red-700'
    if (dias <= 7)  return 'bg-orange-100 text-orange-700'
    return 'bg-amber-100 text-amber-700'
  }

  function sugestaoPedido(r: ReposicaoRow) {
    // Sugere 30 dias de estoque com base na velocidade
    return Math.max(1, Math.ceil(r.velocidade * 30) - r.estoque_atual)
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="sticky top-0 bg-white border-b px-4 py-3 z-10 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#1E1B4B]">Insights</h1>
        <Button onClick={load} disabled={loading || !company?.id}>
          {loading ? 'Analisando...' : 'Atualizar'}
        </Button>
      </div>

      {!company?.id && (
        <div className="px-4 mt-3 rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3">Selecione uma empresa.</div>
      )}

      {/* KPIs de alerta */}
      {resumo && (
        <section className="px-4 mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
          <KPI label="Reposição urgente" value={String(resumo.reposicao_urgente)} />
          <KPI label="Encalhados"        value={String(resumo.encalhados)} />
          <KPI label="Grade furada"      value={String(resumo.grade_furada)} />
          <KPI label="Inadimplentes"     value={String(resumo.inadimplentes)} />
        </section>
      )}

      <div className="px-4 mt-3 space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">

        {/* Reposição urgente */}
        <Card title="Reposição Urgente">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-zinc-500">Alertar se estoque &lt;</span>
            <select
              value={diasAlerta}
              onChange={e => setDiasAlerta(Number(e.target.value))}
              className="rounded-xl border px-2 py-1 text-xs"
            >
              {[7, 14, 21, 30].map(d => <option key={d} value={d}>{d} dias</option>)}
            </select>
            <Button onClick={load} disabled={loading}>Aplicar</Button>
          </div>

          {loading ? (
            <div className="text-sm text-slate-400 py-4 text-center">Calculando velocidade de vendas...</div>
          ) : !store?.id ? (
            <div className="text-sm text-amber-700">Selecione uma loja para ver previsões de estoque.</div>
          ) : reposicao.length === 0 ? (
            <div className="text-sm text-emerald-700">Nenhuma variante em alerta de reposição.</div>
          ) : (
            <div className="space-y-2">
              {reposicao.map((r, i) => (
                <div key={i} className="rounded-xl border p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{r.produto_nome}</div>
                      <div className="flex gap-1 mt-0.5">
                        <span className="text-xs bg-zinc-100 px-2 py-0.5 rounded-full">{r.tamanho}</span>
                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{r.cor}</span>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${urgencyColor(r.dias_restantes)}`}>
                      {r.dias_restantes === 999 ? 'sem vendas' : `${r.dias_restantes}d`}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-xs text-zinc-500">
                    <div><span className="block font-medium text-zinc-700">{r.estoque_atual}</span>em estoque</div>
                    <div><span className="block font-medium text-zinc-700">{r.vendas_30d}</span>vendidos/30d</div>
                    <div><span className="block font-medium text-emerald-700">{sugestaoPedido(r)}</span>sugestão pedido</div>
                  </div>
                </div>
              ))}
              <div className="text-xs text-zinc-400 pt-1">Sugestão = 30 dias de estoque com base na velocidade atual</div>
            </div>
          )}
        </Card>

        {/* Encalhados */}
        <Card title="Produtos Encalhados">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-zinc-500">Sem venda há mais de</span>
            <select
              value={diasEncalhado}
              onChange={e => setDiasEncalhado(Number(e.target.value))}
              className="rounded-xl border px-2 py-1 text-xs"
            >
              {[15, 30, 45, 60, 90].map(d => <option key={d} value={d}>{d} dias</option>)}
            </select>
            <Button onClick={load} disabled={loading}>Aplicar</Button>
          </div>

          {loading ? (
            <div className="text-sm text-slate-400 py-4 text-center">Analisando giro...</div>
          ) : encalhados.length === 0 ? (
            <div className="text-sm text-emerald-700">Nenhum produto encalhado. Bom giro!</div>
          ) : (
            <div className="space-y-2">
              {encalhados.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.nome}</div>
                    <div className="text-xs text-zinc-500">
                      {r.ultima_venda
                        ? `Última venda ${new Date(r.ultima_venda).toLocaleDateString('pt-BR')}`
                        : 'Nunca vendido'}
                    </div>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <div className="font-semibold text-amber-600">{r.dias_parado}d parado</div>
                    <div className="text-xs text-zinc-500">{r.estoque_total} un.</div>
                  </div>
                </div>
              ))}
              <div className="rounded-xl border bg-amber-50 p-3 text-xs text-amber-800 space-y-1 mt-2">
                <div className="font-semibold">Sugestões para encalhados:</div>
                <div>• Criar promoção com desconto em /adm/promocoes</div>
                <div>• Incluir na vitrine ou manequim da loja</div>
                <div>• Combinar com peças de alto giro (look completo)</div>
                <div>• Avaliar liquidação se parado há mais de 60 dias</div>
              </div>
            </div>
          )}
        </Card>

        {/* Grade furada */}
        {gradeFurada.length > 0 && (
          <Card title={`Grade Furada (${gradeFurada.length} variante${gradeFurada.length > 1 ? 's' : ''})`}>
            <div className="text-xs text-zinc-500 mb-2">Variantes zeradas enquanto outras do mesmo produto têm estoque.</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {gradeFurada.slice(0, 10).map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b pb-1 last:border-b-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.produto_nome}</div>
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <span className="text-xs bg-zinc-100 px-2 py-0.5 rounded-full">{r.tamanho}</span>
                    <span className="text-xs bg-zinc-100 px-2 py-0.5 rounded-full">{r.cor}</span>
                    <span className="text-xs text-red-500 font-semibold">0 un.</span>
                  </div>
                </div>
              ))}
            </div>
            {gradeFurada.length > 10 && (
              <div className="text-xs text-zinc-400 mt-2">e mais {gradeFurada.length - 10} variante(s)…</div>
            )}
          </Card>
        )}

        {/* Insights de ação */}
        {resumo && (resumo.reposicao_urgente > 0 || resumo.encalhados > 0 || resumo.inadimplentes > 0) && (
          <Card title="Resumo de Ações Recomendadas">
            <div className="space-y-2 text-sm">
              {resumo.reposicao_urgente > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-red-500 font-bold shrink-0">!</span>
                  <span><b>{resumo.reposicao_urgente}</b> variante(s) precisam de pedido ao fornecedor nos próximos dias.</span>
                </div>
              )}
              {resumo.encalhados > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-amber-500 font-bold shrink-0">~</span>
                  <span><b>{resumo.encalhados}</b> produto(s) encalhado(s) — crie uma promoção para girar o estoque.</span>
                </div>
              )}
              {resumo.inadimplentes > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-orange-500 font-bold shrink-0">$</span>
                  <span><b>{resumo.inadimplentes}</b> cliente(s) com crediário atrasado — acesse Clientes para cobrar.</span>
                </div>
              )}
              {resumo.grade_furada > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-zinc-400 font-bold shrink-0">◻</span>
                  <span><b>{resumo.grade_furada}</b> variante(s) com grade furada — vendas perdidas esperando reposição.</span>
                </div>
              )}
            </div>
          </Card>
        )}

        {resumo && resumo.reposicao_urgente === 0 && resumo.encalhados === 0 && resumo.grade_furada === 0 && resumo.inadimplentes === 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <div className="text-emerald-700 font-semibold">Tudo em ordem!</div>
            <div className="text-xs text-emerald-600 mt-1">Sem alertas no momento. Continue monitorando.</div>
          </div>
        )}
      </div>


    </div>
  )
}
