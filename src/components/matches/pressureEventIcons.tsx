/**
 * pressureEventIcons - premium icon system for the Live Pressure Graph.
 * -----------------------------------------------------------------------------
 * V2.2 - hand-crafted SVGs for every event type.
 * V2.3 - lucide-react primitives wrapped in GoalSense badges for shot_on_target,
 *         shot_off_target and substitution.
 * V2.4 - markers move out of the distorted curve SVG into an HTML overlay.
 *         This file now exposes `PressureEventIconBox` (square, HTML-friendly,
 *         no aspect-ratio distortion), `GroupBubbleBox` (HTML version of +N)
 *         and keeps `PressureEventIconInline` for tooltip / legend usage.
 *
 * Why lucide-react:
 *   - already a project dependency (`lucide-react@^0.511.0`);
 *   - MIT/ISC-licensed;
 *   - tree-shakable named imports - zero new bundle baseline.
 *
 * Public surface (stable):
 *   - PressureEventIcon          (legacy SVG-world variant; kept for back-compat)
 *   - PressureEventIconBox       (V2.4 HTML overlay marker)
 *   - GroupBubble                (legacy SVG-world +N)
 *   - GroupBubbleBox             (V2.4 HTML overlay +N)
 *   - PressureEventIconInline    (HTML inline icon for tooltip / legend)
 *   - PressureEventIconDefs      (SVG defs - filters)
 */
import { ArrowRightLeft, Goal, Target } from 'lucide-react'
import type { PressureGraphEventType } from '@/features/matches/pressureGraphEvents'

// ---------------------------------------------------------------------------
// Lucide source data (verbatim copy from lucide-react v0.511.0).
// We render these as native SVG primitives inside our own viewBox so the
// glyphs look pixel-perfect across all marker sizes.
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
  // Lucide source uses viewBox 0 0 24 24. Caller wraps this in a
  // <g transform="scale(s) translate(-12 -12)"> so the icon centers at origin.
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
// V2.x legacy SVG-world variant. Still exported for back-compat in case
// another consumer renders it inside their own SVG. The Live Pressure Graph
// itself moved away from this in V2.4.
// ---------------------------------------------------------------------------

export interface PressureEventIconProps {
  type: PressureGraphEventType
  cx: number
  cy: number
  size: number
  selected?: boolean
  hovered?: boolean
  muted?: boolean
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
      {selected && <SelectionRingSvg radius={size + 2.6} />}
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
    case 'substitution': return <SubstitutionIcon size={size} />
    case 'var': return <VarTag size={size} />
    case 'unknown':
    default: return <UnknownDot size={size} />
  }
}

interface BadgedLucideSvgProps {
  nodes: LucideNode[]
  size: number
  accent: string
  haloOpacity?: number
  dimmed?: boolean
}

function BadgedLucideSvg({ nodes, size, accent, haloOpacity = 0.12, dimmed = false }: BadgedLucideSvgProps) {
  const badgeR = size * 1.05
  const glyphTargetDiameter = badgeR * 1.4
  const glyphScale = glyphTargetDiameter / 24
  const stroke = dimmed ? '#cbd5e1' : accent
  // V2.6B: thicker strokes for better legibility at larger sizes
  const strokeWidth = 2.2

  return (
    <g>
      <circle r={badgeR * 1.35} fill={accent} opacity={haloOpacity} />
      <circle r={badgeR} fill="rgba(8,11,18,0.92)" stroke={accent} strokeWidth={Math.max(0.7, badgeR * 0.14)} opacity={dimmed ? 0.85 : 1} />
      <ellipse cx={-badgeR * 0.3} cy={-badgeR * 0.4} rx={badgeR * 0.35} ry={badgeR * 0.14} fill="rgba(255,255,255,0.15)" />
      <g transform={`scale(${glyphScale}) translate(-12 -12)`}>
        <LucidePrimitive nodes={nodes} color={stroke} strokeWidth={strokeWidth} />
      </g>
    </g>
  )
}

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
  // V2.6B: cards are their own shape (no circular badge needed). Larger
  // proportions, less tilt, thicker stroke for instant recognition.
  const w = size * 1.1
  const h = size * 1.6
  const tilt = -4

  const yellowFill = '#fbbf24'
  const yellowEdge = '#92400e'
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
        <g transform={`translate(${-w * 0.2} ${h * 0.1}) rotate(${tilt})`}>
          <CardShape w={w} h={h} fill={back.fill} edge={back.edge} />
        </g>
      )}
      <CardShape w={w} h={h} fill={front.fill} edge={front.edge} />
    </g>
  )
}

