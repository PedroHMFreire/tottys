import { useEffect } from 'react'

export type ToastItem = {
  id: string
  kind: 'success' | 'error' | 'info'
  message: string
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
    return () => { timers.forEach(t => clearTimeout(t)) }
  }, [toasts, onDismiss])

  if (!toasts.length) return null
  return (
    <div className="fixed z-[100] bottom-4 right-4 space-y-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`rounded-2xl border px-4 py-3 shadow-sm bg-white text-sm max-w-xs ${
            t.kind === 'success' ? 'border-emerald-300 text-emerald-800' :
            t.kind === 'error' ? 'border-rose-300 text-rose-800' :
            'border-zinc-200 text-zinc-800'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
