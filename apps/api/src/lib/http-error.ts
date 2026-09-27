import { FastifyInstance } from 'fastify'
import { reportServerError } from './sentry'

/**
 * Error con status HTTP. El error handler global (index.ts) responde con su
 * statusCode: si es < 500 muestra el mensaje; si es 500+ en producción lo oculta.
 * Lanzarlo desde services en vez de devolver `reply.status(500).send(err.message)`.
 */
export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

/** Error handler global: statusCode del error; en producción oculta los mensajes 5xx */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const isProd = process.env.NODE_ENV === 'production'
    const status = error.statusCode ?? 500
    app.log.error({ err: error, status }, error.message)
    if (status >= 500) {
      reportServerError(error, {
        url: request.url, method: request.method, gymId: (request.user as { gymId?: string | null } | undefined)?.gymId,
      })
    }
    reply.status(status).send({
      statusCode: status,
      error: isProd && status >= 500 ? 'Error interno del servidor' : error.message,
      ...(isProd ? {} : { stack: error.stack }),
    })
  })
}
