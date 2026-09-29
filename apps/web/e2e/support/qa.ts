/**
 * Datos del entorno QA (qa/fixtures.json) y utilidades comunes de la suite.
 * El seed (`pnpm seed:qa` en apps/api) crea exactamente estos datos.
 */
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { expect, type Page } from '@playwright/test'

type QaUser = { name: string; email: string; role: string; gender?: string; rut?: string }
type QaGym = {
  name: string
  slug: string
  users: Record<string, QaUser>
  plans: Record<string, { name: string; priceCents: number }>
}
type QaFixtures = { password: string; superadmin: QaUser; gyms: { norte: QaGym; sur: QaGym } }

export const QA: QaFixtures = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../qa/fixtures.json'), 'utf-8'),
)

export const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3001/api'

/** Sesiones que prepara auth.setup.ts (una por rol que usan los tests) */
export const ROLES = {
  admin:      { gym: QA.gyms.norte, user: QA.gyms.norte.users.admin },
  coach:      { gym: QA.gyms.norte, user: QA.gyms.norte.users.coach },
  member:     { gym: QA.gyms.norte, user: QA.gyms.norte.users.member },
  adminSur:   { gym: QA.gyms.sur,   user: QA.gyms.sur.users.admin },
  superadmin: { gym: null,          user: QA.superadmin },
} as const
export type Role = keyof typeof ROLES

export const authFile = (role: Role) => `playwright/.auth/${role}.json`

/** Formato CLP como lo muestra la web: $35.000 */
export const clp = (pesos: number) => `$${pesos.toLocaleString('es-CL')}`

// ─── API (preparar o verificar datos sin pasar por la UI) ─────────────────────

const tokenCache = new Map<Role, string>()

/** Segundos que le quedan a un JWT (sin verificar firma: solo para decidir si reusarlo) */
export function secondsLeft(jwt: string): number {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
    return payload.exp - Date.now() / 1000
  } catch {
    return 0
  }
}

/** Token guardado por auth.setup.ts si todavía le quedan al menos 2 minutos */
function storedToken(role: Role): string | null {
  const file = authFile(role)
  if (!existsSync(file)) return null
  const state = JSON.parse(readFileSync(file, 'utf-8'))
  const token = state.origins?.[0]?.localStorage?.find((i: { name: string }) => i.name === 'fitapp_token')?.value
  return token && secondsLeft(token) > 120 ? token : null
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** fetch que reintenta ante 429 respetando Retry-After (rate limit de la API) */
export async function fetchRetry429(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init)
    if (res.status !== 429 || attempt >= 6) return res
    await sleep((Number(res.headers.get('retry-after')) || 5) * 1000)
  }
}

export async function login(role: Role): Promise<{ token: string; refreshToken: string; mediaToken?: string; user: unknown }> {
  const { gym, user } = ROLES[role]
  const res = await fetchRetry429(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: QA.password, ...(gym ? { gymSlug: gym.slug } : {}) }),
  })
  if (!res.ok) throw new Error(`login ${role} → ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function api<T = any>(role: Role, method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  let token = tokenCache.get(role) ?? storedToken(role) ?? undefined
  if (!token) {
    token = (await login(role)).token
    tokenCache.set(role, token)
  }
  const res = await fetchRetry429(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: any = text
  try { data = JSON.parse(text) } catch { /* texto plano */ }
  return { status: res.status, data }
}

// ─── Navegador ────────────────────────────────────────────────────────────────

/**
 * Abre una página del panel y espera a que el layout esté montado. Registra errores
 * de consola y respuestas 5xx para que el test falle si la página los produce.
 */
export async function open(page: Page, path: string) {
  const problems: string[] = []
  page.on('pageerror', err => problems.push(`pageerror: ${err.message}`))
  page.on('response', res => {
    if (res.status() >= 500 && res.url().startsWith(API_URL)) problems.push(`${res.status()} ${res.url()}`)
  })
  await page.goto(path)
  await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  await page.waitForLoadState('networkidle')
  return {
    /** Llamar al final del test: falla si hubo errores de JS o 5xx de la API */
    expectNoErrors: () => expect(problems, problems.join('\n')).toEqual([]),
  }
}
