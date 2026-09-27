import { FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import { authenticateMedia } from '../../middlewares/auth.middleware'
import { prisma } from '../../lib/prisma'
import { safeResolvePath } from '../../lib/safe-path'

// Archivos subidos (sin prefijo /api): avatares, logos de gym y assets de plataforma
export async function mediaRoutes(app: FastifyInstance) {
  const serveDirFile = (dir: string) => async (request: any, reply: any) => {
    const { filename } = request.params as any
    const baseDir = path.resolve(process.cwd(), 'uploads', dir)
    const filepath = safeResolvePath(baseDir, filename)
    if (!filepath) return reply.status(400).send({ error: 'Nombre de archivo inválido' })
    if (!fs.existsSync(filepath)) return reply.status(404).send({ error: 'Archivo no encontrado' })
    const ext = path.extname(filename).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
      '.html': 'text/html',
    }
    reply.header('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    return reply.send(fs.createReadStream(filepath))
  }

  // Avatares (avatar_<userId>.<ext>): el propio, los de usuarios del gym del token, o todos para SUPER_ADMIN
  async function requireAvatarOfSameGym(request: any, reply: any) {
    const user = request.user as { userId: string; gymId: string | null; role: string }
    if (user.role === 'SUPER_ADMIN') return
    const match = /^avatar_([0-9a-f-]+)\.[a-z]+$/i.exec((request.params as any).filename ?? '')
    if (!match) return reply.status(404).send({ error: 'Archivo no encontrado' })
    if (match[1] === user.userId) return // propio (tras switch-sede el gymId del token es otro)
    if (!user.gymId) return reply.status(404).send({ error: 'Archivo no encontrado' })
        const owner = await prisma.user.findFirst({ where: { id: match[1], gymId: user.gymId }, select: { id: true } })
    if (!owner) return reply.status(404).send({ error: 'Archivo no encontrado' })
  }

  app.get('/uploads/avatars/:filename', { preHandler: [authenticateMedia, requireAvatarOfSameGym] }, serveDirFile('avatars'))
  // Assets de plataforma (logos del login, etc.): públicos por diseño, se ven antes de iniciar sesión
  app.get('/uploads/assets/:filename', serveDirFile('assets'))

  // Logos de gym: requieren sesión (superadmin y selector de sedes muestran logos de varios gyms)
  // Comprobantes de transferencia (datos bancarios): solo el alumno dueño de la
  // membresía o ADMIN/SUPER_ADMIN del gym de ese alumno
  const RECEIPT_MIME: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf',
  }
  app.get('/uploads/receipts/:filename', { preHandler: authenticateMedia }, async (request, reply) => {
    const user = request.user as { userId: string; gymId: string | null; role: string }
    const { filename } = request.params as { filename: string }
    const filepath = safeResolvePath(path.resolve(process.cwd(), 'uploads', 'receipts'), filename)
    if (!filepath) return reply.status(400).send({ error: 'Nombre de archivo inválido' })

    const membership = await prisma.membership.findFirst({
      where: { transferReceiptUrl: `/uploads/receipts/${filename}` },
      select: { userId: true, user: { select: { gymId: true } } },
    })
    const isOwner = membership?.userId === user.userId
    const isGymAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role) && !!user.gymId
      && membership?.user.gymId === user.gymId
    if (!membership || !(isOwner || isGymAdmin)) return reply.status(404).send({ error: 'Archivo no encontrado' })

    const mime = RECEIPT_MIME[path.extname(filename).toLowerCase()]
    if (!mime || !fs.existsSync(filepath)) return reply.status(404).send({ error: 'Archivo no encontrado' })
    reply.header('Content-Type', mime)
    reply.header('Cache-Control', 'private, no-store')
    return reply.send(fs.createReadStream(filepath))
  })

  app.get('/uploads/:filename', { preHandler: authenticateMedia }, async (request, reply) => {
    const { filename } = request.params as any
    const baseDir = path.resolve(process.cwd(), 'uploads')
    const filepath = safeResolvePath(baseDir, filename)
    if (!filepath) return reply.status(400).send({ error: 'Nombre de archivo inválido' })
    if (!fs.existsSync(filepath)) return reply.status(404).send({ error: 'Archivo no encontrado' })
    const ext = path.extname(filename).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    }
    reply.header('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    return reply.send(fs.createReadStream(filepath))
  })
}
