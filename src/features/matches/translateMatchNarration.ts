/**
 * Robust translation of match narration/events from English to pt-BR.
 * Three-phase approach:
 * 1. Structural transformations (full sentence pattern rewrites)
 * 2. Phrase-level replacements
 * 3. Final cleanup pass for stray English words
 */

// Phase 1: Structural patterns (full sentence rewrites)
const STRUCTURAL_PATTERNS: [RegExp, (match: string, ...args: string[]) => string][] = [
  // Goal score line: "Goal! TeamA X, TeamB Y. Player (Team) right/left footed shot from..."
  [
    /Goal!\s*[^.]+\d+[.,]\s*[^.]+\d+\.\s*/gi,
    () => '' // Remove score line entirely, we show it elsewhere
  ],
  // Substitution: "Substitution, Team. PlayerIn replaces PlayerOut."
  [
    /Substitution,?\s*(.+?)\.\s*(.+?)\s+replaces\s+(.+?)\.?$/gim,
    (_m, team, playerIn, playerOut) => `Substituicao no ${team.trim()}. ${playerIn.trim()} entra no lugar de ${playerOut.trim()}.`
  ],
  // Yellow card: "Player (Team) is shown the yellow card for a bad foul."
  [
    /(.+?)\s*\(([^)]+)\)\s*is shown the yellow card\s*(?:for\s+(?:a\s+)?(.+?))?\.?$/gim,
    (_m, player, _team, reason) => {
      const r = reason ? translateFoulReason(reason.trim()) : ''
      return `${player.trim()} recebe cartao amarelo${r ? ' por ' + r : ''}.`
    }
  ],
  // Red card: "Player (Team) is shown the red card for a bad foul."
  [
    /(.+?)\s*\(([^)]+)\)\s*is shown the red card\s*(?:for\s+(?:a\s+)?(.+?))?\.?$/gim,
    (_m, player, _team, reason) => {
      const r = reason ? translateFoulReason(reason.trim()) : ''
      return `${player.trim()} recebe cartao vermelho${r ? ' por ' + r : ''}.`
    }
  ],
  // Second yellow: "Second yellow card to Player (Team) for..."
  [
    /Second yellow card to\s+(.+?)\s*\(([^)]+)\)\s*(?:for\s+(?:a\s+)?(.+?))?\.?$/gim,
    (_m, player, _team, reason) => {
      const r = reason ? translateFoulReason(reason.trim()) : ''
      return `Segundo amarelo para ${player.trim()}${r ? ' por ' + r : ''}.`
    }
  ],
  // Free kick won: "Player (Team) wins a free kick in the defensive/attacking half"
  [
    /(.+?)\s*\(([^)]+)\)\s*wins a free kick\s+(.+?)\.?$/gim,
    (_m, player, _team, location) => `${player.trim()} ganha falta ${translateLocation(location.trim())}.`
  ],
  // Foul by: "Foul by Player (Team)."
  [
    /Foul by\s+(.+?)\s*\(([^)]+)\)\.?$/gim,
    (_m, player, _team) => `Falta de ${player.trim()}.`
  ],
  // Corner: "Corner, Team. Conceded by Player."
  [
    /Corner,\s*(.+?)\.\s*Conceded by\s+(.+?)\.?$/gim,
    (_m, team, player) => `Escanteio para ${team.trim()}. Cedido por ${player.trim()}.`
  ],
  // Offside: "Offside, Team. Player tries..."
  [
    /Offside,\s*(.+?)\.\s*(.+?)$/gim,
    (_m, team, rest) => `Impedimento, ${team.trim()}. ${rest.trim()}`
  ],
  // "Player (Team) right/left footed shot from ... to the ..."
  [
    /(.+?)\s*\(([^)]+)\)\s*(right footed shot|left footed shot|header)\s+from\s+(.+?)$/gim,
    (_m, player, _team, shotType, rest) => {
      const type = shotType.includes('right') ? 'finalizacao de direita' : shotType.includes('left') ? 'finalizacao de esquerda' : 'cabeceio'
      return `${player.trim()} ${type} ${translateShotContext(rest.trim())}`
    }
  ],
]

