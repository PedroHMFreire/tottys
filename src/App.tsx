import { useEffect } from 'react'
import AppRoutes from './routes'
import { initTheme } from '@/hooks/useTheme'

// Aplica o tema antes do primeiro render (evita flash de tema errado)
initTheme()

export default function App() {
  useEffect(() => {
    // Re-aplica se o usuário mudar a preferência do sistema enquanto o app está aberto
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (!localStorage.getItem('tottys_theme')) initTheme()
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return <AppRoutes />
}
