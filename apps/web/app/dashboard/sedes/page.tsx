'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api, { mediaUrl } from '../../../lib/api'
import {
  Building2, Plus, ArrowRight, CheckCircle, AlertCircle,
  MapPin, Users, X,
} from 'lucide-react'

interface Sede {
  id: string
  name: string
  slug: string
  address: string | null
  status: string
  logoUrl: string | null
  createdAt: string
  _count: { users: number }
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  ACTIVE:    { label: 'Activa',    color: 'var(--success)' },
  SUSPENDED: { label: 'Suspendida', color: 'var(--error)' },
  TRIAL:     { label: 'Trial',     color: 'var(--brand-accent)' },
}

export default function SedesPage() {
  const { user, switchSede } = useAuthStore()
  const router = useRouter()

  const [sedes, setSedes] = useState<Sede[]>([])
  const [loading, setLoading] = useState(true)
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', address: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    fetchSedes()
  }, [])

  const fetchSedes = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/gyms/my-sedes')
      setSedes(data)
    } catch {
      showToast('Error al cargar las sedes', false)
    } finally {
      setLoading(false)
    }
  }

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.slug.trim()) return
    setSaving(true)
    try {
      await api.post('/gyms/my-sedes', {
        name: form.name.trim(),
        slug: form.slug.trim(),
        address: form.address.trim() || undefined,
      })
      showToast('Sede creada exitosamente', true)
      setShowForm(false)
      setForm({ name: '', slug: '', address: '' })
      fetchSedes()
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Error al crear la sede'
      showToast(typeof msg === 'string' ? msg : 'Error al crear la sede', false)
    } finally {
      setSaving(false)
    }
  }

  const handleSwitch = async (sedeId: string) => {
    if (sedeId === user?.gymId) return
    setSwitchingTo(sedeId)
    try {
      await switchSede(sedeId)
      window.location.href = '/dashboard'
    } catch {
      showToast('Error al cambiar de sede', false)
      setSwitchingTo(null)
    }
  }

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium"
          style={{ backgroundColor: toast.ok ? 'var(--success)' : 'var(--error)', color: '#fff' }}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--gradient-btn)' }}>
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
              Mis Sedes
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-4)' }}>
              Administra todas las ubicaciones de tu centro
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--gradient-btn)' }}
        >
          <Plus className="w-4 h-4" />
          Nueva sede
        </button>
      </div>

      {/* Form nueva sede */}
      {showForm && (
        <div className="mb-6 rounded-2xl border p-5"
          style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--border-1)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Nueva sede</h2>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4" style={{ color: 'var(--text-4)' }} /></button>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-3)' }}>Nombre *</label>
              <input
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ backgroundColor: 'var(--surface-input)', borderColor: 'var(--border-1)', color: 'var(--text-1)' }}
                value={form.name}
                onChange={e => {
                  const name = e.target.value
                  setForm(f => ({ ...f, name, slug: autoSlug(name) }))
                }}
                placeholder="Ej: Sede Norte"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-3)' }}>Slug (URL) *</label>
              <input
                className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
                style={{ backgroundColor: 'var(--surface-input)', borderColor: 'var(--border-1)', color: 'var(--text-1)' }}
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                placeholder="sede-norte"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-3)' }}>Dirección</label>
              <input
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ backgroundColor: 'var(--surface-input)', borderColor: 'var(--border-1)', color: 'var(--text-1)' }}
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--gradient-btn)' }}
              >
                {saving ? 'Creando...' : 'Crear sede'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de sedes */}
      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--text-4)' }}>Cargando sedes...</div>
      ) : sedes.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border"
          style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-card)' }}>
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-3)' }} />
          <p className="font-medium" style={{ color: 'var(--text-2)' }}>No tienes sedes aún</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-4)' }}>Crea tu primera sede con el botón de arriba</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sedes.map(sede => {
            const isCurrent = sede.id === user?.gymId
            const statusInfo = STATUS_LABEL[sede.status] ?? { label: sede.status, color: 'var(--text-4)' }
            return (
              <div key={sede.id}
                className="rounded-2xl border p-5 flex flex-col gap-3 transition-shadow hover:shadow-md"
                style={{
                  backgroundColor: 'var(--surface-card)',
                  borderColor: isCurrent ? 'var(--brand-primary)' : 'var(--border-1)',
                  boxShadow: isCurrent ? '0 0 0 2px color-mix(in srgb, var(--brand-primary) 20%, transparent)' : undefined,
                }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden"
                      style={{ background: 'var(--gradient-btn)' }}>
                      {sede.logoUrl
                        ? <img src={mediaUrl(sede.logoUrl)} alt="" className="w-full h-full object-cover" />
                        : sede.name[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{sede.name}</p>
                      <p className="text-xs font-mono" style={{ color: 'var(--text-4)' }}>{sede.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCurrent && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 15%, transparent)', color: 'var(--brand-primary)' }}>
                        Activa
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: 'color-mix(in srgb, ' + statusInfo.color + ' 12%, transparent)', color: statusInfo.color }}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-4)' }}>
                  {sede.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {sede.address}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {sede._count.users} miembro{sede._count.users !== 1 ? 's' : ''}
                  </span>
                </div>

                {!isCurrent && (
                  <button
                    onClick={() => handleSwitch(sede.id)}
                    disabled={switchingTo === sede.id || sede.status === 'SUSPENDED'}
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-2)' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--brand-primary) 10%, transparent)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                  >
                    {switchingTo === sede.id ? 'Cambiando...' : (
                      <>Cambiar a esta sede <ArrowRight className="w-3 h-3" /></>
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
