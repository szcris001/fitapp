import * as Sentry from '@sentry/node'

/**
 * Monitoreo de errores con Sentry. Solo se activa si SENTRY_DSN está definido;
 * sin DSN (desarrollo, tests) no hace nada.
 * El error handler global (lib/http-error.ts) reporta los errores 5xx.
 */
let enabled = false

export function initSentry(): void {
  if (!process.env.SENTRY_DSN) return
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.GIT_COMMIT_SHA ?? 'local',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      // Los health checks no son errores de la app
      if (event.request?.url?.includes('/health')) return null
      return event
    },
  })
  enabled = true
}

/** Reporta un error del servidor, etiquetado por gym para filtrar por tenant */
export function reportServerError(
  error: unknown,
  context: { url?: string; method?: string; gymId?: string | null },
): void {
  if (!enabled) return
  Sentry.withScope((scope) => {
    if (context.gymId) scope.setTag('gymId', context.gymId)
    if (context.url) scope.setTag('url', context.url)
    if (context.method) scope.setTag('method', context.method)
    Sentry.captureException(error)
  })
}
