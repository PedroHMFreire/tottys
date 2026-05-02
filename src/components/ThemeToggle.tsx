import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

interface Props {
  size?: 'sm' | 'md'
  className?: string
}

export default function ThemeToggle({ size = 'md', className = '' }: Props) {
  const { isDark, toggle } = useTheme()
  const dim = size === 'sm' ? 14 : 16

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
      className={`flex items-center justify-center rounded-lg transition-colors cursor-pointer
        text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200
        hover:bg-slate-100 dark:hover:bg-slate-700
        ${size === 'sm' ? 'w-7 h-7' : 'w-8 h-8'}
        ${className}`}
    >
      {isDark
        ? <Sun size={dim} strokeWidth={1.75} />
        : <Moon size={dim} strokeWidth={1.75} />
      }
    </button>
  )
}
