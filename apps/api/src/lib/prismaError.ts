import { Prisma } from '../generated/prisma'

const FIELD_LABELS: Record<string, string> = {
  email: 'El email',
  slug: 'El slug',
  phone: 'El teléfono',
  name: 'El nombre',
}

/**
 * Convierte un error de Prisma en un mensaje legible en español.
 * Si no es un error de Prisma conocido, retorna null para que el
 * caller lance su propio mensaje.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prismaErrorMessage(err: any): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        // Unique constraint — extraer el campo desde meta.target
        const target = (err.meta?.target as string[] | string | undefined)
        const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : []
        const fieldLabel = fields.map((f: string) => FIELD_LABELS[f] ?? `El campo "${f}"`).join(' y ')
        return `${fieldLabel || 'Un valor'} ya está registrado en el sistema`
      }
      case 'P2025':
        return 'El registro no existe o ya fue eliminado'
      case 'P2003':
        return 'No se puede realizar la operación porque existe una referencia relacionada'
      case 'P2014':
        return 'La operación violaría una restricción de relación'
      case 'P2016':
        return 'Registro no encontrado'
      default:
        return `Error de base de datos (${err.code})`
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return 'Datos inválidos enviados a la base de datos'
  }
  return null
}

/** Lanza un Error con mensaje legible, útil en servicios */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handlePrismaError(err: any): never {
  const msg = prismaErrorMessage(err)
  if (msg) throw new Error(msg)
  throw err
}