function CardShape({ w, h, fill, edge }: { w: number; h: number; fill: string; edge: string }) {
  const rx = Math.max(0.8, h * 0.08)
  return (
    <g>
      {/* Shadow */}
      <rect x={-w / 2 + 0.4} y={-h / 2 + 0.8} width={w} height={h} rx={rx} fill="rgba(0,0,0,0.5)" />
      {/* Card body */}
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx} fill={fill} stroke={edge} strokeWidth={Math.max(0.6, w * 0.09)} />
      {/* Internal highlight */}
      <rect x={-w / 2 + w * 0.1} y={-h / 2 + h * 0.06} width={w * 0.35} height={h * 0.15} rx={rx * 0.5} fill="rgba(255,255,255,0.4)" />
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

function SelectionRingSvg({ radius }: { radius: number }) {
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
// Legacy SVG-world group bubble (+N).
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
// V2.4 - HTML overlay marker (square SVG, no host distortion)
// ---------------------------------------------------------------------------
//
// `PressureEventIconBox` returns a standalone <svg> sized in CSS pixels with
// a fixed aspect ratio. The caller positions the icon via absolute layout in
// percentage coordinates, so the curve SVG's `preserveAspectRatio="none"`
// no longer affects the marker visuals.

export interface PressureEventIconBoxProps {
  type: PressureGraphEventType
  sizePx: number
  selected?: boolean
  hovered?: boolean
  muted?: boolean
  teamAccent?: string
}

// V2.8: internal sizes tuned for larger pixel boxes.
function internalSizeFor(type: PressureGraphEventType): number {
  switch (type) {
    case 'goal':
    case 'own_goal':
    case 'penalty_scored':
    case 'penalty_missed':
      return 13.5
    case 'yellow_card':
    case 'red_card':
    case 'second_yellow':
      return 12
    case 'shot_on_target':
      return 12
    case 'shot_off_target':
      return 12.5
    case 'substitution':
      return 14
    case 'var':
      return 9.5
    default:
      return 9
  }
}

export function PressureEventIconBox({ type, sizePx, selected, hovered, muted, teamAccent }: PressureEventIconBoxProps) {
  const internalSize = internalSizeFor(type)
  // V2.8: muted opacity raised — secondary events must remain visible
  const opacity = muted ? 0.72 : 1
  const scale = hovered ? 1.04 : 1
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: sizePx,
        height: sizePx,
        transform: `scale(${scale})`,
        transition: 'transform 120ms ease-out',
        opacity,
      }}
    >
      {selected && (
        <span
          style={{
            position: 'absolute',
            inset: -3,
            borderRadius: '999px',
            border: '1.5px solid rgba(34,211,238,0.95)',
            boxShadow: '0 0 0 3px rgba(34,211,238,0.18)',
            pointerEvents: 'none',
          }}
        />
      )}
      <svg
        width={sizePx}
        height={sizePx}
        viewBox="-16 -16 32 32"
        overflow="visible"
        style={{ display: 'block' }}
      >
        <defs>
          <filter id="gs-blur-soft-box" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.55" />
          </filter>
        </defs>
        {renderIconBox(type, internalSize, teamAccent)}
      </svg>
    </span>
  )
}

// Identical to renderIcon() but uses the inline filter id so the box SVG is
// fully self-contained (no dependency on PressureEventIconDefs being mounted).
function renderIconBox(type: PressureGraphEventType, size: number, teamAccent?: string) {
  switch (type) {
    case 'goal': return <SoccerBallBox size={size} variant="goal" teamAccent={teamAccent} />
    case 'own_goal': return <SoccerBallBox size={size} variant="own_goal" />
    case 'penalty_scored': return <SoccerBallBox size={size} variant="penalty_scored" />
    case 'penalty_missed': return <SoccerBallBox size={size} variant="penalty_missed" />
    case 'shot_on_target': return <MiniBallIcon size={size} accent="#22d3ee" />
    case 'shot_off_target': return <GoalpostIcon size={size} />
    case 'yellow_card': return <CardIcon size={size} variant="yellow" />
    case 'red_card': return <CardIcon size={size} variant="red" />
    case 'second_yellow': return <CardIcon size={size} variant="second_yellow" />
    case 'substitution': return <SubstitutionIcon size={size} />
    case 'var': return <VarTag size={size} />
    case 'unknown':
    default: return <UnknownDot size={size} />
  }
}

