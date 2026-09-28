import Redis from 'ioredis'
import { logger } from './logger'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,          // no lanza error al arrancar si Redis no está disponible
  enableOfflineQueue: false,  // falla rápido en lugar de acumular comandos
})

redis.on('error', (err) => {
  // Solo loggear — no queremos que un Redis caído tire abajo la API
  logger.error({ err }, '[Redis] error de conexión')
})
