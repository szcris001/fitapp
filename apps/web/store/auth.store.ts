import { create } from 'zustand'
import api from '../lib/api'

interface User {
  userId: string
  gymId: string | null
  email: string
  name: string
  role: string
  avatarUrl?: string | null
  mustChangePassword?: boolean
}

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  isLoading: boolean
  login: (gymSlug: string, email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  setAuth: (token: string, refreshToken: string | null, user: User) => void
  loadFromStorage: () => void
  switchSede: (targetGymId: string) => Promise<{ name: string; logoUrl?: string }>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  isLoading: false,

  loadFromStorage: () => {
    if (typeof window === 'undefined') return
    const token = localStorage.getItem('fitapp_token')
    const refreshToken = localStorage.getItem('fitapp_refresh_token')
    const userStr = localStorage.getItem('fitapp_user')
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr)
        set({ token, refreshToken: refreshToken ?? null, user })
      } catch {}
    }
  },

  setAuth: (token: string, refreshToken: string | null, user: User) => {
    localStorage.setItem('fitapp_token', token)
    localStorage.setItem('fitapp_user', JSON.stringify(user))
    if (refreshToken) {
      localStorage.setItem('fitapp_refresh_token', refreshToken)
    } else {
      localStorage.removeItem('fitapp_refresh_token')
    }
    set({ token, refreshToken: refreshToken ?? null, user })
  },

  login: async (gymSlug, email, password) => {
    set({ isLoading: true })
    try {
      const body: any = { email, password }
      if (gymSlug) body.gymSlug = gymSlug
      const { data } = await api.post('/auth/login', body)
      const refreshToken = data.refreshToken ?? null
      localStorage.setItem('fitapp_token', data.token)
      localStorage.setItem('fitapp_user', JSON.stringify(data.user))
      if (refreshToken) {
        localStorage.setItem('fitapp_refresh_token', refreshToken)
      } else {
        localStorage.removeItem('fitapp_refresh_token')
      }
      set({ token: data.token, refreshToken, user: data.user, isLoading: false })
      return data.user
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  logout: async () => {
    const { refreshToken } = get()
    // Best-effort: notificar al backend para invalidar el refresh token
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refreshToken })
      } catch {
        // Si falla, igual hacemos logout local
      }
    }
    localStorage.removeItem('fitapp_token')
    localStorage.removeItem('fitapp_refresh_token')
    localStorage.removeItem('fitapp_user')
    localStorage.removeItem('fitapp_colors')
    set({ user: null, token: null, refreshToken: null })
    window.location.href = '/login'
  },

  switchSede: async (targetGymId: string) => {
    const { data } = await api.post('/gyms/switch-sede', { targetGymId })
    // switch-sede no emite refresh token: se conserva el actual, y /auth/refresh
    // mantiene la sede porque recibe el gymId de fitapp_user
    const refreshToken = data.refreshToken ?? get().refreshToken
    localStorage.setItem('fitapp_token', data.token)
    localStorage.setItem('fitapp_user', JSON.stringify(data.user))
    if (refreshToken) {
      localStorage.setItem('fitapp_refresh_token', refreshToken)
    }
    set({ token: data.token, refreshToken, user: data.user })
    return data.gym
  },
}))