// V2.6B: Soccer ball — bold pentagon silhouette. At 36px the pentagon is
// large and unmistakable. 5 thick black panels radiate from center. No fine
// lines, no excessive detail. High contrast white ball on dark badge.
function SoccerBallBox(props: { size: number; variant: 'goal' | 'own_goal' | 'penalty_scored' | 'penalty_missed'; teamAccent?: string }) {
  const { size: r, variant, teamAccent } = props

  // Colors: ball is WHITE for normal goals, RED for own_goal.
  const ballFill = variant === 'own_goal' ? '#fb7185' : '#ffffff'
  const panelFill = variant === 'own_goal' ? '#881337' : '#1e293b'
  const panelStroke = variant === 'own_goal' ? '#9f1239' : '#334155'
  const ringColor = variant === 'own_goal'
    ? '#fda4af'
    : variant === 'penalty_scored'
      ? '#22d3ee'
      : teamAccent ? `#${teamAccent}` : '#22d3ee'

  // Pentagon vertices
  const pr = r * 0.38
  const pentPoints = Array.from({ length: 5 }, (_, i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180)
    return { x: Math.cos(angle) * pr, y: Math.sin(angle) * pr }
  })
  const pentPath = pentPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'

  // Outer panel wedges (simplified: just thick lines from pentagon to edge)
  const outerR = r * 0.82

  return (
    <g>
      {/* Halo — strong for goals */}
      <circle r={r * 1.55} fill={ringColor} opacity="0.25" />
      {/* Badge ring */}
      <circle r={r * 1.15} fill="none" stroke={ringColor} strokeWidth={Math.max(1.2, r * 0.09)} opacity="0.8" />
      {/* Dark badge body */}
      <circle r={r * 1.05} fill="rgba(8,11,18,0.92)" />
      {/* Drop shadow */}
      <ellipse cx={0} cy={r * 0.15} rx={r * 0.7} ry={r * 0.22} fill="rgba(0,0,0,0.4)" filter="url(#gs-blur-soft-box)" />
      {/* Ball body */}
      <circle r={r * 0.78} fill={ballFill} stroke="#e2e8f0" strokeWidth={Math.max(0.6, r * 0.05)} />
      {/* Central pentagon — filled dark */}
      <path d={pentPath} fill={panelFill} stroke={panelStroke} strokeWidth={Math.max(0.5, r * 0.04)} strokeLinejoin="round" />
      {/* 5 thick lines from pentagon to ball edge */}
      <g stroke={panelFill} strokeWidth={Math.max(1.2, r * 0.09)} strokeLinecap="round">
        {pentPoints.map((p, i) => {
          const angle = (i * 72 - 90) * (Math.PI / 180)
          const ox = Math.cos(angle) * outerR
          const oy = Math.sin(angle) * outerR
          return <line key={i} x1={p.x} y1={p.y} x2={ox} y2={oy} />
        })}
      </g>
      {/* Highlight */}
      <ellipse cx={-r * 0.3} cy={-r * 0.3} rx={r * 0.22} ry={r * 0.12} fill="rgba(255,255,255,0.6)" />
      {/* Variant badges */}
      {variant === 'own_goal' && (
        <g transform={`translate(${r * 0.7} ${-r * 0.7})`}>
          <circle r={r * 0.32} fill="#f43f5e" stroke="#0b1218" strokeWidth="0.6" />
          <text textAnchor="middle" dy={r * 0.13} fontSize={r * 0.35} fontWeight="800" fill="#ffffff" fontFamily="-apple-system, system-ui, sans-serif">GC</text>
        </g>
      )}
      {variant === 'penalty_scored' && (
        <g transform={`translate(${r * 0.7} ${-r * 0.7})`}>
          <circle r={r * 0.32} fill="#22d3ee" stroke="#0b1218" strokeWidth="0.6" />
          <text textAnchor="middle" dy={r * 0.13} fontSize={r * 0.38} fontWeight="800" fill="#0b1218" fontFamily="-apple-system, system-ui, sans-serif">P</text>
        </g>
      )}
      {variant === 'penalty_missed' && (
        <line x1={-r * 0.55} y1={r * 0.55} x2={r * 0.55} y2={-r * 0.55} stroke="#f43f5e" strokeWidth={Math.max(1.5, r * 0.12)} strokeLinecap="round" />
      )}
    </g>
  )
}

