import { type LucideIcon } from 'lucide-react'

type Trend = 'up' | 'down' | 'neutral'

interface Props {
  label: string
  value: string
  sub?: string
  Icon?: LucideIcon
  trend?: Trend
  trendLabel?: string
}

const trendStyle: Record<Trend, { text: string; arrow: string }> = {
  up:      { text: 'text-emerald-600', arrow: '↑' },
  down:    { text: 'text-rose-500',    arrow: '↓' },
  neutral: { text: 'text-slate-400',   arrow: '→' },
}

export default function KPI({ label, value, sub, Icon, trend, trendLabel }: Props) {
  const t = trend ? trendStyle[trend] : null

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-[0_1px_3px_0_rgb(0_0_0/.06)]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 leading-none mt-0.5">
          {label}
        </span>
        {Icon && (
          <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] flex items-center justify-center shrink-0">
            <Icon size={14} className="text-[#1E40AF]" strokeWidth={2} />
          </div>
        )}
      </div>
      <div className="mt-2 text-xl font-semibold text-[#1E1B4B] tracking-tight leading-none">
        {value}
      </div>
      {(sub || t) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {t && (
            <span className={`text-xs font-medium ${t.text}`}>
              {t.arrow} {trendLabel}
            </span>
          )}
          {sub && !t && (
            <span className="text-xs text-slate-400">{sub}</span>
          )}
        </div>
      )}
    </div>
  )
}
