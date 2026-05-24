/**
 * Normalizes raw match events into structured, typed data.
 * Extracts player names, event types, and generates pt-BR titles/descriptions.
 */

export interface NormalizedEvent {
  id: string
  minute: number
  addedTime: number | null
  type: 'goal' | 'assist' | 'yellow_card' | 'red_card' | 'substitution' | 'shot' | 'corner' | 'offside' | 'foul' | 'period_start' | 'period_end' | 'injury' | 'var' | 'other'
  teamName: string
  playerName: string
  assistName: string | null
  playerIn: string | null
  playerOut: string | null
  title: string
  description: string
  rawText: string
  importance: 'critical' | 'high' | 'medium' | 'low'
}

interface RawEvent {
  clock: string
  text: string
  type: string
  team: string
}

export function normalizeEvents(rawEvents: RawEvent[]): NormalizedEvent[] {
  return rawEvents.map((raw, index) => normalize(raw, index)).filter(Boolean) as NormalizedEvent[]
}

function normalize(raw: RawEvent, index: number): NormalizedEvent | null {
  const text = raw.text || ''
  const textLower = text.toLowerCase()
  const { minute, addedTime } = parseClock(raw.clock)
  const team = raw.team || ''

  // Detect event type
  const type = detectType(textLower, raw.type)

  // Extract players
  const { player, assist, playerIn, playerOut } = extractPlayers(text, type)

  // Generate title and description
  const { title, description } = generateText(type, player, assist, playerIn, playerOut, team, minute, text)

  // Assign importance
  const importance = getImportance(type)

  return {
    id: `evt-${index}-${minute}`,
    minute,
    addedTime,
    type,
    teamName: team,
    playerName: player,
    assistName: assist,
    playerIn,
    playerOut,
    title,
    description,
    rawText: text,
    importance,
  }
}

function parseClock(clock: string): { minute: number; addedTime: number | null } {
  if (!clock) return { minute: 0, addedTime: null }
  const match = clock.match(/(\d+)(?:\+(\d+))?/)
  if (!match) return { minute: 0, addedTime: null }
  return {
    minute: parseInt(match[1]) || 0,
    addedTime: match[2] ? parseInt(match[2]) : null,
  }
}

function detectType(textLower: string, rawType: string): NormalizedEvent['type'] {
  if (textLower.includes('goal') && !textLower.includes('attempt') && !textLower.includes('goal kick')) return 'goal'
  if (textLower.includes('red card') || textLower.includes('shown the red card')) return 'red_card'
  if (textLower.includes('yellow card') || textLower.includes('shown the yellow card') || textLower.includes('second yellow')) return 'yellow_card'
  if (textLower.includes('substitution') || textLower.includes('replaces')) return 'substitution'
  if (textLower.includes('attempt') || textLower.includes('shot') || textLower.includes('header')) return 'shot'
  if (textLower.includes('corner,') || textLower.includes('corner kick')) return 'corner'
  if (textLower.includes('offside')) return 'offside'
  if (textLower.includes('foul by') || textLower.includes('free kick')) return 'foul'
  if (textLower.includes('first half begins') || textLower.includes('second half begins')) return 'period_start'
  if (textLower.includes('first half ends') || textLower.includes('second half ends') || textLower.includes('match ends')) return 'period_end'
  if (textLower.includes('injury') || textLower.includes('delay')) return 'injury'
  if (textLower.includes('var') || textLower.includes('video review')) return 'var'

  // Check raw type field
  const typeLower = rawType.toLowerCase()
  if (typeLower.includes('goal')) return 'goal'
  if (typeLower.includes('card')) return typeLower.includes('red') ? 'red_card' : 'yellow_card'
  if (typeLower.includes('sub')) return 'substitution'

  return 'other'
}