// V2.8: Mini ball for shot_on_target — bright white ball with cyan ring.
function MiniBallIcon({ size, accent }: { size: number; accent: string }) {
  const r = size
  const ballR = r * 0.62
  const badgeR = r * 1.0

  const pr = ballR * 0.35
  const pentPoints = Array.from({ length: 5 }, (_, i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180)
    return { x: Math.cos(angle) * pr, y: Math.sin(angle) * pr }
  })
  const pentPath = pentPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'

  return (
    <g>
      {/* Halo */}
      <circle r={badgeR * 1.3} fill={accent} opacity="0.18" />
      {/* Badge */}
      <circle r={badgeR} fill="rgba(8,11,18,0.9)" stroke={accent} strokeWidth={Math.max(0.7, badgeR * 0.12)} />
      {/* Ball — bright white */}
      <circle r={ballR} fill="#ffffff" stroke="#e2e8f0" strokeWidth={Math.max(0.6, ballR * 0.08)} />
      {/* Pentagon hint */}
      <path d={pentPath} fill="#334155" stroke="#475569" strokeWidth={Math.max(0.4, ballR * 0.06)} strokeLinejoin="round" />
      {/* Highlight */}
      <ellipse cx={-ballR * 0.3} cy={-ballR * 0.3} rx={ballR * 0.22} ry={ballR * 0.12} fill="rgba(255,255,255,0.55)" />
    </g>
  )
}

// V2.10B: Substitution — pure white arrows, no background, no shadow circle.
function SubstitutionIcon({ size }: { size: number }) {
  const r = size
  const arrowLen = r * 0.75
  const arrowHead = r * 0.3
  const gap = r * 0.22

  return (
    <g>
      {/* Main arrows — bright white with built-in contrast via stroke outline */}
      <g strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Dark outline for contrast (thin) */}
        <g stroke="rgba(0,0,0,0.5)" strokeWidth={Math.max(2.8, r * 0.2)}>
          <line x1={-arrowLen * 0.5} y1={-gap} x2={arrowLen * 0.5} y2={-gap} />
          <polyline points={`${arrowLen * 0.5 - arrowHead},${-gap - arrowHead * 0.7} ${arrowLen * 0.5},${-gap} ${arrowLen * 0.5 - arrowHead},${-gap + arrowHead * 0.7}`} />
          <line x1={arrowLen * 0.5} y1={gap} x2={-arrowLen * 0.5} y2={gap} />
          <polyline points={`${-arrowLen * 0.5 + arrowHead},${gap - arrowHead * 0.7} ${-arrowLen * 0.5},${gap} ${-arrowLen * 0.5 + arrowHead},${gap + arrowHead * 0.7}`} />
        </g>
        {/* White foreground */}
        <g stroke="#ffffff" strokeWidth={Math.max(1.6, r * 0.13)}>
          <line x1={-arrowLen * 0.5} y1={-gap} x2={arrowLen * 0.5} y2={-gap} />
          <polyline points={`${arrowLen * 0.5 - arrowHead},${-gap - arrowHead * 0.7} ${arrowLen * 0.5},${-gap} ${arrowLen * 0.5 - arrowHead},${-gap + arrowHead * 0.7}`} />
          <line x1={arrowLen * 0.5} y1={gap} x2={-arrowLen * 0.5} y2={gap} />
          <polyline points={`${-arrowLen * 0.5 + arrowHead},${gap - arrowHead * 0.7} ${-arrowLen * 0.5},${gap} ${-arrowLen * 0.5 + arrowHead},${gap + arrowHead * 0.7}`} />
        </g>
      </g>
    </g>
  )
}

