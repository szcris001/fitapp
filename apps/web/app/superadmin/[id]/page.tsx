'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'
import { ArrowLeft, Save, KeyRound } from 'lucide-react'

const cardStyle = { backgroundColor: '#13131f', border: '1px solid #2d2d4e', borderRadius: '0.75rem' }
const inputStyle: React.CSSProperties = {
  width: '100%', backgroundColor: '#0f0f1a', border: '1px solid #2d2d4e',
  borderRadius: '0.5rem', padding: '0.625rem 1rem', color: '#e2e8f0', outline: 'none',
  fontSize: '0.875rem', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8',
  marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em',
}

export default function EditGymPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()
  const params = useParams()
  const gymId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [gymName, setGymName] = useState('')
  const [fitPlans, setFitPlans] = useState<any[]>([])
  const [staffUsers, setStaffUsers] = useState<{ id: string; name: string; email: string; role: string }[]>([])
  const [resetUserId, setResetUserId] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)

  const [form, setForm] = useState({
    name: '', slug: '', subscriptionPlan: 'trial', status: 'ACTIVE',
    address: '', phone: '', email: '', instagram: '', facebook: '',
    adminName: '', adminEmail: '',
  })

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') { router.push('/dashboard'); return }
    if (user) {
      fetchGym()
      api.get('/superadmin/fitapp-plans').then(r => setFitPlans(r.data)).catch(() => {})
    }
  }, [user])

  const fetchGym = async () => {
    try {
      const { data } = await api.get(`/superadmin/gyms/${gymId}`)
      const admin = data.users?.[0]
      setGymName(data.name)
      setForm({
        name:             data.name             ?? '',
        slug:             data.slug             ?? '',
        subscriptionPlan: data.subscriptionPlan ?? 'trial',
        status:           data.status           ?? 'ACTIVE',
        address:          data.address          ?? '',
        phone:            data.phone            ?? '',
        email:            data.email            ?? '',
        instagram:        data.instagram        ?? '',
        facebook:         data.facebook         ?? '',
        adminName:        admin?.name           ?? '',
        adminEmail:       admin?.email          ?? '',
      })
      const staff: { id: string; name: string; email: string; role: string }[] = data.users ?? []
      setStaffUsers(staff)
      if (staff.length > 0) setResetUserId(staff[0].id)
    } catch {
      router.push('/superadmin')
    } finally {
      setLoading(false)
    }
  }

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetUserId || !resetPassword) return
    setResetting(true)
    setResetError('')
    setResetSuccess(false)
    try {
      await api.post(`/superadmin/gyms/${gymId}/reset-password`, {
        userId: resetUserId,
        newPassword: resetPassword,
      })
      setResetSuccess(true)
      setResetPassword('')
      setTimeout(() => setResetSuccess(false), 3000)
    } catch (err: any) {
      setResetError(err.response?.data?.error || 'Error al resetear la contraseña')
    } finally {
      setResetting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      const payload: Record<string, string | null> = {
        name:             form.name,
        slug:             form.slug,
        subscriptionPlan: form.subscriptionPlan,
        status:           form.status,
        adminName:        form.adminName,
        adminEmail:       form.adminEmail,
        address:   form.address.trim()   || null,
        phone:     form.phone.trim()     || null,
        email:     form.email.trim()     || null,
        instagram: form.instagram.trim() || null,
        facebook:  form.facebook.trim()  || null,
      }
      await api.patch(`/superadmin/gyms/${gymId}`, payload)
      setGymName(form.name)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-500 text-sm">Cargando...</div>
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
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
        <h1 className="text-xl font-bold text-white truncate">{gymName}</h1>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm mb-6"
          style={{ backgroundColor: '#450a0a', border: '1px solid #7f1d1d', color: '#f87171' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg px-4 py-3 text-sm mb-6"
          style={{ backgroundColor: '#14532d', border: '1px solid #166534', color: '#4ade80' }}>
          Cambios guardados correctamente
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Administrador */}
        <div className="p-6 space-y-4" style={cardStyle}>
          <h2 className="font-semibold text-white text-sm">Administrador</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input value={form.adminName} onChange={e => set('adminName', e.target.value)}
                required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input type="email" value={form.adminEmail} onChange={e => set('adminEmail', e.target.value)}
                required style={inputStyle} />
              <p className="text-xs mt-1" style={{ color: '#475569' }}>Este es el email para iniciar sesión</p>
            </div>
          </div>
        </div>

        {/* Identidad */}
        <div className="p-6 space-y-4" style={cardStyle}>
          <h2 className="font-semibold text-white text-sm">Gimnasio</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Slug *</label>
              <input value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                required style={{ ...inputStyle, fontFamily: 'monospace' }} />
              <p className="text-xs mt-1" style={{ color: '#475569' }}>Solo minúsculas, números y guiones</p>
            </div>
          </div>
        </div>

        {/* Suscripción y estado */}
        <div className="p-6 space-y-4" style={cardStyle}>
          <h2 className="font-semibold text-white text-sm">Suscripción y estado</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Plan</label>
              <select value={form.subscriptionPlan} onChange={e => set('subscriptionPlan', e.target.value)}
                style={inputStyle}>
                {fitPlans.length > 0 ? fitPlans.map(p => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                )) : (
                  <>
                    <option value="trial">Trial</option>
                    <option value="go_pro">Go Pro</option>
                    <option value="business">Business</option>
                    <option value="business_pro">Business Pro</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Estado</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                style={inputStyle}>
                <option value="ACTIVE">Activo</option>
                <option value="TRIAL">Trial</option>
                <option value="SUSPENDED">Suspendido</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contacto */}
        <div className="p-6 space-y-4" style={cardStyle}>
          <h2 className="font-semibold text-white text-sm">Contacto</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Teléfono</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="+56 9 1234 5678" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email de contacto</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="info@gimnasio.com" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Dirección</label>
            <input value={form.address} onChange={e => set('address', e.target.value)}
              placeholder="Av. Siempre Viva 742" style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Instagram</label>
              <input value={form.instagram} onChange={e => set('instagram', e.target.value)}
                placeholder="@migimnasio" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Facebook</label>
              <input value={form.facebook} onChange={e => set('facebook', e.target.value)}
                placeholder="facebook.com/migimnasio" style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Reset de contraseña */}
        <div className="p-6 space-y-4" style={cardStyle}>
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" style={{ color: '#f59e0b' }} />
            <h2 className="font-semibold text-white text-sm">Resetear contraseña</h2>
          </div>

          {resetError && (
            <div className="rounded-lg px-4 py-3 text-sm"
              style={{ backgroundColor: '#450a0a', border: '1px solid #7f1d1d', color: '#f87171' }}>
              {resetError}
            </div>
          )}
          {resetSuccess && (
            <div className="rounded-lg px-4 py-3 text-sm"
              style={{ backgroundColor: '#14532d', border: '1px solid #166534', color: '#4ade80' }}>
              Contraseña actualizada. El usuario deberá cambiarla al iniciar sesión.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Usuario</label>
              <select
                value={resetUserId}
                onChange={e => setResetUserId(e.target.value)}
                style={inputStyle}
              >
                {staffUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === 'ADMIN' ? 'Admin' : 'Coach'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Nueva contraseña</label>
              <input
                type="password"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                style={inputStyle}
              />
            </div>
          </div>

          <button
            onClick={handleResetPassword}
            disabled={resetting || !resetUserId || resetPassword.length < 6}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              border: 'none',
              backgroundColor: resetting || resetPassword.length < 6 ? '#78350f' : '#d97706',
              color: '#fff',
              cursor: resetting || resetPassword.length < 6 ? 'not-allowed' : 'pointer',
              opacity: resetting || resetPassword.length < 6 ? 0.6 : 1,
            }}
          >
            <KeyRound className="w-4 h-4" />
            {resetting ? 'Reseteando...' : 'Resetear contraseña'}
          </button>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={() => router.push('/superadmin')}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 500,
              border: '1px solid #2d2d4e', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer',
            }}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            style={{
              flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 600,
              border: 'none', backgroundColor: saving ? '#4c1d95' : '#7c3aed',
              color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}>
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </main>
  )
}
