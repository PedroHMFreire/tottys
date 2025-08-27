
export default function Loading({ label='Carregando...' }: { label?: string }) {
  return (
    <div className="p-6 text-center text-zinc-600">{label}</div>
  )
}
