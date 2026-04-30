import { ReactNode } from 'react'

interface Props {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md'
}

export default function Card({
  title,
  action,
  children,
  className = '',
  padding = 'md',
}: Props) {
  const padClass = { none: '', sm: 'p-3', md: 'p-4' }[padding]

  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl shadow-[0_1px_3px_0_rgb(0_0_0/.06)] ${padClass} ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && (
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              {title}
            </span>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
