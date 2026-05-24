/**
 * Central API path resolver.
 * Supports Vercel (/api/...) and Netlify (/.netlify/functions/...) via env var.
 */

const BASE_PATH = import.meta.env.VITE_API_BASE_PATH || '/api'

export function apiPath(functionName: string, query?: Record<string, string | number | boolean | undefined | null>): string {
  const url = new URL(`${BASE_PATH}/${functionName}`, window.location.origin)
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
  }
  if (import.meta.env.DEV) {
    console.debug('[apiPath]', functionName, url.toString())
  }
  return url.toString()
}
