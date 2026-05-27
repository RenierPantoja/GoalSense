/**
 * pressureEventIcons — premium SVG icon system for the Live Pressure Graph.
 * ─────────────────────────────────────────────────────────────────────────────
 * V2.2 — every icon is hand-crafted as inline SVG, designed at its own micro
 * coordinate space and rendered at any size via a single `size` prop. No
 * emoji, no `lucide-react` for these markers; everything is pixel-tunable.
 *
 * Each icon expects to be placed at (cx, cy) and uses `transform="translate"`
 * so the host can position it without polluting the icon math.
 */
import type { PressureGraphEventType } from '@/features/matches/pressureGraphEvents'

// ─── Public component ───────────────────────────────────────────────────────

export interface PressureEventIconProps {
  type: PressureGraphEventType
  cx: number
  cy: number
  /** Visual radius hint. The icon scales inside `size * 2` width. */
  size: number
  /** Selection ring (cyan) drawn behind the icon. */
  selected?: boolean
  /** Hover indicator (scale 1.06 + opacity bump). Visual only. */
  hovered?: boolean
  /** When true, soften low-priority icons in dense matches. */
  muted?: boolean
  /** Optional team accent color (hex without #). Used as a halo for goals. */
  teamAccent?: string
}

export function PressureEventIcon({ type, cx, cy, size, selected, hovered, muted, teamAccent }: PressureEventIconProps) {
  const opacity = muted ? 0.5 : 1
  const scale = hovered ? 1.06 : 1

  return (
    <g
      transform={`translate(${cx} ${cy}) scale(${scale})`}
      style={{ transition: 'transform 120ms ease-out', opacity }}
    >
      {/* Selection ring renders BEHIND the icon. */}
      {selected && <SelectionRing radius={size + 2.6} />}

      {renderIcon(type, size, teamAccent)}
    </g>
  )
}

function renderIcon(type: PressureGraphEventType, size: number, teamAccent?: string) {
  switch (type) {
    case 'goal': return <SoccerBall size={size} variant="goal" teamAccent={teamAccent} />
    case 'own_goal': return <SoccerBall size={size} variant="own_goal" />
    case 'penalty_scored': return <SoccerBall size={size} variant="penalty_scored" />
    case 'penalty_missed': return <SoccerBall size={size} variant="penalty_missed" />
    case 'shot_on_target': return <ShotOnTarget size={size} />
    case 'shot_off_target': return <GoalPostIcon size={size} />
    case 'yellow_card': return <CardIcon size={size} variant="yellow" />
    case 'red_card': return <CardIcon size={size} variant="red" />
    case 'second_yellow': return <CardIcon size={size} variant="second_yellow" />
    case 'substitution': return <SubstitutionIcon size={size} />
    case 'var': return <VarTag size={size} />
    case 'unknown':
    default: return <UnknownDot size={size} />
  }
}

// ─── Soccer ball (goal / own goal / penalty) ────────────────────────────────

