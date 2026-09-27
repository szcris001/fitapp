import axios, { AxiosRequestConfig } from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const API_BASE = 'http://192.168.100.21:3001'
const API_URL = `${API_BASE}/api`

const api = axios.create({ baseURL: API_URL })

// ── Token de medios ───────────────────────────────────────────────────────────
// login y refresh devuelven `mediaToken`: token de solo lectura para /uploads que va
// en la URL de las imágenes. Se guarda en memoria para armar URLs en el render.
let mediaToken: string | null = null

export async function setMediaToken(token: string | null) {
  mediaToken = token
  if (token) await AsyncStorage.setItem('fitapp_media_token', token)
  else await AsyncStorage.removeItem('fitapp_media_token')
}

export async function loadMediaToken() {
  mediaToken = await AsyncStorage.getItem('fitapp_media_token')
}

// URL absoluta de un archivo subido (avatarUrl, logoUrl…) lista para <Image uri>
export function mediaUrl(path?: string | null): string {
  if (!path) return ''
  // Los assets de plataforma son públicos
  if (!path.startsWith('/uploads/') || path.startsWith('/uploads/assets/') || !mediaToken) return `${API_BASE}${path}`
  return `${API_BASE}${path}${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(mediaToken)}`
}

// ── Request interceptor: adjunta el access token a cada petición ──────────────
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('fitapp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor: renueva el access token ante un 401 ────────────────
//
// Importamos el store de forma diferida (lazy) para evitar dependencia circular
// en el momento del módulo (api.ts ← auth.store.ts ← api.ts).
//
// Marcador interno para detectar que la petición fallida ya es un reintento,
// evitando bucles infinitos.
interface RetryConfig extends AxiosRequestConfig {
  _retry?: boolean
}

api.interceptors.response.use(
  async (response) => {
    if (response.data?.mediaToken) await setMediaToken(response.data.mediaToken)
    return response
  },
  async (error) => {
    const originalConfig: RetryConfig = error.config ?? {}

    // Solo actuar ante 401 que no venga de /auth/refresh ni sea ya un reintento
    const isRefreshEndpoint =
      typeof originalConfig.url === 'string' &&
      originalConfig.url.includes('/auth/refresh')

    if (
      error.response?.status === 401 &&
      !originalConfig._retry &&
      !isRefreshEndpoint
    ) {
      originalConfig._retry = true

      try {
        // Importación diferida del store para evitar dependencia circular
        const { useAuthStore } = await import('../store/auth.store')
        const { refreshToken, setTokens, logout } = useAuthStore.getState()

        if (!refreshToken) {
          // No hay refresh token — forzar logout directamente
          await logout()
          return Promise.reject(error)
        }

        // Solicitar nuevos tokens al backend
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        })

        const newToken: string = data.token
        const newRefreshToken: string = data.refreshToken
        if (data.mediaToken) await setMediaToken(data.mediaToken)

        // Persistir en store y AsyncStorage
        await setTokens(newToken, newRefreshToken)

        // Reintentar la petición original con el nuevo access token
        originalConfig.headers = {
          ...(originalConfig.headers ?? {}),
          Authorization: `Bearer ${newToken}`,
        }
        return api(originalConfig)
      } catch {
        // La renovación falló — hacer logout y propagar el error original
        const { useAuthStore } = await import('../store/auth.store')
        await useAuthStore.getState().logout()
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  },
)

export default api
