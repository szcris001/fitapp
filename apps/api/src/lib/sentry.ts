// apps/api/src/lib/sentry.ts
//
// Inicialización de Sentry para la API Fastify.
//
// SETUP REQUERIDO antes de habilitar:
//   1. Crear proyecto en https://sentry.io (tipo: Node.js)
//   2. Copiar el DSN y guardarlo en SENTRY_DSN (Railway/Render/VPS) + GitHub Secrets
//   3. Instalar la dependencia: pnpm --filter @fitapp/api add @sentry/node
//   4. Descomentar el bloque de código de abajo
//   5. Llamar initSentry() al inicio de apps/api/src/index.ts (antes de Fastify)
//   6. Llamar sentryErrorHandler(app) después de registrar todas las rutas
//
// Documentación: https://docs.sentry.io/platforms/node/

// import * as Sentry from '@sentry/node'

export function initSentry(): void {
  if (!process.env.SENTRY_DSN) {
    // Sin DSN configurado, Sentry no se inicializa.
    // En desarrollo esto es el comportamiento esperado.
    return
  }

  // Descomentar cuando @sentry/node esté instalado:
  //
  // Sentry.init({
  //   dsn: process.env.SENTRY_DSN,
  //   environment: process.env.NODE_ENV ?? 'development',
  //   tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  //   // Taggear todos los errores con el release para correlacionar con deploys
  //   release: process.env.GIT_COMMIT_SHA ?? 'local',
  //   beforeSend(event) {
  //     // No enviar errores de health checks
  //     if (event.request?.url?.includes('/health')) return null
  //     return event
  //   },
  // })
  //
  // console.log('[sentry] Inicializado con DSN configurado')
}

// Middleware para capturar errores no manejados en Fastify.
// Usar después de registrar todas las rutas:
//   sentryErrorHandler(app)
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sentryErrorHandler(_app: any): void {
  // Descomentar cuando @sentry/node esté instalado:
  //
  // app.setErrorHandler((error, request, reply) => {
  //   Sentry.withScope((scope) => {
  //     // Taggear por gymId para filtrar errores por tenant en el dashboard
  //     const gymId = (request.user as any)?.gymId
  //     if (gymId) scope.setTag('gymId', gymId)
  //     scope.setTag('url', request.url)
  //     scope.setTag('method', request.method)
  //     Sentry.captureException(error)
  //   })
  //   reply.status(error.statusCode ?? 500).send({
  //     error: error.message ?? 'Internal Server Error',
  //   })
  // })
}

// Helper para capturar excepciones manualmente desde cualquier módulo.
// Incluye gymId para correlacionar errores con el tenant correcto.
export function captureException(error: unknown, gymId?: string): void {
  if (!process.env.SENTRY_DSN) return

  // Descomentar cuando @sentry/node esté instalado:
  //
  // Sentry.withScope((scope) => {
  //   if (gymId) scope.setTag('gymId', gymId)
  //   Sentry.captureException(error)
  // })
  void gymId
  void error
}
