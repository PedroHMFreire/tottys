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
        let companies: Company[] = []
        if (canSeeAll) {
          const { data, error } = await supabase.from('companies').select('id, nome').order('nome', { ascending: true })
          if (error) throw error
          companies = (data || []) as Company[]
        } else {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) throw new Error('Você precisa estar logado.')
          const { data: prof, error } = await supabase
            .from('profiles')
            .select('company_id')
            .eq('id', user.id)
            .maybeSingle()
          if (error) throw error
          if (prof?.company_id) {
            const { data: comp, error: e2 } = await supabase
              .from('companies')
              .select('id, nome')
              .eq('id', prof.company_id)
              .maybeSingle()
            if (e2) throw e2
            if (comp) companies = [comp as Company]
          }
        }
        if (mounted) setList(companies)
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Falha ao carregar empresas.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [canSeeAll])

  const subtitle = useMemo(() => {
    if (canSeeAll) return 'Escolha a empresa ativa para operar.'
    return 'Empresa vinculada ao seu usuário.'
  }, [canSeeAll])

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-1">Selecionar Empresa</h2>
      <div className="text-sm text-zinc-500 mb-4">{subtitle}</div>

      {error && <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm mb-3">{error}</div>}
      {loading ? (
        <div className="text-sm text-zinc-500">Carregando…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-zinc-500">Nenhuma empresa disponível.</div>
      ) : (
        <div className="space-y-2">
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
