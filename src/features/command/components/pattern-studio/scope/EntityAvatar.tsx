/**
 * EntityAvatar — logo with monogram fallback
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses the team/league logo when available; otherwise falls back to a
 * monogram (1–2 letters) over a deterministic HSL backdrop so the placeholder
 * still has identity. Survives broken images via `onError`.
 */
import { useMemo, useState } from 'react'

interface EntityAvatarProps {
  src?: string | null
  name: string
  size?: number
  square?: boolean
}

export function EntityAvatar({ src, name, size = 32, square = false }: EntityAvatarProps) {
  const [errored, setErrored] = useState(false)
  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }, [name])
  const tone = useMemo(() => {
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
    return h
  }, [name])
  const radius = square ? size * 0.22 : size / 2
  const showImage = !!src && !errored
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 overflow-hidden border border-white/[0.06]"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: showImage ? 'rgba(255,255,255,0.025)' : `hsl(${tone}, 18%, 18%)`,
      }}
    >
      {showImage ? (
        <img
          src={src!}
          alt=""
          width={size}
          height={size}
          onError={() => setErrored(true)}
          loading="lazy"
          decoding="async"
          className="object-contain"
          style={{ width: size * 0.85, height: size * 0.85 }}
        />
      ) : (
        <span
          className="font-semibold tracking-tight"
          style={{ fontSize: Math.round(size * 0.36), color: 'rgba(255,255,255,0.78)' }}
        >
          {initials}
        </span>
      )}
    </span>
  )
}
