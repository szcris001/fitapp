import React, { createContext, useContext, useEffect, useState } from 'react'
import { API_BASE, mediaUrl } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

interface PlatformAssets {
  mobilePlatformLogo: string | null
  mobileLogoAnimated: string | null
  gymLogoUrl: string | null
  gymName: string | null
}

const PlatformAssetsContext = createContext<PlatformAssets>({
  mobilePlatformLogo: null,
  mobileLogoAnimated: null,
  gymLogoUrl: null,
  gymName: null,
})

export function PlatformAssetsProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<PlatformAssets>({
    mobilePlatformLogo: null,
    mobileLogoAnimated: null,
    gymLogoUrl: null,
    gymName: null,
  })

  const token = useAuthStore(state => state.token)

  // Assets de plataforma: público, se carga una sola vez
  useEffect(() => {
    const v = `?v=${Date.now()}`
    fetch(`${API_BASE}/api/platform/assets`)
      .then(r => r.json())
      .then(data => {
        setAssets(prev => ({
          ...prev,
          mobilePlatformLogo: data.assets?.mobile_platform_logo
            ? `${API_BASE}${data.assets.mobile_platform_logo}${v}` : null,
          mobileLogoAnimated: data.assets?.mobile_logo_animated
            ? `${API_BASE}${data.assets.mobile_logo_animated}${v}` : null,
        }))
      })
      .catch(() => {})
  }, [])

  // Logo y nombre del gimnasio: depende del token
  useEffect(() => {
    if (!token) {
      setAssets(prev => ({ ...prev, gymLogoUrl: null, gymName: null }))
      return
    }

    let cancelled = false
    fetch(`${API_BASE}/api/gyms/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => ({
        gymLogoUrl: data.logoUrl ? mediaUrl(data.logoUrl) : null,
        gymName: data.name ?? null,
      }))
      .then(gymData => { if (!cancelled) setAssets(prev => ({ ...prev, ...gymData })) })
      .catch(() => {})

    return () => { cancelled = true }
  }, [token])

  return (
    <PlatformAssetsContext.Provider value={assets}>
      {children}
    </PlatformAssetsContext.Provider>
  )
}

export function usePlatformAssets() {
  return useContext(PlatformAssetsContext)
}
