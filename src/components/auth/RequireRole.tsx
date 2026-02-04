import { ReactNode, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import type { Role } from '@/domain/types'
import { isRoleAllowed } from '@/auth/permissions'
import Button from '@/ui/Button'

export default function RequireRole({
  roles,
  children,
}: {
  roles?: Role | Role[]
  children: ReactNode
}) {
  const navigate = useNavigate()
  const loc = useLocation()
  const [role, setRole] = useState<Role>('ANON')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (mounted) { setRole('ANON'); setLoading(false) }
          return
        }
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
        if (mounted) setRole((data?.role as Role) ?? 'VENDEDOR')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  if (loading) {
    return <div className="p-6 text-sm">Carregando permissões…</div>
  }

  const ok = isRoleAllowed(role, roles)

  if (!ok) {
    const next = encodeURIComponent(loc.pathname + loc.search)
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl border bg-white p-4 space-y-3 text-center">
          <div className="text-lg font-semibold">Acesso restrito</div>
          <div className="text-sm text-zinc-600">
            Você não tem permissão para acessar esta área.
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button onClick={() => navigate(`/login?next=${next}`)}>Ir para Login</Button>
            <Button className="bg-zinc-800" onClick={() => navigate('/')}>Voltar</Button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
