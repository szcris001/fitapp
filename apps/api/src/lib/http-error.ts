import { FastifyInstance } from 'fastify'

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
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const isProd = process.env.NODE_ENV === 'production'
    const status = error.statusCode ?? 500
    app.log.error({ err: error, status }, error.message)
    reply.status(status).send({
      statusCode: status,
      error: isProd && status >= 500 ? 'Error interno del servidor' : error.message,
      ...(isProd ? {} : { stack: error.stack }),
    })
  })
}
