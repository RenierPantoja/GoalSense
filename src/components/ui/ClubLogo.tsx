import { useState } from 'react'

interface ClubLogoProps {
  src: string | null
  name: string
  size?: number
  className?: string
}

export function ClubLogo({ src, name, size = 32, className = '' }: ClubLogoProps) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    const initials = name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()

    return (
      <div
        className={`flex items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)] font-semibold select-none ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.35 }}
      >
        {initials}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  )
}
