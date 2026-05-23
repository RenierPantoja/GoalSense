interface EmptyStateProps {
  title: string
  description?: string
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] py-20 text-center">
      <div className="mb-4 h-10 w-10 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex items-center justify-center">
        <div className="h-2.5 w-2.5 rounded-full bg-[var(--text-muted)] opacity-40" />
      </div>
      <p className="text-[13px] font-medium text-[var(--text-secondary)]">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-[var(--text-muted)]">{description}</p>
      )}
    </div>
  )
}
