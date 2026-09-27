/**
 * Cliente HTTP mínimo para el setup de tests E2E.
 * Se usa en globalSetup (fuera del browser context), donde Axios no está disponible.
 */
export const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3001/api'

export async function apiPost<T = any>(
  path: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`POST ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export async function apiGet<T = any>(
  path: string,
  token: string,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GET ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}
