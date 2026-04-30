import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { useRole } from '@/hooks/useRole'
import Button from '@/ui/Button'
import { useNavigate } from 'react-router-dom'
import { logActivity } from '@/lib/activity'

type Company = { id: string; nome: string }

export default function SelectCompany() {
  const setCompany = useApp(s => s.setCompany)
  const current = useApp(s => s.company)
  const navigate = useNavigate()
  const { admin, role } = useRole()
  const [list, setList] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canSeeAll = admin || role === 'OWNER'

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const { data, error } = await supabase.rpc('get_my_company')
        if (error) throw error
        if (mounted) setList((data || []) as Company[])
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Falha ao carregar empresas.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const subtitle = useMemo(() => {
    if (canSeeAll) return 'Escolha a empresa ativa para operar.'
    return 'Empresa vinculada ao seu usuário.'
  }, [canSeeAll])

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-[#1E1B4B] mb-1">Selecionar Empresa</h2>
      <div className="text-sm text-slate-400 mb-4">{subtitle}</div>

      {error && <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm mb-3">{error}</div>}
      {loading ? (
        <div className="text-sm text-slate-400">Carregando…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-slate-400">Nenhuma empresa disponível.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {list.map(c => (
            <Button
              key={c.id}
              className={current?.id === c.id ? 'bg-emerald-700' : undefined}
              onClick={() => {
                setCompany(c)
                logActivity(`Empresa selecionada • ${c.nome}`, 'info', { company_id: c.id })
                navigate('/loja')
              }}
            >
              {c.nome}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
