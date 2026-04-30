export default function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-slate-400">
      <svg
        className="animate-spin"
        width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <span className="text-xs font-medium text-slate-400">{label}</span>
    </div>
  )
}
