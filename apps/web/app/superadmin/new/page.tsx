'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'
import { ArrowLeft, CheckCircle } from 'lucide-react'

const cardStyle = { backgroundColor: '#13131f', border: '1px solid #2d2d4e', borderRadius: '0.75rem' }
const inputStyle = {
  width: '100%', backgroundColor: '#0f0f1a', border: '1px solid #2d2d4e',
  borderRadius: '0.5rem', padding: '0.625rem 1rem', color: '#e2e8f0', outline: 'none',
}
const labelStyle = { display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.375rem', fontWeight: 500 }

export default function NewGymPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<any>(null)
  const [emailPreviewUrl, setEmailPreviewUrl] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [fitPlans, setFitPlans] = useState<any[]>([])
  const [form, setForm] = useState({
    gymName: '', gymSlug: '', adminName: '', adminEmail: '',
    adminPassword: '', subscriptionPlan: 'trial',
  })

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') router.push('/dashboard')
    if (user) {
      api.get('/superadmin/fitapp-plans').then(r => {
        setFitPlans(r.data)
        if (r.data.length > 0 && !r.data.find((p: any) => p.slug === 'trial')) {
          setForm(f => ({ ...f, subscriptionPlan: r.data[0].slug }))
        }
      }).catch(() => {})
    }
  }, [user])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/superadmin/gyms', form)
      setSuccess(data)
      setEmailPreviewUrl(data.emailPreviewUrl ?? null)
      setEmailError(data.emailError ?? null)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al crear el gimnasio')
    } finally { setLoading(false) }
  }

  if (success) {
    return (
      <main className="max-w-xl mx-auto px-6 py-8">
        <div className="rounded-xl border p-8 text-center space-y-5"
          style={{ backgroundColor: '#13131f', borderColor: '#14532d' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
            style={{ backgroundColor: '#14532d' }}>
            <CheckCircle className="w-6 h-6" style={{ color: '#4ade80' }} />
          </div>
          <h2 className="text-xl font-bold" style={{ color: '#4ade80' }}>Gimnasio creado</h2>
          <div className="rounded-lg p-4 text-left space-y-2 text-sm" style={{ backgroundColor: '#0f0f1a' }}>
            <p><span style={{ color: '#64748b' }}>Nombre:</span> <span className="font-medium text-white">{success.gym.name}</span></p>
            <p><span style={{ color: '#64748b' }}>Slug:</span> <span className="font-mono" style={{ color: '#a78bfa' }}>{success.gym.slug}</span></p>
            <p><span style={{ color: '#64748b' }}>Admin:</span> <span className="font-medium text-white">{success.admin.name}</span></p>
            <p><span style={{ color: '#64748b' }}>Email:</span> <span className="font-medium text-white">{success.admin.email}</span></p>
            <p><span style={{ color: '#64748b' }}>Plan:</span> <span className="font-medium text-white">{fitPlans.find(p => p.slug === success.gym.subscriptionPlan)?.name ?? success.gym.subscriptionPlan}</span></p>
          </div>
          <div className="rounded-lg p-4 text-left text-sm" style={{ backgroundColor: '#0f0f1a' }}>
            <p style={{ color: '#64748b', marginBottom: '0.5rem' }}>Credenciales de acceso:</p>
            <pre className="text-xs rounded p-2 font-mono" style={{ backgroundColor: '#1a1a2e', color: '#e2e8f0' }}>
{`Slug:     ${success.gym.slug}
Email:    ${success.admin.email}
Password: ${form.adminPassword}`}
            </pre>
          </div>

          {/* Estado del correo */}
          {emailError ? (
            <div className="rounded-lg p-4 text-left text-sm"
              style={{ backgroundColor: '#1c0a0a', border: '1px solid #7f1d1d' }}>
              <p style={{ color: '#f87171', fontWeight: 600, marginBottom: 6 }}>
                Error al enviar correo de bienvenida
              </p>
              <p style={{ color: '#f87171', fontSize: 12, opacity: 0.7, marginBottom: 4, lineHeight: 1.5 }}>
                {emailError}
              </p>
              <p style={{ color: '#64748b', fontSize: 12 }}>
                Comparte las credenciales manualmente con el admin.
              </p>
            </div>
          ) : emailPreviewUrl ? (
            <div className="rounded-lg p-4 text-left text-sm"
              style={{ backgroundColor: '#1c1400', border: '1px solid #422006' }}>
              <p style={{ color: '#fb923c', fontWeight: 600, marginBottom: 6 }}>
                SMTP no configurado — correo de prueba (Ethereal)
              </p>
              <a href={emailPreviewUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: '#fb923c', textDecoration: 'underline', wordBreak: 'break-all' }}>
                Ver correo en Ethereal →
              </a>
            </div>
          ) : (
            <div className="rounded-lg p-4 text-left text-sm"
              style={{ backgroundColor: '#0f1a0f', border: '1px solid #14532d' }}>
              <p style={{ color: '#4ade80', fontWeight: 600, marginBottom: 4 }}>
                Correo de bienvenida enviado
              </p>
              <p style={{ color: '#166534', fontSize: 12 }}>
                Se envió un correo con las credenciales a {success.admin.email}
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => {
              setSuccess(null)
              setEmailPreviewUrl(null)
              setForm({ gymName: '', gymSlug: '', adminName: '', adminEmail: '', adminPassword: '', subscriptionPlan: 'trial' })
            }}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors text-white"
              style={{ backgroundColor: '#1e293b' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#334155')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1e293b')}>
              Crear otro
            </button>
            <button onClick={() => router.push('/superadmin')}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors text-white"
              style={{ backgroundColor: '#7c3aed' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#6d28d9')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#7c3aed')}>
              Ver todos
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-7">
        <button onClick={() => router.push('/superadmin')}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: '#64748b' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e2e8f0')}
          onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}>
          <ArrowLeft className="w-4 h-4" />
          Gimnasios
        </button>
        <span style={{ color: '#2d2d4e' }}>/</span>
        <h1 className="text-xl font-bold text-white">Crear gimnasio</h1>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm mb-6"
          style={{ backgroundColor: '#450a0a', border: '1px solid #7f1d1d', color: '#f87171' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Gym data */}
        <div className="p-6 space-y-4" style={cardStyle}>
          <h2 className="font-semibold text-white text-sm">Datos del gimnasio</h2>
          <div>
            <label style={labelStyle}>Nombre del gimnasio *</label>
            <input value={form.gymName}
              onChange={e => { set('gymName', e.target.value); set('gymSlug', autoSlug(e.target.value)) }}
              required placeholder="ej: CrossFit Santiago" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Slug (URL única) *</label>
            <input value={form.gymSlug} onChange={e => set('gymSlug', e.target.value)}
              required placeholder="crossfit-santiago"
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.875rem' }} />
            <p className="text-xs mt-1" style={{ color: '#475569' }}>Login: slug + email + contraseña</p>
          </div>
          <div>
            <label style={labelStyle}>Plan de suscripción</label>
            <select value={form.subscriptionPlan} onChange={e => set('subscriptionPlan', e.target.value)}
              style={inputStyle}>
              {fitPlans.length > 0 ? fitPlans.map(p => (
                <option key={p.slug} value={p.slug}>{p.name}{p.isFree ? ' (gratis)' : ''}</option>
              )) : (
                <>
                  <option value="trial">Trial (gratis)</option>
                  <option value="go_pro">Go Pro</option>
                  <option value="business">Business</option>
                  <option value="business_pro">Business Pro</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Admin data */}
        <div className="p-6 space-y-4" style={cardStyle}>
          <h2 className="font-semibold text-white text-sm">Administrador del gimnasio</h2>
          <div>
            <label style={labelStyle}>Nombre *</label>
            <input value={form.adminName} onChange={e => set('adminName', e.target.value)}
              required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email *</label>
            <input type="email" value={form.adminEmail} onChange={e => set('adminEmail', e.target.value)}
              required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Contraseña temporal *</label>
            <input type="text" value={form.adminPassword} onChange={e => set('adminPassword', e.target.value)}
              required minLength={6} placeholder="Mínimo 6 caracteres" style={inputStyle} />
            <p className="text-xs mt-1" style={{ color: '#475569' }}>El admin deberá cambiarla en su primer acceso</p>
          </div>
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-lg text-sm font-medium transition-colors text-white disabled:opacity-50"
          style={{ backgroundColor: '#7c3aed' }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.backgroundColor = '#6d28d9' }}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#7c3aed')}>
          {loading ? 'Creando...' : 'Crear gimnasio'}
        </button>
      </form>
    </main>
  )
}
