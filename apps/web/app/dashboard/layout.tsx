'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '../../store/auth.store'
import api, { mediaUrl } from '../../lib/api'
import { isCoachAllowedPath } from '../../lib/coach-access'
import OnboardingWizard from './onboarding/OnboardingWizard'
import CommandPalette from './components/CommandPalette'

const DEFAULT_DASHBOARD_BG = 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1920&q=80'
const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:3001'
import {
  House, Users, CalendarDays, Trophy,
  Layers, BarChart3, Send, TrendingUp,
  SlidersHorizontal, LogOut, Pin, PinOff, Wallet, Landmark,
  ChevronDown, ChevronRight, Building2, Plus, Moon, Sun,
} from 'lucide-react'

type NavChild = {
  label: string
  href: string
  coachAllowed: boolean
}

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
  accent: string
  coachAllowed: boolean
  children?: NavChild[]
  popup?: boolean
  section?: string
}

const allNavItems: NavItem[] = [
  {
    label: 'Inicio',
    href: '/dashboard',
    icon: House,
    accent: '#6366f1',
    coachAllowed: true,
  },
  {
    label: 'Alumnos',
    href: '/dashboard/users',
    icon: Users,
    accent: '#22c55e',
    coachAllowed: true,
  },
  {
    label: 'Clases',
    href: '/dashboard/classes',
    icon: CalendarDays,
    accent: '#3b82f6',
    coachAllowed: true,
  },
  {
    label: 'Pizarra',
    href: '/dashboard/wods',
    icon: Trophy,
    accent: '#f59e0b',
    coachAllowed: true,
  },
  {
    label: 'Evolución',
    href: '/dashboard/evolution',
    icon: TrendingUp,
    accent: '#14b8a6',
    coachAllowed: true,
  },
  {
    label: 'Planes',
    href: '/dashboard/plans',
    icon: Layers,
    accent: '#8b5cf6',
    coachAllowed: false,
    section: 'Administración',
  },
  {
    label: 'Pagos',
    href: '/dashboard/payments',
    icon: Wallet,
    accent: '#22c55e',
    coachAllowed: false,
  },
  {
    label: 'Conciliación',
    href: '/dashboard/fintoc',
    icon: Landmark,
    accent: '#10b981',
    coachAllowed: false,
  },
  {
    label: 'Reportes',
    href: '/dashboard/reports',
    icon: BarChart3,
    accent: '#ec4899',
    coachAllowed: false,
  },
  {
    label: 'Comunicación',
    href: '/dashboard/communications',
    icon: Send,
    accent: '#06b6d4',
    coachAllowed: false,
  },
  {
    label: 'Configuración',
    href: '/dashboard/settings',
    icon: SlidersHorizontal,
    accent: '#94a3b8',
    coachAllowed: false,
    popup: true,
    children: [
      { label: 'Mi Centro',         href: '/dashboard/settings',                  coachAllowed: false },
      { label: 'Tipos de clase',    href: '/dashboard/settings/class-types',      coachAllowed: false },
      { label: 'Personal',          href: '/dashboard/staff',                     coachAllowed: false },
      { label: 'Plantillas correo', href: '/dashboard/settings/email-templates',  coachAllowed: false },
      { label: 'Movimientos',       href: '/dashboard/settings/movements',        coachAllowed: false },
    ],
  },
]

