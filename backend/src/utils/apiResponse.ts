export function ok(data: unknown) {
  return { success: true, data }
}

export function created(data: unknown) {
  return { success: true, data }
}

export function badRequest(message: string, details?: unknown) {
  return { success: false, error: { message, details } }
}

export function notFound(message = 'Not found') {
  return { success: false, error: { message } }
}

export function serverError(message = 'Internal server error') {
  return { success: false, error: { message } }
}
