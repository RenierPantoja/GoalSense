export function LoadingState({ message = 'Carregando...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="h-8 w-8 rounded-full border-2 border-[var(--accent-cyan)] border-t-transparent animate-spin" />
      <span className="text-sm text-[var(--text-muted)]">{message}</span>
    </div>
  )
}
