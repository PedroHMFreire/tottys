import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import { formatBRL } from '@/lib/currency'
import Toast, { type ToastItem } from '@/ui/Toast'
import { logActivity } from '@/lib/activity'
import { isUUID } from '@/lib/utils'
import TabBar from '@/ui/TabBar'

type CashRow = {
  id: string
  store_id: string
  user_id?: string | null
  abertura_at: string
  valor_inicial: number
  fechamento_at?: string | null
  valor_final?: number | null
  status: 'ABERTO' | 'FECHADO'
}

type Totals = {
  dinheiro: number
  pix: number
  cartao: number
  suprimentos: number
  sangrias: number
}


export default function Cash() {
  const { store } = useApp()
  const [loading, setLoading] = useState(false)
  const [cash, setCash] = useState<CashRow | null>(null)
  const [totals, setTotals] = useState<Totals>({ dinheiro: 0, pix: 0, cartao: 0, suprimentos: 0, sangrias: 0 })
  const [lockedClose, setLockedClose] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  function pushToast(kind: ToastItem['kind'], message: string) {
    setToasts(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, kind, message }])
  }

  // Form states
  const [valorInicial, setValorInicial] = useState<string>('0')
  const [movTipo, setMovTipo] = useState<'SUPRIMENTO' | 'SANGRIA'>('SUPRIMENTO')
  const [movValor, setMovValor] = useState<string>('0')
  const [movMotivo, setMovMotivo] = useState<string>('')
  const [valorContado, setValorContado] = useState<string>('0')

  const demoKey = useMemo(() => `pdv_demo_cash_${store?.id || 'sem_loja'}`, [store?.id])

  // Carrega sessão de caixa atual
  useEffect(() => {
    (async () => {
      if (!store) return
      setLoading(true)
      try {
        if (isUUID(store.id)) {
          // tenta via RPC (banco)
          const { data, error } = await supabase.rpc('get_open_cash', { p_store_id: store.id })
          if (error) {
            console.warn('get_open_cash erro:', error)
            setCash(null)
          } else {
            // pode vir objeto ou array
            const row: any = Array.isArray(data) ? data[0] : data
            if (row) {
              setCash({
                id: row.id ?? '',
                store_id: row.store_id ?? store.id,
                user_id: row.user_id ?? null,
                abertura_at: row.abertura_at ?? new Date().toISOString(),
                valor_inicial: Number(row.valor_inicial ?? 0),
                fechamento_at: row.fechamento_at ?? null,
                valor_final: row.valor_final ?? null,
                status: (row.status as 'ABERTO' | 'FECHADO') ?? 'ABERTO',
              })
            } else {
              setCash(null)
            }
          }
        } else {
          // modo demo
          const saved = localStorage.getItem(demoKey)
          setCash(saved ? JSON.parse(saved) : null)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [store, demoKey])

  // Auto-carrega totais quando o caixa está aberto
  useEffect(() => {
    if (cash?.id) loadTotals()
  }, [cash?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega totais da sessão (Leitura X)
  async function loadTotals() {
    if (!cash) return
    setLoading(true)
    try {
      if (isUUID(cash.id)) {
        // usa a view v_cash_session_totals
        const { data, error } = await supabase
          .from('v_cash_session_totals')
          .select('dinheiro, pix, cartao, suprimentos, sangrias, valor_inicial')
          .eq('cash_id', cash.id)
          .maybeSingle()
        if (!error && data) {
          setTotals({
            dinheiro: Number(data.dinheiro || 0),
            pix: Number(data.pix || 0),
            cartao: Number(data.cartao || 0),
            suprimentos: Number(data.suprimentos || 0),
            sangrias: Number(data.sangrias || 0),
          })
          setValorContado(String(Number(data.valor_inicial || 0) + Number(data.dinheiro || 0) + Number(data.suprimentos || 0) - Number(data.sangrias || 0)))
        } else {
          setTotals({ dinheiro: 0, pix: 0, cartao: 0, suprimentos: 0, sangrias: 0 })
        }
      } else {
        // demo
        const savedMov = localStorage.getItem(`${demoKey}_movs`)
        const movs: Array<{ tipo: 'SUPRIMENTO' | 'SANGRIA'; valor: number }> = savedMov ? JSON.parse(savedMov) : []
        const supr = movs.filter(m => m.tipo === 'SUPRIMENTO').reduce((a, b) => a + b.valor, 0)
        const sang = movs.filter(m => m.tipo === 'SANGRIA').reduce((a, b) => a + b.valor, 0)
        setTotals({ dinheiro: 0, pix: 0, cartao: 0, suprimentos: supr, sangrias: sang })
      }
    } finally {
      setLoading(false)
    }
  }

  const esperado = useMemo(() => {
    const vi = Number(cash?.valor_inicial || 0)
    return vi + totals.dinheiro + totals.suprimentos - totals.sangrias
  }, [cash, totals])

  async function abrirCaixa() {
    if (!store) return pushToast('error', 'Selecione uma loja em Config.')
    const valor = Math.max(0, Number(valorInicial || 0))
    setLoading(true)
    try {
      if (isUUID(store.id)) {
        const { data, error } = await supabase.rpc('abrir_caixa', { p_store_id: store.id, p_valor_inicial: valor })
        if (error) throw error
        // 🔧 trata objeto/array aqui também
        const row: any = Array.isArray(data) ? data[0] : data
        setCash({
          id: row?.id ?? '',
          store_id: row?.store_id ?? store.id,
          user_id: row?.user_id ?? null,
          abertura_at: row?.abertura_at ?? new Date().toISOString(),
          valor_inicial: Number(row?.valor_inicial ?? 0),
          fechamento_at: row?.fechamento_at ?? null,
          valor_final: row?.valor_final ?? null,
          status: (row?.status as 'ABERTO' | 'FECHADO') ?? 'ABERTO',
        })
        setTotals({ dinheiro: 0, pix: 0, cartao: 0, suprimentos: 0, sangrias: 0 })
        pushToast('success', 'Caixa aberto com sucesso.')
        logActivity(`Caixa aberto • ${formatBRL(valor)}${store?.nome ? ` • ${store.nome}` : ''}`, 'success')
      } else {
        // demo
        const demo: CashRow = {
          id: `cash-${Date.now()}`,
          store_id: store.id,
          user_id: null,
          abertura_at: new Date().toISOString(),
          valor_inicial: valor,
          fechamento_at: null,
          valor_final: null,
          status: 'ABERTO',
        }
        localStorage.setItem(demoKey, JSON.stringify(demo))
        localStorage.removeItem(`${demoKey}_movs`)
        setCash(demo)
        setTotals({ dinheiro: 0, pix: 0, cartao: 0, suprimentos: 0, sangrias: 0 })
        pushToast('info', 'Caixa aberto (modo demo).')
        logActivity(`Caixa aberto (demo) • ${formatBRL(valor)}${store?.nome ? ` • ${store.nome}` : ''}`, 'info')
      }
    } catch (e: any) {
      pushToast('error', e.message || 'Falha ao abrir caixa.')
    } finally {
      setLoading(false)
    }
  }

  async function registrarMovimento() {
    if (!cash) return
    const valor = Number(movValor || 0)
    if (valor <= 0) return pushToast('error', 'Informe um valor maior que zero.')
    if (movTipo === 'SANGRIA' && valor > esperado) {
      return pushToast('error', 'Sangria maior que o valor disponível no gaveteiro.')
    }
    setLoading(true)
    try {
      if (isUUID(cash.id)) {
        const { error } = await supabase.rpc('registrar_movimento', {
          p_cash_id: cash.id,
          p_tipo: movTipo,
          p_valor: valor,
          p_motivo: movMotivo || null,
        })
        if (error) throw error
        await loadTotals()
        setMovValor('0')
        setMovMotivo('')
        pushToast('success', `${movTipo} registrado.`)
        logActivity(`${movTipo} registrado • ${formatBRL(valor)}${store?.nome ? ` • ${store.nome}` : ''}`, 'info')
      } else {
        // demo
        const savedMov = localStorage.getItem(`${demoKey}_movs`)
        const movs: Array<{ tipo: 'SUPRIMENTO' | 'SANGRIA'; valor: number ; motivo?: string }> = savedMov ? JSON.parse(savedMov) : []
        movs.push({ tipo: movTipo, valor, motivo: movMotivo })
        localStorage.setItem(`${demoKey}_movs`, JSON.stringify(movs))
        await loadTotals()
        setMovValor('0')
        setMovMotivo('')
        pushToast('info', `${movTipo} registrado (demo).`)
        logActivity(`${movTipo} registrado (demo) • ${formatBRL(valor)}${store?.nome ? ` • ${store.nome}` : ''}`, 'info')
      }
    } catch (e: any) {
      pushToast('error', e.message || 'Falha ao registrar movimento.')
    } finally {
      setLoading(false)
    }
  }

  async function fecharCaixa() {
    if (!cash) return
    const contado = Number(valorContado || 0)
    if (lockedClose) return
    if (contado < 0) return pushToast('error', 'Valor contado inválido.')
    if (Math.abs(contado - esperado) > 1000) {
      const ok = confirm('Diferença muito alta. Deseja continuar?')
      if (!ok) return
    }
    setLoading(true)
    setLockedClose(true)
    try {
      if (isUUID(cash.id)) {
        const { data, error } = await supabase.rpc('fechar_caixa', {
          p_cash_id: cash.id,
          p_valor_contado: contado,
          p_observacao: null,
        })
        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        const dif = Number(row?.diferenca || 0)
        pushToast('success', `Caixa fechado. Diferença: ${formatBRL(dif)}`)
        logActivity(`Caixa fechado • Diferença: ${formatBRL(dif)}${store?.nome ? ` • ${store.nome}` : ''}`, 'success')
        setCash(null)
        setTotals({ dinheiro: 0, pix: 0, cartao: 0, suprimentos: 0, sangrias: 0 })
      } else {
        // demo
        const dif = contado - esperado
        pushToast('info', `Caixa fechado (demo). Diferença: ${formatBRL(dif)}`)
        logActivity(`Caixa fechado (demo) • Diferença: ${formatBRL(dif)}${store?.nome ? ` • ${store.nome}` : ''}`, 'info')
        localStorage.removeItem(demoKey)
        localStorage.removeItem(`${demoKey}_movs`)
        setCash(null)
        setTotals({ dinheiro: 0, pix: 0, cartao: 0, suprimentos: 0, sangrias: 0 })
      }
    } catch (e: any) {
      pushToast('error', e.message || 'Falha ao fechar caixa.')
    } finally {
      setLoading(false)
      setLockedClose(false)
    }
  }

  return (
    <div className="pb-24 md:pb-8 max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <Toast toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />
      <h1 className="text-lg font-semibold text-navy">Caixa</h1>

      {!store && (
        <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">
          Selecione uma loja em <b>Config</b> para operar o caixa.
        </div>
      )}

      {/* Sem sessão aberta */}
      {!cash && store && (
        <Card title="Abrir caixa">
          <div className="space-y-3">
            <div className="text-sm text-slate-600">
              Informe o valor inicial em <b>dinheiro</b> no gaveteiro.
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step="0.01"
                value={valorInicial}
                onChange={e => setValorInicial(e.target.value)}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Valor inicial"
              />
              <Button onClick={abrirCaixa} disabled={loading || !store}>Abrir</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Sessão aberta */}
      {cash && (
        <>
          <Card title="Status do caixa">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <div className="font-semibold">ABERTO</div>
                <div className="text-slate-400">
                  Desde {new Date(cash.abertura_at).toLocaleString('pt-BR')}
                </div>
              </div>
              <div className="text-sm">
                Valor inicial: <b>{formatBRL(cash.valor_inicial || 0)}</b>
              </div>
            </div>
          </Card>

          <Card title="Leitura X (parcial)">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
              <div className="rounded-2xl border bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Dinheiro</div>
                <div className="text-lg font-semibold mt-1">{formatBRL(totals.dinheiro)}</div>
              </div>
              <div className="rounded-2xl border bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">PIX</div>
                <div className="text-lg font-semibold mt-1">{formatBRL(totals.pix)}</div>
              </div>
              <div className="rounded-2xl border bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Cartão</div>
                <div className="text-lg font-semibold mt-1">{formatBRL(totals.cartao)}</div>
              </div>
              <div className="rounded-2xl border bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Suprimentos</div>
                <div className="text-lg font-semibold mt-1">{formatBRL(totals.suprimentos)}</div>
              </div>
              <div className="rounded-2xl border bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Sangrias</div>
                <div className="text-lg font-semibold mt-1">{formatBRL(totals.sangrias)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">Esperado no gaveteiro</div>
              <div className="text-base font-semibold">{formatBRL(esperado)}</div>
            </div>
            <div className="mt-3">
              <Button onClick={loadTotals} disabled={loading}>Atualizar</Button>
            </div>
          </Card>

          <Card title="Sangria / Suprimento">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select value={movTipo} onChange={e => setMovTipo(e.target.value as any)} className="rounded-xl border border-slate-200 px-3 py-2 bg-white">
                <option value="SUPRIMENTO">Suprimento</option>
                <option value="SANGRIA">Sangria</option>
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                value={movValor}
                onChange={e => setMovValor(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Valor"
              />
            </div>
            <input
              value={movMotivo}
              onChange={e => setMovMotivo(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white mb-2"
              placeholder="Motivo (ex.: troco, segurança, acerto)"
            />
            <Button onClick={registrarMovimento} disabled={loading || Number(movValor) <= 0}>Registrar</Button>
          </Card>

          <Card title="Fechar caixa">
            <div className="grid grid-cols-2 gap-2 items-end">
              <div>
                <div className="text-sm text-slate-600 mb-1">Valor contado (dinheiro)</div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={valorContado}
                  onChange={e => setValorContado(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                />
              </div>
              <Button onClick={fecharCaixa} disabled={loading || lockedClose}>Fechar</Button>
            </div>
          </Card>
        </>
      )}
      <TabBar />
    </div>
  )
}
