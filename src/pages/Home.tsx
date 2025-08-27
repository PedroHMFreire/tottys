import { Link, useNavigate } from 'react-router-dom'
import TabBar from '@/ui/TabBar'
import Button from '@/ui/Button'
import { useApp } from '@/state/store'
import KPI from '@/ui/KPI'
import Card from '@/ui/Card'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Home() {
  const navigate = useNavigate()
  const { store } = useApp()

  // ---- NOVO: status real do caixa (banco ou modo demo) ----
  const [caixaAberto, setCaixaAberto] = useState(false)
  const demoKey = useMemo(() => `pdv_demo_cash_${store?.id || 'sem_loja'}`, [store?.id])
  function isUUID(id) {
    return !!id && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(id)
  }
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

  const vendasHoje = 0      // TODO: puxar do Supabase
  const ticketMedio = 0     // TODO: calcular (vendasHoje/qtde de cupons)
  const itensVendidos = 0   // TODO: somatório de itens do dia

  return (
    <div className="pb-24 max-w-md mx-auto">
      {/* Header */}
      <header className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Anot.AI PDV</h1>
            <p className="text-zinc-500 text-sm -mt-0.5">Rápido, bonito e pronto pra fiscal</p>
          </div>
          <button
            onClick={() => navigate('/store')}
            className="px-3 py-2 rounded-2xl border bg-white text-sm shadow-sm"
            title="Trocar loja"
          >
            {store?.nome ?? 'Selecionar loja'}
          </button>
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
              <div className="text-zinc-500">
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
      <section className="p-4 grid grid-cols-2 gap-3">
        <Link to="/sell"><Button className="h-14 text-base">Vender</Button></Link>
        <Link to="/products"><Button className="h-14 text-base bg-zinc-800">Produtos</Button></Link>
        <Link to="/reports"><Button className="h-14 text-base bg-zinc-800">Relatórios</Button></Link>
        <Link to="/settings"><Button className="h-14 text-base">Configurações</Button></Link>
      </section>

      {/* Últimas ações (placeholder simpático) */}
      <section className="px-4">
        <Card title="Atividades recentes">
          <ul className="text-sm text-zinc-600 space-y-1">
            <li>• Sistema iniciado — pronto para vender</li>
            <li>• Produtos mock carregados (TT-PRE, BP-AZ)</li>
            <li>• Integração fiscal em modo teste (mock)</li>
          </ul>
        </Card>
      </section>

      <TabBar />
    </div>
  )
}
