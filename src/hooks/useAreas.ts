import { useMemo } from 'react'
import { useApp } from '@/state/store'
import { useRole } from './useRole'

export function useAreas() {
  const { areas } = useApp()
  const { loading } = useRole()

  const has = useMemo(
    () => (code: string) => areas.includes(code),
    [areas]
  )

  return { areas, has, loading, error: null }
}
