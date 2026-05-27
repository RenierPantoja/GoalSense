/**
 * teamGraphPalette — contrast-aware color palette for the Live Pressure Graph.
 * -----------------------------------------------------------------------------
 * Problem: teams with dark primary colors (Botafogo, Vasco, Corinthians, etc.)
 * become invisible against GoalSense's dark background (#080b12).
 *
 * Solution: compute relative luminance of the team's primary color. If it's
 * too dark, boost the stroke/edge to the team's secondary color (or a
 * deterministic light fallback). The fill area can stay dark (low opacity),
 * but the stroke must always be readable.
 *
 * This module does NOT make API calls. It uses a small curated map of known
 * dark clubs plus a generic luminance-based fallback for any unknown team.
 */

// --- Types ----------------------------------------------------------------

export interface TeamGraphPalette {
  /** Primary identity color (may be dark). */
  primary: string
  /** Secondary/contrast color. */
  secondary: string
  /** SVG area fill (primary @ low opacity). */
  fill: string
  /** SVG stroke / line (always readable on dark bg). */
  stroke: string
  /** Edge color for markers/halos. */
  edge: string
  /** Label color (always readable). */
  label: string
  /** Marker accent (hex without #). */
  marker: string
  /** Whether the primary was too dark and we boosted. */
  isDark: boolean
  contrastMode: 'normal' | 'boosted' | 'bicolor_fallback'
}

// --- Known dark/bicolor clubs --------------------------------------------

interface ClubPalette {
  primary: string
  secondary: string
  edge: string
}

const DARK_CLUBS: Record<string, ClubPalette> = {
  'botafogo': { primary: '#0B0B0F', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'botafogo fr': { primary: '#0B0B0F', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'botafogo-sp': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'atletico-mg': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'atletico mineiro': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'atlético-mg': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'atlético mineiro': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'vasco': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'vasco da gama': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'corinthians': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'santos': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'santos fc': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'juventus': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'newcastle': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'newcastle united': { primary: '#111111', secondary: '#FFFFFF', edge: '#FFFFFF' },
  'flamengo': { primary: '#D0001B', secondary: '#111111', edge: '#FF5A66' },
  'palmeiras': { primary: '#006437', secondary: '#FFFFFF', edge: '#7AE8A8' },
  'grêmio': { primary: '#00AEEF', secondary: '#111111', edge: '#7DDCFF' },
  'gremio': { primary: '#00AEEF', secondary: '#111111', edge: '#7DDCFF' },
  'cruzeiro': { primary: '#0033A0', secondary: '#FFFFFF', edge: '#7DAAFF' },
  'sporting': { primary: '#006B3F', secondary: '#FFFFFF', edge: '#7AE8A8' },
  'sporting cp': { primary: '#006B3F', secondary: '#FFFFFF', edge: '#7AE8A8' },
}

// --- Luminance helpers ---------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16) || 0
  const g = parseInt(h.substring(2, 4), 16) || 0
  const b = parseInt(h.substring(4, 6), 16) || 0
  return [r, g, b]
}

/** Relative luminance per WCAG 2.1 (0 = black, 1 = white). */
function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function isTooDark(hex: string): boolean {
  return getLuminance(hex) < 0.08
}

/** Generate a deterministic light fallback from a dark color. */
function lightenHex(hex: string, amount = 0.55): string {
  const [r, g, b] = hexToRgb(hex)
  const lighten = (c: number) => Math.round(c + (255 - c) * amount)
  return `#${lighten(r).toString(16).padStart(2, '0')}${lighten(g).toString(16).padStart(2, '0')}${lighten(b).toString(16).padStart(2, '0')}`
}

function hexWithAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

// --- Public API ----------------------------------------------------------

/**
 * Build a contrast-safe palette for a team in the pressure graph.
 * @param teamColors Array of hex colors (without #) from the fixture data.
 *                   Index 0 = primary, index 1 = secondary (if available).
 * @param teamName   Team name for curated club lookup.
 */
export function getTeamGraphPalette(teamColors: string[], teamName: string): TeamGraphPalette {
  const primary = `#${(teamColors[0] || '22d3ee').replace('#', '')}`
  const secondaryRaw = teamColors[1] ? `#${teamColors[1].replace('#', '')}` : null

  // Check curated map first (case-insensitive, trimmed)
  const key = teamName.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const curated = DARK_CLUBS[key]

  if (curated) {
    return {
      primary: curated.primary,
      secondary: curated.secondary,
      fill: hexWithAlpha(curated.primary, 0.35),
      stroke: curated.edge,
      edge: curated.edge,
      label: curated.edge,
      marker: curated.edge.replace('#', ''),
      isDark: true,
      contrastMode: 'boosted',
    }
  }

  // Generic luminance check
  if (isTooDark(primary)) {
    const fallbackLight = secondaryRaw && !isTooDark(secondaryRaw)
      ? secondaryRaw
      : lightenHex(primary, 0.6)
    return {
      primary,
      secondary: fallbackLight,
      fill: hexWithAlpha(primary, 0.3),
      stroke: fallbackLight,
      edge: fallbackLight,
      label: fallbackLight,
      marker: fallbackLight.replace('#', ''),
      isDark: true,
      contrastMode: secondaryRaw ? 'bicolor_fallback' : 'boosted',
    }
  }

  // Normal: primary is readable
  return {
    primary,
    secondary: secondaryRaw || primary,
    fill: `${primary}80`,
    stroke: primary,
    edge: primary,
    label: primary,
    marker: primary.replace('#', ''),
    isDark: false,
    contrastMode: 'normal',
  }
}
