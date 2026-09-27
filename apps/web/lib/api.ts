import axios, { AxiosRequestConfig } from 'axios'

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/\/api$/, '')

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
})

// ── Request interceptor: adjunta el token JWT a cada petición ──────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('fitapp_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Estado interno del interceptor de refresh ──────────────────────────────
// Evita lanzar N peticiones de refresh si hay múltiples 401 simultáneos.
// Todas las peticiones que fallen con 401 quedan en cola hasta que el refresh
// resuelva (o rechace), y entonces se reintentán o abortan juntas.

let isRefreshing = false
let pendingQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

function drainQueue(token: string) {
  pendingQueue.forEach((p) => p.resolve(token))
  pendingQueue = []
}

function rejectQueue(err: unknown) {
  pendingQueue.forEach((p) => p.reject(err))
  pendingQueue = []
}

function doLogout() {
  localStorage.removeItem('fitapp_token')
  localStorage.removeItem('fitapp_refresh_token')
  localStorage.removeItem('fitapp_user')
  localStorage.removeItem('fitapp_colors')
  // Actualizar el store de Zustand sin importarlo directamente (evita ciclo de
  // dependencia store → api → store). El store se re-hidrata al navegar a /login.
  window.location.href = '/login'
}

// ── Response interceptor: maneja 401 con refresh token ────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

    // Solo actuar sobre errores 401 en el cliente
    if (
      typeof window === 'undefined' ||
      error.response?.status !== 401
    ) {
      return Promise.reject(error)
    }

    // Si el 401 viene de la propia llamada a /auth/refresh, no reintentar:
    // el refresh token está vencido/inválido → logout inmediato.
    if (originalRequest.url?.includes('/auth/refresh')) {
      doLogout()
      return Promise.reject(error)
    }

    // Si ya estamos en la página de login o superadmin, no redirigir en bucle
    if (
      window.location.pathname.startsWith('/login') ||
      window.location.pathname.startsWith('/superadmin')
    ) {
      return Promise.reject(error)
    }

    // Evitar doble retry sobre la misma request
    if (originalRequest._retry) {
      doLogout()
      return Promise.reject(error)
    }

    const refreshToken = localStorage.getItem('fitapp_refresh_token')

    // Sin refresh token → logout directo
    if (!refreshToken) {
      doLogout()
      return Promise.reject(error)
    }

    // Si ya hay un refresh en vuelo, encolar esta request y esperar
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        pendingQueue.push({ resolve, reject })
      }).then((newToken) => {
        originalRequest._retry = true
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        } else {
          originalRequest.headers = { Authorization: `Bearer ${newToken}` }
        }
        return api(originalRequest)
      })
    }

    // Iniciar el refresh
    isRefreshing = true
    originalRequest._retry = true

    try {
      const { data } = await api.post('/auth/refresh', { refreshToken })

      const newToken: string = data.token
      const newRefreshToken: string | undefined = data.refreshToken

      // Persistir los nuevos tokens
      localStorage.setItem('fitapp_token', newToken)
      if (newRefreshToken) {
        localStorage.setItem('fitapp_refresh_token', newRefreshToken)
      }

      // También actualizar el store de Zustand en memoria si está disponible.
      // Se hace de forma lazy para no crear ciclos de importación en el momento
      // de evaluar el módulo.
      try {
        const { useAuthStore } = await import('../store/auth.store')
        const state = useAuthStore.getState()
        state.setAuth(newToken, newRefreshToken ?? null, state.user!)
      } catch {
        // Si el store no está disponible, los localStorage ya están actualizados
        // y el request interceptor leerá el nuevo token en el retry.
      }

      drainQueue(newToken)

      // Reintentar la request original con el nuevo token
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`
      } else {
        originalRequest.headers = { Authorization: `Bearer ${newToken}` }
      }
      return api(originalRequest)
    } catch (refreshError) {
      rejectQueue(refreshError)
      doLogout()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default api