function SoccerBall({ size, variant, teamAccent }: { size: number; variant: 'goal' | 'own_goal' | 'penalty_scored' | 'penalty_missed'; teamAccent?: string }) {
  // The ball is drawn with a soft shadow ring behind, a primary disc, three
  // thin geometric panels (a stylized hex pattern that scales well at small
  // sizes) and a tiny inner highlight. Variants change the base color and
  // halo. We deliberately avoid the "many tiny pentagons" approach because
  // it turns into a smudge below ~10px.
  const r = size
  const color = variant === 'own_goal'
    ? '#fda4af'    // soft rose 300
    : variant === 'penalty_scored'
      ? '#a5f3fc'  // soft cyan 200
      : '#f8fafc'  // off-white slate 50
  const stroke = variant === 'own_goal'
    ? '#9f1239'    // rose 800
    : variant === 'penalty_scored'
      ? '#0e7490'  // cyan 700
      : '#0f172a'  // slate 900
  const haloColor = teamAccent
    ? `#${teamAccent}`
    : variant === 'own_goal'
      ? '#f43f5e'
      : variant === 'penalty_scored'
        ? '#22d3ee'
        : '#22d3ee'

  return (
    <g>
      {/* Outer halo for goals */}
      {(variant === 'goal' || variant === 'penalty_scored' || variant === 'own_goal') && (
        <circle r={r * 1.45} fill={haloColor} opacity="0.18" />
      )}

      {/* Soft drop shadow */}
      <ellipse cx={0} cy={r * 0.18} rx={r * 0.95} ry={r * 0.32} fill="rgba(0,0,0,0.32)" filter="url(#gs-blur-soft)" />

      {/* Main disc */}
      <circle r={r} fill={color} stroke={stroke} strokeWidth={Math.max(0.5, r * 0.085)} />

      {/* Hex panels (3 lines forming a stylized soccer pattern) */}
      <g stroke={stroke} strokeWidth={Math.max(0.4, r * 0.07)} fill="none" strokeLinecap="round" opacity="0.9">
        {/* Top pentagon edge */}
        <path d={`M ${-r * 0.42} ${-r * 0.18} L 0 ${-r * 0.55} L ${r * 0.42} ${-r * 0.18}`} />
        {/* Left bottom */}
        <path d={`M ${-r * 0.42} ${-r * 0.18} L ${-r * 0.28} ${r * 0.45}`} />
        {/* Right bottom */}
        <path d={`M ${r * 0.42} ${-r * 0.18} L ${r * 0.28} ${r * 0.45}`} />
        {/* Bottom edge */}
        <path d={`M ${-r * 0.28} ${r * 0.45} L ${r * 0.28} ${r * 0.45}`} />
      </g>

      {/* Subtle highlight (top-left) */}
      <ellipse cx={-r * 0.4} cy={-r * 0.4} rx={r * 0.3} ry={r * 0.18} fill="rgba(255,255,255,0.55)" />

      {/* Penalty scored: small cyan "P" badge */}
      {variant === 'penalty_scored' && (
        <g transform={`translate(${r * 0.6} ${-r * 0.6})`}>
          <circle r={r * 0.42} fill="#22d3ee" stroke="#0b1218" strokeWidth="0.4" />
          <text textAnchor="middle" dy={r * 0.18} fontSize={r * 0.6} fontWeight="800" fill="#0b1218" fontFamily="-apple-system, system-ui, sans-serif">P</text>
        </g>
      )}

      {/* Penalty missed: diagonal slash overlay */}
      {variant === 'penalty_missed' && (
        <g>
          <line x1={-r * 0.95} y1={r * 0.95} x2={r * 0.95} y2={-r * 0.95} stroke="#f43f5e" strokeWidth={Math.max(0.6, r * 0.16)} strokeLinecap="round" />
        </g>
      )}
    </g>
  )
}

// ─── Shot on target — concentric target rings ──────────────────────────────

function ShotOnTarget({ size }: { size: number }) {
  const r = size
  return (
    <g>
      {/* Outer halo */}
      <circle r={r * 1.35} fill="#22d3ee" opacity="0.14" />
      {/* Outer ring */}
      <circle r={r} fill="none" stroke="#22d3ee" strokeWidth={Math.max(0.45, r * 0.18)} />
      {/* Inner ring */}
      <circle r={r * 0.55} fill="none" stroke="#22d3ee" strokeWidth={Math.max(0.4, r * 0.16)} opacity="0.85" />
      {/* Center dot */}
      <circle r={r * 0.22} fill="#22d3ee" />
    </g>
  )
}

// ─── Shot off target — minimalist goal frame + ball ────────────────────────

