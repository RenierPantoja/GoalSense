/**
 * Renders match highlights from ScoreBat when available.
 * If no highlights found, renders nothing.
 */

import { useEffect, useState } from 'react'
import { resolveHighlights, type MatchHighlight } from './matchHighlightsResolver'

interface Props {
  homeName: string
  awayName: string
}

export function MatchHighlightsSection({ homeName, awayName }: Props) {
  const [highlights, setHighlights] = useState<MatchHighlight[]>([])
  const [debug, setDebug] = useState<{ feedCount: number; candidates: number; reason: string; normalizedHome?: string; normalizedAway?: string; firstTitles?: string[]; topSimilarities?: any[] } | null>(null)

  useEffect(() => {
    if (!homeName || !awayName) return
    let cancelled = false
    resolveHighlights(homeName, awayName).then(result => {
      if (!cancelled) {
        setHighlights(result.highlights)
        setDebug(result.debug)
      }
    })
    return () => { cancelled = true }
  }, [homeName, awayName])

  // Debug only with explicit flag
  if (import.meta.env.VITE_SHOW_HIGHLIGHTS_DEBUG === 'true' && debug && highlights.length === 0) {
    return (
      <details className="rounded-xl border border-dashed border-white/[0.06] bg-white/[0.01] p-2">
        <summary className="text-[9px] text-white/25 cursor-pointer select-none">Debug de highlights</summary>
        <div className="mt-2 text-[8px] text-white/15 font-mono space-y-0.5">
          <div>home="{debug.normalizedHome}" away="{debug.normalizedAway}"</div>
          <div>feed={debug.feedCount} candidates={debug.candidates} reason="{debug.reason}"</div>
          {debug.firstTitles && debug.firstTitles.length > 0 && <div>feed: {debug.firstTitles.slice(0, 5).join(' | ')}</div>}
          {debug.topSimilarities && debug.topSimilarities.length > 0 && (
            <div>top: {debug.topSimilarities.slice(0, 3).map(s => `${s.s1||'?'}v${s.s2||'?'}(${s.total})`).join(', ')}</div>
          )}
        </div>
      </details>
    )
  }

  if (highlights.length === 0) return null

  return (
    <section className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-5 animate-slideUp">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 mb-3">Highlights</h3>
      <div className="space-y-3">
        {highlights.map((h, i) => (
          <div key={i} className="rounded-xl border border-white/[0.04] bg-[#080b12] overflow-hidden">
            {h.embed ? (
              <div
                className="aspect-video w-full"
                dangerouslySetInnerHTML={{ __html: sanitizeEmbed(h.embed) }}
              />
            ) : h.url ? (
              <a href={h.url} target="_blank" rel="noopener noreferrer" className="block p-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3">
                  {h.thumbnail && <img src={h.thumbnail} alt="" className="w-24 h-14 object-cover rounded-lg" />}
                  <div>
                    <p className="text-[12px] text-white/60 font-medium">{h.title}</p>
                    <p className="text-[10px] text-white/25 mt-0.5">Assistir melhores momentos</p>
                  </div>
                </div>
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function sanitizeEmbed(html: string): string {
  // Only allow iframe embeds from known domains
  if (!html.includes('<iframe')) return ''
  const allowed = ['scorebat.com', 'youtube.com', 'youtube-nocookie.com', 'dailymotion.com']
  const hasAllowed = allowed.some(d => html.includes(d))
  if (!hasAllowed) return ''
  // Add responsive styling
  return html.replace('<iframe', '<iframe style="width:100%;height:100%;position:absolute;top:0;left:0" ')
}
