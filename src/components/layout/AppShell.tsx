import { Outlet } from 'react-router-dom'
import { TopNavigation } from './TopNavigation'
import { OnboardingModal, useOnboarding } from '@/components/onboarding/OnboardingModal'

export function AppShell() {
  const { showOnboarding, dismiss } = useOnboarding()

  return (
    <div className="min-h-screen bg-[var(--bg-app)]">
      <TopNavigation />
      <main className="mx-auto max-w-[1400px] px-5 py-8">
        <Outlet />
      </main>
      {showOnboarding && <OnboardingModal onDismiss={dismiss} />}
    </div>
  )
}
