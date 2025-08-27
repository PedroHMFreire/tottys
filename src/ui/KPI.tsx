export default function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  )
}
