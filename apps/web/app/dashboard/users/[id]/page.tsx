'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuthStore } from '../../../../store/auth.store'
import api, { mediaUrl } from '../../../../lib/api'
import { toMajorUnits } from '../../../../lib/money'
import {
  ArrowLeft, Edit2, CheckCircle, CreditCard, Banknote,
  RefreshCw, X, ExternalLink, Wallet, Camera, KeyRound,
  Phone, User2, Calendar, Trophy, Activity, Clock, TrendingUp,
} from 'lucide-react'

/* ─── Constants ─────────────────────────────────── */
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo', INACTIVE: 'Inactivo', TRIAL: 'Prueba', EXPIRED: 'Expirado',
}
const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'badge-green', INACTIVE: 'badge-gray', TRIAL: 'badge-yellow', EXPIRED: 'badge-red',
}
const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', stripe: 'Pago online', other: 'Otro',
}
const METHOD_ICON: Record<string, string> = {
  cash: '💵', transfer: '🏦', card: '💳', stripe: '🔒', other: '📋',
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE:   { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e', label: 'Activo' },
  TRIAL:    { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', label: 'Trial' },
  EXPIRED:  { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444', label: 'Expirado' },
  INACTIVE: { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8', label: 'Inactivo' },
}


/* ─── Skeleton ──────────────────────────────────── */
function Skeleton({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />
}

/* ─── Avatar ────────────────────────────────────── */
function Avatar({ name, src, size = 72 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size, borderRadius: size * 0.33, objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.33,
      background: 'var(--gradient-btn)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 800, color: '#fff',
      flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

/* ─── Stat Card ─────────────────────────────────── */
function QuickStatCard({ icon: Icon, label, value, colorVar = 'var(--primary)' }: {
  icon: React.ComponentType<any>
  label: string
  value: string | number
  colorVar?: string
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-3">
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          backgroundColor: `color-mix(in srgb, ${colorVar} 12%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon className="w-4 h-4" style={{ color: colorVar }} />
        </div>
        <span className="text-xs font-medium" style={{ color: 'var(--text-4)' }}>{label}</span>
      </div>
      <p className="stat-number">{value}</p>
    </div>
  )
}

/* ─── Payment Modal ─────────────────────────────── */
function PaymentModal({
  userId, plans, onClose, onSuccess,
}: {
  userId: string; plans: any[]; onClose: () => void; onSuccess: () => void
}) {
  const [mode, setMode] = useState<'manual' | 'stripe'>('manual')
  const [planId, setPlanId] = useState(plans[0]?.id || '')
  const [method, setMethod] = useState<'cash' | 'transfer' | 'card' | 'other'>('cash')
  const [notes, setNotes] = useState('')
  const [invoiceType, setInvoiceType] = useState<'none' | 'boleta' | 'factura'>('none')
  const [receiverRut, setReceiverRut] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [saving, setSaving] = useState(false)
  const [stripeUrl, setStripeUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  const selectedPlan = plans.find(p => p.id === planId)
  const formatPrice = (p: any) =>
    p ? `${toMajorUnits(p.priceCents, p.currency).toLocaleString('es-CL')} ${p.currency}` : ''

  const handleManual = async () => {
    if (!planId) return
    if (invoiceType === 'factura' && !receiverRut) {
      setError('El RUT es requerido para generar una factura')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.post('/payments/manual', {
        userId, planId, paymentMethod: method,
        paymentNotes: notes || undefined,
        invoiceType: invoiceType !== 'none' ? invoiceType : undefined,
        receiverRut: invoiceType === 'factura' ? receiverRut : undefined,
        receiverName: invoiceType === 'factura' ? receiverName : undefined,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al registrar pago')
    } finally { setSaving(false) }
  }

  const handleStripe = async () => {
    if (!planId) return
    setSaving(true)
    setError('')
    try {
      const { data } = await api.post('/payments/checkout', { planId, userId })
      setStripeUrl(data.url)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al generar link de pago')
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden modal-animate card" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5" style={{ color: 'var(--brand-accent)' }} />
              <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Registrar pago</h2>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Plan</label>
              <select value={planId} onChange={e => setPlanId(e.target.value)} className="input">
                {plans.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {toMajorUnits(p.priceCents, p.currency).toLocaleString('es-CL')} {p.currency} · {p.durationDays}d
                  </option>
                ))}
              </select>
              {selectedPlan && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>
                  Duración: {selectedPlan.durationDays} días · Precio: {formatPrice(selectedPlan)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-2)' }}>Método de pago</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setMode('manual'); setStripeUrl(null) }}
                  className="flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all"
                  style={mode === 'manual' ? {
                    borderColor: 'var(--brand-accent)',
                    backgroundColor: 'color-mix(in srgb, var(--brand-accent) 10%, var(--surface-card))',
                    color: 'var(--brand-accent)',
                  } : { borderColor: 'var(--border-1)', color: 'var(--text-2)', backgroundColor: 'var(--surface-base)' }}>
                  <Banknote className="w-4 h-4 shrink-0" />
                  Pago presencial
                </button>
                <button onClick={() => { setMode('stripe'); setStripeUrl(null) }}
                  className="flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all"
                  style={mode === 'stripe' ? {
                    borderColor: '#6366f1',
                    backgroundColor: 'color-mix(in srgb, #6366f1 10%, var(--surface-card))',
                    color: '#6366f1',
                  } : { borderColor: 'var(--border-1)', color: 'var(--text-2)', backgroundColor: 'var(--surface-base)' }}>
                  <CreditCard className="w-4 h-4 shrink-0" />
                  Pago online (Stripe)
                </button>
              </div>
            </div>

            {mode === 'manual' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-2)' }}>Forma de pago</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['cash', 'transfer', 'card', 'other'] as const).map(m => (
                      <button key={m} onClick={() => setMethod(m)}
                        className="flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-all"
                        style={method === m ? {
                          borderColor: 'var(--brand-accent)',
                          backgroundColor: 'color-mix(in srgb, var(--brand-accent) 8%, var(--surface-card))',
                          color: 'var(--text-1)',
                        } : { borderColor: 'var(--border-1)', color: 'var(--text-3)', backgroundColor: 'transparent' }}>
                        <span>{METHOD_ICON[m]}</span>
                        {METHOD_LABEL[m]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
                    Notas <span className="font-normal" style={{ color: 'var(--text-4)' }}>(opcional)</span>
                  </label>
                  <input value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="N° transferencia, referencia, etc."
                    className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-2)' }}>Documento tributario</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['none', 'boleta', 'factura'] as const).map(t => (
                      <button key={t} onClick={() => setInvoiceType(t)}
                        className="p-2.5 rounded-lg border text-xs font-medium transition-all"
                        style={invoiceType === t ? {
                          borderColor: 'var(--brand-accent)',
                          backgroundColor: 'color-mix(in srgb, var(--brand-accent) 8%, var(--surface-card))',
                          color: 'var(--text-1)',
                        } : { borderColor: 'var(--border-1)', color: 'var(--text-3)', backgroundColor: 'transparent' }}>
                        {t === 'none' ? 'Sin documento' : t === 'boleta' ? '📄 Boleta' : '🧾 Factura'}
                      </button>
                    ))}
                  </div>
                </div>
                {invoiceType === 'factura' && (
                  <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: 'var(--surface-base)', border: '1px solid var(--border-1)' }}>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Datos del receptor (empresa)</p>
                    <input value={receiverRut} onChange={e => setReceiverRut(e.target.value)}
                      placeholder="RUT receptor ej: 76.123.456-7" className="input text-sm" />
                    <input value={receiverName} onChange={e => setReceiverName(e.target.value)}
                      placeholder="Razón social receptor" className="input text-sm" />
                  </div>
                )}
              </div>
            )}

            {mode === 'stripe' && !stripeUrl && (
              <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: 'var(--surface-base)', border: '1px solid var(--border-1)' }}>
                <p style={{ color: 'var(--text-2)' }}>
                  Se generará un link de pago seguro de Stripe para que el alumno pague con tarjeta.
                  La membresía se activará automáticamente al completar el pago.
                </p>
              </div>
            )}

            {stripeUrl && (
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-medium text-green-700">Link generado</p>
                </div>
                <p className="text-xs text-green-600 break-all">{stripeUrl}</p>
                <a href={stripeUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm font-medium text-green-700 underline">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir página de pago
                </a>
                <p className="text-xs text-green-600">Comparte este link con el alumno para que complete el pago.</p>
              </div>
            )}

            {error && (
              <div className="text-sm rounded-lg px-3 py-2.5 bg-red-50 border border-red-200 text-red-600">{error}</div>
            )}

            {!stripeUrl && (
              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="flex-1 btn-secondary py-2.5 rounded-xl text-sm">Cancelar</button>
                <button
                  onClick={mode === 'manual' ? handleManual : handleStripe}
                  disabled={saving || !planId}
                  className="flex-1 btn-brand py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
                  {saving ? 'Procesando...' : mode === 'manual' ? 'Confirmar pago' : 'Generar link Stripe'}
                </button>
              </div>
            )}
            {stripeUrl && (
              <button onClick={onClose} className="w-full btn-secondary py-2.5 rounded-xl text-sm">Cerrar</button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/* ─── Reset Password Modal ──────────────────────── */
function ResetPasswordModal({ userId, onClose, onSuccess }: { userId: string; onClose: () => void; onSuccess: () => void }) {
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) { setError('Mínimo 6 caracteres'); return }
    setSaving(true)
    setError('')
    try {
      await api.post(`/users/${userId}/reset-password`, { newPassword })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al resetear contraseña')
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden modal-animate card" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" style={{ color: 'var(--brand-accent)' }} />
              <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Resetear contraseña</h2>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              El alumno deberá cambiar esta contraseña al iniciar sesión.
            </p>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Nueva contraseña</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="input"
                autoFocus
              />
            </div>
            {error && (
              <div className="text-sm rounded-lg px-3 py-2 bg-red-50 border border-red-200 text-red-600">{error}</div>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 btn-secondary py-2.5 rounded-xl text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 btn-brand py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

/* ─── Helpers ───────────────────────────────────── */
function calcAge(birthDate: string): number {
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function calcDaysMember(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
}

function getBestRms(rmRecords: any[]): Record<string, any> {
  return rmRecords.reduce((acc: Record<string, any>, rm: any) => {
    if (!acc[rm.movementName] || new Date(rm.recordedAt) > new Date(acc[rm.movementName].recordedAt)) {
      acc[rm.movementName] = rm
    }
    return acc
  }, {})
}

/* ─── Main Page ─────────────────────────────────── */
export default function UserDetailPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [member, setMember] = useState<any>(null)
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', gender: '' })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [showExtendModal, setShowExtendModal] = useState(false)
  const [showReversalModal, setShowReversalModal] = useState(false)
  const [extendDays, setExtendDays] = useState(7)
  const [reversalNotes, setReversalNotes] = useState('')
  const [membershipActionLoading, setMembershipActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()
  const params = useParams()

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchData(true)
  }, [user])

  const fetchData = async (resetForm = false) => {
    try {
      const [memberRes, plansRes] = await Promise.all([
        api.get(`/users/${params.id}`),
        api.get('/plans'),
      ])
      setMember(memberRes.data)
      setPlans(plansRes.data)
      if (resetForm) {
        setEditForm({
          name: memberRes.data.name,
          email: memberRes.data.email || '',
          phone: memberRes.data.phone || '',
          gender: memberRes.data.gender || '',
        })
        setAvatarFile(null)
        setAvatarPreview(null)
      }
    } catch { router.push('/dashboard/users') }
    finally { setLoading(false) }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    const reader = new FileReader()
    reader.onload = ev => setAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingEdit(true)
    setError('')
    try {
      await api.put(`/users/${params.id}`, editForm)

      if (avatarFile) {
        setSavingAvatar(true)
        const fd = new FormData()
        fd.append('file', avatarFile)
        await api.post(`/users/${params.id}/avatar`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        setSavingAvatar(false)
      }

      setSuccess('Datos actualizados')
      setEditing(false)
      fetchData(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al actualizar')
      setSavingAvatar(false)
    } finally { setSavingEdit(false) }
  }

  const handleRenew = async () => {
    setError('')
    try {
      await api.post(`/memberships/${params.id}/renew`)
      setSuccess('Membresía renovada')
      fetchData(false)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al renovar')
    }
  }

  const handleToggleMembership = async (membershipId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' || currentStatus === 'TRIAL' ? 'INACTIVE' : 'ACTIVE'
    const label = newStatus === 'ACTIVE' ? 'activar' : 'desactivar'
    if (!confirm(`¿Seguro que deseas ${label} esta membresía?`)) return
    setMembershipActionLoading(true)
    try {
      await api.patch(`/memberships/${membershipId}`, { status: newStatus })
      fetchData(false)
    } catch { alert('Error al actualizar la membresía') }
    finally { setMembershipActionLoading(false) }
  }

  const handleExtend = async (membershipId: string) => {
    setMembershipActionLoading(true)
    try {
      await api.patch(`/memberships/${membershipId}`, { extendDays })
      setShowExtendModal(false)
      fetchData(false)
    } catch { alert('Error al extender la membresía') }
    finally { setMembershipActionLoading(false) }
  }

  const handleReversal = async (membershipId: string) => {
    setMembershipActionLoading(true)
    try {
      await api.patch(`/memberships/${membershipId}`, { reversalNotes: reversalNotes || 'Reversión manual' })
      setShowReversalModal(false)
      setReversalNotes('')
      fetchData(false)
    } catch { alert('Error al reversar la membresía') }
    finally { setMembershipActionLoading(false) }
  }

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="px-6 py-8 space-y-5">
        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton style={{ width: 32, height: 32, borderRadius: 8 }} />
          <div className="space-y-2">
            <Skeleton style={{ width: 200, height: 20, borderRadius: 6 }} />
            <Skeleton style={{ width: 140, height: 14, borderRadius: 6 }} />
          </div>
        </div>
        {/* Profile card skeleton */}
        <div className="card rounded-xl p-6">
          <div className="flex items-start gap-5">
            <Skeleton style={{ width: 72, height: 72, borderRadius: 24 }} />
            <div className="flex-1 space-y-3">
              <Skeleton style={{ width: '60%', height: 24, borderRadius: 6 }} />
              <Skeleton style={{ width: '40%', height: 16, borderRadius: 6 }} />
              <Skeleton style={{ width: '55%', height: 16, borderRadius: 6 }} />
            </div>
          </div>
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => (
            <div key={i} className="stat-card">
              <Skeleton style={{ width: 32, height: 32, borderRadius: 8, marginBottom: 12 }} />
              <Skeleton style={{ width: '80%', height: 36, borderRadius: 8 }} />
            </div>
          ))}
        </div>
        {/* Sections skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
          <div className="space-y-5">
            {[0,1].map(i => (
              <div key={i} className="card rounded-xl p-6 space-y-3">
                <Skeleton style={{ width: 160, height: 20, borderRadius: 6 }} />
                <Skeleton style={{ width: '100%', height: 48, borderRadius: 8 }} />
                <Skeleton style={{ width: '100%', height: 48, borderRadius: 8 }} />
              </div>
            ))}
          </div>
          <div className="card rounded-xl p-6 space-y-3">
            <Skeleton style={{ width: 160, height: 20, borderRadius: 6 }} />
            <Skeleton style={{ width: '100%', height: 80, borderRadius: 8 }} />
          </div>
        </div>
      </div>
    )
  }

  if (!member) return null

  /* ── Derived data ── */
  const activeMembership = member.memberships?.find((m: any) => m.status === 'ACTIVE')
  const daysLeft = activeMembership
    ? Math.ceil((new Date(activeMembership.endsAt).getTime() - Date.now()) / 86_400_000)
    : null
  const currentAvatar = member.avatarUrl ? mediaUrl(member.avatarUrl) : null
  const displayAvatar = avatarPreview ?? currentAvatar

  const memberStatus = activeMembership?.status ?? (member.memberships?.length > 0 ? 'EXPIRED' : 'INACTIVE')
  const statusStyle = STATUS_STYLE[memberStatus] ?? STATUS_STYLE.INACTIVE

  const age = member.birthDate ? calcAge(member.birthDate) : null
  const daysMember = calcDaysMember(member.createdAt)
  const bestRms = getBestRms(member.rmRecords ?? [])
  const rmCount = Object.keys(bestRms).length
  const attendedCount = member.memberships?.reduce((acc: number, m: any) => {
    // approximate: no direct bookings count in this endpoint; show memberships as proxy
    return acc
  }, 0)

  const genderLabel: Record<string, string> = { M: 'Masculino', F: 'Femenino', OTHER: 'Otro' }

  return (
    <div className="px-6 py-8 fade-up">

      {/* ── Top navigation ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard/users')}
            className="w-8 h-8 flex items-center justify-center rounded-lg btn-secondary">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>{member.name}</h1>
            <p className="text-sm" style={{ color: 'var(--text-4)' }}>Perfil de miembro</p>
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {activeMembership && (
            <button onClick={handleRenew}
              className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg">
              <RefreshCw className="w-3.5 h-3.5" />
              Renovar
            </button>
          )}
          <button onClick={() => setShowPayment(true)}
            className="btn-brand flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg">
            <Wallet className="w-3.5 h-3.5" />
            Registrar pago
          </button>
          <button onClick={() => { setEditing(!editing); setError(''); setSuccess('') }}
            className="btn-secondary flex items-center gap-2 px-3 py-2 text-sm rounded-lg">
            <Edit2 className="w-3.5 h-3.5" />
            {editing ? 'Cancelar' : 'Editar'}
          </button>
        </div>
      </div>

      {/* ── Toast messages ── */}
      {success && (
        <div className="rounded-xl px-4 py-3 text-sm bg-green-50 border border-green-200 text-green-700 flex items-center gap-2 mb-5">
          <CheckCircle className="w-4 h-4 shrink-0" />{success}
        </div>
      )}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-600 mb-5">{error}</div>
      )}

      {/* ══════════════════════════════════════════════
          SECCIÓN 1 — Header de perfil (full width)
      ══════════════════════════════════════════════ */}
      <div className="card rounded-xl p-6 mb-5">
        {editing ? (
          /* ── Edit form (unchanged logic) ── */
          <form onSubmit={handleEdit} className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <Avatar name={member.name} src={displayAvatar} size={64} />
                <button type="button" onClick={() => avatarInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center shadow"
                  style={{ backgroundColor: 'var(--brand-accent)', color: '#fff' }}>
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>Foto de perfil</p>
                <button type="button" onClick={() => avatarInputRef.current?.click()}
                  className="text-xs mt-0.5" style={{ color: 'var(--brand-accent)' }}>
                  Cambiar imagen
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Nombre</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="input" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Email</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Teléfono</label>
                <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Género</label>
                <select value={editForm.gender} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))} className="input">
                  <option value="">Sin especificar</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button type="button"
                onClick={() => { setEditing(false); setShowResetPassword(true) }}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg"
                style={{ color: 'var(--text-3)', border: '1px solid var(--border-1)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <KeyRound className="w-3.5 h-3.5" />
                Resetear contraseña
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setEditing(false); setAvatarFile(null); setAvatarPreview(null) }}
                  className="btn-secondary px-5 py-2 rounded-lg text-sm">
                  Cancelar
                </button>
                <button type="submit" disabled={savingEdit || savingAvatar}
                  className="btn-brand px-5 py-2 rounded-lg disabled:opacity-50 text-sm">
                  {savingAvatar ? 'Subiendo imagen...' : savingEdit ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* ── View mode ── */
          <div className="flex items-start gap-5">
            <Avatar name={member.name} src={currentAvatar} size={72} />

            <div className="flex-1 min-w-0">
              {/* Name + badges row */}
              <div className="flex items-start gap-3 flex-wrap">
                <h2 className="text-xl font-bold leading-tight" style={{ color: 'var(--text-1)' }}>
                  {member.name}
                </h2>
                {/* Status badge */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '0.2rem 0.65rem', borderRadius: 9999,
                  fontSize: '0.75rem', fontWeight: 600,
                  backgroundColor: statusStyle.bg, color: statusStyle.color,
                  border: `1px solid ${statusStyle.color}40`,
                }}>
                  {statusStyle.label}
                </span>
                {/* Role badge */}
                {member.role && member.role !== 'MEMBER' && (
                  <span className="badge-purple">{member.role}</span>
                )}
              </div>

              {/* Email */}
              <p className="text-sm mt-1" style={{ color: 'var(--text-4)' }}>{member.email}</p>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm" style={{ color: 'var(--text-3)' }}>
                {member.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    {member.phone}
                  </span>
                )}
                {member.gender && (
                  <span className="flex items-center gap-1.5">
                    <User2 className="w-3.5 h-3.5 shrink-0" />
                    {genderLabel[member.gender] ?? member.gender}
                  </span>
                )}
                {age !== null && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    {age} años
                  </span>
                )}
                {member.rut && (
                  <span className="flex items-center gap-1.5" style={{ color: 'var(--text-4)' }}>
                    RUT: {member.rut}
                  </span>
                )}
              </div>

              {/* Active membership pill */}
              {activeMembership && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium"
                  style={{ backgroundColor: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
                  {activeMembership.plan?.name}
                  {' · vence '}
                  {new Date(activeMembership.endsAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {daysLeft !== null && daysLeft > 0 && (
                    <span style={{ opacity: 0.75 }}>({daysLeft}d)</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          SECCIÓN 2 — Estadísticas rápidas (full width)
      ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <QuickStatCard
          icon={Activity}
          label="Membresías totales"
          value={member.memberships?.length ?? 0}
          colorVar="var(--primary)"
        />
        <QuickStatCard
          icon={Trophy}
          label="Récords personales"
          value={rmCount}
          colorVar="#f59e0b"
        />
        <QuickStatCard
          icon={TrendingUp}
          label="Hitos gimnásticos"
          value={member.gymnasticProgress?.length ?? 0}
          colorVar="#22c55e"
        />
        <QuickStatCard
          icon={Clock}
          label="Días como miembro"
          value={daysMember}
          colorVar="#8b5cf6"
        />
      </div>

      {/* ── Grid 2 columnas: izquierda = historial + RMs + gimnástica, derecha = membresía activa ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">

        {/* ── Columna izquierda ── */}
        <div className="space-y-5">

          {/* Historial de membresías */}
          <div className="card rounded-xl p-6">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Historial de membresías</h3>
            {!member.memberships?.length ? (
              <div className="py-6 text-center" style={{ color: 'var(--text-4)' }}>
                <p className="text-sm">Sin historial de membresías</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
                      {['Plan', 'Inicio', 'Vencimiento', 'Método', 'Monto', 'Estado', ''].map(h => (
                        <th key={h} className="text-left pb-3 pr-4 font-medium" style={{ color: 'var(--text-4)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border-1)' }}>
                    {member.memberships.map((m: any) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--border-1)' }}>
                        <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-1)' }}>
                          {m.plan?.name ?? '—'}
                          {m.invoicePdfUrl && (
                            <a href={m.invoicePdfUrl} target="_blank" rel="noreferrer"
                              className="ml-2 inline-flex items-center gap-0.5 text-xs"
                              style={{ color: 'var(--brand-accent)' }}>
                              <ExternalLink className="w-3 h-3" />
                              {m.invoiceType === 'factura' ? 'Factura' : 'Boleta'}
                            </a>
                          )}
                        </td>
                        <td className="py-3 pr-4" style={{ color: 'var(--text-3)' }}>
                          {new Date(m.startsAt).toLocaleDateString('es-CL')}
                        </td>
                        <td className="py-3 pr-4" style={{ color: 'var(--text-3)' }}>
                          {new Date(m.endsAt).toLocaleDateString('es-CL')}
                        </td>
                        <td className="py-3 pr-4" style={{ color: 'var(--text-3)' }}>
                          {m.paymentMethod ? `${METHOD_ICON[m.paymentMethod]} ${METHOD_LABEL[m.paymentMethod] || m.paymentMethod}` : '—'}
                        </td>
                        <td className="py-3 pr-4 font-semibold" style={{ color: 'var(--text-1)' }}>
                          {m.pricePaid != null ? `${toMajorUnits(m.pricePaid, m.currency).toLocaleString('es-CL')} ${m.currency}` : '—'}
                        </td>
                        <td className="py-3">
                          <span className={STATUS_BADGE[m.status] || 'badge-gray'}>
                            {STATUS_LABEL[m.status] || m.status}
                          </span>
                        </td>
                        <td className="py-3">
                          {(m.status === 'ACTIVE' || m.status === 'TRIAL' || m.status === 'INACTIVE') && (
                            <button
                              onClick={() => handleToggleMembership(m.id, m.status)}
                              disabled={membershipActionLoading}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50"
                              style={{ borderColor: 'var(--border-2)', color: 'var(--text-3)', backgroundColor: 'transparent' }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                            >
                              {m.status === 'INACTIVE' ? 'Activar' : 'Desactivar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Récords personales */}
          {rmCount > 0 && (
            <div className="card rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4" style={{ color: '#f59e0b' }} />
                <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>Récords personales</h3>
                <span className="badge-yellow ml-auto">{rmCount} movimientos</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(bestRms).map(([movement, rm]: any) => (
                  <div key={movement} className="rounded-xl p-4 transition-all"
                    style={{ backgroundColor: 'var(--surface-base)', border: '1px solid var(--border-1)' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-1)')}>
                    <p className="text-xs mb-1 font-medium" style={{ color: 'var(--text-4)' }}>{movement}</p>
                    <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
                      {rm.weightKg}
                      <span className="text-sm font-normal ml-1" style={{ color: 'var(--text-4)' }}>kg</span>
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>
                      {new Date(rm.recordedAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progresión gimnástica */}
          {member.gymnasticProgress?.length > 0 && (
            <div className="card rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4" style={{ color: '#22c55e' }} />
                <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>Progresión gimnástica</h3>
                <span className="badge-green ml-auto">{member.gymnasticProgress.length} hitos</span>
              </div>
              <div className="space-y-3">
                {Object.entries(
                  member.gymnasticProgress.reduce((acc: any, p: any) => {
                    if (!acc[p.skillName]) acc[p.skillName] = []
                    acc[p.skillName].push(p)
                    return acc
                  }, {})
                ).map(([skill, milestones]: any) => (
                  <div key={skill} className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border-1)' }}>
                    <div className="flex items-center justify-between px-4 py-3"
                      style={{ backgroundColor: 'var(--surface-base)' }}>
                      <span className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{skill}</span>
                      <span className="text-xs" style={{ color: '#22c55e' }}>
                        {(milestones as any[]).length} hito{(milestones as any[]).length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="divide-y" style={{ borderColor: 'var(--border-1)' }}>
                      {(milestones as any[]).map((p: any) => (
                        <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-green-100">
                            <CheckCircle className="w-3 h-3 text-green-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{p.milestone}</p>
                            <p className="text-xs" style={{ color: 'var(--text-4)' }}>
                              {new Date(p.achievedAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>{/* fin columna izquierda */}

        {/* ── Columna derecha: membresía activa ── */}
        <div className="card rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>Membresía activa</h3>
            <div className="flex items-center gap-2">
              {activeMembership && (
                <button onClick={handleRenew}
                  className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs">
                  <RefreshCw className="w-3 h-3" />
                  Renovar
                </button>
              )}
              <button onClick={() => setShowPayment(true)}
                className="btn-brand flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs">
                <Wallet className="w-3 h-3" />
                Pago
              </button>
            </div>
          </div>

          {activeMembership ? (
            <div className="space-y-3">
              <div>
                <p className="font-semibold" style={{ color: 'var(--text-1)' }}>{activeMembership.plan?.name}</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-4)' }}>
                  {new Date(activeMembership.startsAt).toLocaleDateString('es-CL')} –{' '}
                  {new Date(activeMembership.endsAt).toLocaleDateString('es-CL')}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className={`badge-${daysLeft !== null && daysLeft <= 3 ? 'red' : daysLeft !== null && daysLeft <= 7 ? 'yellow' : 'green'}`}>
                  {daysLeft !== null && daysLeft > 0 ? `${daysLeft}d restantes` : 'Vencida'}
                </span>
                {activeMembership.paymentMethod && (
                  <p className="text-xs" style={{ color: 'var(--text-4)' }}>
                    {METHOD_ICON[activeMembership.paymentMethod]} {METHOD_LABEL[activeMembership.paymentMethod] || activeMembership.paymentMethod}
                  </p>
                )}
              </div>
              {daysLeft !== null && activeMembership.plan && (
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-hover)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(0, Math.min(100, (daysLeft / activeMembership.plan.durationDays) * 100))}%`,
                      backgroundColor: daysLeft <= 3 ? '#ef4444' : daysLeft <= 7 ? '#f59e0b' : '#22c55e',
                    }} />
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-3 border-t" style={{ borderColor: 'var(--border-1)' }}>
                <button
                  onClick={() => setShowExtendModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                  style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)', backgroundColor: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Extender
                </button>
                <button
                  onClick={() => handleToggleMembership(activeMembership.id, activeMembership.status)}
                  disabled={membershipActionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                  style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)', backgroundColor: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {activeMembership.status === 'INACTIVE' ? 'Activar' : 'Desactivar'}
                </button>
                <button
                  onClick={() => setShowReversalModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                  style={{ borderColor: '#ef444440', color: '#ef4444', backgroundColor: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #ef4444 8%, transparent)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Reversar pago
                </button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center" style={{ color: 'var(--text-4)' }}>
              <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin membresía activa</p>
              <button onClick={() => setShowPayment(true)}
                className="btn-brand mt-3 px-4 py-2 text-sm">
                + Asignar plan
              </button>
            </div>
          )}
        </div>{/* fin columna derecha */}

      </div>{/* fin grid */}

      {/* ── Modals ── */}
      {showPayment && (
        <PaymentModal
          userId={params.id as string}
          plans={plans}
          onClose={() => setShowPayment(false)}
          onSuccess={() => { setSuccess('Pago registrado correctamente'); fetchData(false) }}
        />
      )}

      {showResetPassword && (
        <ResetPasswordModal
          userId={params.id as string}
          onClose={() => setShowResetPassword(false)}
          onSuccess={() => setSuccess('Contraseña reseteada. El alumno deberá cambiarla al ingresar.')}
        />
      )}

      {/* ── Extend membership modal ── */}
      {showExtendModal && activeMembership && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
            onClick={() => setShowExtendModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowExtendModal(false)}>
            <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden modal-animate card" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" style={{ color: 'var(--brand-accent)' }} />
                  <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Extender membresía</h2>
                </div>
                <button onClick={() => setShowExtendModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg"
                  style={{ color: 'var(--text-3)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                  Vencimiento actual: <strong>{new Date(activeMembership.endsAt).toLocaleDateString('es-CL')}</strong>
                </p>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Días a extender</label>
                  <input
                    type="number" min={1} max={365} value={extendDays}
                    onChange={e => setExtendDays(Number(e.target.value))}
                    className="input"
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>
                    Nuevo vencimiento: {(() => {
                      const d = new Date(new Date(activeMembership.endsAt) > new Date() ? activeMembership.endsAt : new Date())
                      d.setDate(d.getDate() + extendDays)
                      return d.toLocaleDateString('es-CL')
                    })()}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowExtendModal(false)}
                    className="flex-1 btn-secondary py-2.5 rounded-xl text-sm">
                    Cancelar
                  </button>
                  <button onClick={() => handleExtend(activeMembership.id)} disabled={membershipActionLoading}
                    className="flex-1 btn-brand py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
                    {membershipActionLoading ? 'Guardando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Reversal modal ── */}
      {showReversalModal && activeMembership && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
            onClick={() => setShowReversalModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowReversalModal(false)}>
            <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden modal-animate card" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
                <div className="flex items-center gap-2">
                  <Banknote className="w-5 h-5" style={{ color: 'var(--brand-accent)' }} />
                  <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Reversar pago</h2>
                </div>
                <button onClick={() => setShowReversalModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg"
                  style={{ color: 'var(--text-3)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                  Esto desactivará la membresía y registrará el motivo. El reembolso se gestiona manualmente.
                </p>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Motivo (opcional)</label>
                  <textarea
                    value={reversalNotes}
                    onChange={e => setReversalNotes(e.target.value)}
                    placeholder="Ej: Lesión, doble cobro, solicitud del alumno..."
                    rows={3}
                    className="input resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowReversalModal(false)}
                    className="flex-1 btn-secondary py-2.5 rounded-xl text-sm">
                    Cancelar
                  </button>
                  <button onClick={() => handleReversal(activeMembership.id)} disabled={membershipActionLoading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: '#ef4444' }}>
                    {membershipActionLoading ? 'Procesando...' : 'Reversar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