function translateFoulReason(reason: string): string {
  const map: [RegExp, string][] = [
    [/^bad foul$/i, 'falta dura'],
    [/^dangerous play$/i, 'jogada perigosa'],
    [/^tripping$/i, 'rasteira'],
    [/^handball$/i, 'mao na bola'],
    [/^hand ?ball$/i, 'mao na bola'],
    [/^a?n? ?handball$/i, 'mao na bola'],
    [/^pushing$/i, 'empurrao'],
    [/^holding$/i, 'segurar o adversario'],
    [/^high foot$/i, 'pe alto'],
    [/^simulation$/i, 'simulacao'],
    [/^dissent$/i, 'reclamacao'],
    [/^time wasting$/i, 'cera'],
    [/^unsporting behaviour$/i, 'conduta antidesportiva'],
    [/^deliberate handball$/i, 'mao na bola intencional'],
    [/^serious foul play$/i, 'jogo violento'],
    [/^violent conduct$/i, 'conduta violenta'],
  ]
  for (const [re, tr] of map) {
    if (re.test(reason)) return tr
  }
  return reason
}

function translateLocation(loc: string): string {
  const map: [RegExp, string][] = [
    [/in the defensive half/i, 'no campo defensivo'],
    [/in the attacking half/i, 'no campo ofensivo'],
    [/on the left wing/i, 'pela esquerda'],
    [/on the right wing/i, 'pela direita'],
    [/in their own half/i, 'no campo defensivo'],
    [/in the opponent/i, 'no campo ofensivo'],
  ]
  for (const [re, tr] of map) {
    if (re.test(loc)) return tr
  }
  return loc
}

function translateShotContext(text: string): string {
  let r = text
  const replacements: [RegExp, string][] = [
    [/from the right side of the six yard box/gi, 'pelo lado direito da pequena area'],
    [/from the left side of the six yard box/gi, 'pelo lado esquerdo da pequena area'],
    [/from the centre of the six yard box/gi, 'do centro da pequena area'],
    [/from the right side of the box/gi, 'pelo lado direito da area'],
    [/from the left side of the box/gi, 'pelo lado esquerdo da area'],
    [/from the centre of the box/gi, 'do centro da area'],
    [/from outside the box/gi, 'de fora da area'],
    [/from very close range/gi, 'de muito perto'],
    [/from a difficult angle on the left/gi, 'de angulo dificil pela esquerda'],
    [/from a difficult angle on the right/gi, 'de angulo dificil pela direita'],
    [/from a difficult angle/gi, 'de angulo dificil'],
    [/from long range on the left/gi, 'de longa distancia pela esquerda'],
    [/from long range on the right/gi, 'de longa distancia pela direita'],
    [/from long range/gi, 'de longa distancia'],
    [/to the top right corner/gi, 'no canto superior direito'],
    [/to the top left corner/gi, 'no canto superior esquerdo'],
    [/to the bottom right corner/gi, 'no canto inferior direito'],
    [/to the bottom left corner/gi, 'no canto inferior esquerdo'],
    [/to the centre of the goal/gi, 'no centro do gol'],
    [/is saved in the bottom right corner/gi, 'defendida no canto inferior direito'],
    [/is saved in the bottom left corner/gi, 'defendida no canto inferior esquerdo'],
    [/is saved in the top right corner/gi, 'defendida no canto superior direito'],
    [/is saved in the top left corner/gi, 'defendida no canto superior esquerdo'],
    [/is saved in the centre of the goal/gi, 'defendida no centro do gol'],
    [/is saved/gi, 'defendida'],
    [/is blocked/gi, 'bloqueada'],
    [/is close, but misses to the left/gi, 'passa perto pela esquerda'],
    [/is close, but misses to the right/gi, 'passa perto pela direita'],
    [/is close/gi, 'passa perto'],
    [/is just a bit too high/gi, 'vai um pouco acima'],
    [/is too high/gi, 'vai por cima'],
    [/misses to the right/gi, 'passa a direita'],
    [/misses to the left/gi, 'passa a esquerda'],
    [/hits the left post/gi, 'acerta a trave esquerda'],
    [/hits the right post/gi, 'acerta a trave direita'],
    [/hits the bar/gi, 'acerta o travessao'],
    [/Assisted by/gi, 'Assistencia de'],
    [/following a set piece situation/gi, 'apos bola parada'],
    [/following a corner/gi, 'apos escanteio'],
    [/following a fast break/gi, 'em contra-ataque'],
    [/following a set piece/gi, 'apos bola parada'],
    [/with an attempt/gi, 'com finalizacao'],
    [/with a cross/gi, 'com cruzamento'],
    [/with a through ball/gi, 'com passe em profundidade'],
    [/with a headed pass/gi, 'com passe de cabeca'],
  ]
  for (const [p, rep] of replacements) {
    r = r.replace(p, rep)
  }
  return r
}

