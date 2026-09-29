/**
 * Proyecto "setup": resiembra el entorno QA y guarda una sesión por rol.
 *
 * La sesión se arma por API (sin UI) y se escribe como storageState con las mismas
 * claves de localStorage que usa la web. El login por UI se prueba en modules/auth.
 * E2E_SKIP_SEED=1 evita resembrar (útil al iterar un solo test). Sin resembrar, una
 * sesión guardada que aún tiene 10+ minutos se reutiliza: el login tiene rate limit
 * (50 cada 15 min en dev) y no conviene gastarlo en cada corrida.
 */
import { test as setup } from '@playwright/test'
import { execSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { ROLES, authFile, login, secondsLeft, type Role } from './support/qa'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

// El seed recrea los usuarios (IDs nuevos): tras resembrar hay que volver a iniciar sesión
let reseeded = false

function sessionStillValid(role: Role): boolean {
  const file = authFile(role)
  if (reseeded || !existsSync(file)) return false
  const state = JSON.parse(readFileSync(file, 'utf-8'))
  const token = state.origins?.[0]?.localStorage?.find((i: { name: string }) => i.name === 'fitapp_token')?.value
  return !!token && secondsLeft(token) > 600
}

setup('resembrar entorno QA', async () => {
  setup.skip(!!process.env.E2E_SKIP_SEED, 'E2E_SKIP_SEED activo')
  execSync('pnpm seed:qa', { cwd: resolve(__dirname, '../../api'), stdio: 'pipe' })
  reseeded = true
})

for (const role of Object.keys(ROLES) as Role[]) {
  setup(`sesión ${role}`, async () => {
    if (sessionStillValid(role)) return
    const data = await login(role)
    const localStorage = [
      { name: 'fitapp_token', value: data.token },
      { name: 'fitapp_refresh_token', value: data.refreshToken },
      { name: 'fitapp_user', value: JSON.stringify(data.user) },
      ...(data.mediaToken ? [{ name: 'fitapp_media_token', value: data.mediaToken }] : []),
    ]
    const file = authFile(role)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ cookies: [], origins: [{ origin: BASE_URL, localStorage }] }, null, 2))
  })
}
