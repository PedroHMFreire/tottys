import { ReactNode, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAreas } from '@/hooks/useAreas'
import { supabase } from '@/lib/supabaseClient'
import Button from '@/ui/Button'

type Role = 'OWNER' | 'ADMIN' | 'GERENTE' | 'GESTOR' | 'VENDEDOR' | null

export default function RequireArea({
  area,
  mode = 'any',
  children,
}: {
  area: string | string[]
  mode?: 'any' | 'all'  // 'any' = precisa de pelo menos 1; 'all' = precisa de todas
  children: ReactNode
}) {
  const navigate = useNavigate()
  const loc = useLocation()

  // 1) Carrega papel para liberar OWNER independentemente das áreas
  const [role, setRole] = useState<Role>(null)
  const [roleLoading, setRoleLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (mounted) { setRole(null); setRoleLoading(false) }; return }
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
        if (mounted) setRole((data?.role as Role) ?? 'VENDEDOR')
      } finally {
        if (mounted) setRoleLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  // 2) Áreas (continua funcionando p/ ADMIN/GERENTE/GESTOR)
  const { has, loading: areasLoading } = useAreas()

  if (roleLoading || areasLoading) {
    return <div className="p-6 text-sm">Carregando permissões…</div>
  }

  // 👉 Bypass: OWNER sempre pode
  if (role === 'OWNER') {
    return <>{children}</>
  }

  const required = Array.isArray(area) ? area : [area]
  const ok = mode === 'all'
    ? required.every(a => has(a))
    : required.some(a => has(a))

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
