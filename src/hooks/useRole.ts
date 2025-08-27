import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Role = 'ADMIN' | 'GERENTE' | 'GESTOR' | 'VENDEDOR' | 'ANON'

export function useRole() {
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
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        if (mounted) {
          if (!error && data?.role) {
            setRole((data.role as Role) || 'VENDEDOR')
          } else {
            setRole('VENDEDOR')
          }
          setLoading(false)
        }
      } catch {
        if (mounted) { setRole('VENDEDOR'); setLoading(false) }
      }
    })()
    return () => { mounted = false }
  }, [])

  const admin = role === 'ADMIN' || role === 'GERENTE' || role === 'GESTOR'

  return { role, admin, loading }
}
