export default function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-3">
      <div className="text-sm font-semibold mb-2">{title}</div>
      <div>{children}</div>
    </div>
  )
}
