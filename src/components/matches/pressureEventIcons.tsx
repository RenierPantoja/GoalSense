/**
 * pressureEventIcons - premium icon system for the Live Pressure Graph (V2.3).
 * -----------------------------------------------------------------------------
 * V2.2 - every glyph hand-crafted as SVG. Premium look, but a few non-football
 *         glyphs (target, goalpost, substitution) felt amateur compared to
 *         industry icon libraries.
 * V2.3 - keeps the custom soccer ball / cards / VAR (lucide has no proper
 *         referee cards or stylized soccer ball), but switches the
 *         non-football glyphs to lucide-react primitives wrapped in a
 *         GoalSense "event badge" so they feel professional yet on-brand.
 *
 * Why lucide-react:
 *   - already a project dependency (`lucide-react@^0.511.0`);
 *   - MIT-licensed (ISC for icons);
 *   - tree-shakable named imports - zero new bundle baseline;
 *   - consistent stroke weights that pair well with Apple/Resend tone.
 *
 * Important detail about the host SVG:
 *   LivePressureGraph renders its host `<svg>` with `preserveAspectRatio="none"`
 *   so the curve fills the full container. HTML inside `<foreignObject>` would
 *   be stretched non-uniformly. To keep lucide glyphs crisp we render them as
 *   raw SVG primitives (path/circle) using their published lucide source data,
 *   so they share the exact same coordinate system as our custom SVG icons.
 *
 * Public surface: `PressureEventIcon`, `PressureEventIconInline`,
 * `GroupBubble`, `PressureEventIconDefs`. Stable across V2.x.
 */
import { ArrowRightLeft, Goal, Target } from 'lucide-react'
import type { PressureGraphEventType } from '@/features/matches/pressureGraphEvents'

// ---------------------------------------------------------------------------
// Lucide icon source data (paths copied verbatim from lucide-react v0.511.0).
// We render them as native SVG inside our user-unit space, so behavior is
// identical to our hand-crafted icons (no foreignObject, no HTML).
// ---------------------------------------------------------------------------

type LucideNode =
  | { tag: 'path'; d: string }
  | { tag: 'circle'; cx: number; cy: number; r: number }

const LUCIDE_TARGET: LucideNode[] = [
  { tag: 'circle', cx: 12, cy: 12, r: 10 },
  { tag: 'circle', cx: 12, cy: 12, r: 6 },
  { tag: 'circle', cx: 12, cy: 12, r: 2 },
]

const LUCIDE_GOAL: LucideNode[] = [
  { tag: 'path', d: 'M12 13V2l8 4-8 4' },
  { tag: 'path', d: 'M20.561 10.222a9 9 0 1 1-12.55-5.29' },
  { tag: 'path', d: 'M8.002 9.997a5 5 0 1 0 8.9 2.02' },
]

const LUCIDE_ARROW_RIGHT_LEFT: LucideNode[] = [
  { tag: 'path', d: 'm16 3 4 4-4 4' },
  { tag: 'path', d: 'M20 7H4' },
  { tag: 'path', d: 'm8 21-4-4 4-4' },
  { tag: 'path', d: 'M4 17h16' },
]

