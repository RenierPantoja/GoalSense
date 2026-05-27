/**
 * Scope picker shared tokens
 * ─────────────────────────────────────────────────────────────────────────────
 * Visual palette + mode type that keeps include and exclude pickers feeling
 * like one family with a clear semantic difference.
 */
export type ScopeMode = 'include' | 'exclude'

export const SCOPE_PALETTE = {
  include: {
    pill: 'border-white/[0.08] bg-white/[0.04]',
    cardActive: 'border-white/[0.18] bg-white/[0.04]',
    radioOn: 'border-white/65 bg-white/85',
    addLabel: (q: string) => `+ Adicionar "${q}" manualmente`,
    addLabelMatch: (q: string) => `+ Adicionar partida manual: "${q}"`,
    primaryActionTone: 'text-white/85',
    statusActiveLabel: 'Selecionado',
  },
  exclude: {
    pill: 'border-rose-300/25 bg-rose-500/[0.06]',
    cardActive: 'border-rose-300/35 bg-rose-500/[0.06]',
    radioOn: 'border-rose-300 bg-rose-300/85',
    addLabel: (q: string) => `− Excluir "${q}" manualmente`,
    addLabelMatch: (q: string) => `− Excluir partida manual: "${q}"`,
    primaryActionTone: 'text-rose-200/90',
    statusActiveLabel: 'Excluído',
  },
} as const
