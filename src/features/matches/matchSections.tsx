import { normalizeEvents, type NormalizedEvent } from './normalizeMatchEvents'

interface Event { clock: string; text: string; type: string; team: string }

// === MATCH STORYLINE ===
export function MatchStoryline({ events, homeName, awayName, homeScore, awayScore }: { events: Event[]; homeName: string; awayName: string; homeScore: number; awayScore: number }) {
  if (events.length < 2) return null

  const normalized = normalizeEvents(events)
  const goals = normalized.filter(e => e.type === 'goal')
  const cards = normalized.filter(e => e.type === 'yellow_card' || e.type === 'red_card')
  const redCards = normalized.filter(e => e.type === 'red_card')

  const firstHalfEvents = normalized.filter(e => e.minute <= 45)
  const secondHalfEvents = normalized.filter(e => e.minute > 45)

  // Build narrative with actual player references
  let inicio = ''
  if (goals.length > 0 && goals[0].minute <= 20) {
    const scorer = goals[0].playerName
    const team = goals[0].teamName
    inicio = scorer
      ? `${team || 'Time da casa'} abriu o placar aos ${goals[0].minute}' com ${scorer}.`
      : `Gol cedo aos ${goals[0].minute}' abriu o placar.`
  } else if (firstHalfEvents.length > 8) {
    const shotsCount = firstHalfEvents.filter(e => e.type === 'shot').length
    inicio = shotsCount > 3
      ? `Primeiro tempo intenso com ${shotsCount} finalizações e ações frequentes.`
      : 'Primeiro tempo movimentado com ações de ambos os lados.'
  } else if (firstHalfEvents.length > 3) {
    inicio = 'Início equilibrado com poucas oportunidades claras.'
  } else {
    inicio = 'Início sem grandes oportunidades.'
  }

  let desenvolvimento = ''
  if (redCards.length > 0) {
    const redPlayer = redCards[0].playerName
    desenvolvimento = redPlayer
      ? `${redPlayer} expulso aos ${redCards[0].minute}', mudando o rumo da partida.`
      : 'Expulsão alterou completamente o equilíbrio da partida.'
  } else if (goals.length >= 3) {
    const scorers = goals.slice(0, 3).map(g => g.playerName ? `${g.playerName} (${g.minute}')` : `gol aos ${g.minute}'`).join(', ')
    desenvolvimento = `Partida aberta com gols de ${scorers}.`
  } else if (goals.length === 1 && cards.length >= 2) {
    const cardPlayer = cards[0].playerName
    desenvolvimento = cardPlayer
      ? `O jogo teve vantagem mínima e ações disciplinárias, com ${cardPlayer} advertido aos ${cards[0].minute}'.`
      : `O jogo seguiu com vantagem mínima e ${cards.length} cartões.`
  } else if (cards.length >= 3) {
    desenvolvimento = `Jogo ficou mais duro com ${cards.length} cartões, alterando o ritmo.`
  } else if (goals.length === 2) {
    const g1 = goals[0]
    const g2 = goals[1]
    if (g1.teamName && g2.teamName && g1.teamName !== g2.teamName) {
      desenvolvimento = `${g1.teamName} abriu com ${g1.playerName || 'gol'} aos ${g1.minute}', mas ${g2.teamName} empatou com ${g2.playerName || 'gol'} aos ${g2.minute}'.`
    } else {
      const team = g1.teamName || 'um time'
      desenvolvimento = `${team} ampliou com dois gols (${g1.minute}' e ${g2.minute}').`
    }
  } else if (goals.length === 1) {
    desenvolvimento = `Placar magro mantido após o gol aos ${goals[0].minute}'.`
  } else {
    desenvolvimento = normalized.length > 6
      ? 'Jogo movimentado, porém sem gols até aqui.'
      : 'Desenvolvimento sem grandes alterações.'
  }

  let finalPhase = ''
  const lateGoals = goals.filter(g => g.minute >= 75)
  if (lateGoals.length > 0) {
    const lateScorer = lateGoals[0].playerName
    finalPhase = lateScorer
      ? `${lateScorer} marcou nos minutos finais (${lateGoals[0].minute}'), alterando o panorama.`
      : 'Gol nos minutos finais alterou o panorama da partida.'
  } else if (secondHalfEvents.length > 6) {
    finalPhase = 'Fase final intensa com pressão crescente.'
  } else {
    finalPhase = 'Reta final sem grandes alterações no placar.'
  }

  // Result summary
  let resultado = ''
  if (homeScore > awayScore) {
    resultado = `Vitória do ${homeName} por ${homeScore} a ${awayScore}.`
  } else if (awayScore > homeScore) {
    resultado = `Vitória do ${awayName} por ${awayScore} a ${homeScore}.`
  } else {
    resultado = `Empate em ${homeScore} a ${awayScore}.`
  }

  // Momentos decisivos - use actual events with player names
  const momentos: string[] = []
  for (const g of goals.slice(0, 3)) {
    const label = g.playerName ? `Gol de ${g.playerName} ${g.minute}'` : `Gol ${g.minute}'`
    momentos.push(label)
  }
  for (const rc of redCards.slice(0, 1)) {
    const label = rc.playerName ? `Vermelho para ${rc.playerName} ${rc.minute}'` : `Vermelho ${rc.minute}'`
    momentos.push(label)
  }
  for (const c of cards.filter(cc => cc.type === 'yellow_card').slice(0, 2)) {
    if (c.playerName) momentos.push(`Cartão para ${c.playerName} ${c.minute}'`)
  }
  const subs = normalized.filter(e => e.type === 'substitution')
  if (subs.length > 0) {
    const subRange = subs.map(s => s.minute)
    const min = Math.min(...subRange)
    const max = Math.max(...subRange)
    if (min === max) momentos.push(`Substituição aos ${min}'`)
    else momentos.push(`Substituições entre ${min}' e ${max}'`)
  }

  return (
    <section className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-6 animate-slideUp">
      <h3 className="text-[13px] font-bold text-white/70 mb-4">História da partida</h3>
      <div className="space-y-3 text-[12px] text-white/50 leading-relaxed">
        <div><span className="text-[10px] font-bold uppercase tracking-widest text-white/25 block mb-1">Início</span>{inicio}</div>
        <div><span className="text-[10px] font-bold uppercase tracking-widest text-white/25 block mb-1">Desenvolvimento</span>{desenvolvimento}</div>
        <div><span className="text-[10px] font-bold uppercase tracking-widest text-white/25 block mb-1">Fase final</span>{finalPhase}</div>
        {resultado && <div><span className="text-[10px] font-bold uppercase tracking-widest text-white/25 block mb-1">Resultado</span>{resultado}</div>}
      </div>
      {momentos.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/[0.03]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/20 block mb-2">Momentos decisivos</span>
          <div className="flex flex-wrap gap-2">
            {momentos.map((m, i) => (
              <span key={i} className={`rounded-lg border px-3 py-1.5 text-[11px] ${
                m.startsWith('Gol') ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400/70' :
                m.startsWith('Vermelho') ? 'border-rose-500/20 bg-rose-500/5 text-rose-400/70' :
                'border-white/[0.05] bg-white/[0.02] text-white/40'
              }`}>{m}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// === PLAYER IMPACT ===
export function PlayerImpactPanel({ events }: { events: Event[] }) {
  const normalized = normalizeEvents(events)
  const playerMap = new Map<string, { team: string; events: { type: NormalizedEvent['type']; minute: number; desc: string }[] }>()

  for (const ev of normalized) {
    if (!ev.playerName || ev.playerName.length < 2) continue

    // Skip period events
    if (ev.type === 'period_start' || ev.type === 'period_end' || ev.type === 'other') continue

    if (!playerMap.has(ev.playerName)) {
      playerMap.set(ev.playerName, { team: ev.teamName, events: [] })
    }
    const entry = playerMap.get(ev.playerName)!

    let desc = ''
    switch (ev.type) {
      case 'goal': desc = ev.teamName ? `Gol aos ${ev.minute}'. Marcou para o ${ev.teamName}.` : `Gol aos ${ev.minute}'.`; break
      case 'yellow_card': desc = `Cartão amarelo aos ${ev.minute}'.`; break
      case 'red_card': desc = `Cartão vermelho aos ${ev.minute}'. Expulso.`; break
      case 'substitution': desc = `Entrou aos ${ev.minute}'.`; break
      case 'shot': desc = `Finalização aos ${ev.minute}'.`; break
      case 'foul': desc = `Falta aos ${ev.minute}'.`; break
      default: desc = `${ev.title} aos ${ev.minute}'.`; break
    }

    entry.events.push({ type: ev.type, minute: ev.minute, desc })

    // Handle assists
    if (ev.assistName && ev.assistName.length > 2) {
      if (!playerMap.has(ev.assistName)) {
        playerMap.set(ev.assistName, { team: ev.teamName, events: [] })
      }
      playerMap.get(ev.assistName)!.events.push({
        type: 'assist' as any,
        minute: ev.minute,
        desc: `Assistência aos ${ev.minute}'.`,
      })
    }

    // Handle playerOut for subs
    if (ev.type === 'substitution' && ev.playerOut && ev.playerOut.length > 2) {
      if (!playerMap.has(ev.playerOut)) {
        playerMap.set(ev.playerOut, { team: ev.teamName, events: [] })
      }
      playerMap.get(ev.playerOut)!.events.push({
        type: 'substitution',
        minute: ev.minute,
        desc: `Saiu aos ${ev.minute}'.`,
      })
    }
  }

  const playerList = Array.from(playerMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .filter(p => {
      // Only show players with meaningful events (not just fouls/shots)
      return p.events.some(e =>
        e.type === 'goal' || e.type === 'assist' as any ||
        e.type === 'yellow_card' || e.type === 'red_card' ||
        e.type === 'substitution'
      )
    })
    .sort((a, b) => {
      const scoreA = a.events.reduce((s, e) => s + getEventWeight(e.type), 0)
      const scoreB = b.events.reduce((s, e) => s + getEventWeight(e.type), 0)
      return scoreB - scoreA
    })

  if (playerList.length === 0) return null

  return (
    <section className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-5 animate-slideUp">
      <h3 className="text-[12px] font-bold text-white/60 mb-3">Jogadores de impacto</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {playerList.slice(0, 8).map((p, i) => {
          const impactScore = p.events.reduce((s, e) => s + getEventWeight(e.type), 0)
          const goals = p.events.filter(e => e.type === 'goal').length
          const assists = p.events.filter(e => e.type === 'assist' as any).length
          const phrase = goals >= 2 ? `Participou diretamente de ${goals} gols.`
            : goals === 1 && assists >= 1 ? 'Gol e assistência na partida.'
            : goals === 1 ? 'Decisivo no placar.'
            : assists >= 1 ? 'Criou chance de gol.'
            : p.events.some(e => e.type === 'red_card') ? 'Entrou no radar disciplinar.'
            : p.events.some(e => e.type === 'yellow_card') ? 'Advertido na partida.'
            : p.events.some(e => e.type === 'substitution') && p.events.some(e => e.minute >= 60) ? 'Entrou na rotação da partida.'
            : ''
          const mainType = p.events[0]?.type || 'other'
          const rank = i < 3 ? `#${i + 1}` : ''

          return (
            <div key={i} className="flex items-start gap-2.5 rounded-xl border border-white/[0.03] bg-white/[0.01] p-3">
              <div className="flex flex-col items-center shrink-0 w-6">
                {rank && <span className="text-[8px] font-bold text-cyan-400/40">{rank}</span>}
                <div className={`h-2.5 w-2.5 rounded-full ${getEventDotColor(mainType)}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-white/70 line-clamp-2" title={p.name}>{p.name}</span>
                  <span className="text-[10px] font-bold tabular-nums text-cyan-400/50 shrink-0">{impactScore}</span>
                </div>
                {p.team && <span className="text-[9px] text-white/15 block">{p.team}</span>}
                {phrase && <span className="text-[9px] text-white/30 block mt-0.5 italic">{phrase}</span>}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {p.events.map((e, ei) => (
                    <span key={ei} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-medium ${getEventBadgeStyle(e.type)}`}>
                      {getEventBadgeLabel(e.type)} {e.minute}'
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function getEventWeight(type: string): number {
  switch (type) {
    case 'goal': return 40
    case 'assist': return 25
    case 'red_card': return 25
    case 'yellow_card': return 8
    case 'substitution': return 5
    case 'shot': return 8
    default: return 0
  }
}

function getEventDotColor(type: string): string {
  switch (type) {
    case 'goal': return 'bg-emerald-400'
    case 'assist': return 'bg-cyan-400'
    case 'red_card': return 'bg-rose-500'
    case 'yellow_card': return 'bg-amber-400'
    case 'substitution': return 'bg-cyan-400/60'
    default: return 'bg-white/20'
  }
}

function getEventBadgeStyle(type: string): string {
  switch (type) {
    case 'goal': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
    case 'assist': return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15'
    case 'red_card': return 'bg-rose-500/10 text-rose-400 border border-rose-500/15'
    case 'yellow_card': return 'bg-amber-500/10 text-amber-400 border border-amber-500/15'
    case 'substitution': return 'bg-white/[0.03] text-white/40 border border-white/[0.06]'
    default: return 'bg-white/[0.02] text-white/30 border border-white/[0.04]'
  }
}

function getEventBadgeLabel(type: string): string {
  switch (type) {
    case 'goal': return 'Gol'
    case 'assist': return 'Assist.'
    case 'red_card': return 'Vermelho'
    case 'yellow_card': return 'Amarelo'
    case 'substitution': return 'Sub'
    default: return ''
  }
}

// === DANGEROUS ATTACKS ESTIMATED ===
export function DangerousAttackPanel({ stats, events, homeName, awayName }: { stats: { label: string; home: string; away: string }[]; events?: Event[]; homeName: string; awayName: string }) {
  const getStat = (name: string) => { const s = stats.find(x => x.label.toLowerCase().includes(name.toLowerCase())); return s ? { home: parseFloat(s.home) || 0, away: parseFloat(s.away) || 0 } : null }

  const shots = getStat('shots') || getStat('SHOTS')
  const onTarget = getStat('on goal') || getStat('ON GOAL') || getStat('shotsOnTarget')
  const corners = getStat('corner') || getStat('Corner')

  if (!shots && !onTarget && !corners) return null

  const homeDA = Math.round(((shots?.home || 0) * 0.5 + (onTarget?.home || 0) * 1.2 + (corners?.home || 0) * 0.8))
  const awayDA = Math.round(((shots?.away || 0) * 0.5 + (onTarget?.away || 0) * 1.2 + (corners?.away || 0) * 0.8))

  if (homeDA === 0 && awayDA === 0) return null

  const leader = homeDA > awayDA ? homeName : awayDA > homeDA ? awayName : null
  const total = homeDA + awayDA || 1

  // Sequência recente - last 3 offensive events
  const recentOffensive: { team: string; minute: number; desc: string }[] = []
  if (events && events.length > 0) {
    const normalized = normalizeEvents(events)
    const offensive = normalized.filter(e =>
      e.type === 'goal' || e.type === 'shot' || e.type === 'corner'
    )
    for (const ev of offensive.slice(-3)) {
      recentOffensive.push({
        team: ev.teamName,
        minute: ev.minute,
        desc: ev.title,
      })
    }
  }

  // Confidence level
  const dataPoints = (shots ? 1 : 0) + (onTarget ? 1 : 0) + (corners ? 1 : 0)
  const confidence = dataPoints >= 3 ? 'Alta' : dataPoints >= 2 ? 'Média' : 'Baixa'

  return (
    <section className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-6 animate-slideUp">
      <h3 className="text-[13px] font-bold text-white/70 mb-1">Ataques perigosos estimados</h3>
      <p className="text-[10px] text-white/20 mb-4">Baseado em finalizações, chutes ao gol e escanteios</p>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[16px] font-bold tabular-nums text-white/80">{homeDA}</span>
        <span className="text-[10px] text-white/25">{homeName} vs {awayName}</span>
        <span className="text-[16px] font-bold tabular-nums text-white/80">{awayDA}</span>
      </div>
      <div className="flex h-[5px] rounded-full overflow-hidden bg-white/[0.04] gap-[2px]">
        <div className="bg-cyan-400/60 rounded-full transition-all duration-700" style={{ width: `${(homeDA / total) * 100}%` }} />
        <div className="bg-emerald-400/40 rounded-full flex-1" />
      </div>
      {leader && <p className="text-[11px] text-white/30 mt-3">{leader} concentra mais ações ofensivas nesta partida.</p>}

      {/* Sequência recente */}
      {recentOffensive.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/[0.03]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/20 block mb-2">Sequência recente</span>
          <div className="space-y-1.5">
            {recentOffensive.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className="text-emerald-400/60 tabular-nums w-6 text-right">{r.minute}'</span>
                <span className="text-white/30">{r.team}</span>
                <span className="text-white/20">{r.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confiança */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[9px] text-white/15">Confiança:</span>
        <span className={`text-[9px] font-medium ${confidence === 'Alta' ? 'text-emerald-400/50' : confidence === 'Média' ? 'text-amber-400/50' : 'text-white/25'}`}>{confidence}</span>
      </div>
    </section>
  )
}

// === STATS INSIGHT HEADER ===
export function StatsInsightHeader({ stats, homeName, awayName, homeScore, awayScore }: { stats: { label: string; home: string; away: string }[]; homeName: string; awayName: string; homeScore?: number; awayScore?: number }) {
  const getStat = (name: string) => { const s = stats.find(x => x.label.toLowerCase().includes(name.toLowerCase())); return s ? { home: parseFloat(s.home) || 0, away: parseFloat(s.away) || 0 } : null }

  const possession = getStat('possession') || getStat('POSSESSION')
  const shots = getStat('shots') || getStat('SHOTS')
  const onTarget = getStat('on goal') || getStat('ON GOAL') || getStat('shotsOnTarget')
  const corners = getStat('corner') || getStat('Corner')
  const fouls = getStat('fouls') || getStat('Fouls')
  const useful = stats.filter(s => (parseFloat(s.home) || 0) > 0 || (parseFloat(s.away) || 0) > 0)

  if (useful.length === 0) return <p className="text-[12px] text-white/30 mb-4">Estatísticas detalhadas indisponíveis para esta partida.</p>

  const insights: string[] = []

  if (possession && shots) {
    const possLeader = possession.home > possession.away ? homeName : awayName
    const shotsLeader = shots.home > shots.away ? homeName : awayName
    if (possLeader === shotsLeader) {
      insights.push(`${possLeader} domina posse (${Math.round(possession.home > possession.away ? possession.home : possession.away)}%) e volume ofensivo (${Math.round(shots.home > shots.away ? shots.home : shots.away)} finalizações).`)
    } else {
      insights.push(`${possLeader} tem mais posse (${Math.round(possession.home > possession.away ? possession.home : possession.away)}%), mas ${shotsLeader} finaliza mais (${Math.round(shots.home > shots.away ? shots.home : shots.away)}).`)
    }
  }

  if (onTarget) {
    const total = onTarget.home + onTarget.away
    if (total > 0) {
      const leader = onTarget.home > onTarget.away ? homeName : awayName
      const val = Math.round(Math.max(onTarget.home, onTarget.away))
      insights.push(`${leader} com ${val} finalizações no alvo.`)
    }
  }

  if (corners) {
    const total = corners.home + corners.away
    if (total >= 4) {
      const leader = corners.home > corners.away ? homeName : awayName
      insights.push(`${leader} pressiona mais pelo setor ofensivo (${Math.round(Math.max(corners.home, corners.away))} escanteios).`)
    }
  }

  if (fouls) {
    const total = fouls.home + fouls.away
    if (total >= 15) {
      insights.push('Jogo com muitas faltas, ritmo quebrado.')
    }
  }

  // Score context
  if (homeScore !== undefined && awayScore !== undefined && (homeScore + awayScore) > 0) {
    if (homeScore === awayScore) {
      insights.push('Placar equilibrado reflete o equilíbrio em campo.')
    }
  }

  const finalInsight = insights.slice(0, 2).join(' ')

  return <p className="text-[12px] text-white/40 mb-4 italic">{finalInsight || 'Estatísticas parciais disponíveis.'}</p>
}
