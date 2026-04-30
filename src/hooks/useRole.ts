import { useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Role } from '@/domain/types'
import { useApp } from '@/state/store'

export function useRole() {
  const { role, permissionsLoaded, setPermissions, areas } = useApp()

  useEffect(() => {
    if (permissionsLoaded) return
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (mounted) setPermissions('ANON', [])
          return
        }
        const [profileRes, areasRes] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
          supabase.rpc('get_my_areas'),
        ])
        if (!mounted) return
        const fetchedRole = (profileRes.data?.role as Role) || 'COLABORADOR'
        const fetchedAreas: string[] = ((areasRes.data || []) as Array<{ area_code: string }>)
          .map(r => r.area_code)
        setPermissions(fetchedRole, Array.from(new Set(fetchedAreas)))
      } catch {
        if (mounted) setPermissions('ANON', [])
      }
    })()
    return () => { mounted = false }
  }, [permissionsLoaded])

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        useApp.getState().clearPermissions()
      }
    })
    return () => sub?.subscription?.unsubscribe?.()
  }, [])

  const isOwner      = role === 'OWNER'
  const isAdmin      = role === 'OWNER' || role === 'ADMIN'
  const isGerente    = role === 'OWNER' || role === 'ADMIN' || role === 'GERENTE'
  const isColaborador = !isGerente
  const loading      = !permissionsLoaded

  // Legado: `admin` = true para OWNER e ADMIN (antigo GERENTE)
  const admin = isAdmin

  return { role, isOwner, isAdmin, isGerente, isColaborador, admin, loading }
}
