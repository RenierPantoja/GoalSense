export function LoadingState({ message = 'Carregando...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative h-8 w-8">
        <div className="absolute inset-0 rounded-full border border-[var(--border-subtle)]" />
        <div className="absolute inset-0 rounded-full border border-t-[var(--accent-cyan)] animate-spin" />
      </div>
      <span className="text-[12px] text-[var(--text-muted)]">{message}</span>
    </div>
  )
}