function GoalPostIcon({ size }: { size: number }) {
  // Stylized goal: two posts + crossbar drawn as a single rounded "U" shape
  // upside-down, with a tiny ball bouncing off to the side. Sized to read
  // even at 4–6px units thanks to thick caps.
  const r = size
  const w = r * 1.7
  const h = r * 1.25
  const stroke = '#cbd5e1' // slate 300
  return (
    <g>
      {/* Frame */}
      <g stroke={stroke} strokeWidth={Math.max(0.45, r * 0.22)} strokeLinecap="round" fill="none">
        <line x1={-w / 2} y1={h * 0.45} x2={-w / 2} y2={-h * 0.5} />
        <line x1={w / 2} y1={h * 0.45} x2={w / 2} y2={-h * 0.5} />
        <line x1={-w / 2 - r * 0.12} y1={-h * 0.5} x2={w / 2 + r * 0.12} y2={-h * 0.5} />
      </g>
      {/* Mini ball flying out (right-up) */}
      <g transform={`translate(${w / 2 + r * 0.55} ${-h * 0.65})`}>
        <circle r={r * 0.4} fill="#cbd5e1" stroke="#475569" strokeWidth={Math.max(0.3, r * 0.08)} />
      </g>
      {/* Ground line (very faint) */}
      <line x1={-w / 2 - r * 0.25} y1={h * 0.6} x2={w / 2 + r * 0.25} y2={h * 0.6} stroke="rgba(203,213,225,0.25)" strokeWidth={Math.max(0.2, r * 0.06)} strokeLinecap="round" />
    </g>
  )
}

// ─── Cards (yellow / red / second yellow) ──────────────────────────────────

function CardIcon({ size, variant }: { size: number; variant: 'yellow' | 'red' | 'second_yellow' }) {
  const w = size * 1.05
  const h = size * 1.5
  const tilt = -6 // degrees

  const yellowFill = '#facc15' // amber 400
  const yellowEdge = '#a16207' // amber 700
  const redFill = '#ef4444'    // red 500
  const redEdge = '#7f1d1d'    // red 900

  const back = variant === 'red' ? null : { fill: yellowFill, edge: yellowEdge }
  const front =
    variant === 'red' ? { fill: redFill, edge: redEdge }
    : variant === 'second_yellow' ? { fill: redFill, edge: redEdge }
    : { fill: yellowFill, edge: yellowEdge }

  return (
    <g transform={`rotate(${tilt})`}>
      {/* Back card (only in second_yellow combo) */}
      {variant === 'second_yellow' && back && (
        <g transform={`translate(${-w * 0.18} ${h * 0.12}) rotate(${tilt})`}>
          <CardShape w={w} h={h} fill={back.fill} edge={back.edge} />
        </g>
      )}

      {/* Front card */}
      <CardShape w={w} h={h} fill={front.fill} edge={front.edge} />
    </g>
  )
}

function CardShape({ w, h, fill, edge }: { w: number; h: number; fill: string; edge: string }) {
  const rx = Math.max(0.6, h * 0.1)
  return (
    <g>
      {/* Drop shadow */}
      <rect x={-w / 2 + 0.2} y={-h / 2 + 0.6} width={w} height={h} rx={rx} fill="rgba(0,0,0,0.4)" />
      {/* Card body */}
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx} fill={fill} stroke={edge} strokeWidth={Math.max(0.4, w * 0.08)} />
      {/* Inner shine */}
      <rect x={-w / 2 + w * 0.12} y={-h / 2 + h * 0.08} width={w * 0.3} height={h * 0.18} rx={rx * 0.6} fill="rgba(255,255,255,0.35)" />
    </g>
  )
}

// ─── Substitution — two curved arrows ───────────────────────────────────────

function SubstitutionIcon({ size }: { size: number }) {
  const r = size
  const stroke = '#94a3b8' // slate 400
  const sw = Math.max(0.5, r * 0.18)
  return (
    <g stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* Top arrow: pointing right */}
      <path d={`M ${-r * 0.95} ${-r * 0.4} Q ${-r * 0.4} ${-r * 0.95}, ${r * 0.45} ${-r * 0.4}`} />
      <path d={`M ${r * 0.45} ${-r * 0.4} l ${-r * 0.35} ${-r * 0.25}`} />
      <path d={`M ${r * 0.45} ${-r * 0.4} l ${-r * 0.4} ${r * 0.18}`} />
      {/* Bottom arrow: pointing left */}
      <path d={`M ${r * 0.95} ${r * 0.4} Q ${r * 0.4} ${r * 0.95}, ${-r * 0.45} ${r * 0.4}`} />
      <path d={`M ${-r * 0.45} ${r * 0.4} l ${r * 0.35} ${r * 0.25}`} />
      <path d={`M ${-r * 0.45} ${r * 0.4} l ${r * 0.4} ${-r * 0.18}`} />
    </g>
  )
}

