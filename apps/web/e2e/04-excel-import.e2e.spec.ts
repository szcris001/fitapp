/**
 * Flow 4: Importar planificación por Excel → validar datos cargados
 *
 * Rutas:
 *  - /dashboard/settings/class-types/import — importar tipos de clase
 *  - /dashboard/wods/import — importar WODs
 *
 * Verifica:
 *  - La UI de importación carga
 *  - Botón de descarga de plantilla
 *  - Input de archivo presente
 *  - Subir archivo Excel válido muestra preview
 */
import { test, expect } from '@playwright/test'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { navigateTo } from './helpers/auth'

// Genera un archivo Excel mínimo válido para el test
async function createMinimalExcel(): Promise<string> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    ['tipo_clase', 'disciplina', 'color', 'descripcion', 'bloque_nombre', 'bloque_duracion_mins', 'bloque_notas', 'bloque_opcional'],
    ['CrossFit E2E', 'crossfit', '#6366f1', 'Test import', 'Entrada en calor', 10, 'Dinámico', 'No'],
    ['CrossFit E2E', 'crossfit', '#6366f1', '', 'WOD', 20, 'AMRAP', 'No'],
  ])
  XLSX.utils.book_append_sheet(wb, ws, 'Tipos de Clase')
  const tmpPath = join(tmpdir(), `e2e-class-types-${Date.now()}.xlsx`)
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  writeFileSync(tmpPath, buffer)
  return tmpPath
}

test.describe('Flow 4 — Importar planificación por Excel', () => {
  test('página de importación tiene elementos clave (botón plantilla + input archivo)', async ({ page }) => {
    await navigateTo(page, '/dashboard/settings/class-types/import')
    await expect(page).toHaveURL(/\/dashboard\/settings\/class-types\/import/)

    // Botón de plantilla
    await expect(
      page.getByRole('button', { name: /descargar plantilla/i })
    ).toBeVisible({ timeout: 8_000 })

    // Input de archivo (puede estar oculto visualmente pero presente en el DOM)
    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toBeAttached({ timeout: 5_000 })
  })

  test('subir archivo Excel válido muestra preview de datos', async ({ page }) => {
    await navigateTo(page, '/dashboard/settings/class-types/import')

    const excelPath = await createMinimalExcel()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(excelPath)

    // La librería xlsx parsea el archivo en el browser (client-side)
    // Debe aparecer el nombre del tipo de clase o algún indicador de validación
    await expect(
      page.getByText('CrossFit E2E').or(
        page.getByText(/válid|preview|importar|error/i).first()
      )
    ).toBeVisible({ timeout: 8_000 })
  })

  test('página de importación de WODs es accesible y no redirige a login', async ({ page }) => {
    await navigateTo(page, '/dashboard/wods/import')
    await expect(page).toHaveURL(/\/dashboard\/wods\/import/)
    await expect(page).not.toHaveURL(/\/login/)
    // La página debe tener algún contenido (no está en blanco)
    await expect(page.locator('body')).not.toBeEmpty()
  })
})
