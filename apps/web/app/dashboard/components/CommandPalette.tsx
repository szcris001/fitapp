'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Users, Calendar, BarChart2, Settings, Trophy,
  Bell, CreditCard, Dumbbell, X, ArrowRight, UserPlus,
  Home, MessageSquare, Landmark,
} from 'lucide-react'
import api from '../../../lib/api'

// Navegación estática
const NAV_ACTIONS = [
  { id: 'home',        label: 'Inicio',         subtitle: 'Panel principal',             icon: Home,         href: '/dashboard',                       category: 'Navegación' },
  { id: 'members',     label: 'Alumnos',         subtitle: 'Gestión de alumnos',          icon: Users,        href: '/dashboard/users',                 category: 'Navegación' },
  { id: 'classes',     label: 'Clases',          subtitle: 'Horario y reservas',          icon: Calendar,     href: '/dashboard/classes',               category: 'Navegación' },
  { id: 'wods',        label: 'Pizarra',         subtitle: 'WODs y leaderboard',          icon: Trophy,       href: '/dashboard/wods',                  category: 'Navegación' },
  { id: 'plans',       label: 'Planes',          subtitle: 'Membresías y precios',        icon: CreditCard,   href: '/dashboard/plans',                 category: 'Navegación' },
  { id: 'reports',     label: 'Reportes',        subtitle: 'Estadísticas del box',        icon: BarChart2,    href: '/dashboard/reports',               category: 'Navegación' },
  { id: 'comms',       label: 'Comunicación',    subtitle: 'Mensajes y notificaciones',   icon: MessageSquare,href: '/dashboard/communications',         category: 'Navegación' },
  { id: 'fintoc',      label: 'Conciliación',    subtitle: 'Pagos y conciliación',        icon: Landmark,     href: '/dashboard/fintoc',                category: 'Navegación' },
  { id: 'alerts',      label: 'Alertas',         subtitle: 'Retención inteligente',       icon: Bell,         href: '/dashboard/alerts',                category: 'Navegación' },
  { id: 'settings',    label: 'Configuración',   subtitle: 'Ajustes del box',             icon: Settings,     href: '/dashboard/settings',              category: 'Configuración' },
  { id: 'movements',   label: 'Movimientos',     subtitle: 'Biblioteca de ejercicios',    icon: Dumbbell,     href: '/dashboard/settings/movements',    category: 'Configuración' },
  { id: 'classtypes',  label: 'Tipos de clase',  subtitle: 'Configurar tipos de clase',   icon: Calendar,     href: '/dashboard/settings/class-types',  category: 'Configuración' },
]

const QUICK_ACTIONS = [
  { id: 'invite', label: 'Invitar miembro', subtitle: 'Agregar nuevo alumno', icon: UserPlus, href: '/dashboard/users?action=invite', category: 'Acciones rápidas' },
]

interface MemberResult {
  id: string
  name: string
  email: string
}

