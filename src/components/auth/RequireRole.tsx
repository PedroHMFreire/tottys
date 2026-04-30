import { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { Role } from '@/domain/types'
import { useRole } from '@/hooks/useRole'
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
  const { role, loading } = useRole()

  if (loading) {
    return <div className="p-6 text-sm text-zinc-400">Carregando permissões…</div>
  }

  const list = roles ? (Array.isArray(roles) ? roles : [roles]) : null
  const ok = !list || list.includes(role)

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
