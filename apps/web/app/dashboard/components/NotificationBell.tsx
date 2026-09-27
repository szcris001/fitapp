'use client'
import { useState, useEffect, useRef } from 'react'
import { Bell, X, Clock, UserX, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import api from '../../../lib/api'

interface Notification {
  id: string
  type: 'expiring' | 'inactive' | 'trial'
  title: string
  subtitle: string
  userId?: string
  urgency: 'high' | 'medium' | 'low'
}

export default function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get('/gyms/stats')
      const notifs: Notification[] = []

      // Membresías por vencer
      for (const m of data.expiringMemberships ?? []) {
        const days = Math.ceil(
          (new Date(m.endsAt).getTime() - Date.now()) / 86400000
        )
        notifs.push({
          id: `exp-${m.id}`,
          type: 'expiring',
          title: m.user?.name ?? 'Alumno',
          subtitle: days <= 0 ? 'Vence hoy' : `Vence en ${days} día${days !== 1 ? 's' : ''}`,
          userId: m.user?.id,
          urgency: days <= 2 ? 'high' : 'medium',
        })
      }

      // Alumnos inactivos — máx 5
      for (const u of (data.inactiveMembers ?? []).slice(0, 5)) {
        notifs.push({
          id: `inactive-${u.id}`,
          type: 'inactive',
          title: u.name,
          subtitle: 'Sin membresía activa',
          userId: u.id,
          urgency: 'low',
        })
      }

      setNotifications(notifs)
    } catch {
      // silencioso — no romper el sidebar si el endpoint falla
    }
  }

  useEffect(() => {
    // Carga asíncrona: el setState ocurre después del await, no durante el effect
    void Promise.resolve().then(fetchNotifications)
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Cerrar al click fuera del panel
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const highCount = notifications.filter(n => n.urgency === 'high').length
  const count = notifications.length

  const badgeColor = highCount > 0 ? '#ef4444' : '#f59e0b'

  const urgencyColor = (u: string) =>
    u === 'high' ? '#ef4444' : u === 'medium' ? '#f59e0b' : 'var(--text-4)'

  const typeIcon = (type: string) => {
    if (type === 'expiring') return <Clock style={{ width: 16, height: 16 }} />
    if (type === 'inactive') return <UserX style={{ width: 16, height: 16 }} />
    return <AlertTriangle style={{ width: 16, height: 16 }} />
  }

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      {/* Botón campana */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Notificaciones"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: collapsed ? 32 : 'auto',
          height: collapsed ? 32 : 'auto',
          padding: collapsed ? 0 : '4px 10px',
          gap: collapsed ? 0 : 6,
          borderRadius: 8,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: open ? 'var(--brand-primary)' : 'var(--text-4)',
          transition: 'color 0.15s, background-color 0.15s',
          fontSize: 12,
          fontWeight: 500,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--brand-accent) 10%, transparent)'
          if (!open) e.currentTarget.style.color = 'var(--text-1)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = open ? 'var(--brand-primary)' : 'var(--text-4)'
        }}
      >
        {/* Icono con badge */}
        <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Bell style={{ width: collapsed ? 16 : 12, height: collapsed ? 16 : 12 }} />
          {count > 0 && (
            <span
              style={{
                position: 'absolute',
                top: collapsed ? -4 : -5,
                right: collapsed ? -4 : -5,
                minWidth: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: badgeColor,
                color: '#fff',
                fontSize: 9,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
                lineHeight: 1,
              }}
            >
              {count > 9 ? '9+' : count}
            </span>
          )}
        </span>
        {!collapsed && <span style={{ marginTop: 1 }}>Alertas</span>}
      </button>

      {/* Panel dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            // En colapsado abre a la derecha; en expandido abre hacia arriba alineado a la izquierda
            ...(collapsed
              ? { left: 'calc(100% + 12px)', bottom: 0 }
              : { bottom: 'calc(100% + 8px)', left: 0 }),
            width: 320,
            borderRadius: 16,
            border: '1px solid var(--border-1)',
            backgroundColor: 'var(--surface-card)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            zIndex: 999,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                Notificaciones
              </span>
              {count > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: highCount > 0 ? '#ef4444' : '#f59e0b',
                    backgroundColor:
                      highCount > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                    padding: '2px 8px',
                    borderRadius: 20,
                  }}
                >
                  {count} {count === 1 ? 'alerta' : 'alertas'}
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                color: 'var(--text-4)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                borderRadius: 6,
              }}
              onMouseEnter={e =>
                (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')
              }
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <X style={{ width: 15, height: 15 }} />
            </button>
          </div>

          {/* Lista */}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <Bell
                  style={{
                    width: 32,
                    height: 32,
                    color: 'var(--text-4)',
                    margin: '0 auto 8px',
                    display: 'block',
                  }}
                />
                <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
                  Sin alertas por ahora
                </p>
              </div>
            ) : (
              notifications.map((n, i) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setOpen(false)
                    if (n.userId) router.push(`/dashboard/users/${n.userId}`)
                    else router.push('/dashboard/alerts')
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    borderBottom:
                      i < notifications.length - 1
                        ? '1px solid var(--border-1)'
                        : 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e =>
                    (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')
                  }
                  onMouseLeave={e =>
                    (e.currentTarget.style.backgroundColor = 'transparent')
                  }
                >
                  {/* Icono de urgencia */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor:
                        n.urgency === 'high'
                          ? 'rgba(239,68,68,0.12)'
                          : n.urgency === 'medium'
                          ? 'rgba(245,158,11,0.12)'
                          : 'rgba(128,128,128,0.10)',
                      color: urgencyColor(n.urgency),
                    }}
                  >
                    {typeIcon(n.type)}
                  </div>

                  {/* Texto */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-1)',
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {n.title}
                    </p>
                    <p
                      style={{
                        fontSize: 12,
                        color: urgencyColor(n.urgency),
                        margin: '2px 0 0',
                        fontWeight: n.urgency === 'high' ? 600 : 400,
                      }}
                    >
                      {n.subtitle}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer del panel */}
          {notifications.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-1)' }}>
              <button
                onClick={() => {
                  setOpen(false)
                  router.push('/dashboard/alerts')
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--brand-primary)',
                  background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e =>
                  (e.currentTarget.style.background =
                    'color-mix(in srgb, var(--brand-primary) 18%, transparent)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background =
                    'color-mix(in srgb, var(--brand-primary) 10%, transparent)')
                }
              >
                Ver todas en Centro de alertas →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
