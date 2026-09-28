import pino from 'pino'
import type { FastifyBaseLogger } from 'fastify'

// Logger compartido: Fastify lo usa como `app.log`/`request.log` y los módulos sin
// request a mano (cron, servicios, envío de correos) lo importan directo.
// Errores: `logger.error({ err }, 'mensaje')` para que pino serialice el stack.
export const logger: FastifyBaseLogger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.VITEST ? 'silent' : 'info'),
})
