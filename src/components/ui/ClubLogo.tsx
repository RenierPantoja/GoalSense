import { useState } from 'react'

interface ClubLogoProps {
  src: string | null
  name: string
  size?: number
  className?: string
}

export function ClubLogo({ src, name, size = 28, className = '' }: ClubLogoProps) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    const initials = name
      .split(' ')
      .filter((w) => w.length > 0)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()

    return (
      <div
        className={`inline-flex items-center justify-center rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] select-none ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.32 }}
        title={`Logo indisponível — ${name}`}
        aria-label={`Logo indisponível para ${name}`}
      >
        <span className="font-semibold text-[var(--text-muted)]">{initials}</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={`Escudo ${name}`}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  )
}
