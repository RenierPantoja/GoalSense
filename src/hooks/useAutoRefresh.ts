import { useEffect, useRef, useState, useCallback } from 'react'

interface UseAutoRefreshOptions {
  intervalMs: number
  enabled?: boolean
}

export function useAutoRefresh<T>(
  fetcher: () => Promise<T>,
  { intervalMs, enabled = true }: UseAutoRefreshOptions
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    try {
      const result = await fetcher()
      setData(result)
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      // Keep old data, show error
      setError((err as Error).message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fetcher])

  useEffect(() => {
    fetchData()
    if (!enabled) return

    const id = setInterval(() => fetchData(true), intervalMs)
    return () => clearInterval(id)
  }, [fetchData, intervalMs, enabled])

  const refresh = useCallback(() => fetchData(true), [fetchData])

  return { data, loading, error, lastUpdate, refreshing, refresh }
}
