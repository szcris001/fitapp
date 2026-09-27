import { FastifyInstance, FastifyRequest } from 'fastify'
import { MultipartFile } from '@fastify/multipart'
import { requireSuperAdmin } from '../../middlewares/auth.middleware'
import { prisma } from '../../lib/prisma'
import path from 'path'
import fs from 'fs'

// Slots configurables — cada uno describe dónde se usa y el tamaño recomendado
export const ASSET_SLOTS = [
  // ── Logos ──
  // ── Web logos ──
  { group: 'web', key: 'platform_logo', label: '🖼 Logo web — menú lateral', page: 'Web: menú lateral del dashboard (todas las páginas internas)', width: 0, height: 0, note: 'Logo estático que aparece en el menú lateral del dashboard web. Formatos: SVG (recomendado), PNG o WebP con fondo transparente.' },
  { group: 'web', key: 'login_logo_animated', label: '✨ Logo web — animado en login', page: 'Web: pantalla de login (reemplaza al logo del menú)', width: 0, height: 0, note: 'Animación que se muestra únicamente en el login del dashboard web. Si no se sube, el login web usa el logo del menú lateral. Solo se aceptan archivos .html con animación CSS.' },

  // ── Mobile logos ──
  { group: 'mobile', key: 'mobile_platform_logo', label: '🖼 Logo móvil — cabecera de la app', page: 'App móvil: cabecera de las pantallas principales', width: 0, height: 0, note: 'Logo estático que aparece en la cabecera de las pantallas internas de la app móvil. Formatos: SVG (recomendado), PNG o WebP con fondo transparente.' },
  { group: 'mobile', key: 'mobile_logo_animated', label: '✨ Logo móvil — animado en login', page: 'App móvil: pantalla de login (reemplaza al logo de cabecera)', width: 0, height: 0, note: 'Animación que se muestra únicamente en el login de la app móvil. Si no se sube, el login usa el logo de cabecera. Solo se aceptan archivos .html con animación CSS.' },

  // ── Web ──
  { group: 'web', key: 'login_bg_1', label: 'Fondo login web — imagen 1', page: 'Web: pantalla de inicio de sesión', width: 1400, height: 900, note: 'Imagen de fondo del login web. Se alterna aleatoriamente con las otras dos. Orientación horizontal 16:9. No afecta a la app móvil.' },
  { group: 'web', key: 'login_bg_2', label: 'Fondo login web — imagen 2', page: 'Web: pantalla de inicio de sesión', width: 1400, height: 900, note: 'Imagen de fondo del login web. Se alterna aleatoriamente con las otras dos. Orientación horizontal 16:9. No afecta a la app móvil.' },
  { group: 'web', key: 'login_bg_3', label: 'Fondo login web — imagen 3', page: 'Web: pantalla de inicio de sesión', width: 1400, height: 900, note: 'Imagen de fondo del login web. Se alterna aleatoriamente con las otras dos. Orientación horizontal 16:9. No afecta a la app móvil.' },
  { group: 'web', key: 'dashboard_bg', label: 'Fondo dashboard web', page: 'Web: todas las páginas internas del panel', width: 1920, height: 1080, note: 'Imagen de fondo que aparece detrás de todas las pantallas internas del dashboard web. Se aplica con overlay semitransparente. Recomendado: imagen oscura. No afecta a la app móvil.' },

  // ── Móvil ──
  { group: 'mobile', key: 'mobile_login_bg_1', label: 'Fondo login móvil — imagen 1', page: 'App móvil: pantalla de inicio de sesión', width: 1080, height: 1920, note: 'Imagen de fondo de la pantalla de login en la app móvil. Se alterna aleatoriamente con las otras dos. Orientación vertical 9:16. No afecta al dashboard web.' },
  { group: 'mobile', key: 'mobile_login_bg_2', label: 'Fondo login móvil — imagen 2', page: 'App móvil: pantalla de inicio de sesión', width: 1080, height: 1920, note: 'Imagen de fondo de la pantalla de login en la app móvil. Se alterna aleatoriamente con las otras dos. Orientación vertical 9:16. No afecta al dashboard web.' },
  { group: 'mobile', key: 'mobile_login_bg_3', label: 'Fondo login móvil — imagen 3', page: 'App móvil: pantalla de inicio de sesión', width: 1080, height: 1920, note: 'Imagen de fondo de la pantalla de login en la app móvil. Se alterna aleatoriamente con las otras dos. Orientación vertical 9:16. No afecta al dashboard web.' },
  { group: 'mobile', key: 'mobile_dashboard_bg', label: 'Fondo dashboard móvil', page: 'App móvil: pantalla principal (home)', width: 1080, height: 1920, note: 'Imagen de fondo de la pantalla principal de la app móvil. Se aplica con overlay semitransparente. Orientación vertical 9:16. No afecta al dashboard web.' },
]

const MAX_BYTES = 3 * 1024 * 1024 // 3 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'text/html']

