import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'

const DISMISS_KEY = 'setup_checklist_dismissed'

type CheckItem = {
  key: string
  label: string
  sublabel: string
  done: boolean
  action?: { label: string; path: string }
}

export default function SetupChecklist() {
  const navigate = useNavigate()
  const { company } = useApp()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')
  const [checks, setChecks] = useState<CheckItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (dismissed || !company?.id) return
    let mounted = true
    ;(async () => {
      setLoading(true)
      try {
        const [prodRes, custRes, saleRes] = await Promise.all([
          supabase.from('products').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
          supabase.from('customers').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
          supabase.from('sales').select('id', { count: 'exact', head: true })
            .in('store_id', await getStoreIds(company.id)),
        ])
        if (!mounted) return

        const hasProducts  = (prodRes.count ?? 0) > 0
        const hasCustomers = (custRes.count ?? 0) > 0
        const hasSales     = (saleRes.count ?? 0) > 0

        setChecks([
          {
            key: 'conta',
            label: 'Conta criada',
            sublabel: 'Você está aqui.',
            done: true,
          },
          {
            key: 'produtos',
            label: 'Importar produtos',
            sublabel: hasProducts ? `${prodRes.count} produto(s) cadastrado(s)` : 'Suba sua planilha ou adicione manualmente.',
            done: hasProducts,
            action: hasProducts ? undefined : { label: 'Importar agora', path: '/onboarding' },
          },
          {
            key: 'clientes',
            label: 'Importar clientes',
            sublabel: hasCustomers ? `${custRes.count} cliente(s) cadastrado(s)` : 'Opcional — importe sua base de clientes.',
            done: hasCustomers,
            action: hasCustomers ? undefined : { label: 'Importar clientes', path: '/onboarding' },
          },
          {
            key: 'venda',
            label: 'Fazer a primeira venda',
            sublabel: hasSales ? 'Primeira venda realizada!' : 'Abra o caixa e registre sua primeira venda.',
            done: hasSales,
            action: hasSales ? undefined : { label: 'Abrir o PDV', path: '/loja/sell' },
          },
        ])
      } catch {
        // silently fail — checklist is not critical
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [company?.id, dismissed])

  async function getStoreIds(companyId: string): Promise<string[]> {
    const { data } = await supabase.from('stores').select('id').eq('company_id', companyId)
    return (data || []).map((s: any) => s.id)
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  if (dismissed || loading) return null

  const total = checks.length
  const done  = checks.filter(c => c.done).length
  const pct   = Math.round((done / total) * 100)
  const allDone = done === total

  if (allDone) return null

  return (
    <div className="rounded-2xl border bg-white p-4 space-y-3 mb-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">Configuração inicial — {done} de {total} concluídas</div>
          <div className="text-xs text-slate-400 mt-0.5">Complete o setup para aproveitar o sistema ao máximo.</div>
        </div>
        <button onClick={dismiss} className="text-xs text-slate-400 hover:text-slate-600 shrink-0 mt-0.5">
          fechar
        </button>
      </div>

      {/* Barra de progresso */}
      <div className="w-full bg-zinc-100 rounded-full h-1.5">
        <div
          className="bg-[#1E40AF] h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {checks.map(item => (
          <div key={item.key} className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
              item.done ? 'bg-[#1E40AF] border-[#1E40AF]' : 'border-zinc-300'
            }`}>
              {item.done && <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm ${item.done ? 'text-slate-400 line-through' : 'text-[#1E1B4B] font-medium'}`}>
                {item.label}
              </div>
              <div className="text-xs text-slate-400">{item.sublabel}</div>
            </div>
            {item.action && (
              <button
                onClick={() => navigate(item.action!.path)}
                className="text-xs font-medium text-black underline underline-offset-2 shrink-0"
              >
                {item.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
