/**
 * CFG — Configuración del gym. Casos en docs/TESTING_STRATEGY.md §4.
 *
 * Otros specs leen la configuración de qa-box-norte: aquí solo se tocan campos inocuos
 * (teléfono, dirección, logo) y se restauran en `finally`.
 */
import { test, expect, type Page } from '@playwright/test'
import { writeFileSync } from 'fs'
import { crc32, deflateSync } from 'zlib'
import { api, API_URL, authFile, open } from '../support/qa'

/** PNG válido de size×size (rojo), generado en el test */
function png(size: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2 // 8 bits, RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, Buffer.from([220, 38, 38]))])
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Los <label> del formulario no tienen htmlFor: el input es el hermano siguiente */
const field = (page: Page, label: string) =>
  page.locator('label', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::input[1]')

async function openPerfil(page: Page) {
  const p = await open(page, '/dashboard/settings')
  await expect(page.getByRole('heading', { name: 'Ajustes del box' })).toBeVisible()
  await expect(page.getByText('Datos del centro')).toBeVisible()
  return p
}

test.describe('CFG — admin Norte', () => {
  test('CFG-01 editar datos del gym (teléfono y dirección) → persiste y no pisa las ventanas de reserva', async ({ page }) => {
    const before = (await api('admin', 'GET', '/gyms/me')).data
    const stamp = Date.now().toString().slice(-6)
    const phone = `+56 9 5555 ${stamp.slice(0, 4)}`
    const address = `Av. QA E2E ${stamp}`
    try {
      const p = await openPerfil(page)
      await field(page, 'Teléfono').fill(phone)
      await field(page, 'Dirección').fill(address)
      await page.getByRole('button', { name: 'Guardar perfil' }).click()
      await expect(page.getByText('Configuración guardada correctamente')).toBeVisible()

      // Persiste tras recargar
      await page.reload()
      await expect(page.getByText('Datos del centro')).toBeVisible()
      await expect(field(page, 'Teléfono')).toHaveValue(phone)
      await expect(field(page, 'Dirección')).toHaveValue(address)

      // Y en la API, sin cambiar nombre ni ventanas de reserva
      const after = (await api('admin', 'GET', '/gyms/me')).data
      expect(after.phone).toBe(phone)
      expect(after.address).toBe(address)
      expect(after.name).toBe(before.name)
      expect(after.bookingWindowDays).toBe(before.bookingWindowDays)
      expect(after.bookingCutoffMins).toBe(before.bookingCutoffMins)
      expect(after.cancelCutoffMins).toBe(before.cancelCutoffMins)
      p.expectNoErrors()
    } finally {
      await api('admin', 'PUT', '/gyms/me', { phone: before.phone ?? '', address: before.address ?? '' })
    }
  })

  // BUG: el formulario envía `phone: form.phone || undefined`, así que un campo vaciado
  // no se manda y el valor anterior queda guardado (settings/page.tsx handleSubmit).
  test('CFG-05 vaciar el teléfono desde la UI → queda vacío', async ({ page }) => {
    const before = (await api('admin', 'GET', '/gyms/me')).data
    try {
      await api('admin', 'PUT', '/gyms/me', { phone: '+56 2 2222 0000' })
      await openPerfil(page)
      await expect(field(page, 'Teléfono')).toHaveValue('+56 2 2222 0000')
      await field(page, 'Teléfono').fill('')
      await page.getByRole('button', { name: 'Guardar perfil' }).click()
      await expect(page.getByText('Configuración guardada correctamente')).toBeVisible()
      await page.reload()
      await expect(page.getByText('Datos del centro')).toBeVisible()
      await expect(field(page, 'Teléfono')).toHaveValue('')
      expect((await api('admin', 'GET', '/gyms/me')).data.phone || '').toBe('')
    } finally {
      await api('admin', 'PUT', '/gyms/me', { phone: before.phone ?? '' })
    }
  })

  test('CFG-02 logo: subir un PNG y verlo en la configuración', async ({ page }, testInfo) => {
    const file = testInfo.outputPath('logo-qa.png')
    writeFileSync(file, png(4))

    const p = await openPerfil(page)
    await page.locator('input[type="file"][accept*="image/png"]').first().setInputFiles(file)
    await expect(page.getByText('Logo actualizado correctamente')).toBeVisible()

    const logoUrl = (await api('admin', 'GET', '/gyms/me')).data.logoUrl as string
    expect(logoUrl).toMatch(/^\/uploads\/logo_[0-9a-f-]+\.png$/)

    // Tras recargar, la imagen se ve (carga con el token de medios, no queda rota)
    await page.reload()
    const img = page.locator('main').getByRole('img', { name: 'Logo', exact: true })
    await expect(img).toBeVisible()
    await expect(img).toHaveAttribute('src', /[?&]t=/)
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(4)
    p.expectNoErrors()
  })

  // BUG: el logo se guarda siempre como logo_<gymId>.<ext> y la web no agrega un
  // cache-buster: al reemplazarlo por otro PNG la URL no cambia y la vista previa
  // sigue mostrando el logo anterior hasta recargar (settings/page.tsx handleLogoUpload).
  test('CFG-07 reemplazar el logo actualiza la vista previa sin recargar', async ({ page }, testInfo) => {
    const first = testInfo.outputPath('logo-a.png')
    const second = testInfo.outputPath('logo-b.png')
    writeFileSync(first, png(4))
    writeFileSync(second, png(6))

    await openPerfil(page)
    const input = page.locator('input[type="file"][accept*="image/png"]').first()
    const img = page.locator('main').getByRole('img', { name: 'Logo', exact: true })
    await input.setInputFiles(first)
    await expect(page.getByText('Logo actualizado correctamente')).toBeVisible()
    await page.reload()
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(4)

    await page.locator('input[type="file"][accept*="image/png"]').first().setInputFiles(second)
    await expect(page.getByText('Logo actualizado correctamente')).toBeVisible()
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(6)
  })
})

test.describe('CFG — pasarelas (admin Sur, para no tocar Norte)', () => {
  test.use({ storageState: authFile('adminSur') })

  // BUG: GET /gyms/me no devuelve `paymentGateways` (gyms.service.ts getGym select), así que
  // la sección Pagos siempre muestra todas las pasarelas desactivadas y, al guardar, el
  // PUT manda el formulario completo y sobrescribe (borra) las credenciales guardadas.
  test('CFG-06 la sección Pagos muestra las pasarelas que el gym tiene activas', async ({ page }) => {
    // qa-box-sur no tiene pasarelas en el seed: se restaura a {}
    try {
      const put = await api('adminSur', 'PUT', '/gyms/me', {
        paymentGateways: { flow: { enabled: true, apiKey: 'qa-flow-key', secretKey: 'qa-flow-secret', sandbox: true } },
      })
      expect(put.status).toBe(200)

      await open(page, '/dashboard/settings')
      await page.locator('main').getByRole('button', { name: 'Pagos', exact: true }).click()
      await expect(page.getByText('Pasarelas de pago')).toBeVisible()
      const flowRow = page.locator('div', { has: page.getByText('Flow Chile', { exact: true }) }).last()
      await expect(flowRow.getByText('Activo', { exact: true })).toBeVisible()
    } finally {
      await api('adminSur', 'PUT', '/gyms/me', { paymentGateways: {} })
    }
  })
})
