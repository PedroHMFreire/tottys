import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('tottys_theme') as Theme | null
    if (stored === 'dark' || stored === 'light') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  try { localStorage.setItem('tottys_theme', theme) } catch {}
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggle, isDark: theme === 'dark' }
}

// Aplica o tema imediatamente (sem esperar React montar) — evita flash
export function initTheme() {
  applyTheme(getInitialTheme())
}