// Phase 2: Phrase-level replacements (order matters - longer first)
const PHRASE_REPLACEMENTS: [RegExp, string][] = [
  // Periods
  [/\bFirst Half begins\.?/gi, 'Primeiro tempo comeca.'],
  [/\bFirst Half ends[^.]*\.?/gi, 'Fim do primeiro tempo.'],
  [/\bSecond Half begins\.?/gi, 'Segundo tempo comeca.'],
  [/\bSecond Half ends[^.]*\.?/gi, 'Fim do segundo tempo.'],
  [/\bFirst Half\b/gi, 'Primeiro tempo'],
  [/\bSecond Half\b/gi, 'Segundo tempo'],
  [/\bMatch ends\.?/gi, 'Fim de jogo.'],
  [/\bLineups are announced and players are warming up\.?/gi, 'Escalacoes anunciadas. Jogadores aquecendo.'],
  [/\bThey are ready to continue\.?/gi, 'Prontos para continuar.'],
  [/\bDelay in match because of an injury\.?/gi, 'Paralisacao por lesao.'],
  [/\bDelay over\.?\s*They are ready to continue\.?/gi, 'Jogo retomado.'],
  [/\bDelay over\.?/gi, 'Jogo retomado.'],
  [/\bDelay in match/gi, 'Paralisacao'],

  // Main actions
  [/\bAttempt missed\.?\s*/gi, 'Finalizacao para fora. '],
  [/\bAttempt saved\.?\s*/gi, 'Finalizacao defendida. '],
  [/\bAttempt blocked\.?\s*/gi, 'Finalizacao bloqueada. '],
  [/\bGoal!\s*/gi, 'Gol! '],
  [/\bPenalty saved\.?/gi, 'Penalti defendido.'],
  [/\bPenalty missed\.?/gi, 'Penalti perdido.'],
  [/\bPenalty\b/gi, 'Penalti'],
  [/\bOwn Goal\b/gi, 'Gol contra'],
  [/\bHand ?ball\b/gi, 'Mao na bola'],

  // Cards & subs (catch remaining after structural pass)
  [/\bis shown the yellow card/gi, 'recebe cartao amarelo'],
  [/\bis shown the red card/gi, 'recebe cartao vermelho'],
  [/\bYellow Card\b/gi, 'Cartao amarelo'],
  [/\bRed Card\b/gi, 'Cartao vermelho'],
  [/\bSubstitution\b/gi, 'Substituicao'],
  [/\breplaces\b/gi, 'substitui'],
  [/\benters the field/gi, 'entra em campo'],

  // Set pieces
  [/\bCorner,\s*/gi, 'Escanteio, '],
  [/\bOffside,\s*/gi, 'Impedimento, '],
  [/\bFoul by\b/gi, 'Falta de'],
  [/\bGoal kick\b/gi, 'Tiro de meta'],
  [/\bNew attacking attempt\b/gi, 'Novo ataque'],
  [/\bVAR Decision\b/gi, 'Decisao do VAR'],
  [/\bVideo Review\b/gi, 'Revisao de video'],

  // Free kick contexts
  [/\bwins a free kick in the defensive half/gi, 'ganha falta no campo defensivo'],
  [/\bwins a free kick in the attacking half/gi, 'ganha falta no campo ofensivo'],
  [/\bwins a free kick on the left wing/gi, 'ganha falta pela esquerda'],
  [/\bwins a free kick on the right wing/gi, 'ganha falta pela direita'],
  [/\bwins a free kick/gi, 'ganha falta'],
  [/\bfree kick\b/gi, 'falta'],

  // Shot types
  [/\bheaded attempt\b/gi, 'cabeceio'],
  [/\bheader\b/gi, 'cabeceio'],
  [/\bright footed shot\b/gi, 'finalizacao de direita'],
  [/\bleft footed shot\b/gi, 'finalizacao de esquerda'],
  [/\bright footed\b/gi, 'de direita'],
  [/\bleft footed\b/gi, 'de esquerda'],

  // Shot locations (longer patterns first)
  [/\bfrom the right side of the six yard box\b/gi, 'pelo lado direito da pequena area'],
  [/\bfrom the left side of the six yard box\b/gi, 'pelo lado esquerdo da pequena area'],
  [/\bfrom the centre of the six yard box\b/gi, 'do centro da pequena area'],
  [/\bthe right side of the six yard box\b/gi, 'o lado direito da pequena area'],
  [/\bthe left side of the six yard box\b/gi, 'o lado esquerdo da pequena area'],
  [/\bsix yard box\b/gi, 'pequena area'],
  [/\bfrom the right side of the box\b/gi, 'pelo lado direito da area'],
  [/\bfrom the left side of the box\b/gi, 'pelo lado esquerdo da area'],
  [/\bfrom the centre of the box\b/gi, 'do centro da area'],
  [/\bfrom outside the box\b/gi, 'de fora da area'],
  [/\bfrom very close range\b/gi, 'de muito perto'],
  [/\bfrom a difficult angle on the left\b/gi, 'de angulo dificil pela esquerda'],
  [/\bfrom a difficult angle on the right\b/gi, 'de angulo dificil pela direita'],
  [/\bfrom a difficult angle\b/gi, 'de angulo dificil'],
  [/\bfrom long range on the left\b/gi, 'de longa distancia pela esquerda'],
  [/\bfrom long range on the right\b/gi, 'de longa distancia pela direita'],
  [/\bfrom long range\b/gi, 'de longa distancia'],
  [/\bfrom more than (\d+) yards\b/gi, 'de mais de $1 metros'],

  // Saved locations
  [/\bis saved in the bottom right corner\b/gi, 'defendida no canto inferior direito'],
  [/\bis saved in the bottom left corner\b/gi, 'defendida no canto inferior esquerdo'],
  [/\bis saved in the top right corner\b/gi, 'defendida no canto superior direito'],
  [/\bis saved in the top left corner\b/gi, 'defendida no canto superior esquerdo'],
  [/\bis saved in the centre of the goal\b/gi, 'defendida no centro do gol'],
  [/\bis saved\b/gi, 'defendida'],
  [/\bis blocked\b/gi, 'bloqueada'],

  // Corner/target locations
  [/\bto the top right corner\b/gi, 'no canto superior direito'],
  [/\bto the top left corner\b/gi, 'no canto superior esquerdo'],
  [/\bto the bottom right corner\b/gi, 'no canto inferior direito'],
  [/\bto the bottom left corner\b/gi, 'no canto inferior esquerdo'],
  [/\bto the centre of the goal\b/gi, 'no centro do gol'],
  [/\btop right corner\b/gi, 'canto superior direito'],
  [/\btop left corner\b/gi, 'canto superior esquerdo'],
  [/\bbottom right corner\b/gi, 'canto inferior direito'],
  [/\bbottom left corner\b/gi, 'canto inferior esquerdo'],
  [/\btop centre of the goal\b/gi, 'centro alto do gol'],
  [/\bcentre of the goal\b/gi, 'centro do gol'],

  // Miss descriptions
  [/\bis close, but misses to the left\b/gi, 'passa perto pela esquerda'],
  [/\bis close, but misses to the right\b/gi, 'passa perto pela direita'],
  [/\bis close\b/gi, 'passa perto'],
  [/\bis just a bit too high\b/gi, 'vai um pouco acima'],
  [/\bis too high\b/gi, 'vai por cima'],
  [/\bhigh and wide to the right\b/gi, 'por cima a direita'],
  [/\bhigh and wide to the left\b/gi, 'por cima a esquerda'],
  [/\bhigh and wide\b/gi, 'por cima e para fora'],
  [/\bmisses to the right\b/gi, 'passa a direita'],
  [/\bmisses to the left\b/gi, 'passa a esquerda'],
  [/\bjust misses\b/gi, 'passa perto'],

  // Posts & bar
  [/\bhits the left post\b/gi, 'acerta a trave esquerda'],
  [/\bhits the right post\b/gi, 'acerta a trave direita'],
  [/\bhits the bar\b/gi, 'acerta o travessao'],
  [/\bthe left post\b/gi, 'a trave esquerda'],
  [/\bthe right post\b/gi, 'a trave direita'],
  [/\bthe bar\b/gi, 'o travessao'],
  [/\bthe wall\b/gi, 'a barreira'],

  // Context
  [/\bAssisted by\b/gi, 'Assistencia de'],
  [/\bfollowing a set piece situation\b/gi, 'apos bola parada'],
  [/\bfollowing a corner\b/gi, 'apos escanteio'],
  [/\bfollowing a fast break\b/gi, 'em contra-ataque'],
  [/\bfollowing a set piece\b/gi, 'apos bola parada'],
  [/\bwith an attempt\b/gi, 'com finalizacao'],
  [/\bwith a cross\b/gi, 'com cruzamento'],
  [/\bwith a through ball\b/gi, 'com passe em profundidade'],
  [/\bwith a headed pass\b/gi, 'com passe de cabeca'],
  [/\bwith a\b/gi, 'com'],

  // Location descriptors
  [/\bin the defensive half\b/gi, 'no campo defensivo'],
  [/\bin the attacking half\b/gi, 'no campo ofensivo'],
  [/\bon the right wing\b/gi, 'pela direita'],
  [/\bon the left wing\b/gi, 'pela esquerda'],

  // Fouls and reasons
  [/\bfor a bad foul\b/gi, 'por falta dura'],
  [/\bfor a foul\b/gi, 'por falta'],
  [/\bbad foul\b/gi, 'falta dura'],
  [/\bdangerous play\b/gi, 'jogada perigosa'],
  [/\btripping\b/gi, 'rasteira'],
  [/\bfoul\b/gi, 'falta'],
  [/\bscores\b/gi, 'marca'],

  // General terms
  [/\bSecond yellow card\b/gi, 'Segundo amarelo'],
  [/\bConceded by\b/gi, 'Cedido por'],
  [/\binjury\b/gi, 'lesao'],
  [/\bbecause of an injury\b/gi, 'por lesao'],
  [/\bat\s+(\d+)'/g, 'aos $1\''],

  // Additional common English fragments that leak through
  [/\btries a through ball\b/gi, 'tenta passe em profundidade'],
  [/\btries\b/gi, 'tenta'],
  [/\bbut misses\b/gi, 'mas erra'],
  [/\bbut fails\b/gi, 'mas falha'],
  [/\bthe attempt\b/gi, 'a tentativa'],
  [/\ban attempt\b/gi, 'uma tentativa'],
  [/\battempt\b/gi, 'tentativa'],
  [/\bthe box\b/gi, 'a area'],
  [/\bthe goal\b/gi, 'o gol'],
  [/\bgoal\b/gi, 'gol'],
  [/\bshot\b/gi, 'finalizacao'],
  [/\bsave\b/gi, 'defesa'],
  [/\bsaved\b/gi, 'defendida'],
  [/\bblocked\b/gi, 'bloqueada'],
  [/\bmissed\b/gi, 'perdida'],
]

