'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../store/auth.store'
import { CalendarDays, TrendingUp, CreditCard } from 'lucide-react'

// ── Cambia VIDEO_URL para probar diferentes videos ──────────────────────────
const VIDEO_URL = '/videos/crossfit-community.mp4' // ← activo ahora
// '/videos/silhouette-barbell.mp4'  → silueta atleta con barra
// '/videos/dark-room-barbell.mp4'   → barra en cuarto oscuro
// '/videos/muscular-barbell.mp4'    → hombre musculoso con barra
// '/videos/deadlift-focal.mp4'      → deadlift con luz focal
// '/videos/kettlebell-box.mp4'      → kettlebell en CrossFit box
// '/videos/barbell-press.mp4'       → press con barra
// '/videos/barbells-drop.mp4'       → hombre lanzando barbells
// '/videos/battle-ropes-2.mp4'    → battle ropes intenso
// '/videos/barbell-press.mp4'     → press con barra (loopable)
// '/videos/pullups.mp4'           → pull-ups en barra
// '/videos/box-jumps.mp4'         → box jumps
// ───────────────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:3001'


export default function LoginPage() {
  const [gymSlug, setGymSlug]   = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const { login, isLoading }    = useAuthStore()
  const router = useRouter()

  const [platformLogo, setPlatformLogo] = useState<string>(`${API_BASE}/uploads/assets/platform_logo.png`)
  const [animatedLogo, setAnimatedLogo] = useState<string | null>(null)
  const iframeRef  = useRef<HTMLIFrameElement>(null)
  const [logoRatio, setLogoRatio] = useState(0.3256)
  const [iframeReady, setIframeReady] = useState(false)

  const handleLogoLoad = useCallback(() => {
    try {
      const svg = iframeRef.current?.contentDocument?.querySelector('svg')
      if (svg) {
        const vb = svg.viewBox?.baseVal
        if (vb && vb.width > 0) setLogoRatio(vb.height / vb.width)
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/api/platform/assets`)
      .then(r => r.json())
      .then(data => {
        const v = `?v=${Date.now()}`
        if (data.assets?.platform_logo)    setPlatformLogo(`${API_BASE}${data.assets.platform_logo}${v}`)
        if (data.assets?.login_logo_animated) setAnimatedLogo(`${API_BASE}${data.assets.login_logo_animated}${v}`)
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const user = await login(gymSlug, email, password)
      // El panel es para el staff del gym; los alumnos usan la app móvil
      if (user.role === 'MEMBER') {
        await useAuthStore.getState().logout({ redirect: false })
        setError('Esta cuenta es de alumno: ingresa desde la app móvil de tu gimnasio.')
        return
      }
      if (user.mustChangePassword) {
        router.push('/change-password')
      } else {
        router.push(user.role === 'SUPER_ADMIN' ? '/superadmin' : '/dashboard')
      }
    } catch (err: any) {
      const errData = err.response?.data?.error
      if (typeof errData === 'string') setError(errData)
      else if (errData?.formErrors?.length) setError(errData.formErrors[0])
      else setError('Credenciales incorrectas')
    }
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', backgroundColor: '#050505' }}>
      <style>{`
        @keyframes logoReveal {
          0%   { opacity: 0; transform: scale(0.92) translateY(6px); filter: blur(6px); }
          100% { opacity: 1; transform: scale(1) translateY(0);    filter: blur(0); }
        }
        .logo-reveal { animation: logoReveal 0.9s cubic-bezier(0.22,1,0.36,1) forwards; }

        /* ── Snake border — conic-gradient rotando ── */
        @property --snake-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
      `}</style>

      {/* ── VIDEO FULL SCREEN ──────────────────────────────────────── */}
      <video
        autoPlay muted loop playsInline
        style={{
          position: 'fixed', inset: 0, zIndex: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center center',
        }}
      >
        <source src={VIDEO_URL} type="video/mp4" />
      </video>

      {/* Un solo overlay uniforme — misma opacidad en toda la pantalla */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'rgba(0,0,0,0.48)',
      }} />

      {/* ── LOGO — centrado en toda la pantalla (el form encima lo cubre por la derecha) ── */}
      <div style={{
        position: 'fixed', top: '3%', left: 0, right: 0,
        zIndex: 3, display: 'flex', justifyContent: 'center',
        paddingRight: 60, /* cede espacio al panel del form */
      }}>
        <div style={{ position: 'relative', width: 480 }}>
          <img
            src={platformLogo} alt="Logo"
            style={{
              display: 'block', margin: '0 auto',
              height: 180, width: 'auto', maxWidth: '100%', objectFit: 'contain',
              opacity: iframeReady ? 0 : 1, transition: 'opacity 0.5s',
              filter: 'drop-shadow(0 4px 40px rgba(0,0,0,0.8))',
            }}
          />
          {animatedLogo && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              paddingTop: `${logoRatio * 100}%`,
              opacity: iframeReady ? 1 : 0, transition: 'opacity 0.5s',
            }}>
              <iframe
                ref={iframeRef} src={animatedLogo}
                onLoad={() => { handleLogoLoad(); setIframeReady(true) }}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none', background: 'transparent', overflow: 'hidden', colorScheme: 'normal' }}
                sandbox="allow-scripts allow-same-origin" scrolling="no"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── FRANJA INFERIOR — texto lineal discreto ────────────────── */}
      <div className="hidden lg:flex" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 3, alignItems: 'center', justifyContent: 'center',
        padding: '14px 48px', gap: 20,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(8px)',
        background: 'rgba(0,0,0,0.35)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#FB923C', letterSpacing: '0.1em', fontFamily: 'var(--font-body)' }}>
          CROSSFIT · HYROX
        </span>
        {[
          { Icon: CalendarDays, label: 'Clases & WODs' },
          { Icon: TrendingUp,   label: 'Progresión atletas' },
          { Icon: CreditCard,   label: 'Membresías & pagos' },
        ].map(({ Icon, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 10 }}>·</span>
            <Icon size={11} color="rgba(255,255,255,0.4)" />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}>{label}</span>
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-body)' }}>
          Software de gestión para tu Box
        </span>
      </div>

      {/* ── FORMULARIO — centrado horizontalmente ────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 48, left: 0, right: 0,
        zIndex: 4, display: 'flex', justifyContent: 'center',
      }}>
        <div style={{ width: '100%', maxWidth: 360, padding: '0 16px', boxSizing: 'border-box' }}>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Slug del gimnasio', key: 'gymSlug', type: 'text',     placeholder: 'mi-gimnasio',     value: gymSlug,  onChange: setGymSlug,  required: false },
              { label: 'Email',             key: 'email',   type: 'email',    placeholder: 'admin@tubox.com', value: email,    onChange: setEmail,    required: true  },
              { label: 'Contraseña',        key: 'password',type: 'password', placeholder: '••••••••',        value: password, onChange: setPassword, required: true  },
            ].map(field => (
              <div key={field.key}>
                <label style={{
                  display: 'block', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
                  marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase',
                  fontFamily: 'var(--font-body)',
                }}>{field.label}</label>
                <input
                  type={field.type} value={field.value}
                  onChange={e => field.onChange(e.target.value)}
                  placeholder={field.placeholder} required={field.required}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10, padding: '10px 14px', fontSize: 13,
                    color: '#F8F8F8', outline: 'none', fontFamily: 'var(--font-body)',
                    transition: 'border-color 150ms',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.5)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                />
              </div>
            ))}

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8, padding: '8px 12px', fontSize: 12,
                color: '#F87171', fontFamily: 'var(--font-body)',
              }}>{error}</div>
            )}

            <button type="submit" disabled={isLoading} style={{
              marginTop: 4, width: '100%',
              background: 'linear-gradient(135deg, #F97316 0%, #FB923C 100%)',
              border: 'none', borderRadius: 10, padding: '11px',
              fontSize: 13, fontWeight: 700, color: '#fff',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              boxShadow: '0 4px 20px rgba(249,115,22,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
              fontFamily: 'var(--font-body)', transition: 'all 150ms ease',
            }}>
              {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <a href="/forgot-password" style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                ¿Olvidaste tu contraseña?
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
