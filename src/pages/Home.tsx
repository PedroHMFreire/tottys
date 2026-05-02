import { Link, useNavigate } from 'react-router-dom'
import TabBar from '@/ui/TabBar'
import Button from '@/ui/Button'
import { useApp } from '@/state/store'
import { useRole } from '@/hooks/useRole'
import KPI from '@/ui/KPI'
import Card from '@/ui/Card'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { readActivity } from '@/lib/activity'
import { isUUID } from '@/lib/utils'
import { LayoutDashboard } from 'lucide-react'

export default function Home() {
  const navigate = useNavigate()
  const { store } = useApp()
  const { role } = useRole()
  const isAdmin = role === 'OWNER' || role === 'ADMIN' || role === 'GERENTE'

  // ---- NOVO: status real do caixa (banco ou modo demo) ----
  const [caixaAberto, setCaixaAberto] = useState(false)
  const demoKey = useMemo(() => `pdv_demo_cash_${store?.id || 'sem_loja'}`, [store?.id])
  useEffect(() => {
    let mounted = true
    async function checkCash() {
      if (!store) { if (mounted) setCaixaAberto(false); return }
      let opened = false
      if (isUUID(store.id)) {
        try {
          const { data, error } = await supabase.rpc('get_open_cash', { p_store_id: store.id })
          const row = error ? null : (Array.isArray(data) ? data[0] : data)
          opened = !!row && row.status === 'ABERTO'
        } catch {
          opened = false
        }
      } else {
        const saved = localStorage.getItem(demoKey)
        const row = saved ? JSON.parse(saved) : null
        opened = !!row && row.status === 'ABERTO'
      }
      if (mounted) setCaixaAberto(opened)
    }
    checkCash()
    return () => { mounted = false }
  }, [store?.id, demoKey])
  // ---------------------------------------------------------

  const [vendasHoje, setVendasHoje] = useState(0)
  const [ticketMedio, setTicketMedio] = useState(0)
  const [itensVendidos, setItensVendidos] = useState(0)

  useEffect(() => {
    let mounted = true
    async function loadKpis() {
      if (!store?.id || !isUUID(store.id)) {
        setVendasHoje(0); setTicketMedio(0); setItensVendidos(0)
        return
      }
      try {
        const start = new Date(); start.setHours(0, 0, 0, 0)
        const end = new Date(); end.setHours(23, 59, 59, 999)
        const { data: daySales } = await supabase
          .from('sales')
          .select('id, total')
          .eq('store_id', store.id)
          .eq('status', 'PAGA')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
        if (!mounted) return
        const ids = (daySales || []).map((s: any) => s.id)
        const totalDia = (daySales || []).reduce((acc, s: any) => acc + Number(s.total || 0), 0)
        const cupons = (daySales || []).length
        setVendasHoje(totalDia)
        setTicketMedio(cupons > 0 ? totalDia / cupons : 0)
        if (ids.length) {
          const { data: items } = await supabase
            .from('sale_items')
            .select('qtde')
            .in('sale_id', ids)
          if (mounted) {
            const itens = (items || []).reduce((acc, it: any) => acc + Number(it.qtde || 0), 0)
            setItensVendidos(itens)
          }
        } else {
          setItensVendidos(0)
        }
      } catch { /* silencioso */ }
    }
    loadKpis()
    return () => { mounted = false }
  }, [store?.id])

  const suggestions = useMemo(() => {
    if (!store) {
      return [
        'Selecione uma loja para habilitar o PDV.',
        'Cadastre produtos para liberar a venda rápida.',
      ]
    }
    if (!caixaAberto) {
      return [
        'Abra o caixa para iniciar vendas.',
        'Revise o estoque dos itens mais vendidos.',
      ]
    }
    return [
      'Faça uma venda teste para validar pagamentos.',
      'Acompanhe o ticket médio em Relatórios.',
    ]
  }, [store, caixaAberto])

  const [activities, setActivities] = useState(() => readActivity(5))
  useEffect(() => {
    const refresh = () => setActivities(readActivity(5))
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return (
    <div className="pb-24 md:pb-8 max-w-5xl mx-auto">
      {/* Header */}
      <header className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-navy tracking-tight">Tottys PDV</h1>
            <p className="text-slate-400 text-sm -mt-0.5">Frente de loja</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                to="/adm"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                title="Ir para a retaguarda"
              >
                <LayoutDashboard size={13} />
                Retaguarda
              </Link>
            )}
            <button
              onClick={() => navigate('/store')}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm shadow-sm text-slate-700 hover:bg-slate-50 transition-colors"
              title="Trocar loja"
            >
              {store?.nome ?? 'Selecionar loja'}
            </button>
          </div>
        </div>

        {/* Banner do caixa */}
        <div
          className={`mt-3 p-3 rounded-2xl border ${caixaAberto ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}
        >
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <div className="font-semibold">
                Caixa {caixaAberto ? 'ABERTO' : 'FECHADO'}
              </div>
              <div className="text-slate-400">
                {caixaAberto ? 'Pode iniciar vendas.' : 'Abra o caixa para começar a vender.'}
              </div>
            </div>
            <Link to="/cash">
              <Button className="w-auto px-4 py-2 text-sm">
                {caixaAberto ? 'Fechar Caixa' : 'Abrir Caixa'}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* KPIs rápidos */}
      <section className="px-4 mt-3 grid grid-cols-3 gap-2">
        <KPI label="Vendas (R$)" value={vendasHoje.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
        <KPI label="Ticket Médio" value={ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
        <KPI label="Itens" value={String(itensVendidos)} />
      </section>

      {/* Ações principais */}
      <section className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link to="/sell"><Button className="h-14 text-base">Vender</Button></Link>
        <Link to="/products"><Button className="h-14 text-base">Produtos</Button></Link>
        <Link to="/reports"><Button className="h-14 text-base">Relatórios</Button></Link>
        <Link to="/settings"><Button className="h-14 text-base">Configurações</Button></Link>
      </section>

      {/* Cards inferiores — lado a lado no desktop */}
      <div className="px-4 md:grid md:grid-cols-2 md:gap-4">
        <section>
          <Card title="Sugestões do dia">
            <ul className="text-sm text-slate-600 space-y-1">
              {suggestions.map(item => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <Card title="Atividades recentes">
            {activities.length === 0 ? (
              <div className="text-sm text-slate-400">Nenhuma atividade registrada ainda.</div>
            ) : (
              <ul className="text-sm text-slate-600 space-y-1">
                {activities.map(item => (
                  <li key={item.id}>
                    • {item.message}{' '}
                    <span className="text-xs text-zinc-400">
                      {new Date(item.ts).toLocaleString('pt-BR')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      <TabBar />
    </div>
  )
}
