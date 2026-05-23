interface EmptyStateProps {
  title: string
  description?: string
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mb-4">
        <div className="h-4 w-4 rounded-full bg-[var(--border-strong)]" />
      </div>
      <h3 className="text-sm font-medium text-[var(--text-secondary)]">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
      )}
    </div>
  )
}