const coachAllowedHrefs = allNavItems
  .flatMap(item => [item, ...(item.children ?? [])])
  .filter(item => item.coachAllowed)
  .map(item => item.href)

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, hydrated, loadFromStorage, logout, switchSede } = useAuthStore()
  const [gym, setGym] = useState<any>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [popupOpen, setPopupOpen] = useState<string | null>(null)
  const [popupPos, setPopupPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 })
  const popupHovered = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sedes, setSedes] = useState<any[]>([])
  const [sedeDropOpen, setSedeDropOpen] = useState(false)
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const [dashboardBg, setDashboardBg] = useState(DEFAULT_DASHBOARD_BG)
  const [platformLogo, setPlatformLogo] = useState(`${API_BASE}/uploads/assets/platform_logo.png`)
  const [subscription, setSubscription] = useState<any>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [subToast, setSubToast] = useState<'success' | 'cancelled' | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null

  // Única redirección a /login del panel: espera a leer la sesión guardada. Si cada
  // página redirigía con user=null, al recargar (F5) o abrir un link directo se perdía
  // la sesión, porque el efecto de la página corre antes que loadFromStorage.
  useEffect(() => {
    if (!hydrated) return
    if (!user) router.replace('/login')
    else if (user.role === 'MEMBER') logout()
  }, [hydrated, user, router, logout])

  useEffect(() => {
    loadFromStorage()

    fetch(`${API_BASE}/api/platform/assets`)
      .then(r => r.json())
      .then(data => {
        const v = `?v=${Date.now()}`
        if (data.assets?.dashboard_bg) setDashboardBg(`${API_BASE}${data.assets.dashboard_bg}${v}`)
        if (data.assets?.platform_logo) setPlatformLogo(`${API_BASE}${data.assets.platform_logo}${v}`)
      })
      .catch(() => {})

    const savedCollapsed = localStorage.getItem('sidebar_collapsed')
    if (savedCollapsed === 'true') setCollapsed(true)

    const savedTheme = localStorage.getItem('fitapp_theme')
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark')
      setIsDark(true)
    } else {
      document.documentElement.classList.remove('dark')
      setIsDark(false)
    }

    // Apply cached sport theme immediately (before API responds)
    const savedSport = localStorage.getItem('fitapp_sport_theme')
    if (savedSport) {
      document.documentElement.setAttribute('data-sport', savedSport)
    }
  }, [])

  useEffect(() => {
    const themeHandler = (e: Event) => {
      const { theme } = (e as CustomEvent).detail
      setIsDark(theme === 'dark')
    }
    window.addEventListener('theme-changed', themeHandler)
    return () => window.removeEventListener('theme-changed', themeHandler)
  }, [])

  useEffect(() => {
    const sportHandler = (e: Event) => {
      const { theme } = (e as CustomEvent).detail
      document.documentElement.setAttribute('data-sport', theme)
    }
    window.addEventListener('sport-theme-changed', sportHandler)
    return () => window.removeEventListener('sport-theme-changed', sportHandler)
  }, [])


  useEffect(() => {
    if (!user) return
    api.get('/gyms/me').then(({ data }) => {
      setGym(data)
      const sport = data.sportTheme || 'neutral'
      document.documentElement.setAttribute('data-sport', sport)
      localStorage.setItem('fitapp_sport_theme', sport)
    }).catch(() => {})

    // Cargar sedes solo para admins
    if (user.role === 'ADMIN') {
      api.get('/gyms/my-sedes').then(({ data }) => setSedes(data)).catch(() => {})
      api.get('/gyms/me/subscription').then(({ data }) => setSubscription(data)).catch(() => {})
    }

    // Mostrar toast de resultado de pago de suscripción
    const params = new URLSearchParams(window.location.search)
    const subParam = params.get('subscription')
    if (subParam === 'success' || subParam === 'cancelled') {
      setSubToast(subParam)
      // Limpiar el query param sin recargar
      const url = new URL(window.location.href)
      url.searchParams.delete('subscription')
      window.history.replaceState({}, '', url.toString())
      setTimeout(() => setSubToast(null), 6000)
    }
  }, [user])

  // Onboarding wizard: detectar si el gym es nuevo (sin class-types ni planes)
  useEffect(() => {
    if (!user) return
    // Solo ADMIN y SUPER_ADMIN ven el wizard, y SUPER_ADMIN solo tras elegir una sede: sin
    // gymId, /class-types y /plans fallan (400) y el wizard se disparaba en falso sobre
    // /dashboard/sedes, tapando el botón "Cambiar a esta sede" (ver SUP-02)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') return
    if (user.role === 'SUPER_ADMIN' && !user.gymId) return
    // Si ya fue completado/cerrado en esta sesión, no volver a mostrar
    if (typeof window !== 'undefined' && localStorage.getItem('fitapp_onboarding_done')) return

    let cancelled = false
    Promise.all([
      api.get('/class-types').catch(() => ({ data: [] })),
      api.get('/plans').catch(() => ({ data: [] })),
    ]).then(([ctRes, plRes]) => {
      if (cancelled) return
      const classTypes: unknown[] = Array.isArray(ctRes.data) ? ctRes.data : []
      const plans: unknown[] = Array.isArray(plRes.data) ? plRes.data : []
      if (classTypes.length === 0 && plans.length === 0) {
        setShowOnboarding(true)
      }
    })

    return () => { cancelled = true }
  }, [user])

  // Auto-expand the group that contains the active child
  useEffect(() => {
    const activeParent = allNavItems.find(item =>
      item.children?.some(child =>
        pathname === child.href || pathname.startsWith(child.href + '/')
      )
    )
    if (activeParent) {
      setExpandedGroups(prev => new Set(prev).add(activeParent.href))
    }
  }, [pathname])

  const isCoach = user?.role === 'COACH'
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const handleSubscriptionCheckout = async () => {
    if (!subscription?.subscription?.planId) return
    setCheckingOut(true)
    try {
      const { data } = await api.post('/gyms/me/subscription/checkout', {
        planId: subscription.subscription.planId,
      })
      if (data.checkoutUrl) window.location.href = data.checkoutUrl
    } catch {
      alert('Error al generar el link de pago. Contacta a soporte.')
    } finally {
      setCheckingOut(false)
    }
  }

  const navItems = allNavItems
    .filter(item => isAdmin || item.coachAllowed)
    .map(item => ({
      ...item,
      children: item.children?.filter(child => isAdmin || child.coachAllowed),
    }))

  // COACH: lista de permitidos. Antes era una lista de prohibidos armada desde el menú,
  // y las páginas fuera del menú (/dashboard/payments, /dashboard/evolution…) quedaban abiertas.
  useEffect(() => {
    if (!user || !isCoach) return
    if (!isCoachAllowedPath(pathname, coachAllowedHrefs)) router.push('/dashboard')
  }, [pathname, user])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar_collapsed', String(next))
  }

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    if (next) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('fitapp_theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('fitapp_theme', 'light')
    }
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: next ? 'dark' : 'light' } }))
  }

  const handleSwitchSede = async (targetGymId: string) => {
    if (targetGymId === user?.gymId) { setSedeDropOpen(false); return }
    setSwitchingTo(targetGymId)
    try {
      await switchSede(targetGymId)
      setSedeDropOpen(false)
      window.location.href = '/dashboard'
    } catch {
      setSwitchingTo(null)
    }
  }

  const toggleGroup = (href: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  }

  const isParentActive = (item: NavItem) =>
    pathname === item.href ||
    (item.href !== '/dashboard' && pathname.startsWith(item.href + '/')) ||
    (item.children?.some(c => pathname === c.href || pathname.startsWith(c.href + '/')) ?? false)

  const isChildActive = (child: NavChild) =>
    pathname === child.href || pathname.startsWith(child.href + '/')

  const userInitials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className="flex flex-col h-screen sticky top-0 shrink-0 border-r transition-all duration-200"
        style={{
          width: collapsed ? '5rem' : '17rem',
          backgroundColor: isDark ? 'var(--surface-sidebar)' : 'var(--surface-sidebar)',
          borderColor: 'var(--border-1)',
          backdropFilter: isDark ? 'blur(20px)' : 'none',
          WebkitBackdropFilter: isDark ? 'blur(20px)' : 'none',
        }}
      >
        {/* Header */}
        <div className="flex items-center h-24 px-4 border-b shrink-0 gap-3 relative"
          style={{ borderColor: 'var(--border-1)' }}>
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-lg font-bold shrink-0 overflow-hidden cursor-pointer"
            style={{
              background: 'var(--gradient-btn)',
              boxShadow: 'var(--glow)',
              fontFamily: 'var(--font-display)',
            }}
            onClick={() => router.push('/dashboard')}
          >
            {gym?.logoUrl
              ? <img src={mediaUrl(gym.logoUrl)} alt="logo" className="w-full h-full object-cover" />
              : gym?.name?.[0] || 'F'}
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              {/* Sede selector (solo admin con >1 sede) */}
              {isAdmin && sedes.length > 1 ? (
                <button
                  onClick={() => setSedeDropOpen(v => !v)}
                  className="flex items-center gap-1 w-full group"
                >
                  <div className="min-w-0 flex-1 text-left">
                    <p className="font-semibold text-sm leading-tight truncate" style={{ color: 'var(--text-1)' }}>
                      {gym?.name || 'FitApp'}
                    </p>
                    <p className="text-xs mt-0.5 truncate flex items-center gap-1" style={{ color: 'var(--brand-accent)' }}>
                      <Building2 className="w-3 h-3 inline" />
                      {sedes.length} sedes
                    </p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 shrink-0 transition-transform"
                    style={{ color: 'var(--text-4)', transform: sedeDropOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
              ) : (
                <div className="cursor-pointer" onClick={() => router.push('/dashboard')}>
                  <p className="font-semibold text-sm leading-tight truncate" style={{ color: 'var(--text-1)' }}>
                    {gym?.name || 'FitApp'}
                  </p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-4)' }}>
                    {isCoach ? 'Coach' : 'Administrador'}
                  </p>
                </div>
              )}
            </div>
          )}

          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              title="Minimizar menú"
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors"
              style={{ color: 'var(--text-4)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--brand-accent) 10%, transparent)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Dropdown de sedes */}
          {sedeDropOpen && !collapsed && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSedeDropOpen(false)} />
              <div className="absolute top-full left-4 right-4 z-50 mt-1 rounded-xl border shadow-xl overflow-hidden"
                style={{ backgroundColor: 'var(--surface-sidebar)', borderColor: 'var(--border-1)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide px-3 pt-3 pb-1"
                  style={{ color: 'var(--text-4)' }}>Mis sedes</p>
                {sedes.map(s => {
                  const isCurrent = s.id === user?.gymId
                  const isSwitching = switchingTo === s.id
                  return (
                    <button key={s.id} onClick={() => handleSwitchSede(s.id)}
                      disabled={isSwitching}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-colors"
                      style={isCurrent
                        ? { backgroundColor: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', color: 'var(--brand-primary)' }
                        : { color: 'var(--text-2)' }}
                      onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--brand-accent) 10%, transparent)' }}
                      onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: isCurrent ? 'var(--gradient-btn)' : 'var(--surface-hover)', color: isCurrent ? '#fff' : 'var(--text-3)' }}>
                        {s.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        {s.address && <p className="text-xs truncate" style={{ color: 'var(--text-4)' }}>{s.address}</p>}
                      </div>
                      {isCurrent && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 15%, transparent)', color: 'var(--brand-primary)' }}>Activa</span>}
                      {isSwitching && <span className="text-xs" style={{ color: 'var(--text-4)' }}>...</span>}
                    </button>
                  )
                })}
                <div className="border-t mx-3 my-1" style={{ borderColor: 'var(--border-1)' }} />
                <button onClick={() => { setSedeDropOpen(false); router.push('/dashboard/sedes') }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--brand-accent)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--brand-accent) 10%, transparent)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Gestionar sedes
                </button>
              </div>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {navItems.map(item => {
            const active = isParentActive(item)
            const isExpanded = expandedGroups.has(item.href)
            const hasChildren = item.children && item.children.length > 0
            const isPopup = item.popup === true
            const isPopupOpen = popupOpen === item.href
            const Icon = item.icon
            const accent = item.accent ?? 'var(--brand-primary)'

            return (
              <div key={item.href} style={{ position: 'relative' }}>
                {/* Section divider */}
                {item.section && !collapsed && (
                  <div style={{
                    padding: '14px 10px 5px',
                    fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.07em',
                    color: 'var(--text-4)',
                    textTransform: 'uppercase',
                  }}>
                    {item.section}
                  </div>
                )}

                {/* Parent item */}
                <button
                  onClick={() => {
                    router.push(item.href)
                    if (!isPopup && hasChildren && !collapsed) toggleGroup(item.href)
                    if (!isPopup) setPopupOpen(null)
                  }}
                  onMouseEnter={e => {
                    if (!active) e.currentTarget.style.backgroundColor = `${accent}12`
                    if (isPopup) {
                      if (closeTimer.current) clearTimeout(closeTimer.current)
                      const rect = e.currentTarget.getBoundingClientRect()
                      setPopupPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 })
                      setPopupOpen(item.href)
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) e.currentTarget.style.backgroundColor = 'transparent'
                    if (isPopup) {
                      closeTimer.current = setTimeout(() => {
                        if (!popupHovered.current) setPopupOpen(null)
                      }, 120)
                    }
                  }}
                  title={collapsed ? item.label : undefined}
                  className="flex items-center w-full transition-all"
                  style={{
                    gap: collapsed ? 0 : 10,
                    padding: collapsed ? '6px 0' : '6px 10px',
                    borderRadius: 10,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    backgroundColor: active ? `${accent}15` : 'transparent',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {/* Icon container */}
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: active ? `${accent}25` : 'transparent',
                    transition: 'background 0.15s',
                  }}>
                    <Icon style={{
                      width: 15, height: 15,
                      color: active ? accent : 'var(--text-4)',
                      transition: 'color 0.15s',
                    }} />
                  </div>

                  {!collapsed && (
                    <>
                      <span style={{
                        flex: 1, textAlign: 'left',
                        fontSize: 13,
                        fontWeight: active ? 600 : 500,
                        color: active ? 'var(--text-1)' : 'var(--text-3)',
                        letterSpacing: '-0.01em',
                        transition: 'color 0.15s',
                      }}>
                        {item.label}
                      </span>
                      {hasChildren && !isPopup && (
                        isExpanded
                          ? <ChevronDown style={{ width: 13, height: 13, flexShrink: 0, color: 'var(--text-4)' }} />
                          : <ChevronRight style={{ width: 13, height: 13, flexShrink: 0, color: 'var(--text-4)' }} />
                      )}
                      {isPopup && (
                        <ChevronRight style={{
                          width: 13, height: 13, flexShrink: 0, color: 'var(--text-4)',
                          transform: isPopupOpen ? 'rotate(90deg)' : 'none',
                          transition: 'transform 150ms',
                        }} />
                      )}
                    </>
                  )}
                </button>

                {/* Inline children (non-popup) */}
                {!collapsed && hasChildren && !isPopup && isExpanded && (
                  <div className="ml-4 mt-0.5 mb-0.5 space-y-0.5 pl-3 border-l"
                    style={{ borderColor: 'var(--border-1)' }}>
                    {item.children!.map(child => {
                      const childActive = isChildActive(child)
                      return (
                        <button
                          key={child.href + child.label}
                          onClick={() => router.push(child.href)}
                          className="flex items-center w-full py-2 px-3 rounded-md text-xs transition-colors"
                          style={childActive ? {
                            backgroundColor: 'color-mix(in srgb, var(--brand-primary) 10%, var(--surface-sidebar))',
                            color: isDark ? '#ffffff' : 'var(--brand-primary)',
                            fontWeight: 600,
                          } : {
                            color: 'var(--text-4)',
                          }}
                          onMouseEnter={e => { if (!childActive) e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--brand-accent) 10%, transparent)' }}
                          onMouseLeave={e => { if (!childActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          {child.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Popup flyout rendered via portal coords — see fixed div below nav */}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t p-3 shrink-0" style={{ borderColor: 'var(--border-1)' }}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={toggleCollapsed}
                title="Expandir menú"
                className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
                style={{ color: 'var(--text-4)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--brand-accent) 10%, transparent)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              ><PinOff className="w-4 h-4" /></button>
              <button
                onClick={toggleTheme}
                title={isDark ? 'Modo claro' : 'Modo oscuro'}
                className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
                style={{ color: 'var(--text-4)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--brand-accent) 10%, transparent)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >{isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button>
              {user?.avatarUrl ? (
                <img src={mediaUrl(user.avatarUrl)} title={user.email}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                  onError={e => { const el = e.currentTarget; el.style.display = 'none'; (el.nextElementSibling as HTMLElement)?.style.setProperty('display', 'flex') }} />
              ) : null}
              <div
                className="w-8 h-8 rounded-full items-center justify-center text-xs font-semibold"
                style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)', display: user?.avatarUrl ? 'none' : 'flex' }}
                title={user?.email}
              >{userInitials}</div>
              <button onClick={() => logout()} title="Cerrar sesión"
                className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
                style={{ color: 'var(--text-4)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--brand-accent) 10%, transparent)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              ><LogOut className="w-4 h-4" /></button>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, width: '100%', display: 'flex', justifyContent: 'center' }}>
                <img src={platformLogo} alt="Logo" style={{ width: 40, height: 'auto', objectFit: 'contain', opacity: 0.6 }} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              {user?.avatarUrl ? (
                <img src={mediaUrl(user.avatarUrl)}
                  className="w-14 h-14 rounded-full object-cover"
                  style={{ outline: '2px solid var(--brand-accent)', outlineOffset: '2px' }}
                  onError={e => { const el = e.currentTarget; el.style.display = 'none'; (el.nextElementSibling as HTMLElement)?.style.setProperty('display', 'flex') }} />
              ) : null}
              <div className="w-14 h-14 rounded-full items-center justify-center text-lg font-bold shrink-0"
                style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-2)', display: user?.avatarUrl ? 'none' : 'flex' }}>
                {userInitials}
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold truncate max-w-[140px]" style={{ color: 'var(--text-1)' }}>{user?.name ?? user?.email}</p>
                <p className="text-xs truncate max-w-[140px]" style={{ color: 'var(--text-4)', fontSize: 10 }}>{user?.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleTheme}
                  title={isDark ? 'Modo claro' : 'Modo oscuro'}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors mt-1"
                  style={{ color: 'var(--text-4)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--brand-accent) 10%, transparent)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {isDark ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                  {isDark ? 'Claro' : 'Oscuro'}
                </button>
                <button onClick={() => logout()} title="Cerrar sesión"
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors mt-1"
                  style={{ color: 'var(--text-4)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--brand-accent) 10%, transparent)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                ><LogOut className="w-3 h-3" />Salir</button>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, marginTop: 4, width: '100%', display: 'flex', justifyContent: 'center' }}>
                <img src={platformLogo} alt="Logo" style={{ width: 80, height: 'auto', objectFit: 'contain', opacity: 0.6 }} />
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Config popup — fixed, opens on hover */}
      {popupOpen && (() => {
        const popupItem = navItems.find(i => i.href === popupOpen && i.popup)
        if (!popupItem) return null
        return (
          <div
            onMouseEnter={() => {
              popupHovered.current = true
              if (closeTimer.current) clearTimeout(closeTimer.current)
            }}
            onMouseLeave={() => {
              popupHovered.current = false
              setPopupOpen(null)
            }}
            style={{
              position: 'fixed',
              ...popupPos,
              zIndex: 100,
              minWidth: 210,
              borderRadius: 14,
              border: '1px solid color-mix(in srgb, var(--brand-primary) 25%, var(--border-1))',
              backgroundColor: isDark ? 'rgba(14,14,16,0.97)' : 'var(--surface-sidebar)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.32), var(--glow)',
              padding: '6px',
            }}
          >
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
              color: 'var(--text-4)', padding: '6px 10px 4px',
              textTransform: 'uppercase',
            }}>Configuración</p>
            {popupItem.children!.map(child => {
              const childActive = isChildActive(child)
              return (
                <button
                  key={child.href + child.label}
                  onClick={() => { router.push(child.href); setPopupOpen(null) }}
                  className="flex items-center w-full py-2 px-3 rounded-md text-xs transition-colors"
                  style={childActive ? {
                    backgroundColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
                    color: isDark ? '#ffffff' : 'var(--brand-primary)',
                    fontWeight: 600,
                  } : {
                    color: 'var(--text-3)',
                  }}
                  onMouseEnter={e => { if (!childActive) e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--brand-accent) 10%, transparent)' }}
                  onMouseLeave={e => { if (!childActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  {child.label}
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* Toast de resultado de pago de suscripción */}
      {subToast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 999,
          padding: '14px 20px', borderRadius: 14, fontSize: 14, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 10,
          backgroundColor: subToast === 'success' ? '#052e16' : '#1c1917',
          color: subToast === 'success' ? '#4ade80' : '#fbbf24',
          border: `1px solid ${subToast === 'success' ? '#166534' : '#92400e'}`,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          <span style={{ fontSize: 18 }}>{subToast === 'success' ? '✅' : '⚠️'}</span>
          <span>
            {subToast === 'success'
              ? 'Pago recibido. Tu suscripción será activada en segundos.'
              : 'Pago cancelado. Puedes intentarlo nuevamente cuando quieras.'}
          </span>
          <button onClick={() => setSubToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16, marginLeft: 8, opacity: 0.6 }}>
            ✕
          </button>
        </div>
      )}

      {/* Main */}
      <main
        className="flex-1 min-w-0 overflow-y-auto"
        style={{
          backgroundImage: `linear-gradient(var(--bg-overlay), var(--bg-overlay)), url('${dashboardBg}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      >
        {/* Banner de suscripción */}
        {isAdmin && subscription && (() => {
          const { subscription: sub, daysLeft, isExpired } = subscription
          if (!sub) return null
          const isTrial = sub.status === 'TRIAL'
          const isSuspended = subscription.gym?.status === 'SUSPENDED' || isExpired

          if (!isTrial && !isSuspended) return null

          const bgColor = isSuspended ? '#ef4444' : daysLeft <= 5 ? '#f59e0b' : '#6366f1'
          const msg = isSuspended
            ? 'Tu suscripción ha vencido. Renueva para continuar usando FitApp.'
            : `Período de prueba: ${daysLeft} día${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}.`

          return (
            <div className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm text-white"
              style={{ backgroundColor: bgColor, fontWeight: 500 }}>
              <span>{msg}</span>
              <button
                onClick={handleSubscriptionCheckout}
                disabled={checkingOut}
                className="shrink-0 px-4 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)' }}
              >
                {checkingOut ? 'Generando...' : 'Pagar ahora'}
              </button>
            </div>
          )
        })()}
        {children}
      </main>

      {/* Onboarding wizard overlay */}
      {showOnboarding && (
        <OnboardingWizard
          onClose={() => {
            if (typeof window !== 'undefined') {
              localStorage.setItem('fitapp_onboarding_done', '1')
            }
            setShowOnboarding(false)
          }}
        />
      )}

      {/* Command palette — global, activado con ⌘K / Ctrl+K */}
      <CommandPalette />
    </div>
  )
}
