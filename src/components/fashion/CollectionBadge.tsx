import type { Collection } from '@/domain/types'

type Props = {
  collection: Collection | null | undefined
}

const statusStyle: Record<string, string> = {
  ATIVA: 'bg-emerald-100 text-emerald-700',
  ENCERRADA: 'bg-zinc-100 text-zinc-500',
  RASCUNHO: 'bg-amber-100 text-amber-700',
}

export default function CollectionBadge({ collection }: Props) {
  if (!collection) return null
  const style = statusStyle[collection.status] || 'bg-zinc-100 text-zinc-500'
  const label = [collection.nome, collection.temporada, collection.ano].filter(Boolean).join(' · ')
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${style}`}>
      {label}
    </span>
  )
}
