import { Outlet } from 'react-router-dom'
import { TopNavigation } from './TopNavigation'
import { OnboardingModal, useOnboarding } from '@/components/onboarding/OnboardingModal'

export function AppShell() {
  const { showOnboarding, dismiss } = useOnboarding()

  return (
    <div className="min-h-screen bg-[var(--bg-app)]">
      <TopNavigation />
      <main className="mx-auto max-w-[1680px] px-4 sm:px-5 lg:px-6 py-6 sm:py-8">
        <Outlet />
      </main>
      {showOnboarding && <OnboardingModal onDismiss={dismiss} />}
    </div>
  )
}