interface CommandItem {
  id: string
  label: string
  subtitle: string
  icon: React.ElementType
  href: string
  category: string
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState<MemberResult[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Abrir con Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Escuchar evento personalizado desde el hint del sidebar
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('open-command-palette', handler)
    return () => window.removeEventListener('open-command-palette', handler)
  }, [])

  // Focus del input al abrir
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setMembers([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Buscar miembros con debounce de 250ms
  useEffect(() => {
    if (query.length < 2) { setMembers([]); return }
    const timeout = setTimeout(async () => {
      setLoadingMembers(true)
      try {
        // Intentar con `search`, fallback a `q`
        const { data } = await api.get(`/users?role=MEMBER&search=${encodeURIComponent(query)}&limit=5`)
        const list = Array.isArray(data) ? data : (data.users ?? [])
        setMembers(list)
      } catch {
        setMembers([])
      } finally {
        setLoadingMembers(false)
      }
    }, 250)
    return () => clearTimeout(timeout)
  }, [query])

  // Resultados filtrados
  const filteredNav = query.length === 0
    ? NAV_ACTIONS
    : NAV_ACTIONS.filter(a =>
        a.label.toLowerCase().includes(query.toLowerCase()) ||
        a.subtitle.toLowerCase().includes(query.toLowerCase())
      )

  const filteredActions = query.length === 0
    ? QUICK_ACTIONS
    : QUICK_ACTIONS.filter(a =>
        a.label.toLowerCase().includes(query.toLowerCase()) ||
        a.subtitle.toLowerCase().includes(query.toLowerCase())
      )

  const memberItems: CommandItem[] = members.map(m => ({
    id: m.id,
    label: m.name,
    subtitle: m.email,
    icon: Users,
    href: `/dashboard/users/${m.id}`,
    category: 'Miembros',
  }))

  // Lista plana para navegación con teclado
  const allItems: CommandItem[] = [
    ...filteredActions,
    ...memberItems,
    ...filteredNav,
  ]

  const navigate = useCallback((href: string) => {
    setOpen(false)
    router.push(href)
  }, [router])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => {
        const next = Math.min(i + 1, allItems.length - 1)
        scrollItemIntoView(next)
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => {
        const next = Math.max(i - 1, 0)
        scrollItemIntoView(next)
        return next
      })
    } else if (e.key === 'Enter' && allItems[selectedIndex]) {
      navigate(allItems[selectedIndex].href)
    }
  }

  const scrollItemIntoView = (idx: number) => {
    if (!listRef.current) return
    const btn = listRef.current.querySelectorAll<HTMLButtonElement>('button[data-cmd-item]')[idx]
    btn?.scrollIntoView({ block: 'nearest' })
  }

  if (!open) return null

  // Agrupar por categoría manteniendo el orden de allItems
  const grouped: Record<string, CommandItem[]> = {}
  for (const item of allItems) {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  }

  let runningIndex = 0

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          animation: 'cp-fadeIn 0.1s ease',
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{
          position: 'fixed',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 560,
          zIndex: 9999,
          borderRadius: 20,
          border: '1px solid var(--border-2)',
          backgroundColor: 'var(--surface-card)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5), var(--glow)',
          overflow: 'hidden',
          animation: 'cp-slideDown 0.15s ease',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-1)',
        }}>
          <Search style={{ width: 18, height: 18, color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
            placeholder="Buscar alumnos, navegar, ejecutar acciones..."
            aria-label="Buscar en el dashboard"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: 15,
              color: 'var(--text-1)',
              caretColor: 'var(--brand-primary)',
              fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setSelectedIndex(0); inputRef.current?.focus() }}
              aria-label="Limpiar búsqueda"
              style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          )}
          <kbd style={{
            fontSize: 11,
            color: 'var(--text-4)',
            backgroundColor: 'var(--surface-hover)',
            border: '1px solid var(--border-1)',
            borderRadius: 6,
            padding: '2px 7px',
            fontFamily: 'monospace',
            lineHeight: '1.6',
          }}>
            ESC
          </kbd>
        </div>

        {/* Resultados */}
        <div ref={listRef} style={{ maxHeight: 400, overflowY: 'auto', padding: '8px 0' }}>
          {loadingMembers && (
            <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-4)' }}>
              Buscando alumnos...
            </div>
          )}

          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div style={{
                padding: '6px 16px 4px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'var(--text-4)',
                textTransform: 'uppercase',
              }}>
                {category}
              </div>
              {items.map(item => {
                const idx = runningIndex++
                const isSelected = idx === selectedIndex
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    data-cmd-item
                    onClick={() => navigate(item.href)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '9px 16px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      backgroundColor: isSelected
                        ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)'
                        : 'transparent',
                      transition: 'background 0.1s',
                    }}
                  >
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected
                        ? 'color-mix(in srgb, var(--brand-primary) 20%, transparent)'
                        : 'var(--surface-hover)',
                      color: isSelected ? 'var(--brand-primary)' : 'var(--text-3)',
                      transition: 'all 0.1s',
                    }}>
                      <Icon style={{ width: 16, height: 16 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', margin: 0 }}>
                        {item.label}
                      </p>
                      <p style={{
                        fontSize: 12,
                        color: 'var(--text-4)',
                        margin: '1px 0 0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {item.subtitle}
                      </p>
                    </div>
                    {isSelected && (
                      <ArrowRight style={{ width: 14, height: 14, color: 'var(--brand-primary)', flexShrink: 0 }} />
                    )}
                  </button>
                )
              })}
            </div>
          ))}

          {allItems.length === 0 && !loadingMembers && query.length > 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
                Sin resultados para &ldquo;{query}&rdquo;
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border-1)',
          display: 'flex',
          gap: 16,
          fontSize: 11,
          color: 'var(--text-4)',
        }}>
          <span><kbd style={{ fontFamily: 'monospace', marginRight: 4 }}>↑↓</kbd>Navegar</span>
          <span><kbd style={{ fontFamily: 'monospace', marginRight: 4 }}>↵</kbd>Abrir</span>
          <span><kbd style={{ fontFamily: 'monospace', marginRight: 4 }}>ESC</kbd>Cerrar</span>
        </div>
      </div>

      <style>{`
        @keyframes cp-fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes cp-slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </>
  )
}
