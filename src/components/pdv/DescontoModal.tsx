import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatBRL } from '@/lib/currency'
import Button from '@/ui/Button'

type Promocao = {
  id: string
  nome: string
  descricao: string | null
  tipo: 'PERCENTUAL' | 'VALOR_FIXO'
  valor: number
  aplica_em: string
  valor_minimo_carrinho: number
  requer_perfil: string
  data_inicio: string | null
  data_fim: string | null
}

export type DescontoAplicado = {
  tipo: 'PERCENTUAL' | 'VALOR_FIXO' | 'MANUAL'
  valor: number   // percentual (0-100) ou valor fixo em R$
  nome: string
}

type Props = {
  companyId: string
  cartTotal: number
  role: string
  onApply: (d: DescontoAplicado) => void
  onRemove: () => void
  current: DescontoAplicado | null
  onClose: () => void
}

const ROLE_LEVEL: Record<string, number> = {
  COLABORADOR: 0, VENDEDOR: 0, CAIXA: 0, GESTOR: 1,
  GERENTE: 2, ADMIN: 3, OWNER: 4,
}
function roleAtLeast(role: string, required: string) {
  return (ROLE_LEVEL[role] ?? 0) >= (ROLE_LEVEL[required] ?? 0)
}

export default function DescontoModal({ companyId, cartTotal, role, onApply, onRemove, current, onClose }: Props) {
  const [promocoes, setPromocoes] = useState<Promocao[]>([])
  const [loading, setLoading] = useState(true)

  // Manual discount
  const [manualPct, setManualPct] = useState('')
  const [manualFixed, setManualFixed] = useState('')
  const [manualTipo, setManualTipo] = useState<'PERCENTUAL' | 'VALOR_FIXO'>('PERCENTUAL')

  const canManual = roleAtLeast(role, 'GERENTE')

  useEffect(() => {
    load()
  }, [companyId])

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('promocoes')
      .select('*')
      .eq('company_id', companyId)
      .eq('ativo', true)
      .or(`data_inicio.is.null,data_inicio.lte.${today}`)
      .or(`data_fim.is.null,data_fim.gte.${today}`)
      .order('nome')
    setPromocoes((data || []) as Promocao[])
    setLoading(false)
  }

  function calcDesconto(p: Promocao): number {
    if (p.tipo === 'PERCENTUAL') return cartTotal * p.valor / 100
    return Math.min(p.valor, cartTotal)
  }

  function applicable(p: Promocao): boolean {
    if (cartTotal < Number(p.valor_minimo_carrinho)) return false
    if (p.requer_perfil !== 'TODOS' && !roleAtLeast(role, p.requer_perfil)) return false
    return true
  }

  function applyPromo(p: Promocao) {
    onApply({ tipo: p.tipo, valor: p.valor, nome: p.nome })
    onClose()
  }

  function applyManual() {
    const v = Number((manualTipo === 'PERCENTUAL' ? manualPct : manualFixed).replace(',', '.'))
    if (!v || v <= 0) return
    if (manualTipo === 'PERCENTUAL' && v > 100) return
    onApply({ tipo: manualTipo === 'PERCENTUAL' ? 'PERCENTUAL' : 'VALOR_FIXO', valor: v, nome: 'Desconto manual' })
    onClose()
  }

  const applicablePromos = promocoes.filter(applicable)
  const blockedPromos = promocoes.filter(p => !applicable(p))

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md lg:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Aplicar Desconto</div>
          <button onClick={onClose} className="text-slate-400 text-sm">fechar</button>
        </div>

        <div className="rounded-2xl border bg-zinc-50 p-3 text-sm">
          <div className="text-slate-400 text-xs">Subtotal do carrinho</div>
          <div className="text-xl font-bold">{formatBRL(cartTotal)}</div>
        </div>

        {/* Desconto atual */}
        {current && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-emerald-600 font-medium">Desconto ativo</div>
              <div className="font-semibold">{current.nome}</div>
              <div className="text-sm text-slate-600">
                {current.tipo === 'PERCENTUAL' ? `${current.valor}%` : formatBRL(current.valor)}
              </div>
            </div>
            <button onClick={() => { onRemove(); onClose() }} className="text-xs text-red-500 hover:underline">remover</button>
          </div>
        )}

        {/* Promoções cadastradas */}
        {loading ? (
          <div className="text-sm text-slate-400">Carregando promoções…</div>
        ) : applicablePromos.length === 0 && blockedPromos.length === 0 ? (
          <div className="text-sm text-slate-400">Nenhuma promoção ativa cadastrada.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-slate-400 font-medium">Promoções disponíveis</div>
            {applicablePromos.map(p => (
              <div
                key={p.id}
                onClick={() => applyPromo(p)}
                className="rounded-2xl border p-3 cursor-pointer hover:bg-zinc-50 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm">{p.nome}</div>
                  {p.descricao && <div className="text-xs text-slate-400 truncate">{p.descricao}</div>}
                  {p.valor_minimo_carrinho > 0 && (
                    <div className="text-xs text-slate-400">Mín. {formatBRL(p.valor_minimo_carrinho)}</div>
                  )}
                </div>
                <div className="ml-3 text-right shrink-0">
                  <div className="font-semibold text-emerald-700">
                    {p.tipo === 'PERCENTUAL' ? `${p.valor}%` : formatBRL(p.valor)}
                  </div>
                  <div className="text-xs text-slate-400">- {formatBRL(calcDesconto(p))}</div>
                </div>
              </div>
            ))}
            {blockedPromos.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-slate-400 font-medium mt-2">Não aplicáveis agora</div>
                {blockedPromos.map(p => (
                  <div key={p.id} className="rounded-2xl border border-dashed p-3 opacity-50 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{p.nome}</div>
                      {p.valor_minimo_carrinho > 0 && cartTotal < p.valor_minimo_carrinho && (
                        <div className="text-xs text-amber-600">Mín. {formatBRL(p.valor_minimo_carrinho)} (falta {formatBRL(p.valor_minimo_carrinho - cartTotal)})</div>
                      )}
                      {p.requer_perfil !== 'TODOS' && !roleAtLeast(role, p.requer_perfil) && (
                        <div className="text-xs text-red-400">Requer perfil {p.requer_perfil}</div>
                      )}
                    </div>
                    <div className="ml-3 shrink-0 font-semibold text-zinc-400">
                      {p.tipo === 'PERCENTUAL' ? `${p.valor}%` : formatBRL(p.valor)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Desconto manual */}
        {canManual && (
          <div className="rounded-2xl border p-3 space-y-3 bg-zinc-50">
            <div className="text-xs font-semibold text-slate-600">Desconto manual (gerente+)</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setManualTipo('PERCENTUAL')}
                className={`py-2 rounded-xl border text-sm font-medium ${manualTipo === 'PERCENTUAL' ? 'bg-primary text-white' : 'border-zinc-200'}`}
              >
                Percentual (%)
              </button>
              <button
                onClick={() => setManualTipo('VALOR_FIXO')}
                className={`py-2 rounded-xl border text-sm font-medium ${manualTipo === 'VALOR_FIXO' ? 'bg-primary text-white' : 'border-zinc-200'}`}
              >
                Valor fixo (R$)
              </button>
            </div>
            {manualTipo === 'PERCENTUAL' ? (
              <input
                value={manualPct}
                onChange={e => setManualPct(e.target.value)}
                placeholder="Ex: 10 (para 10%)"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
              />
            ) : (
              <input
                value={manualFixed}
                onChange={e => setManualFixed(e.target.value)}
                placeholder="Ex: 30,00"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
              />
            )}
            <Button onClick={applyManual}>Aplicar desconto manual</Button>
          </div>
        )}

        <Button variant="ghost" className="w-full" onClick={onClose}>Fechar</Button>
      </div>
    </div>
  )
}
