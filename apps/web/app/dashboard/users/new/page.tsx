'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../../store/auth.store'
import api from '../../../../lib/api'
import { toMajorUnits } from '../../../../lib/money'
import { ArrowLeft, Camera } from 'lucide-react'

export default function NewUserPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '',
    gender: '', birthDate: '',
    planId: '', startsAt: new Date().toISOString().split('T')[0],
  })

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) return  // el layout redirige a /login
    api.get('/plans').then(r => setPlans(r.data)).catch(() => {})
  }, [user])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    const reader = new FileReader()
    reader.onload = ev => setAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data: newUser } = await api.post('/users', {
        name: form.name, email: form.email, password: form.password,
        phone: form.phone || undefined, gender: form.gender || undefined,
        birthDate: form.birthDate || undefined, role: 'MEMBER',
      })
      if (avatarFile) {
        const fd = new FormData()
        fd.append('file', avatarFile)
        await api.post(`/users/${newUser.id}/avatar`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      if (form.planId) {
        await api.post('/memberships', {
          userId: newUser.id, planId: form.planId,
          startsAt: form.startsAt, status: 'ACTIVE',
        })
      }
      router.push('/dashboard/users')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al crear el alumno')
    } finally { setLoading(false) }
  }

  return (
    <div className="px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.push('/dashboard/users')}
          className="w-8 h-8 flex items-center justify-center rounded-lg btn-secondary">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="section-title">Nuevo alumno</h1>
          <p className="text-sm" style={{ color: 'var(--text-4)' }}>Registra un nuevo miembro en el gimnasio</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">

          {/* ── Columna izquierda: avatar + datos personales ── */}
          <div className="space-y-5">
            {/* Avatar */}
            <div className="card rounded-xl p-6">
              <h2 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-1)' }}>Foto de perfil</h2>
              <div className="flex items-center gap-5">
                <div className="relative shrink-0">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="preview"
                      className="w-20 h-20 rounded-full object-cover" />
                  ) : (
                    <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
                      style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-4)' }}>
                      {form.name ? form.name[0].toUpperCase() : '?'}
                    </div>
                  )}
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--brand-accent)', color: '#fff' }}>
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="btn-secondary px-4 py-2 text-sm rounded-lg">
                    Subir foto
                  </button>
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text-4)' }}>JPG, PNG o WebP. Máx 5MB</p>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>
            </div>

            {/* Datos personales */}
            <div className="card rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Datos personales</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Nombre completo *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)} required className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Email *</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Contraseña *</label>
                  <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Teléfono</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Fecha de nacimiento</label>
                  <input type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Género</label>
                  <select value={form.gender} onChange={e => set('gender', e.target.value)} className="input">
                    <option value="">Sin especificar</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="OTHER">Otro</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ── Columna derecha: plan + acciones ── */}
          <div className="space-y-5">
            {/* Plan */}
            <div className="card rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                Asignar plan{' '}
                <span className="font-normal" style={{ color: 'var(--text-4)' }}>(opcional)</span>
              </h2>
              {plans.length > 0 ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Plan</label>
                    <select value={form.planId} onChange={e => set('planId', e.target.value)} className="input">
                      <option value="">Sin plan por ahora</option>
                      {plans.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {toMajorUnits(p.priceCents, p.currency).toLocaleString()} {p.currency}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Fecha de inicio</label>
                    <input type="date" value={form.startsAt} onChange={e => set('startsAt', e.target.value)} className="input" />
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-4)' }}>No hay planes configurados aún.</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-600">{error}</div>
            )}

            {/* Botones */}
            <div className="flex gap-3">
              <button type="button" onClick={() => router.push('/dashboard/users')}
                className="flex-1 btn-secondary py-3 rounded-xl">
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 btn-brand py-3 rounded-xl font-medium disabled:opacity-50">
                {loading ? 'Guardando...' : 'Crear alumno'}
              </button>
            </div>
          </div>

        </div>
      </form>
    </div>
  )
}