function extractPlayers(text: string, type: NormalizedEvent['type']): {
  player: string
  assist: string | null
  playerIn: string | null
  playerOut: string | null
} {
  let player = ''
  let assist: string | null = null
  let playerIn: string | null = null
  let playerOut: string | null = null

  // Pattern: "Name (Team)" — common for goals, cards
  const nameTeamMatch = text.match(/([A-Z][a-zA-ZÀ-ÿ\s'.~-]{2,30}?)\s*\(/)
  if (nameTeamMatch) {
    player = nameTeamMatch[1].trim()
  }

  // Assisted by pattern
  const assistMatch = text.match(/Assisted by\s+([A-Z][a-zA-ZÀ-ÿ\s'.~-]{2,30})(?:\s+with|\s*\.|\s*$)/i)
  if (assistMatch) {
    assist = assistMatch[1].trim()
  }

  // Substitution: "Name replaces Name2"
  if (type === 'substitution') {
    // Pattern: "Substitution, Team. PlayerIn replaces PlayerOut."
    const subMatch = text.match(/Substitution[,.]?\s*[^.]*\.\s*([A-Z][a-zA-ZÀ-ÿ\s'.~-]{2,30}?)\s+replaces\s+([A-Z][a-zA-ZÀ-ÿ\s'.~-]{2,30}?)(?:\s+because|\s+due|\s*\.|$)/i)
    if (subMatch) {
      playerIn = subMatch[1].trim()
      playerOut = subMatch[2].trim()
      player = playerIn
    } else {
      // Simpler: "Name replaces Name2"
      const simpleSubMatch = text.match(/([A-Z][a-zA-ZÀ-ÿ\s'.~-]{2,30}?)\s+replaces\s+([A-Z][a-zA-ZÀ-ÿ\s'.~-]{2,30}?)(?:\s+because|\s+due|\s*\.|$)/i)
      if (simpleSubMatch) {
        playerIn = simpleSubMatch[1].trim()
        playerOut = simpleSubMatch[2].trim()
        player = playerIn
      }
    }
  }

  // Foul by pattern
  if (type === 'foul' && !player) {
    const foulMatch = text.match(/Foul by\s+([A-Z][a-zA-ZÀ-ÿ\s'.~-]{2,30}?)(?:\s*\(|\s*$)/i)
    if (foulMatch) player = foulMatch[1].trim()
  }

  // Goal after score line removal: look for name after period
  if (type === 'goal' && !player) {
    const goalMatch = text.match(/\d+\.\s*([A-Z][a-zA-ZÀ-ÿ\s'.~-]{2,30}?)\s*\(/)
    if (goalMatch) player = goalMatch[1].trim()
  }

  return { player: cleanPlayerName(player), assist, playerIn: playerIn ? cleanPlayerName(playerIn) : null, playerOut: playerOut ? cleanPlayerName(playerOut) : null }
}

function cleanPlayerName(name: string): string {
  // Remove trailing English phrases that got captured as part of name
  return name
    .replace(/\s*because of an? (?:injury|injur\w*|les[aã]o).*$/i, '')
    .replace(/\s*due to (?:an? )?(?:injury|les[aã]o).*$/i, '')
    .replace(/\s*because\b.*$/i, '')
    .replace(/\s*following\b.*$/i, '')
    .trim()
}

function generateText(
  type: NormalizedEvent['type'],
  player: string,
  assist: string | null,
  playerIn: string | null,
  playerOut: string | null,
  team: string,
  minute: number,
  _rawText: string
): { title: string; description: string } {
  const minuteStr = minute > 0 ? ` aos ${minute}'` : ''

  switch (type) {
    case 'goal':
      return {
        title: 'Gol',
        description: player
          ? `${player}${minuteStr}${team ? ` (${team})` : ''}${assist ? `. Assistência de ${assist}` : ''}.`
          : `Gol marcado${minuteStr}${team ? ` pelo ${team}` : ''}.`,
      }
    case 'yellow_card':
      return {
        title: 'Cartão amarelo',
        description: player
          ? `${player} recebe cartão amarelo${minuteStr}.`
          : `Cartão amarelo${minuteStr}${team ? ` para o ${team}` : ''}.`,
      }
    case 'red_card':
      return {
        title: 'Cartão vermelho',
        description: player
          ? `${player} recebe cartão vermelho${minuteStr}.`
          : `Cartão vermelho${minuteStr}${team ? ` para o ${team}` : ''}.`,
      }
    case 'substitution':
      {
        const hasInjury = _rawText.toLowerCase().includes('injur') || _rawText.toLowerCase().includes('lesão') || _rawText.toLowerCase().includes('lesao')
        const injuryStr = hasInjury ? ' por lesão' : ''
        return {
          title: 'Substituição',
          description: playerIn && playerOut
            ? `${playerIn} entra no lugar de ${playerOut}${injuryStr}${minuteStr}${team ? ` (${team})` : ''}.`
            : `Substituição${injuryStr}${minuteStr}${team ? ` no ${team}` : ''}.`,
        }
      }
    case 'shot':
      return {
        title: 'Finalização',
        description: player
          ? `Finalização de ${player}${minuteStr}.`
          : `Finalização${minuteStr}${team ? ` do ${team}` : ''}.`,
      }
    case 'corner':
      return {
        title: 'Escanteio',
        description: `Escanteio${team ? ` para o ${team}` : ''}${minuteStr}.`,
      }
    case 'offside':
      return {
        title: 'Impedimento',
        description: `Impedimento${team ? ` do ${team}` : ''}${minuteStr}.`,
      }
    case 'foul':
      return {
        title: 'Falta',
        description: player
          ? `Falta de ${player}${minuteStr}.`
          : `Falta${minuteStr}${team ? ` do ${team}` : ''}.`,
      }
    case 'period_start':
      return { title: 'Início', description: minute <= 1 ? 'Primeiro tempo começa.' : 'Segundo tempo começa.' }
    case 'period_end':
      return { title: 'Fim', description: minute <= 50 ? 'Fim do primeiro tempo.' : 'Fim de jogo.' }
    case 'injury':
      return { title: 'Lesão', description: `Paralisação por lesão${minuteStr}.` }
    case 'var':
      return { title: 'VAR', description: `Revisão de vídeo${minuteStr}.` }
    default:
      return { title: 'Evento', description: player ? `${player}${minuteStr}.` : `Evento${minuteStr}.` }
  }
}

function getImportance(type: NormalizedEvent['type']): NormalizedEvent['importance'] {
  switch (type) {
    case 'goal': return 'critical'
    case 'red_card': return 'critical'
    case 'yellow_card': return 'high'
    case 'substitution': return 'medium'
    case 'var': return 'high'
    default: return 'low'
  }
}