// Phase 3: Final cleanup - catch stray English words/prepositions
const FINAL_CLEANUP: [RegExp, string][] = [
  // Post-translation patterns (created by earlier replacements)
  [/\bto the centre of the area\b/gi, 'para o centro da area'],
  [/\bto the high centre of the goal\b/gi, 'no centro alto do gol'],
  [/\bthe centre of the area\b/gi, 'o centro da area'],
  [/\bwith a through ball\b/gi, 'com passe em profundidade'],
  [/\bthrough ball\b/gi, 'passe em profundidade'],
  [/\bthe area\b/gi, 'a area'],
  [/\bcross\b/gi, 'cruzamento'],
  [/\bheader\b/gi, 'cabeceio'],
  [/\bthe\s+canto\b/gi, 'o canto'],
  [/\bto\s+the\b/gi, 'no'],
  [/\bfrom\s+the\b/gi, 'da'],
  [/\bof\s+the\b/gi, 'da'],
  [/\bin\s+the\b/gi, 'na'],
  [/\bon\s+the\b/gi, 'na'],
  [/\bfor\s+a\b/gi, 'por'],
  [/\bbut\s+the\b/gi, 'mas a'],
  [/\band\s+the\b/gi, 'e o'],
  // Isolated English words
  [/(?<=\s)the(?=\s)/gi, 'o'],
  [/(?<=\s)from(?=\s)/gi, 'de'],
  [/(?<=\s)for(?=\s[a-z])/gi, 'por'],
  [/(?<=\s)but(?=\s)/gi, 'mas'],
  [/(?<=\s)and(?=\s)/gi, 'e'],
  [/(?<=\s)by(?=\s)/gi, 'por'],
  [/(?<=\s)with(?=\s)/gi, 'com'],
]

