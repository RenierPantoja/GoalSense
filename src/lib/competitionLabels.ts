const STAGE_MAP: Record<string, string> = {
  'regular season': 'Temporada regular',
  'playoff round': 'Rodada de playoff',
  'playoffs': 'Playoffs',
  'final': 'Final',
  'semi-finals': 'Semifinal',
  'semi final': 'Semifinal',
  'semifinal': 'Semifinal',
  'quarter-finals': 'Quartas de final',
  'quarter final': 'Quartas de final',
  'round of 16': 'Oitavas de final',
  'round of 32': 'Fase de 32',
  'group stage': 'Fase de grupos',
  'league stage': 'Fase de liga',
  'preliminary round': 'Rodada preliminar',
  'relegation round': 'Rodada de rebaixamento',
  'relegation/promotion playoffs': 'Playoff acesso/rebaixamento',
  'promotion/relegation playoffs': 'Playoff acesso/rebaixamento',
  'championship round': 'Rodada do título',
  'clausura': 'Clausura',
  'apertura': 'Apertura',
  '1st round': '1ª rodada',
  '2nd round': '2ª rodada',
  '3rd round': '3ª rodada',
  '4th round': '4ª rodada',
  '5th round': '5ª rodada',
  'qualification': 'Qualificação',
  'preliminary': 'Preliminar',
  'play-offs': 'Playoffs',
  'promotion playoffs': 'Playoff de acesso',
  'relegation playoffs': 'Playoff de rebaixamento',
  'belgian first division a promotion/relegation playoffs': 'Primeira Divisão Belga · Playoff',
}

const STATUS_MAP: Record<string, string> = {
  'LIVE': 'Ao vivo',
  'HT': 'Intervalo',
  '1H': '1º tempo',
  '2H': '2º tempo',
  'ET': 'Prorrogação',
  'BT': 'Break',
  'P': 'Pênaltis',
  'FT': 'Encerrado',
  'AET': 'Prorrogação enc.',
  'PEN': 'Pênaltis enc.',
  'NS': 'Não iniciado',
  'TBD': 'A definir',
  'PST': 'Adiado',
  'CANC': 'Cancelado',
  'ABD': 'Abandonado',
  'SUSP': 'Suspenso',
  'INT': 'Interrompido',
  'STATUS_IN_PROGRESS': 'Ao vivo',
  'STATUS_FIRST_HALF': '1º tempo',
  'STATUS_SECOND_HALF': '2º tempo',
  'STATUS_HALFTIME': 'Intervalo',
  'STATUS_FULL_TIME': 'Encerrado',
  'STATUS_SCHEDULED': 'Não iniciado',
}

export function translateStage(raw?: string): string {
  if (!raw) return ''
  const key = raw.toLowerCase().trim()
  return STAGE_MAP[key] || raw
}

export function translateStatus(raw?: string): string {
  if (!raw) return ''
  return STATUS_MAP[raw] || STATUS_MAP[raw.toUpperCase()] || raw
}

interface FixtureLike {
  league: { name: string; country?: string }
  status?: { short?: string }
}

export function buildCompetitionLabel(fx: FixtureLike): string {
  const name = fx.league.name || 'Competição'
  // Translate if the league name itself is a stage
  const translated = translateStage(name)
  if (translated !== name) return translated
  return name
}

export function buildCompetitionSubtitle(fx: FixtureLike & { raw?: string }): string {
  const parts: string[] = []

  // Try to detect stage from raw/league name
  const leagueName = fx.league.name?.toLowerCase() || ''
  for (const [key, val] of Object.entries(STAGE_MAP)) {
    if (leagueName.includes(key) && val !== fx.league.name) {
      // Don't repeat if stage IS the league name
      break
    }
  }

  if (fx.league.country) parts.push(fx.league.country)
  return parts.join(' · ')
}

/** Display name for a fixture's competition context */
export function displayLeague(leagueName: string, country?: string): string {
  // Fix common casing issues
  const LEAGUE_FIXES: Record<string, string> = {
    'laliga': 'LaLiga',
    'ligue1': 'Ligue 1',
    'regular season': 'Temporada regular',
    'playoff round': 'Rodada de playoff',
    'final stage': 'Fase final',
    'semifinal': 'Semifinal',
    'semi-finals': 'Semifinal',
    'championship round': 'Rodada do título',
    'brazilian serie a': 'Brasileirão Série A',
    'brazilian serie b': 'Brasileirão Série B',
    'campeonato brasileiro serie a': 'Brasileirão Série A',
    'campeonato brasileiro serie b': 'Brasileirão Série B',
    'serie a': 'Serie A',
    'argentine primera division': 'Primera División Argentina',
    'argentine nacional b': 'Primera Nacional Argentina',
    'copa do brasil': 'Copa do Brasil',
    'copa libertadores': 'Copa Libertadores',
    'copa sudamericana': 'Copa Sul-Americana',
    'northern super league': 'Northern Super League',
    'major league soccer': 'MLS',
    'mls': 'MLS',
  }
  const key = leagueName.toLowerCase().trim()
  const fixed = LEAGUE_FIXES[key] || leagueName

  // Translate if the name is a stage label
  const translated = translateStage(fixed)
  if (translated !== fixed) return translated
  return fixed
}

/** Full competition line: "LaLiga · Espanha" or "Temporada regular" */
export function displayCompetition(leagueName: string, country?: string): string {
  const name = displayLeague(leagueName, country)
  if (country && country !== name) {
    const COUNTRY_MAP: Record<string, string> = { 'Italy': 'Itália', 'Spain': 'Espanha', 'Germany': 'Alemanha', 'France': 'França', 'England': 'Inglaterra', 'Netherlands': 'Holanda', 'Belgium': 'Bélgica', 'Turkey': 'Turquia', 'Argentina': 'Argentina', 'Brazil': 'Brasil', 'United States': 'EUA', 'Mexico': 'México', 'Scotland': 'Escócia', 'Austria': 'Áustria', 'Switzerland': 'Suíça', 'Portugal': 'Portugal', 'Japan': 'Japão', 'Australia': 'Austrália', 'Canada': 'Canadá' }
    return `${name} · ${COUNTRY_MAP[country] || country}`
  }
  return name
}
