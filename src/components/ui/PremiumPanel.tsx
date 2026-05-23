import type { ReactNode } from 'react'

interface PremiumPanelProps {
  children: ReactNode
  className?: string
}

export function PremiumPanel({ children, className = '' }: PremiumPanelProps) {
  return (
    <div
      className={`rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-[var(--shadow-panel)] ${className}`}
    >
      {children}
    </div>
  )
}
