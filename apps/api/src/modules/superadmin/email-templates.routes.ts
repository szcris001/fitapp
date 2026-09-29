import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireSuperAdmin } from '../../middlewares/auth.middleware'
import { sendBulkToGyms } from '../../lib/email'

const SYSTEM_TEMPLATES = [
  {
    slug: 'subscription_expiry',
    name: 'Vencimiento de suscripción FitApp',
    description: 'Se envía automáticamente al admin del gimnasio cuando su plan FitApp está por vencer.',
    subject: '⚠️ Tu suscripción FitApp vence en {{dias}} días — {{gimnasio}}',
    body: 'Hola {{gimnasio}},\n\nTu suscripción al plan {{plan}} vence el {{fecha}}.\n\nRenueva para seguir usando FitApp sin interrupciones.\n\nSaludos,\nEl equipo de FitApp',
    placeholders: ['{{gimnasio}}', '{{plan}}', '{{dias}}', '{{fecha}}'],
    isSystem: true,
  },
  {
    slug: 'promo',
    name: 'Correo promocional / Anuncio',
    description: 'Plantilla base para envíos manuales a todos los gimnasios activos.',
    subject: '🚀 Novedad en FitApp para {{gimnasio}}',
    body: 'Hola {{gimnasio}},\n\nTenemos una novedad para ti...',
    placeholders: ['{{gimnasio}}', '{{nombre}}'],
    isSystem: true,
  },
]

export async function ensureSystemTemplates() {
  for (const tpl of SYSTEM_TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where: { slug: tpl.slug },
      create: tpl,
      update: {},
    })
  }
}

const templateSchema = z.object({
  name:         z.string().min(1),
  description:  z.string().optional().nullable(),
  subject:      z.string().min(1),
  body:         z.string().min(1),
  placeholders: z.array(z.string()).optional(),
  isActive:     z.boolean().optional(),
})

export async function emailTemplateRoutes(app: FastifyInstance) {
  // GET — listar todas las plantillas
  app.get('/superadmin/email-templates', { preHandler: requireSuperAdmin }, async (_req, reply) => {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    })
    return reply.send(templates)
  })

  // POST — crear nueva plantilla
  app.post('/superadmin/email-templates', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const parsed = templateSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })

    const { name, description, subject, body, placeholders, isActive } = parsed.data
    const slug = `custom_${Date.now()}`

    const template = await prisma.emailTemplate.create({
      data: { name, description, subject, body, placeholders: placeholders ?? [], isActive: isActive ?? true, slug },
    })
    return reply.status(201).send(template)
  })

  // PATCH — actualizar plantilla
  app.patch('/superadmin/email-templates/:id', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const parsed = templateSchema.partial().safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })

    const template = await prisma.emailTemplate.findUnique({ where: { id } })
    if (!template) return reply.status(404).send({ error: 'Plantilla no encontrada' })

    const updated = await prisma.emailTemplate.update({
      where: { id },
      data: parsed.data,
    })
    return reply.send(updated)
  })

  // DELETE — solo plantillas no-sistema
  app.delete('/superadmin/email-templates/:id', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const template = await prisma.emailTemplate.findUnique({ where: { id } })
    if (!template) return reply.status(404).send({ error: 'Plantilla no encontrada' })
    if (template.isSystem) return reply.status(400).send({ error: 'No se puede eliminar una plantilla del sistema' })

    await prisma.emailTemplate.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // GET — lista de gimnasios para selección manual (id, name, status, plan)
  app.get('/superadmin/email-templates/gyms', { preHandler: requireSuperAdmin }, async (_req, reply) => {
    const gyms = await prisma.gym.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, status: true, subscriptionPlan: true },
      orderBy: { name: 'asc' },
    })
    return reply.send(gyms)
  })

  // POST — enviar plantilla con filtros opcionales
  app.post('/superadmin/email-templates/:id/send', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const template = await prisma.emailTemplate.findUnique({ where: { id } })
    if (!template) return reply.status(404).send({ error: 'Plantilla no encontrada' })
    if (!template.isActive) return reply.status(400).send({ error: 'Plantilla inactiva' })

    const filtersSchema = z.object({
      status:           z.array(z.string()).optional(),
      subscriptionPlan: z.array(z.string()).optional(),
      gymIds:           z.array(z.string()).optional(),
    }).optional()

    const parsed = filtersSchema.safeParse((request.body as any)?.filters)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })

    const result = await sendBulkToGyms({
      subject: template.subject,
      body:    template.body,
      filters: parsed.data,
    })
    return reply.send(result)
  })
}
