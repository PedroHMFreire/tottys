import { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAreas } from '@/hooks/useAreas'
import { useRole } from '@/hooks/useRole'
import type { Role } from '@/domain/types'
import { hasRequiredAreas } from '@/auth/permissions'
import Button from '@/ui/Button'

export default function RequireArea({
  area,
  mode = 'any',
  bypassRoles = ['OWNER'],
  children,
}: {
  area: string | string[]
  mode?: 'any' | 'all'  // 'any' = precisa de pelo menos 1; 'all' = precisa de todas
  bypassRoles?: Role | Role[]
  children: ReactNode
}) {
  const { areas, loading } = useAreas()
  const { role, loading: roleLoading } = useRole()
  const navigate = useNavigate()
  const loc = useLocation()

  if (loading || roleLoading) {
    return <div className="p-6 text-sm">Carregando permissões…</div>
  }

  const bypass = Array.isArray(bypassRoles) ? bypassRoles : [bypassRoles]
  // OWNER e ADMIN sempre passam (acesso total)
  if (bypass.includes(role) || role === 'ADMIN') {
    return <>{children}</>
  }

  const required = Array.isArray(area) ? area : [area]
  const ok = hasRequiredAreas(areas, required, mode)

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
            <Button variant="ghost" onClick={() => navigate('/')}>Voltar</Button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