export function translateNarration(text: string): string {
  if (!text) return ''

  let result = text

  // Phase 1: Structural transformations
  for (const [pattern, replacer] of STRUCTURAL_PATTERNS) {
    result = result.replace(pattern, replacer as any)
  }

  // Phase 2: Phrase replacements
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    result = result.replace(pattern, replacement)
  }

  // Phase 3: Final cleanup
  for (const [pattern, replacement] of FINAL_CLEANUP) {
    try {
      result = result.replace(pattern, replacement)
    } catch {
      // Lookbehind not supported in all environments
    }
  }

  // Phase 4: Aggressive post-translation cleanup (catches patterns created by earlier phases)
  for (const [pattern, replacement] of POST_TRANSLATION_CLEANUP) {
    result = result.replace(pattern, replacement)
  }

  // Restore accents
  result = restoreAccents(result)

  // Clean up double spaces and trim
  result = result.replace(/\s{2,}/g, ' ').trim()

  // Phase 5: Final validation — if English terms remain, use fallback
  if (hasEnglishRemnants(result)) {
    return buildFallback(result, text)
  }

  return result
}

// Phase 4: Aggressive post-translation patterns
const POST_TRANSLATION_CLEANUP: [RegExp, string][] = [
  // Injury patterns — MUST come first (catches partially translated text)
  [/\bbecause of an? les[aã]o\.?/gi, 'por lesão.'],
  [/\bbecause of an? injury\.?/gi, 'por lesão.'],
  [/\bbecause of injury\.?/gi, 'por lesão.'],
  [/\bdue to an? injury\.?/gi, 'por lesão.'],
  [/\bdue to an? les[aã]o\.?/gi, 'por lesão.'],
  [/\bdue to injury\.?/gi, 'por lesão.'],
  [/\binjured\b/gi, 'lesionado'],
  [/\binjury\b/gi, 'lesão'],
  // Location patterns
  [/\bto the cent(?:re|er) of a? ?[aá]rea\b/gi, 'para o centro da área'],
  [/\bo? ?cent(?:re|er) of a? ?[aá]rea\b/gi, 'o centro da área'],
  [/\bcent(?:re|er) of the (?:area|box)\b/gi, 'centro da área'],
  [/\bcent(?:re|er) of a? ?(?:area|box)\b/gi, 'centro da área'],
  [/\bright side of the (?:area|box)\b/gi, 'lado direito da área'],
  [/\bleft side of the (?:area|box)\b/gi, 'lado esquerdo da área'],
  [/\bright side of a? ?(?:area|box)\b/gi, 'lado direito da área'],
  [/\bleft side of a? ?(?:area|box)\b/gi, 'lado esquerdo da área'],
  [/\boutside a? ?(?:area|[aá]rea|box)\b/gi, 'fora da área'],
  [/\boutside the (?:area|[aá]rea|box)\b/gi, 'fora da área'],
  [/\btop right corner\b/gi, 'canto superior direito'],
  [/\btop left corner\b/gi, 'canto superior esquerdo'],
  [/\bbottom right corner\b/gi, 'canto inferior direito'],
  [/\bbottom left corner\b/gi, 'canto inferior esquerdo'],
  [/\bhigh cent(?:re|er) of the goal\b/gi, 'centro alto do gol'],
  [/\bcent(?:re|er) of the goal\b/gi, 'centro do gol'],
  [/\bright footed\b/gi, 'de direita'],
  [/\bleft footed\b/gi, 'de esquerda'],
  [/\bheaded\b/gi, 'cabeceou'],
  [/\bheader\b/gi, 'cabeceça'],
  [/\bwith a cross\b/gi, 'com cruzamento'],
  [/\bcross\b/gi, 'cruzamento'],
  [/\bthrough ball\b/gi, 'passe em profundidade'],
  [/\bfollowing a corner\b/gi, 'após escanteio'],
  [/\bfollowing a fast break\b/gi, 'após contra-ataque'],
  [/\bfollowing a?\b/gi, 'após'],
  [/\bassisted by\b/gi, 'assistência de'],
  [/\bis blocked\b/gi, 'é bloqueada'],
  [/\bis saved\b/gi, 'é defendida'],
  [/\bwins a free kick\b/gi, 'sofre falta'],
  [/\bbad foul\b/gi, 'falta dura'],
  [/\bhand ball\b/gi, 'toque de mão'],
  [/\boutside\b/gi, 'fora'],
  [/\bright side\b/gi, 'lado direito'],
  [/\bleft side\b/gi, 'lado esquerdo'],
  [/\bthe box\b/gi, 'a área'],
  [/\bthe area\b/gi, 'a área'],
  [/\bfrom the\b/gi, 'da'],
  [/\bto the\b/gi, 'para o'],
  [/\bcentre\b/gi, 'centro'],
  [/\bcenter\b/gi, 'centro'],
  [/\bbecause\b/gi, 'por'],
  // Natural Portuguese fixups (post-all-translations)
  [/finalização de direita o centro/gi, 'finaliza de direita no centro'],
  [/finalização de esquerda o centro/gi, 'finaliza de esquerda no centro'],
  [/finalização de direita o lado direito/gi, 'finaliza de direita pelo lado direito'],
  [/finalização de direita o lado esquerdo/gi, 'finaliza de direita pelo lado esquerdo'],
  [/finalização de esquerda o lado esquerdo/gi, 'finaliza de esquerda pelo lado esquerdo'],
  [/finalização de esquerda o lado direito/gi, 'finaliza de esquerda pelo lado direito'],
  [/cabeceou o centro/gi, 'cabeceia no centro'],
  [/cabeceou o lado/gi, 'cabeceia pelo lado'],
  [/finalização de direita da /gi, 'finaliza de direita da '],
  [/finalização de esquerda da /gi, 'finaliza de esquerda da '],
  [/finalização de direita de /gi, 'finaliza de direita de '],
  [/finalização de esquerda de /gi, 'finaliza de esquerda de '],
  [/ o centro da área/gi, ' no centro da área'],
  [/ o lado esquerdo da área/gi, ' pelo lado esquerdo da área'],
  [/ o lado direito da área/gi, ' pelo lado direito da área'],
]

