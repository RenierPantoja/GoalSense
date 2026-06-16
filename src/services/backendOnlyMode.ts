/**
 * backendOnlyMode — toggle that makes the Command Center delegate ALL pattern
 * detection, alerting and resolution to the backend worker pipeline.
 * ─────────────────────────────────────────────────────────────────────────────
 * When enabled (and a backend URL is configured), the local client-side engine
 * STOPS generating/persisting alerts. The Scanner/Cockpit still visualize local
 * pattern evaluation as a live preview, but the authoritative alerts come only
 * from the backend (`/api/alerts`, created by the backend Pattern Worker).
 *
 * This removes the ambiguity of "was this alert detected locally or by the
 * backend?" — in backend-only mode every persisted alert is the backend's.
 *
 * Persisted in localStorage so the choice survives reloads. No backend call.
 */

const KEY = 'goalsense_command_backend_only'

/** Read the backend-only preference (default: false). */
export function isBackendOnly(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

/** Persist the backend-only preference. */
export function setBackendOnly(value: boolean): void {
  try {
    if (value) localStorage.setItem(KEY, 'true')
    else localStorage.removeItem(KEY)
  } catch {
    /* localStorage unavailable */
  }
}
