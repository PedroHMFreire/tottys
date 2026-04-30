import { useEffect } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

export type ToastItem = {
  id: string
  kind: 'success' | 'error' | 'info'
  message: string
}

const kindConfig = {
  success: {
    Icon: CheckCircle2,
    container: 'border-emerald-200 bg-white',
    icon: 'text-emerald-500',
    text: 'text-emerald-800',
  },
  error: {
    Icon: XCircle,
    container: 'border-rose-200 bg-white',
    icon: 'text-rose-500',
    text: 'text-rose-800',
  },
  info: {
    Icon: Info,
    container: 'border-blue-200 bg-white',
    icon: 'text-blue-500',
    text: 'text-slate-700',
  },
}

export default function Toast({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}) {
  useEffect(() => {
    if (!toasts.length) return
    const timers = toasts.map(t =>
      setTimeout(() => onDismiss(t.id), 3500)
    )
    return () => { timers.forEach(clearTimeout) }
  }, [toasts, onDismiss])

  if (!toasts.length) return null

  return (
    <div className="fixed z-[100] bottom-[72px] right-3 left-3 sm:left-auto sm:right-4 sm:bottom-4 space-y-2">
      {toasts.map(t => {
        const { Icon, container, icon, text } = kindConfig[t.kind]
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-md text-sm max-w-sm ${container}`}
          >
            <Icon size={16} className={`${icon} mt-0.5 shrink-0`} strokeWidth={2} />
            <span className={`flex-1 text-xs leading-relaxed ${text}`}>{t.message}</span>
            <button
              onClick={() => onDismiss(t.id)}
              className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
