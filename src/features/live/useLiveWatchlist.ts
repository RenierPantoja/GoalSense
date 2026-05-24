import { useState, useCallback } from 'react'

const STORAGE_KEY = 'goalsense_live_watchlist'

function loadWatchlist(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw))
  } catch {}
  return new Set()
}

function saveWatchlist(ids: Set<number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)))
}

export function useLiveWatchlist() {
  const [watchlist, setWatchlist] = useState<Set<number>>(loadWatchlist)

  const toggle = useCallback((id: number) => {
    setWatchlist(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveWatchlist(next)
      return next
    })
  }, [])

  const isWatching = useCallback((id: number) => watchlist.has(id), [watchlist])

  return { watchlist, toggle, isWatching, count: watchlist.size }
}
