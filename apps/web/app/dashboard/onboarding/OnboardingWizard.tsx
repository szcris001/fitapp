'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '../../../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  onClose: () => void
}

type StepId = 1 | 2 | 3 | 4

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: StepId; total: number }) {
  return (
    <div className="flex items-center gap-0" style={{ marginBottom: 6 }}>
      {Array.from({ length: total }, (_, i) => {
        const idx = (i + 1) as StepId
        const done = idx < current
        const active = idx === current
        return (
          <div key={idx} className="flex items-center">
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
                transition: 'background 0.25s, border-color 0.25s',
                background: done
                  ? 'var(--status-success, #22c55e)'
                  : active
                  ? 'var(--gradient-btn, var(--brand-primary, #6366f1))'
                  : 'transparent',
                border: done
                  ? '2px solid var(--status-success, #22c55e)'
                  : active
                  ? '2px solid var(--brand-primary, #6366f1)'
                  : '2px solid var(--border-1, #374151)',
                color: done || active ? '#fff' : 'var(--text-4, #9ca3af)',
                boxShadow: active ? 'var(--glow, none)' : 'none',
              }}
            >
              {done ? '✓' : idx}
            </div>
            {i < total - 1 && (
              <div
                style={{
                  height: 2,
                  width: 32,
                  background: done
                    ? 'var(--status-success, #22c55e)'
                    : 'var(--border-1, #374151)',
                  transition: 'background 0.25s',
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 1: Box profile ──────────────────────────────────────────────────────

function Step1({ onNext }: { onNext: () => void }) {
  const router = useRouter()
  return (
    <div>
      <p
        className="text-sm leading-relaxed"
        style={{ color: 'var(--text-2)', marginBottom: 24 }}
      >
        Antes de empezar, personaliza el perfil de tu box: nombre, logo y colores
        de marca. Esto se aplica a todo lo que ven tus alumnos.
      </p>
      <div
        style={{
          padding: '14px 18px',
          borderRadius: 10,
          background: 'color-mix(in srgb, var(--brand-primary, #6366f1) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--brand-primary, #6366f1) 20%, var(--border-1))',
          marginBottom: 28,
        }}
      >
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Puedes subir tu logo, elegir el deporte (CrossFit, Yoga, Cycling…) y
          definir los colores de marca que identifican a tu box.
        </p>
      </div>
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => router.push('/dashboard/settings')}
          style={{
            padding: '9px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            border: '1px solid var(--border-1)',
            background: 'transparent',
            color: 'var(--brand-accent, #818cf8)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e =>
            (e.currentTarget.style.background =
              'color-mix(in srgb, var(--brand-accent, #818cf8) 10%, transparent)')
          }
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          Ir a Configuracion
        </button>
        <button
          onClick={onNext}
          style={{
            padding: '9px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            border: 'none',
            background: 'var(--gradient-btn, var(--brand-primary, #6366f1))',
            color: '#fff',
            boxShadow: 'var(--glow, none)',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Ya esta listo →
        </button>
      </div>
    </div>
  )
}

// ─── Step 2: Class types ──────────────────────────────────────────────────────

function Step2({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<string | null>(null)

  const handleCreate = async () => {
    if (name.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.post('/class-types', { name: name.trim(), color })
      setCreated(name.trim())
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.fieldErrors?.name?.[0] ||
        err?.response?.data?.error ||
        'No se pudo crear el tipo de clase.'
      setError(typeof msg === 'string' ? msg : 'Error al crear el tipo de clase.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p className="text-sm" style={{ color: 'var(--text-2)', marginBottom: 20 }}>
        Define los tipos de clase que ofrece tu box. Puedes crear mas despues desde
        Configuracion → Tipos de clase.
      </p>

      {created ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'color-mix(in srgb, #22c55e 12%, transparent)',
            border: '1px solid color-mix(in srgb, #22c55e 30%, transparent)',
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 18 }}>✓</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>
              Tipo de clase creado
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '1px 8px',
                  borderRadius: 6,
                  background: color,
                  color: '#fff',
                  fontWeight: 700,
                  marginRight: 4,
                }}
              >
                {created}
              </span>
              fue creado exitosamente.
            </p>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-4)',
                marginBottom: 6,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Nombre del tipo de clase
            </label>
            <input
              type="text"
              placeholder="Ej: CrossFit, Cycling, Yoga..."
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              disabled={loading}
              style={{
                width: '100%',
                padding: '9px 14px',
                borderRadius: 8,
                border: error
                  ? '1.5px solid #ef4444'
                  : '1.5px solid var(--border-1)',
                background: 'var(--surface-hover, rgba(255,255,255,0.04))',
                color: 'var(--text-1)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e =>
                (e.currentTarget.style.borderColor =
                  'color-mix(in srgb, var(--brand-primary, #6366f1) 60%, transparent)')
              }
              onBlur={e =>
                (e.currentTarget.style.borderColor = error
                  ? '#ef4444'
                  : 'var(--border-1)')
              }
            />
            {error && (
              <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{error}</p>
            )}
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-4)',
                marginBottom: 6,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Color de identificacion
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                disabled={loading}
                style={{
                  width: 44,
                  height: 36,
                  borderRadius: 8,
                  border: '1.5px solid var(--border-1)',
                  cursor: 'pointer',
                  padding: 2,
                  background: 'transparent',
                }}
              />
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  background: color,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {name.trim() || 'Vista previa'}
              </span>
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={loading || name.trim().length < 2}
            style={{
              alignSelf: 'flex-start',
              padding: '9px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: loading || name.trim().length < 2 ? 'not-allowed' : 'pointer',
              border: 'none',
              background: 'var(--gradient-btn, var(--brand-primary, #6366f1))',
              color: '#fff',
              opacity: loading || name.trim().length < 2 ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Creando...' : 'Crear tipo de clase'}
          </button>
        </div>
      )}

      <div className="flex gap-3 justify-between" style={{ marginTop: 8 }}>
        <button
          onClick={onSkip}
          style={{
            padding: '9px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-4)',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}
        >
          Hacer despues
        </button>
        <button
          onClick={onNext}
          disabled={!created}
          style={{
            padding: '9px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            cursor: created ? 'pointer' : 'not-allowed',
            border: 'none',
            background: 'var(--gradient-btn, var(--brand-primary, #6366f1))',
            color: '#fff',
            opacity: created ? 1 : 0.4,
            boxShadow: created ? 'var(--glow, none)' : 'none',
            transition: 'opacity 0.15s',
          }}
        >
          Siguiente →
        </button>
      </div>
    </div>
  )
}

// ─── Step 3: Membership plans ─────────────────────────────────────────────────

function Step3({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [created, setCreated] = useState<string | null>(null)

  const validate = () => {
    const errs: Record<string, string> = {}
    if (name.trim().length < 2) errs.name = 'El nombre debe tener al menos 2 caracteres.'
    const priceNum = parseFloat(price)
    if (isNaN(priceNum) || priceNum < 0) errs.price = 'Ingresa un precio valido (0 o mayor).'
    return errs
  }

  const handleCreate = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    try {
      const priceNum = parseFloat(price)
      const priceCents = Math.round(priceNum * 100)
      await api.post('/plans', {
        name: name.trim(),
        priceCents,
      })
      setCreated(name.trim())
    } catch (err: any) {
      const raw = err?.response?.data?.error
      if (raw?.fieldErrors) {
        const fe: Record<string, string> = {}
        if (raw.fieldErrors.name?.[0]) fe.name = raw.fieldErrors.name[0]
        if (raw.fieldErrors.priceCents?.[0]) fe.price = raw.fieldErrors.priceCents[0]
        setErrors(fe)
      } else {
        setErrors({ name: typeof raw === 'string' ? raw : 'Error al crear el plan.' })
      }
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%',
    padding: '9px 14px',
    borderRadius: 8,
    border: errors[field] ? '1.5px solid #ef4444' : '1.5px solid var(--border-1)',
    background: 'var(--surface-hover, rgba(255,255,255,0.04))',
    color: 'var(--text-1)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
  })

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-4)',
    marginBottom: 6,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  }

  return (
    <div>
      <p className="text-sm" style={{ color: 'var(--text-2)', marginBottom: 20 }}>
        Crea el primer plan de membresia para tus alumnos. Podras agregar mas
        planes desde la seccion Planes en cualquier momento.
      </p>

      {created ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'color-mix(in srgb, #22c55e 12%, transparent)',
            border: '1px solid color-mix(in srgb, #22c55e 30%, transparent)',
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 18 }}>✓</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>
              Plan creado
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              El plan{' '}
              <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>
                {created}
              </span>{' '}
              fue creado exitosamente.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Nombre del plan</label>
            <input
              type="text"
              placeholder="Ej: Mensual, Trimestral, Ilimitado..."
              value={name}
              onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })) }}
              disabled={loading}
              style={inputStyle('name')}
              onFocus={e =>
                (e.currentTarget.style.borderColor =
                  'color-mix(in srgb, var(--brand-primary, #6366f1) 60%, transparent)')
              }
              onBlur={e =>
                (e.currentTarget.style.borderColor = errors.name ? '#ef4444' : 'var(--border-1)')
              }
            />
            {errors.name && (
              <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{errors.name}</p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Precio</label>
              <input
                type="number"
                placeholder="0"
                min={0}
                step={0.01}
                value={price}
                onChange={e => { setPrice(e.target.value); setErrors(p => ({ ...p, price: '' })) }}
                disabled={loading}
                style={inputStyle('price')}
                onFocus={e =>
                  (e.currentTarget.style.borderColor =
                    'color-mix(in srgb, var(--brand-primary, #6366f1) 60%, transparent)')
                }
                onBlur={e =>
                  (e.currentTarget.style.borderColor = errors.price ? '#ef4444' : 'var(--border-1)')
                }
              />
              {errors.price && (
                <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{errors.price}</p>
              )}
            </div>
            <div>
              <label style={labelStyle}>Duracion</label>
              {/* Regla de negocio: toda membresía dura 30 días */}
              <p style={{ fontSize: 14, color: 'var(--text-2)', padding: '10px 0' }}>30 dias</p>
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={loading}
            style={{
              alignSelf: 'flex-start',
              padding: '9px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: 'none',
              background: 'var(--gradient-btn, var(--brand-primary, #6366f1))',
              color: '#fff',
              opacity: loading ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Creando...' : 'Crear plan'}
          </button>
        </div>
      )}

      <div className="flex gap-3 justify-between" style={{ marginTop: 8 }}>
        <button
          onClick={onSkip}
          style={{
            padding: '9px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-4)',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}
        >
          Hacer despues
        </button>
        <button
          onClick={onNext}
          disabled={!created}
          style={{
            padding: '9px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            cursor: created ? 'pointer' : 'not-allowed',
            border: 'none',
            background: 'var(--gradient-btn, var(--brand-primary, #6366f1))',
            color: '#fff',
            opacity: created ? 1 : 0.4,
            boxShadow: created ? 'var(--glow, none)' : 'none',
            transition: 'opacity 0.15s',
          }}
        >
          Siguiente →
        </button>
      </div>
    </div>
  )
}

// ─── Step 4: Invite staff ─────────────────────────────────────────────────────

function Step4({ onFinish }: { onFinish: () => void }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'COACH' | 'ADMIN'>('COACH')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [invited, setInvited] = useState<string | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)

  const handleInvite = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Ingresa un email valido.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.post('/users', { email: email.trim(), role })
      setInvited(email.trim())
    } catch {
      // Si falla solo informamos, no bloqueamos
      setError('No se pudo enviar la invitacion. Puedes agregar personal desde la seccion Usuarios.')
    } finally {
      setLoading(false)
    }
  }

  if (showCelebration) {
    return (
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
        <h3
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--text-1)',
            marginBottom: 10,
            fontFamily: 'var(--font-display)',
          }}
        >
          ¡Box configurado!
        </h3>
        <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 28, lineHeight: 1.6 }}>
          Tu box esta listo. Aqui tienes tus proximos pasos:
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginBottom: 28,
            textAlign: 'left',
          }}
        >
          {[
            { label: 'Crear horario de clases', href: '/dashboard/classes/new' },
            { label: 'Registrar alumnos', href: '/dashboard/users/new' },
            { label: 'Ver analytics', href: '/dashboard/reports' },
          ].map(item => (
            <button
              key={item.href}
              onClick={() => { onFinish(); router.push(item.href) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 9,
                border: '1px solid var(--border-1)',
                background: 'var(--surface-hover, rgba(255,255,255,0.04))',
                color: 'var(--brand-accent, #818cf8)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={e =>
                (e.currentTarget.style.background =
                  'color-mix(in srgb, var(--brand-accent, #818cf8) 10%, transparent)')
              }
              onMouseLeave={e =>
                (e.currentTarget.style.background =
                  'var(--surface-hover, rgba(255,255,255,0.04))')
              }
            >
              <span style={{ opacity: 0.6 }}>→</span>
              {item.label}
            </button>
          ))}
        </div>
        <button
          onClick={onFinish}
          style={{
            padding: '10px 32px',
            borderRadius: 9,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            border: 'none',
            background: 'var(--gradient-btn, var(--brand-primary, #6366f1))',
            color: '#fff',
            boxShadow: 'var(--glow, none)',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Empezar
        </button>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm" style={{ color: 'var(--text-2)', marginBottom: 20 }}>
        Invita a tu equipo para que puedan gestionar clases y alumnos.
      </p>

      {invited ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'color-mix(in srgb, #22c55e 12%, transparent)',
            border: '1px solid color-mix(in srgb, #22c55e 30%, transparent)',
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 18 }}>✓</span>
          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
            Usuario creado para{' '}
            <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{invited}</span>
            {' '}con rol{' '}
            <span style={{ fontWeight: 700, color: 'var(--brand-accent)' }}>{role}</span>.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-4)',
                  marginBottom: 6,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase' as const,
                }}
              >
                Email del coach o admin
              </label>
              <input
                type="email"
                placeholder="coach@miobox.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: 8,
                  border: error ? '1.5px solid #ef4444' : '1.5px solid var(--border-1)',
                  background: 'var(--surface-hover, rgba(255,255,255,0.04))',
                  color: 'var(--text-1)',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box' as const,
                }}
                onFocus={e =>
                  (e.currentTarget.style.borderColor =
                    'color-mix(in srgb, var(--brand-primary, #6366f1) 60%, transparent)')
                }
                onBlur={e =>
                  (e.currentTarget.style.borderColor = error ? '#ef4444' : 'var(--border-1)')
                }
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-4)',
                  marginBottom: 6,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase' as const,
                }}
              >
                Rol
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as 'COACH' | 'ADMIN')}
                disabled={loading}
                style={{
                  padding: '9px 14px',
                  borderRadius: 8,
                  border: '1.5px solid var(--border-1)',
                  background: 'var(--surface-hover, rgba(255,255,255,0.04))',
                  color: 'var(--text-1)',
                  fontSize: 14,
                  outline: 'none',
                  cursor: 'pointer',
                  height: '100%',
                  minWidth: 110,
                }}
              >
                <option value="COACH">Coach</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>

          {error && (
            <p style={{ fontSize: 12, color: '#ef4444', marginTop: -8 }}>{error}</p>
          )}

          <button
            onClick={handleInvite}
            disabled={loading}
            style={{
              alignSelf: 'flex-start',
              padding: '9px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: 'none',
              background: 'var(--gradient-btn, var(--brand-primary, #6366f1))',
              color: '#fff',
              opacity: loading ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Invitando...' : 'Invitar'}
          </button>

          <p style={{ fontSize: 12, color: 'var(--text-4)' }}>
            O{' '}
            <button
              onClick={() => { onFinish(); }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--brand-accent, #818cf8)',
                fontSize: 12,
                padding: 0,
                fontWeight: 600,
              }}
            >
              ve a Usuarios
            </button>{' '}
            para gestionar manualmente.
          </p>
        </div>
      )}

      <div className="flex gap-3 justify-end" style={{ marginTop: 8 }}>
        <button
          onClick={() => setShowCelebration(true)}
          style={{
            padding: '9px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            border: 'none',
            background: 'var(--gradient-btn, var(--brand-primary, #6366f1))',
            color: '#fff',
            boxShadow: 'var(--glow, none)',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          {invited ? 'Finalizar' : 'Saltar y finalizar →'}
        </button>
      </div>
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

const STEP_TITLES: Record<StepId, string> = {
  1: 'Configura tu box',
  2: 'Tipos de clase',
  3: 'Planes de membresia',
  4: 'Invita a tu equipo',
}

const STEP_SUBTITLES: Record<StepId, string> = {
  1: 'Personaliza el perfil de tu gimnasio',
  2: 'Define las disciplinas que ofreces',
  3: 'Crea tu primer plan de membresia',
  4: 'Agrega coaches y admins a tu equipo',
}

export default function OnboardingWizard({ onClose }: OnboardingWizardProps) {
  const [step, setStep] = useState<StepId>(1)
  const TOTAL = 4

  const goNext = () => {
    if (step < TOTAL) setStep((s) => (s + 1) as StepId)
  }

  return (
    /* Overlay */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={e => {
        // Cerrar al hacer clic fuera de la tarjeta
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Card */}
      <div
        className="card rounded-xl"
        style={{
          width: '100%',
          maxWidth: 480,
          position: 'relative',
          animation: 'fadeSlideUp 0.25s ease',
        }}
      >
        <style>{`
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Cerrar wizard"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 28,
            height: 28,
            border: 'none',
            borderRadius: 8,
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-4)',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background =
              'color-mix(in srgb, var(--brand-accent, #818cf8) 12%, transparent)'
            e.currentTarget.style.color = 'var(--text-2)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-4)'
          }}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          {/* Bienvenida — solo en paso 1 */}
          {step === 1 && (
            <p
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--brand-accent, #818cf8)',
                marginBottom: 8,
              }}
            >
              Bienvenido a FitHub
            </p>
          )}

          <StepDots current={step} total={TOTAL} />

          <p style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 16, marginTop: 6 }}>
            Paso {step} de {TOTAL}
          </p>

          <h2
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: 'var(--text-1)',
              marginBottom: 4,
              fontFamily: 'var(--font-display)',
              lineHeight: 1.2,
            }}
          >
            {STEP_TITLES[step]}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{STEP_SUBTITLES[step]}</p>
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: 'var(--border-1)',
            marginBottom: 24,
          }}
        />

        {/* Step content */}
        {step === 1 && <Step1 onNext={goNext} />}
        {step === 2 && <Step2 onNext={goNext} onSkip={goNext} />}
        {step === 3 && <Step3 onNext={goNext} onSkip={goNext} />}
        {step === 4 && <Step4 onFinish={onClose} />}
      </div>
    </div>
  )
}
