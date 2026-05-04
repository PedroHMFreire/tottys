import { useState, type ReactNode } from 'react'
import { useSubscription } from '@/hooks/useSubscription'
import { upgradeLabel, type PlanFeature } from '@/domain/plans'
import { Lock } from 'lucide-react'
import UpgradeModal from './UpgradeModal'

interface Props {
  feature: PlanFeature
  children: ReactNode
  fallback?: ReactNode
}

export default function PlanGate({ feature, children, fallback }: Props) {
  const { can, plan, loading } = useSubscription()
  const [showModal, setShowModal] = useState(false)

  if (loading) return null
  if (can(feature)) return <>{children}</>

  if (fallback) return <>{fallback}</>

  return (
    <>
      <div
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 text-xs cursor-pointer hover:border-blue-400 hover:text-blue-500 transition-colors select-none"
        title={upgradeLabel(plan, feature)}
      >
        <Lock size={11} />
        {upgradeLabel(plan, feature)}
      </div>

      {showModal && (
        <UpgradeModal feature={feature} onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