const ENGLISH_TERMS = /\b(because|injury|outside|inside|right side|left side|centre|center|box|through ball|assisted by|following|bad foul|hand ball|from the|to the|with a cross)\b/i

function hasEnglishRemnants(text: string): boolean {
  return ENGLISH_TERMS.test(text)
}

function buildFallback(translated: string, original: string): string {
  // Try to extract player name and minute for a clean fallback
  const playerMatch = original.match(/([A-Z][a-zA-ZÀ-ɏ\s'.~-]{2,25}?)\s*\(/)
  const minuteMatch = original.match(/(\d+)'|^(\d+)\s/)
  const player = playerMatch?.[1]?.trim() || ''
  const minute = minuteMatch?.[1] || minuteMatch?.[2] || ''

  const textLower = original.toLowerCase()
  if (textLower.includes('goal') && !textLower.includes('attempt')) {
    return player ? `Gol de ${player}${minute ? ` aos ${minute}'` : ''}.` : translated
  }
  if (textLower.includes('corner')) {
    return `Escanteio${minute ? ` aos ${minute}'` : ''}.`
  }
  if (textLower.includes('foul')) {
    return player ? `Falta de ${player}${minute ? ` aos ${minute}'` : ''}.` : `Falta${minute ? ` aos ${minute}'` : ''}.`
  }
  if (textLower.includes('attempt') || textLower.includes('shot')) {
    return player ? `Finalização de ${player}${minute ? ` aos ${minute}'` : ''}.` : `Finalização${minute ? ` aos ${minute}'` : ''}.`
  }
  if (textLower.includes('substitution')) {
    return `Substituição${minute ? ` aos ${minute}'` : ''}.`
  }
  // Generic fallback
  return minute ? `Evento da partida aos ${minute}'.` : translated.replace(ENGLISH_TERMS, '').replace(/\s{2,}/g, ' ').trim()
}

function restoreAccents(text: string): string {
  const accents: [RegExp, string][] = [
    [/\bFinalizacao\b/g, 'Finalização'],
    [/\bfinalizacao\b/g, 'finalização'],
    [/\bSubstituicao\b/g, 'Substituição'],
    [/\bsubstituicao\b/g, 'substituição'],
    [/\bEscalacoes\b/g, 'Escalações'],
    [/\bParalisacao\b/g, 'Paralisação'],
    [/\bparalisacao\b/g, 'paralisação'],
    [/\blesao\b/g, 'lesão'],
    [/\bcartao\b/g, 'cartão'],
    [/\bCartao\b/g, 'Cartão'],
    [/\bPenalti\b/g, 'Pênalti'],
    [/\bpenalti\b/g, 'pênalti'],
    [/\bcomeca\b/g, 'começa'],
    [/\bComeca\b/g, 'Começa'],
    [/\bangulo\b/g, 'ângulo'],
    [/\bdistancia\b/g, 'distância'],
    [/\barea\b/g, 'área'],
    [/\bAssistencia\b/g, 'Assistência'],
    [/\bassistencia\b/g, 'assistência'],
    [/\bDecisao\b/g, 'Decisão'],
    [/\bRevisao\b/g, 'Revisão'],
    [/\bvideo\b/g, 'vídeo'],
    [/\bcabeca\b/g, 'cabeça'],
    [/\breclamacao\b/g, 'reclamação'],
    [/\bsimulacao\b/g, 'simulação'],
    [/\bempurrao\b/g, 'empurrão'],
    [/\bmao\b/g, 'mão'],
    [/\bMao\b/g, 'Mão'],
    [/\ba direita\b/g, 'à direita'],
    [/\ba esquerda\b/g, 'à esquerda'],
    [/\bapos\b/g, 'após'],
  ]
  let r = text
  for (const [p, rep] of accents) {
    r = r.replace(p, rep)
  }
  return r
}

export function translateEventText(text: string): string {
  return translateNarration(text)
}

/** Translate event type labels to pt-BR */
export function translateEventType(type: string): string {
  const map: Record<string, string> = {
    'goal': 'Gol',
    'Goal': 'Gol',
    'yellow_card': 'Cartao amarelo',
    'Yellow Card': 'Cartao amarelo',
    'yellowCard': 'Cartao amarelo',
    'red_card': 'Cartao vermelho',
    'Red Card': 'Cartao vermelho',
    'redCard': 'Cartao vermelho',
    'substitution': 'Substituicao',
    'Substitution': 'Substituicao',
    'shot': 'Finalizacao',
    'Shot': 'Finalizacao',
    'corner': 'Escanteio',
    'Corner': 'Escanteio',
    'offside': 'Impedimento',
    'Offside': 'Impedimento',
    'foul': 'Falta',
    'Foul': 'Falta',
    'period_start': 'Inicio do periodo',
    'period_end': 'Fim do periodo',
    'injury': 'Lesao',
    'var': 'VAR',
    'VAR': 'VAR',
    'assist': 'Assistencia',
    'other': 'Outro',
    'First Half': 'Primeiro tempo',
    'Second Half': 'Segundo tempo',
    'Half Time': 'Intervalo',
    'Full Time': 'Fim de jogo',
    'Kick Off': 'Pontape inicial',
    'Free Kick': 'Falta',
    'Penalty': 'Penalti',
  }
  // Apply accent restoration to the result
  const raw = map[type] || type
  return restoreAccents(raw)
}

/**
 * Final sanitization function. Run on ALL text before rendering in UI.
 * Catches any remaining English terms and replaces with clean Portuguese fallback.
 */
export function sanitizeFinalPortugueseText(text: string, eventType?: string, player?: string, team?: string, minute?: string): string {
  if (!text) return ''

  // Run translation
  let result = translateNarration(text)

  // Extra cleanup for hybrid patterns that slip through
  result = result
    .replace(/because of an? les[aã]o\.?/gi, 'por lesão.')
    .replace(/because of an? injury\.?/gi, 'por lesão.')
    .replace(/because\b/gi, 'por')
    .replace(/\binjury\b/gi, 'lesão')

  // Final check — if English terms remain, use fallback
  if (ENGLISH_TERMS.test(result)) {
    const min = minute || ''
    const p = player || ''
    const t = team || ''

    switch (eventType) {
      case 'goal': return p ? `Gol de ${p}${min ? ` aos ${min}'` : ''}.` : `Gol${min ? ` aos ${min}'` : ''}.`
      case 'yellow_card': case 'Yellow Card': return p ? `${p} recebeu cartão amarelo${min ? ` aos ${min}'` : ''}.` : `Cartão amarelo${min ? ` aos ${min}'` : ''}.`
      case 'red_card': case 'Red Card': return p ? `${p} recebeu cartão vermelho${min ? ` aos ${min}'` : ''}.` : `Cartão vermelho${min ? ` aos ${min}'` : ''}.`
      case 'substitution': case 'Substitution': return t ? `Substituição em ${t}${min ? ` aos ${min}'` : ''}.` : `Substituição${min ? ` aos ${min}'` : ''}.`
      case 'shot': case 'Shot': return p ? `Finalização de ${p}${min ? ` aos ${min}'` : ''}.` : `Finalização${min ? ` aos ${min}'` : ''}.`
      case 'corner': case 'Corner': return t ? `Escanteio para ${t}${min ? ` aos ${min}'` : ''}.` : `Escanteio${min ? ` aos ${min}'` : ''}.`
      case 'foul': case 'Foul': return p ? `Falta de ${p}${min ? ` aos ${min}'` : ''}.` : `Falta${min ? ` aos ${min}'` : ''}.`
      default: return min ? `Evento da partida aos ${min}'.` : result.replace(ENGLISH_TERMS, '').replace(/\s{2,}/g, ' ').trim()
    }
  }

  return result
}
