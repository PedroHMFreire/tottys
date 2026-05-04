import { RefreshCw, Home } from 'lucide-react'

interface Props {
  error?: Error
  onReset?: () => void
}

export default function AppError({ error, onReset }: Props) {
  const isDev = import.meta.env.DEV

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-zinc-50 dark:from-slate-900 dark:to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-5">

        <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center mx-auto">
          <span className="text-2xl">⚠️</span>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            Algo deu errado
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ocorreu um erro inesperado. Nossa equipe foi notificada automaticamente.
          </p>
        </div>

        {isDev && error && (
          <div className="text-left rounded-xl bg-slate-100 dark:bg-slate-800 p-4 overflow-auto max-h-40">
            <p className="text-xs font-mono text-rose-600 dark:text-rose-400 break-all">
              {error.message}
            </p>
            {error.stack && (
              <pre className="text-[10px] font-mono text-slate-500 mt-2 whitespace-pre-wrap">
                {error.stack}
              </pre>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          {onReset && (
            <button
              onClick={onReset}
              className="flex items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw size={14} />
              Tentar novamente
            </button>
          )}
          <a
            href="/gate"
            className="flex items-center justify-center gap-2 h-11 rounded-xl bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-300 transition-colors cursor-pointer"
          >
            <Home size={14} />
            Voltar ao início
          </a>
        </div>

      </div>
    </div>
  )
}
