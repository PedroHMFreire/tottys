import { ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import Button from '@/ui/Button'

export default function RequireCompany({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { company, setCompany } = useApp()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (company?.id) { setLoading(false); return }
      try {
        const { data, error } = await supabase.rpc('get_my_company')
        if (!error && data && data.length > 0 && mounted) {
          setCompany(data[0] as any)
        }
      } catch {
        // silently ignore — user will see "select company" prompt
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [company?.id, setCompany])

  if (loading) {
    return <div className="p-6 text-sm">Carregando empresa…</div>
  }

  if (!company?.id) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl border bg-white p-4 space-y-3 text-center">
          <div className="text-lg font-semibold">Selecione uma empresa</div>
          <div className="text-sm text-zinc-600">
            Para continuar, escolha a empresa ativa.
          </div>
          <div className="grid grid-cols-1 gap-2 pt-1">
            <Button onClick={() => navigate('/company')}>Selecionar Empresa</Button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
