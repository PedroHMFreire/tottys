import { useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp, type Subscription } from '@/state/store'
import { planIncludes, type Plan, type PlanFeature } from '@/domain/plans'
import { captureError } from '@/lib/sentry'

export function useSubscription() {
  const { company, subscription, subscriptionLoaded, setSubscription } = useApp()

  useEffect(() => {
    if (subscriptionLoaded || !company?.id) return
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_subscription')
        if (!mounted) return
        if (error) { captureError(error, { context: 'useSubscription' }); return }
        setSubscription((data?.[0] as Subscription) ?? undefined)
      } catch (err) {
        captureError(err, { context: 'useSubscription' })
      }
    })()
    return () => { mounted = false }
  }, [company?.id, subscriptionLoaded])

  const plan = subscription?.plan as Plan | undefined
  const status = subscription?.status

  const trialEndsAt = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null
  const isTrialing  = status === 'trialing' && !!trialEndsAt && trialEndsAt > new Date()
  const trialExpired = status === 'trialing' && !!trialEndsAt && trialEndsAt <= new Date()
  const isActive    = status === 'active' || isTrialing
  const isPastDue   = status === 'past_due'
  const isCanceled  = status === 'canceled'
  const isBlocked   = trialExpired || isCanceled

  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000))
    : 0

  function can(feature: PlanFeature): boolean {
    if (!isActive && !isPastDue) return false
    return planIncludes(plan, feature)
  }

  return {
    subscription,
    plan,
    status,
    loading: !subscriptionLoaded,
    isTrialing,
    isActive,
    isPastDue,
    isCanceled,
    isBlocked,
    trialDaysLeft,
    can,
  }
}
