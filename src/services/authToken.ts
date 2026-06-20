/**
 * authToken (Phase B27) — dependency-free token provider for all API clients.
 * ─────────────────────────────────────────────────────────────────────────────
 * Holds the current Bearer token getter (set by AuthProvider). Kept separate from
 * apiClient/commandBackendClient to avoid circular imports. NEVER logs the token.
 */
type TokenProvider = () => string | null

let tokenProvider: TokenProvider = () => null

export function setAuthTokenProvider(fn: TokenProvider): void {
  tokenProvider = fn
}

/** Synchronous auth headers; empty when no token (local mode / auth off). */
export function authHeaders(): Record<string, string> {
  const t = tokenProvider()
  return t ? { Authorization: `Bearer ${t}` } : {}
}
