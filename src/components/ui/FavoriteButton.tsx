/**
 * Reusable favorite toggle button (heart icon).
 * Discrete, elegant, consistent.
 */
import { Heart } from 'lucide-react'

interface Props {
  active: boolean
  onClick: (e: React.MouseEvent) => void
  size?: number
  label?: string
}

export function FavoriteButton({ active, onClick, size = 16, label }: Props) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      className={`inline-flex items-center justify-center rounded-lg p-1.5 transition-all ${
        active
          ? 'text-rose-400 hover:text-rose-300'
          : 'text-white/15 hover:text-white/40'
      }`}
      title={label || (active ? 'Remover dos favoritos' : 'Adicionar aos favoritos')}
      aria-label={label || (active ? 'Remover dos favoritos' : 'Adicionar aos favoritos')}
    >
      <Heart size={size} className={active ? 'fill-current' : ''} />
    </button>
  )
}