// V2.8: Custom goalpost icon — bright white strokes for visibility.
function GoalpostIcon({ size }: { size: number }) {
  const r = size
  const badgeR = r * 1.05
  const postH = r * 1.0
  const postW = r * 1.3
  const barY = -postH * 0.45
  const postStroke = Math.max(1.4, r * 0.13)

  return (
    <g>
      {/* Halo */}
      <circle r={badgeR * 1.35} fill="#e2e8f0" opacity="0.12" />
      {/* Glass badge */}
      <circle r={badgeR} fill="rgba(8,11,18,0.92)" stroke="rgba(255,255,255,0.22)" strokeWidth={Math.max(0.7, badgeR * 0.1)} />
      {/* Goalpost: bright white posts + crossbar */}
      <g stroke="#f8fafc" strokeWidth={postStroke} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1={-postW * 0.5} y1={barY} x2={-postW * 0.5} y2={postH * 0.4} />
        <line x1={postW * 0.5} y1={barY} x2={postW * 0.5} y2={postH * 0.4} />
        <line x1={-postW * 0.5} y1={barY} x2={postW * 0.5} y2={barY} />
      </g>
      {/* Net hint */}
      <g stroke="#94a3b8" strokeWidth={Math.max(0.4, r * 0.035)} opacity="0.35">
        <line x1={-postW * 0.3} y1={barY + postH * 0.15} x2={-postW * 0.15} y2={postH * 0.35} />
        <line x1={0} y1={barY + postH * 0.1} x2={0} y2={postH * 0.35} />
        <line x1={postW * 0.3} y1={barY + postH * 0.15} x2={postW * 0.15} y2={postH * 0.35} />
      </g>
      {/* Ball flying away — bright */}
      <circle cx={postW * 0.6 + r * 0.15} cy={barY - r * 0.35} r={r * 0.2} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.6" />
      {/* Motion trail */}
      <line x1={postW * 0.35} y1={barY - r * 0.05} x2={postW * 0.55 + r * 0.05} y2={barY - r * 0.28} stroke="#cbd5e1" strokeWidth={Math.max(0.6, r * 0.06)} strokeLinecap="round" opacity="0.6" strokeDasharray="1.5 1" />
    </g>
  )
}

// ---------------------------------------------------------------------------
// V2.4 - HTML overlay group bubble (+N)
// ---------------------------------------------------------------------------

export function GroupBubbleBox({ count, sizePx, accent, hovered }: { count: number; sizePx: number; accent: string; hovered?: boolean }) {
  const scale = hovered ? 1.04 : 1
  const radius = 11.5 + (count >= 10 ? 1.6 : 0.8)
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: sizePx,
        height: sizePx,
        transform: `scale(${scale})`,
        transition: 'transform 120ms ease-out',
      }}
    >
      <svg width={sizePx} height={sizePx} viewBox="-16 -16 32 32" overflow="visible" style={{ display: 'block' }}>
        <circle r={radius * 1.45} fill={accent} opacity="0.14" />
        <circle r={radius} fill="rgba(11,16,24,0.92)" stroke={accent} strokeWidth={Math.max(0.5, radius * 0.16)} />
        <ellipse cx={-radius * 0.4} cy={-radius * 0.45} rx={radius * 0.42} ry={radius * 0.18} fill="rgba(255,255,255,0.18)" />
        <text textAnchor="middle" dy={radius * 0.34} fontSize={radius * 0.92} fontWeight="800" fill="#ffffff" fontFamily="-apple-system, system-ui, sans-serif">+{count}</text>
      </svg>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Inline icon (HTML usage: tooltip header / legend)
// ---------------------------------------------------------------------------

export function PressureEventIconInline({ type, sizePx = 14, teamAccent }: { type: PressureGraphEventType; sizePx?: number; teamAccent?: string }) {
  // All types now use the unified inline SVG renderer for visual consistency
  const r = 11
  return (
    <svg width={sizePx} height={sizePx} viewBox="-16 -16 32 32" overflow="visible" aria-hidden="true">
      <defs>
        <filter id="gs-blur-soft-inline" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.55" />
        </filter>
      </defs>
      {renderInlineCustom(type, r, teamAccent)}
    </svg>
  )
}

function renderInlineCustom(type: PressureGraphEventType, r: number, teamAccent?: string) {
  switch (type) {
    case 'goal': return <SoccerBall size={r} variant="goal" teamAccent={teamAccent} />
    case 'own_goal': return <SoccerBall size={r} variant="own_goal" />
    case 'penalty_scored': return <SoccerBall size={r} variant="penalty_scored" />
    case 'penalty_missed': return <SoccerBall size={r} variant="penalty_missed" />
    case 'shot_on_target': return <MiniBallIcon size={r} accent="#22d3ee" />
    case 'shot_off_target': return <GoalpostIcon size={r} />
    case 'yellow_card': return <CardIcon size={r} variant="yellow" />
    case 'red_card': return <CardIcon size={r} variant="red" />
    case 'second_yellow': return <CardIcon size={r} variant="second_yellow" />
    case 'substitution': return <SubstitutionIcon size={r} />
    case 'var': return <VarTag size={r} />
    default: return <UnknownDot size={r} />
  }
}
