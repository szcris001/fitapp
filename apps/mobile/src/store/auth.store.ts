import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import api from '../lib/api'

interface User {
  userId: string
  gymId: string
  email: string
  name: string
  role: string
}

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  isLoading: boolean
  login: (gymSlug: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  loadFromStorage: () => Promise<void>
  /** Actualiza token y refreshToken en el store y en AsyncStorage. Usado por el interceptor de refresh. */
  setTokens: (token: string, refreshToken: string) => Promise<void>
}

async function registerPushToken() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      })
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') return

    const tokenData = await Notifications.getExpoPushTokenAsync()
    await api.post('/auth/push-token', { token: tokenData.data })
  } catch (err) {
    // No interrumpir el login si falla el registro del push token
    console.warn('[PushToken] Error al registrar:', err)
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  isLoading: false,

  loadFromStorage: async () => {
    const token = await AsyncStorage.getItem('fitapp_token')
    const refreshToken = await AsyncStorage.getItem('fitapp_refresh_token')
    const userStr = await AsyncStorage.getItem('fitapp_user')
    if (token && userStr) {
      set({ token, refreshToken: refreshToken ?? null, user: JSON.parse(userStr) })
    }
  },

  login: async (gymSlug, email, password) => {
    set({ isLoading: true })
    try {
      const { data } = await api.post('/auth/login', { gymSlug, email, password })
      const newRefreshToken: string | null = data.refreshToken ?? null
      await AsyncStorage.setItem('fitapp_token', data.token)
      if (newRefreshToken) {
        await AsyncStorage.setItem('fitapp_refresh_token', newRefreshToken)
      }
      await AsyncStorage.setItem('fitapp_user', JSON.stringify(data.user))
      set({ token: data.token, refreshToken: newRefreshToken, user: data.user, isLoading: false })
      // Registrar push token en segundo plano (no bloquea el login)
      registerPushToken()
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  setTokens: async (token: string, refreshToken: string) => {
    await AsyncStorage.setItem('fitapp_token', token)
    await AsyncStorage.setItem('fitapp_refresh_token', refreshToken)
    set({ token, refreshToken })
  },

  logout: async () => {
    // Notificar al backend (best effort — no bloquea el logout local)
    const currentRefreshToken = get().refreshToken
    if (currentRefreshToken) {
      api.post('/auth/logout', { refreshToken: currentRefreshToken }).catch(() => {
        // Ignorar errores de red; el token local se limpia de todas formas
      })
    }
    await AsyncStorage.multiRemove(['fitapp_token', 'fitapp_refresh_token', 'fitapp_user'])
    set({ user: null, token: null, refreshToken: null })
  },
}))