export async function platformAssetsRoutes(app: FastifyInstance) {
  const uploadsDir = path.join(process.cwd(), 'uploads', 'assets')
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

  // ── Público: lista de assets activos (usado por el login y otras páginas) ──
  app.get('/platform/assets', async (_req, reply) => {
    const assets = await prisma.platformAsset.findMany()
    const map: Record<string, string> = {}
    for (const a of assets) map[a.key] = `${a.url}?v=${new Date(a.updatedAt).getTime()}`

    // Complementar con archivos en disco que no tienen registro en DB
    const EXTS = ['.png', '.webp', '.svg', '.jpg', '.jpeg', '.html']
    for (const slot of ASSET_SLOTS) {
      if (map[slot.key]) continue
      for (const ext of EXTS) {
        const fp = path.join(uploadsDir, `${slot.key}${ext}`)
        if (fs.existsSync(fp)) {
          const stat = fs.statSync(fp)
          map[slot.key] = `/uploads/assets/${slot.key}${ext}?v=${stat.mtimeMs}`
          break
        }
      }
    }

    return reply.send({ assets: map, slots: ASSET_SLOTS })
  })

  // ── Super admin: listar con metadata completa ──
  app.get('/superadmin/config/assets', { preHandler: requireSuperAdmin }, async (_req, reply) => {
    const assets = await prisma.platformAsset.findMany()
    const map: Record<string, any> = {}
    for (const a of assets) map[a.key] = a
    return reply.send({ slots: ASSET_SLOTS, assets: map })
  })

  // ── Super admin: subir / reemplazar imagen de un slot ──
  app.post('/superadmin/config/assets/:key', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply) => {
    const { key } = request.params as any
    const slot = ASSET_SLOTS.find(s => s.key === key)
    if (!slot) return reply.status(400).send({ error: 'Slot no válido' })

    const data = await (request as any).file() as MultipartFile | undefined
    if (!data) return reply.status(400).send({ error: 'No se recibió archivo' })
    const baseMime = data.mimetype.split(';')[0].trim()
    if (!ALLOWED_MIME.includes(baseMime)) return reply.status(400).send({ error: 'Formato no permitido' })
    const HTML_SLOTS = ['login_logo_animated', 'mobile_logo_animated', 'platform_logo', 'mobile_platform_logo']
    if (baseMime === 'text/html' && !HTML_SLOTS.includes(key)) return reply.status(400).send({ error: 'HTML solo permitido en slots de logo animado' })

    // Leer buffer para verificar tamaño
    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)
    if (buffer.length > MAX_BYTES) return reply.status(400).send({ error: `La imagen supera los 3 MB (${(buffer.length / 1024 / 1024).toFixed(1)} MB)` })

    // Guardar archivo
    const ext = path.extname(data.filename) || (baseMime === 'image/png' ? '.png' : baseMime === 'image/webp' ? '.webp' : baseMime === 'image/svg+xml' ? '.svg' : baseMime === 'text/html' ? '.html' : '.jpg')
    const filename = `${key}${ext}`
    const filepath = path.join(uploadsDir, filename)

    // Eliminar versión anterior si tiene extensión distinta
    for (const e of ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.html']) {
      const old = path.join(uploadsDir, `${key}${e}`)
      if (old !== filepath && fs.existsSync(old)) fs.unlinkSync(old)
    }

    // Normalizar HTML animado: quitar fondo, padding, border-radius del SVG y expandir viewBox
    let finalBuffer = buffer
    if (baseMime === 'text/html') {
      let html = buffer.toString('utf8')
      // Inyectar reset de fondo si no existe
      if (!html.includes('html,body') && !html.includes('html, body')) {
        html = '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style>\n' + html
      }
      // Limpiar style del elemento SVG raíz
      html = html.replace(/<svg([^>]*?)style="([^"]*)"/, (_m, attrs, style) => {
        style = style
          .replace(/background\s*:\s*[^;]+;?/gi, '')
          .replace(/padding\s*:\s*[^;]+;?/gi, '')
          .replace(/border-radius\s*:\s*[^;]+;?/gi, '')
          .trim()
        return `<svg${attrs}style="width:100%;background:transparent;display:block;overflow:visible;${style}"`
      })
      // Expandir viewBox para dar margen al contenido (evita letras cortadas)
      html = html.replace(/viewBox="(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]*)"/,
        (_m, x, y, w, h) => {
          const m = 14
          return `viewBox="${+x - m} ${+y - m} ${+w + m * 2} ${+h + m * 2}"`
        }
      )
      finalBuffer = Buffer.from(html, 'utf8')
    }

    // Para SVG: eliminar atributo style del elemento raíz (evita fondos hardcodeados)
    if (baseMime === 'image/svg+xml') {
      const svgStr = buffer.toString('utf8').replace(/<svg([^>]*)\sstyle="[^"]*"/, '<svg$1')
      finalBuffer = Buffer.from(svgStr, 'utf8')
    }

    fs.writeFileSync(filepath, finalBuffer)
    const url = `/uploads/assets/${filename}`

    const asset = await prisma.platformAsset.upsert({
      where: { key },
      create: { key, url, filename, sizeBytes: finalBuffer.length, mimeType: data.mimetype },
      update: { url, filename, sizeBytes: finalBuffer.length, mimeType: data.mimetype },
    })

    return reply.send(asset)
  })

  // ── Super admin: eliminar asset (vuelve al default) ──
  app.delete('/superadmin/config/assets/:key', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { key } = request.params as any
    const asset = await prisma.platformAsset.findUnique({ where: { key } })
    if (!asset) return reply.status(404).send({ error: 'Asset no encontrado' })

    const filepath = path.join(uploadsDir, asset.filename)
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath)
    await prisma.platformAsset.delete({ where: { key } })
    return reply.send({ ok: true })
  })
}
