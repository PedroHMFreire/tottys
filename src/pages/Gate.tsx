import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'

export default function Gate() {
  const navigate = useNavigate()
  const { role, loading } = useRole()

  // Auto-redireciona por papel — sem tela intermediária
  useEffect(() => {
    if (loading) return
    if (role === 'ANON') {
      navigate('/login', { replace: true })
    } else if (role === 'OWNER' || role === 'ADMIN' || role === 'GERENTE') {
      navigate('/adm', { replace: true })
    } else {
      navigate('/loja/sell', { replace: true })
    }
  }, [role, loading, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-zinc-400">Redirecionando…</div>
    </div>
  )
}
