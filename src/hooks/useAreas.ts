import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type MyAreaRow = { area_code: string; source: string }

export function useAreas() {
  const [areas, setAreas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchAreas() {
    setLoading(true); setError(null)
    try {
      // user pode estar anônimo; função retorna vazio nesse caso
      const { data, error } = await supabase.rpc('get_my_areas')
      if (error) throw error
      const list = ((data || []) as MyAreaRow[]).map(r => r.area_code)
      // remove duplicados
      setAreas(Array.from(new Set(list)))
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar permissões.')
      setAreas([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    fetchAreas()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (mounted) fetchAreas()
    })
    return () => { mounted = false; sub?.subscription?.unsubscribe?.() }
  }, [])

  const has = useMemo(
    () => (code: string) => areas.includes(code),
    [areas]
  )

  return { areas, has, loading, error, refresh: fetchAreas }
}