// ─── VAR tag ────────────────────────────────────────────────────────────────

function VarTag({ size }: { size: number }) {
  const w = size * 2.4
  const h = size * 1.4
  return (
    <g>
      {/* Halo */}
      <rect x={-w / 2 - 1} y={-h / 2 - 1} width={w + 2} height={h + 2} rx={h * 0.35} fill="#a78bfa" opacity="0.18" />
      {/* Body */}
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h * 0.32} fill="#0b1018" stroke="#a78bfa" strokeWidth={Math.max(0.4, h * 0.1)} />
      <text textAnchor="middle" dy={h * 0.18} fontSize={h * 0.78} fontWeight="800" letterSpacing="0.3" fill="#c4b5fd" fontFamily="-apple-system, system-ui, sans-serif">VAR</text>
    </g>
  )
}

// ─── Unknown / fallback dot ────────────────────────────────────────────────

function UnknownDot({ size }: { size: number }) {
  return (
    <g>
      <circle r={size} fill="#94a3b8" opacity="0.7" />
      <circle r={size * 0.5} fill="#475569" />
    </g>
  )
}

// ─── Group bubble (+N) ─────────────────────────────────────────────────────

export function GroupBubble({ cx, cy, size, count, accent, hovered }: { cx: number; cy: number; size: number; count: number; accent: string; hovered?: boolean }) {
  // Glass capsule sized to fit "+99" comfortably. Color is taken from the
  // most important event in the group so visual hierarchy survives the merge.
  const radius = size + (count >= 10 ? 1.6 : 0.8)
  const scale = hovered ? 1.06 : 1
  return (
    <g
      transform={`translate(${cx} ${cy}) scale(${scale})`}
      style={{ transition: 'transform 120ms ease-out' }}
    >
      {/* Halo */}
      <circle r={radius * 1.45} fill={accent} opacity="0.14" />
      {/* Glass body */}
      <circle r={radius} fill="rgba(11,16,24,0.92)" stroke={accent} strokeWidth={Math.max(0.5, radius * 0.16)} />
      {/* Highlight */}
      <ellipse cx={-radius * 0.4} cy={-radius * 0.45} rx={radius * 0.42} ry={radius * 0.18} fill="rgba(255,255,255,0.18)" />
      {/* Text */}
      <text textAnchor="middle" dy={radius * 0.34} fontSize={radius * 0.92} fontWeight="800" fill="#ffffff" fontFamily="-apple-system, system-ui, sans-serif">+{count}</text>
    </g>
  )
}

// ─── Selection ring + filter defs ───────────────────────────────────────────

function SelectionRing({ radius }: { radius: number }) {
  return (
    <g>
      <circle r={radius} fill="none" stroke="#22d3ee" strokeWidth="0.7" opacity="0.95" />
      <circle r={radius + 1.2} fill="none" stroke="#22d3ee" strokeWidth="0.4" opacity="0.4" />
    </g>
  )
}

/**
 * Reusable SVG defs (drop shadow blur). Mount once at the top of the host
 * SVG so every icon can reference `url(#gs-blur-soft)`.
 */
export function PressureEventIconDefs() {
  return (
    <defs>
      <filter id="gs-blur-soft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="0.55" />
      </filter>
    </defs>
  )
}

// ─── HTML icon for tooltip header / legend ──────────────────────────────────

/**
 * Compact 14x14 inline-SVG version of the marker icon, for use inside the
 * HTML tooltip header and the legend. Reuses the same SVG icon system but in
 * a fixed coordinate space optimised for HTML embedding. Each inline SVG
 * brings its own filter def so it works standalone.
 */
export function PressureEventIconInline({ type, sizePx = 14 }: { type: PressureGraphEventType; sizePx?: number }) {
  const r = 11
  return (
    <svg width={sizePx} height={sizePx} viewBox="-16 -16 32 32" aria-hidden="true">
      <defs>
        {/* Same id used by the in-graph defs so SoccerBall renders consistently
            whether we're inside the host SVG or in this isolated inline one. */}
        <filter id="gs-blur-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.55" />
        </filter>
      </defs>
      {renderIcon(type, r)}
    </svg>
  )
}