function LucidePrimitive({ nodes, color, strokeWidth }: { nodes: LucideNode[]; color: string; strokeWidth: number }) {
  // Lucide source uses viewBox 0 0 24 24. The caller wraps this in a
  // <g transform="scale(s) translate(-12 -12)"> so the icon is centered on
  // the world origin and sized appropriately. We render the source nodes
  // verbatim, with no coordinate rewriting needed.
  return (
    <g fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {nodes.map((n, i) =>
        n.tag === 'circle'
          ? <circle key={i} cx={n.cx} cy={n.cy} r={n.r} />
          : <path key={i} d={n.d} />
      )}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface PressureEventIconProps {
  type: PressureGraphEventType
  cx: number
  cy: number
  /** Visual radius hint. Determines the badge / icon footprint. */
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
    case 'shot_on_target': return <BadgedLucideSvg nodes={LUCIDE_TARGET} size={size} accent="#22d3ee" haloOpacity={0.18} />
    case 'shot_off_target': return <BadgedLucideSvg nodes={LUCIDE_GOAL} size={size} accent="#cbd5e1" haloOpacity={0.10} dimmed />
    case 'yellow_card': return <CardIcon size={size} variant="yellow" />
    case 'red_card': return <CardIcon size={size} variant="red" />
    case 'second_yellow': return <CardIcon size={size} variant="second_yellow" />
    case 'substitution': return <BadgedLucideSvg nodes={LUCIDE_ARROW_RIGHT_LEFT} size={size} accent="#94a3b8" haloOpacity={0.10} dimmed />
    case 'var': return <VarTag size={size} />
    case 'unknown':
    default: return <UnknownDot size={size} />
  }
}

// ---------------------------------------------------------------------------
// Lucide-backed badge (rendered as native SVG, not HTML/foreignObject)
// ---------------------------------------------------------------------------

interface BadgedLucideSvgProps {
  nodes: LucideNode[]
  size: number
  accent: string
  haloOpacity?: number
  dimmed?: boolean
}

function BadgedLucideSvg({ nodes, size, accent, haloOpacity = 0.12, dimmed = false }: BadgedLucideSvgProps) {
  const badgeR = size * 1.05
  // Lucide viewBox is 24x24 anchored at (12,12). We want the glyph diameter
  // ~70% of badge diameter. Compose translate + scale so the glyph is
  // centered on the world origin.
  const glyphTargetDiameter = badgeR * 1.4
  const glyphScale = glyphTargetDiameter / 24
  const stroke = dimmed ? '#cbd5e1' : accent
  // Stroke thickness in lucide source units. 2.0 reads cleanly across our
  // typical badge sizes; bump slightly when the badge is very small so the
  // glyph stays legible.
  const strokeWidth = size <= 4 ? 2.4 : 2.0

  return (
    <g>
      {/* Halo */}
      <circle r={badgeR * 1.4} fill={accent} opacity={haloOpacity} />
      {/* Glass body */}
      <circle r={badgeR} fill="rgba(11,16,24,0.9)" stroke={accent} strokeWidth={Math.max(0.45, badgeR * 0.13)} opacity={dimmed ? 0.85 : 1} />
      {/* Highlight */}
      <ellipse cx={-badgeR * 0.35} cy={-badgeR * 0.45} rx={badgeR * 0.4} ry={badgeR * 0.16} fill="rgba(255,255,255,0.18)" />
      {/* Lucide glyph as native SVG primitives, centered on origin */}
      <g transform={`scale(${glyphScale}) translate(-12 -12)`}>
        <LucidePrimitive nodes={nodes} color={stroke} strokeWidth={strokeWidth} />
      </g>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Custom SVG icons (kept from V2.2)
// ---------------------------------------------------------------------------

function SoccerBall({ size, variant, teamAccent }: { size: number; variant: 'goal' | 'own_goal' | 'penalty_scored' | 'penalty_missed'; teamAccent?: string }) {
  const r = size
  const color = variant === 'own_goal'
    ? '#fda4af'
    : variant === 'penalty_scored'
      ? '#a5f3fc'
      : '#f8fafc'
  const stroke = variant === 'own_goal'
    ? '#9f1239'
    : variant === 'penalty_scored'
      ? '#0e7490'
      : '#0f172a'
  const haloColor = teamAccent
    ? `#${teamAccent}`
    : variant === 'own_goal'
      ? '#f43f5e'
      : variant === 'penalty_scored'
        ? '#22d3ee'
        : '#22d3ee'

  return (
    <g>
      {(variant === 'goal' || variant === 'penalty_scored' || variant === 'own_goal') && (
        <circle r={r * 1.45} fill={haloColor} opacity="0.18" />
      )}
      <ellipse cx={0} cy={r * 0.18} rx={r * 0.95} ry={r * 0.32} fill="rgba(0,0,0,0.32)" filter="url(#gs-blur-soft)" />
      <circle r={r} fill={color} stroke={stroke} strokeWidth={Math.max(0.5, r * 0.085)} />
      {/* Stylized hexagonal panels */}
      <g stroke={stroke} strokeWidth={Math.max(0.4, r * 0.07)} fill="none" strokeLinecap="round" opacity="0.9">
        <path d={`M ${-r * 0.42} ${-r * 0.18} L 0 ${-r * 0.55} L ${r * 0.42} ${-r * 0.18}`} />
        <path d={`M ${-r * 0.42} ${-r * 0.18} L ${-r * 0.28} ${r * 0.45}`} />
        <path d={`M ${r * 0.42} ${-r * 0.18} L ${r * 0.28} ${r * 0.45}`} />
        <path d={`M ${-r * 0.28} ${r * 0.45} L ${r * 0.28} ${r * 0.45}`} />
      </g>
      <ellipse cx={-r * 0.4} cy={-r * 0.4} rx={r * 0.3} ry={r * 0.18} fill="rgba(255,255,255,0.55)" />

      {variant === 'penalty_scored' && (
        <g transform={`translate(${r * 0.6} ${-r * 0.6})`}>
          <circle r={r * 0.42} fill="#22d3ee" stroke="#0b1218" strokeWidth="0.4" />
          <text textAnchor="middle" dy={r * 0.18} fontSize={r * 0.6} fontWeight="800" fill="#0b1218" fontFamily="-apple-system, system-ui, sans-serif">P</text>
        </g>
      )}
      {variant === 'penalty_missed' && (
        <g>
          <line x1={-r * 0.95} y1={r * 0.95} x2={r * 0.95} y2={-r * 0.95} stroke="#f43f5e" strokeWidth={Math.max(0.6, r * 0.16)} strokeLinecap="round" />
        </g>
      )}
    </g>
  )
}

function CardIcon({ size, variant }: { size: number; variant: 'yellow' | 'red' | 'second_yellow' }) {
  const w = size * 1.05
  const h = size * 1.5
  const tilt = -6

  const yellowFill = '#facc15'
  const yellowEdge = '#a16207'
  const redFill = '#ef4444'
  const redEdge = '#7f1d1d'

  const back = variant === 'red' ? null : { fill: yellowFill, edge: yellowEdge }
  const front =
    variant === 'red' ? { fill: redFill, edge: redEdge }
    : variant === 'second_yellow' ? { fill: redFill, edge: redEdge }
    : { fill: yellowFill, edge: yellowEdge }

  return (
    <g transform={`rotate(${tilt})`}>
      {variant === 'second_yellow' && back && (
        <g transform={`translate(${-w * 0.18} ${h * 0.12}) rotate(${tilt})`}>
          <CardShape w={w} h={h} fill={back.fill} edge={back.edge} />
        </g>
      )}
      <CardShape w={w} h={h} fill={front.fill} edge={front.edge} />
    </g>
  )
}

function CardShape({ w, h, fill, edge }: { w: number; h: number; fill: string; edge: string }) {
  const rx = Math.max(0.6, h * 0.1)
  return (
    <g>
      <rect x={-w / 2 + 0.2} y={-h / 2 + 0.6} width={w} height={h} rx={rx} fill="rgba(0,0,0,0.4)" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx} fill={fill} stroke={edge} strokeWidth={Math.max(0.4, w * 0.08)} />
      <rect x={-w / 2 + w * 0.12} y={-h / 2 + h * 0.08} width={w * 0.3} height={h * 0.18} rx={rx * 0.6} fill="rgba(255,255,255,0.35)" />
    </g>
  )
}

function VarTag({ size }: { size: number }) {
  const w = size * 2.4
  const h = size * 1.4
  return (
    <g>
      <rect x={-w / 2 - 1} y={-h / 2 - 1} width={w + 2} height={h + 2} rx={h * 0.35} fill="#a78bfa" opacity="0.18" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h * 0.32} fill="#0b1018" stroke="#a78bfa" strokeWidth={Math.max(0.4, h * 0.1)} />
      <text textAnchor="middle" dy={h * 0.18} fontSize={h * 0.78} fontWeight="800" letterSpacing="0.3" fill="#c4b5fd" fontFamily="-apple-system, system-ui, sans-serif">VAR</text>
    </g>
  )
}

function UnknownDot({ size }: { size: number }) {
  return (
    <g>
      <circle r={size} fill="#94a3b8" opacity="0.7" />
      <circle r={size * 0.5} fill="#475569" />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Group bubble (+N)
// ---------------------------------------------------------------------------

export function GroupBubble({ cx, cy, size, count, accent, hovered }: { cx: number; cy: number; size: number; count: number; accent: string; hovered?: boolean }) {
  const radius = size + (count >= 10 ? 1.6 : 0.8)
  const scale = hovered ? 1.06 : 1
  return (
    <g
      transform={`translate(${cx} ${cy}) scale(${scale})`}
      style={{ transition: 'transform 120ms ease-out' }}
    >
      <circle r={radius * 1.45} fill={accent} opacity="0.14" />
      <circle r={radius} fill="rgba(11,16,24,0.92)" stroke={accent} strokeWidth={Math.max(0.5, radius * 0.16)} />
      <ellipse cx={-radius * 0.4} cy={-radius * 0.45} rx={radius * 0.42} ry={radius * 0.18} fill="rgba(255,255,255,0.18)" />
      <text textAnchor="middle" dy={radius * 0.34} fontSize={radius * 0.92} fontWeight="800" fill="#ffffff" fontFamily="-apple-system, system-ui, sans-serif">+{count}</text>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Selection ring + filter defs
// ---------------------------------------------------------------------------

function SelectionRing({ radius }: { radius: number }) {
  return (
    <g>
      <circle r={radius} fill="none" stroke="#22d3ee" strokeWidth="0.7" opacity="0.95" />
      <circle r={radius + 1.2} fill="none" stroke="#22d3ee" strokeWidth="0.4" opacity="0.4" />
    </g>
  )
}

export function PressureEventIconDefs() {
  return (
    <defs>
      <filter id="gs-blur-soft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="0.55" />
      </filter>
    </defs>
  )
}

// ---------------------------------------------------------------------------
// Inline icon (HTML usage: tooltip header / legend)
// ---------------------------------------------------------------------------
//
// HTML world has no aspect-ratio distortion, so for HTML usage we render the
// lucide-react components directly. This gives the legend/tooltip pixel-perfect
// industry-grade glyphs. Custom SVG types use a small inline SVG that mirrors
// the in-graph version so the reader recognizes them as the same icons.

export function PressureEventIconInline({ type, sizePx = 14 }: { type: PressureGraphEventType; sizePx?: number }) {
  if (type === 'shot_on_target') return <Target size={sizePx} color="#22d3ee" strokeWidth={2.2} aria-hidden />
  if (type === 'shot_off_target') return <Goal size={sizePx} color="#cbd5e1" strokeWidth={2.2} aria-hidden />
  if (type === 'substitution') return <ArrowRightLeft size={sizePx} color="#94a3b8" strokeWidth={2.2} aria-hidden />

  const r = 11
  return (
    <svg width={sizePx} height={sizePx} viewBox="-16 -16 32 32" aria-hidden="true">
      <defs>
        <filter id="gs-blur-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.55" />
        </filter>
      </defs>
      {renderInlineCustom(type, r)}
    </svg>
  )
}

function renderInlineCustom(type: PressureGraphEventType, r: number) {
  switch (type) {
    case 'goal': return <SoccerBall size={r} variant="goal" />
    case 'own_goal': return <SoccerBall size={r} variant="own_goal" />
    case 'penalty_scored': return <SoccerBall size={r} variant="penalty_scored" />
    case 'penalty_missed': return <SoccerBall size={r} variant="penalty_missed" />
    case 'yellow_card': return <CardIcon size={r} variant="yellow" />
    case 'red_card': return <CardIcon size={r} variant="red" />
    case 'second_yellow': return <CardIcon size={r} variant="second_yellow" />
    case 'var': return <VarTag size={r} />
    default: return <UnknownDot size={r} />
  }
}
