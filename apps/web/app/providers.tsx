'use client'
import { useEffect } from 'react'
import { useAuthStore } from '../store/auth.store'
import api from '../lib/api'

function setCssColors(colors: { primary: string; secondary: string; accent: string }) {
  document.documentElement.style.setProperty('--brand-primary', colors.primary)
  document.documentElement.style.setProperty('--brand-secondary', colors.secondary)
  document.documentElement.style.setProperty('--brand-accent', colors.accent)
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const { loadFromStorage, user } = useAuthStore()

  useEffect(() => {
    loadFromStorage()
  }, [])

  useEffect(() => {
    // SUPER_ADMIN sin sede elegida (gymId null) no tiene gym propio — /gyms/me
    // devuelve 404 en cada carga del panel hasta que hace switch-sede (QA 2026-10-30).
    if (!user || !user.gymId) return
    api.get('/gyms/me').then(({ data }) => {
      if (data.brandColors) setCssColors(data.brandColors)
    }).catch(() => {})
  }, [user])

  useEffect(() => {
    const handler = (e: Event) => setCssColors((e as CustomEvent).detail)
    window.addEventListener('brand-colors-changed', handler)
    return () => window.removeEventListener('brand-colors-changed', handler)
  }, [])

  return <>{children}</>
}
