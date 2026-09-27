'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api, { API_BASE } from '../../../lib/api'
import {
  Building2, Sun, Moon, Calendar, Upload,
  CheckCircle, Bell, FileText, Palette, Receipt,
  Settings2, CreditCard, Loader2, MapPin, Users,
} from 'lucide-react'

// ── Secciones de la nav lateral ───────────────────────────────────────────────
const SECTIONS = [
  { id: 'perfil',         label: 'Perfil del box',     icon: Building2   },
  { id: 'marca',          label: 'Marca y diseño',      icon: Palette     },
  { id: 'reservas',       label: 'Reservas y clases',   icon: Calendar    },
  { id: 'notificaciones', label: 'Notificaciones',      icon: Bell        },
  { id: 'asistencia',     label: 'Asistencia',          icon: MapPin      },
  { id: 'waitlist',       label: 'Lista de espera',     icon: Users       },
  { id: 'facturacion',    label: 'Facturación',         icon: Receipt     },
  { id: 'pagos',          label: 'Pagos',               icon: CreditCard  },
  { id: 'avanzado',       label: 'Avanzado',            icon: Settings2   },
]

// ── Sport themes ──────────────────────────────────────────────────────────────
const SPORT_THEMES = [
  { id: 'crossfit', label: 'CrossFit', color: '#F97316', emoji: '🏋️' },
  { id: 'hyrox',    label: 'HYROX',    color: '#EF4444', emoji: '⚡' },
  { id: 'neutral',  label: 'Neutral',  color: '#6366F1', emoji: '🏟️' },
] as const

type SportThemeId = (typeof SPORT_THEMES)[number]['id']

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      className="fade-up"
      style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 18px', borderRadius: 12,
        backgroundColor: type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        border: `1px solid ${type === 'success' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
        color: type === 'success' ? '#22c55e' : '#ef4444',
        fontSize: 14, fontWeight: 600,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        backdropFilter: 'blur(12px)',
        maxWidth: 360,
      }}>
      {type === 'success'
        ? <CheckCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
        : <span style={{ flexShrink: 0 }}>✕</span>}
      {message}
    </div>
  )
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', width: 40, height: 22, borderRadius: 999, border: 'none',
        cursor: 'pointer', flexShrink: 0, transition: 'background-color 0.2s',
        backgroundColor: checked ? 'var(--primary)' : 'var(--border-2)',
      }}>
      <span style={{
        position: 'absolute', top: 3, width: 16, height: 16,
        backgroundColor: '#fff', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        transition: 'left 0.2s',
        left: checked ? 20 : 3,
      }} />
    </button>
  )
}

// ── SaveButton con spinner ────────────────────────────────────────────────────
function SaveButton({ saving, label = 'Guardar', fullWidth = false, onClick }: {
  saving: boolean; label?: string; fullWidth?: boolean; onClick?: () => void
}) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      disabled={saving}
      className="btn-brand"
      style={{
        width: fullWidth ? '100%' : 'auto',
        padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, opacity: saving ? 0.7 : 1,
      }}>
      {saving && <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} />}
      {label}
    </button>
  )
}

// ── FieldLabel ────────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>
      {children}
    </label>
  )
}

// ── SectionCard ───────────────────────────────────────────────────────────────
function SectionCard({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode
}) {
  return (
    <div className="card" style={{ padding: '24px', marginBottom: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</h3>
        {description && (
          <p style={{ fontSize: 13, color: 'var(--text-4)', marginTop: 4 }}>{description}</p>
        )}
      </div>
      <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 20 }}>
        {children}
      </div>
    </div>
  )
}

// ── PillSelector ──────────────────────────────────────────────────────────────
function PillSelector<T extends number | string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map(opt => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
            borderColor: value === opt.value ? 'var(--primary)' : 'var(--border-2)',
            backgroundColor: value === opt.value
              ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
              : 'transparent',
            color: value === opt.value ? 'var(--primary)' : 'var(--text-3)',
          }}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── GatewayToggleRow ──────────────────────────────────────────────────────────
function GatewayRow({ label, enabled, onToggle, children }: {
  label: string; enabled: boolean; onToggle: () => void; children?: React.ReactNode
}) {
  return (
    <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 16, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: enabled ? 14 : 0 }}>
        <Toggle checked={enabled} onChange={onToggle} />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{label}</span>
        {enabled && (
          <span className="badge-green" style={{ marginLeft: 'auto' }}>Activo</span>
        )}
      </div>
      {enabled && children && (
        <div style={{ paddingLeft: 52 }}>{children}</div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [gym, setGym] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [sportTheme, setSportTheme] = useState<SportThemeId>('neutral')
  const [savingSport, setSavingSport] = useState(false)
  const [activeSection, setActiveSection] = useState('perfil')

  const [form, setForm] = useState({
    name: '', address: '', phone: '', email: '',
    instagram: '', facebook: '',
    bookingWindowDays: 1, bookingCutoffMins: 60, cancelCutoffMins: 30,
    termsAndConditions: '',
  })

  const [notifForm, setNotifForm] = useState({ expiryReminderDays: 3 })

  const [dteForm, setDteForm] = useState({
    bsaleToken: '', bsaleOfficeId: 1, bsalePriceListId: 1,
    bsaleBoletaTypeId: 0, bsaleFacturaTypeId: 0,
    dteRut: '', dteRazonSocial: '', dteGiro: '',
    dteDireccion: '', dteComuna: '', dteCiudad: '',
  })

  const [savingNotif, setSavingNotif] = useState(false)
  const [savingDte, setSavingDte] = useState(false)
  const [savingBank, setSavingBank] = useState(false)
  const [bankForm, setBankForm] = useState({
    ownerName: '', rut: '', bank: '', accountType: '', accountNumber: '', email: '',
  })
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [attendanceForm, setAttendanceForm] = useState({
    attendanceMode: 'manual' as 'manual' | 'auto',
    gymLat: '', gymLng: '', gymRadiusMeters: 200,
  })
  const [savingWaitlist, setSavingWaitlist] = useState(false)
  const [waitlistForm, setWaitlistForm] = useState({
    waitlistConfirmEnabled: false,
    waitlistConfirmMins: 30,
  })
  const [savingGateways, setSavingGateways] = useState(false)
  const [gatewaysForm, setGatewaysForm] = useState({
    stripe:      { enabled: false, publishableKey: '', secretKey: '', webhookSecret: '' },
    flow:        { enabled: false, apiKey: '', secretKey: '', sandbox: true },
    khipu:       { enabled: false, receiverId: '', secretKey: '' },
    mercadopago: { enabled: false, accessToken: '' },
    mach:        { enabled: false, apiKey: '' },
  })

  const router = useRouter()

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
  }

  useEffect(() => {
    loadFromStorage()
    const saved = localStorage.getItem('fitapp_theme') as 'light' | 'dark' | null
    if (saved) setTheme(saved)
    const savedSport = localStorage.getItem('fitapp_sport_theme') as SportThemeId | null
    if (savedSport) setSportTheme(savedSport)
  }, [])

  const toggleTheme = (t: 'light' | 'dark') => {
    setTheme(t)
    localStorage.setItem('fitapp_theme', t)
    if (t === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: t } }))
  }

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchGym()
  }, [user])

  const fetchGym = async () => {
    try {
      const { data } = await api.get('/gyms/me')
      setGym(data)
      setForm({
        name: data.name || '',
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        instagram: data.instagram || '',
        facebook: data.facebook || '',
        bookingWindowDays: data.bookingWindowDays || 1,
        bookingCutoffMins: data.bookingCutoffMins ?? 60,
        cancelCutoffMins: data.cancelCutoffMins ?? 30,
        termsAndConditions: data.termsAndConditions || '',
      })
      setNotifForm({ expiryReminderDays: data.expiryReminderDays ?? 3 })
      setDteForm({
        bsaleToken: data.bsaleToken || '',
        bsaleOfficeId: data.bsaleOfficeId || 1,
        bsalePriceListId: data.bsalePriceListId || 1,
        bsaleBoletaTypeId: data.bsaleBoletaTypeId || 0,
        bsaleFacturaTypeId: data.bsaleFacturaTypeId || 0,
        dteRut: data.dteRut || '',
        dteRazonSocial: data.dteRazonSocial || '',
        dteGiro: data.dteGiro || '',
        dteDireccion: data.dteDireccion || '',
        dteComuna: data.dteComuna || '',
        dteCiudad: data.dteCiudad || '',
      })
      setAttendanceForm({
        attendanceMode: data.attendanceMode || 'manual',
        gymLat: data.gymLat != null ? String(data.gymLat) : '',
        gymLng: data.gymLng != null ? String(data.gymLng) : '',
        gymRadiusMeters: data.gymRadiusMeters || 200,
      })
      setWaitlistForm({
        waitlistConfirmEnabled: data.waitlistConfirmEnabled ?? false,
        waitlistConfirmMins: data.waitlistConfirmMins ?? 30,
      })
      if (data.sportTheme) setSportTheme(data.sportTheme as SportThemeId)
      if (data.bankAccount) {
        setBankForm({
          ownerName: data.bankAccount.ownerName || '',
          rut: data.bankAccount.rut || '',
          bank: data.bankAccount.bank || '',
          accountType: data.bankAccount.accountType || '',
          accountNumber: data.bankAccount.accountNumber || '',
          email: data.bankAccount.email || '',
        })
      }
      if (data.paymentGateways) {
        const gw = data.paymentGateways
        setGatewaysForm({
          stripe:      { enabled: gw.stripe?.enabled ?? false, publishableKey: gw.stripe?.publishableKey || '', secretKey: gw.stripe?.secretKey || '', webhookSecret: gw.stripe?.webhookSecret || '' },
          flow:        { enabled: gw.flow?.enabled ?? false, apiKey: gw.flow?.apiKey || '', secretKey: gw.flow?.secretKey || '', sandbox: gw.flow?.sandbox ?? true },
          khipu:       { enabled: gw.khipu?.enabled ?? false, receiverId: gw.khipu?.receiverId || '', secretKey: gw.khipu?.secretKey || '' },
          mercadopago: { enabled: gw.mercadopago?.enabled ?? false, accessToken: gw.mercadopago?.accessToken || '' },
          mach:        { enabled: gw.mach?.enabled ?? false, apiKey: gw.mach?.apiKey || '' },
        })
      }
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put('/gyms/me', {
        name: form.name,
        address: form.address || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        instagram: form.instagram || undefined,
        facebook: form.facebook || undefined,
        bookingWindowDays: Number(form.bookingWindowDays),
        bookingCutoffMins: Number(form.bookingCutoffMins ?? 60),
        cancelCutoffMins: Number(form.cancelCutoffMins ?? 30),
        termsAndConditions: form.termsAndConditions || undefined,
      })
      showToast('Configuración guardada correctamente')
      fetchGym()
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error al guardar', 'error')
    } finally { setSaving(false) }
  }

  const handleSaveSportTheme = async () => {
    setSavingSport(true)
    try {
      await api.put('/gyms/me', { sportTheme })
      document.documentElement.setAttribute('data-sport', sportTheme)
      localStorage.setItem('fitapp_sport_theme', sportTheme)
      window.dispatchEvent(new CustomEvent('sport-theme-changed', { detail: { theme: sportTheme } }))
      showToast('Tema deportivo actualizado')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error al guardar', 'error')
    } finally { setSavingSport(false) }
  }

  const handleSaveNotif = async () => {
    setSavingNotif(true)
    try {
      await api.put('/gyms/me', { expiryReminderDays: Number(notifForm.expiryReminderDays) })
      showToast('Configuración de notificaciones guardada')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error al guardar', 'error')
    } finally { setSavingNotif(false) }
  }

  const handleSaveDte = async () => {
    setSavingDte(true)
    try {
      await api.put('/gyms/me', {
        bsaleToken: dteForm.bsaleToken || undefined,
        bsaleOfficeId: dteForm.bsaleOfficeId ? Number(dteForm.bsaleOfficeId) : undefined,
        bsalePriceListId: dteForm.bsalePriceListId ? Number(dteForm.bsalePriceListId) : undefined,
        bsaleBoletaTypeId: dteForm.bsaleBoletaTypeId ? Number(dteForm.bsaleBoletaTypeId) : undefined,
        bsaleFacturaTypeId: dteForm.bsaleFacturaTypeId ? Number(dteForm.bsaleFacturaTypeId) : undefined,
        dteRut: dteForm.dteRut || undefined,
        dteRazonSocial: dteForm.dteRazonSocial || undefined,
        dteGiro: dteForm.dteGiro || undefined,
        dteDireccion: dteForm.dteDireccion || undefined,
        dteComuna: dteForm.dteComuna || undefined,
        dteCiudad: dteForm.dteCiudad || undefined,
      })
      showToast('Configuración de facturación guardada')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error al guardar', 'error')
    } finally { setSavingDte(false) }
  }

  const handleSaveAttendance = async () => {
    setSavingAttendance(true)
    try {
      await api.put('/gyms/me', {
        attendanceMode: attendanceForm.attendanceMode,
        gymLat: attendanceForm.gymLat ? Number(attendanceForm.gymLat) : null,
        gymLng: attendanceForm.gymLng ? Number(attendanceForm.gymLng) : null,
        gymRadiusMeters: Number(attendanceForm.gymRadiusMeters),
      })
      showToast('Configuración de asistencia guardada')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error al guardar', 'error')
    } finally { setSavingAttendance(false) }
  }

  const handleSaveWaitlist = async () => {
    setSavingWaitlist(true)
    try {
      await api.put('/gyms/me', {
        waitlistConfirmEnabled: waitlistForm.waitlistConfirmEnabled,
        waitlistConfirmMins: Number(waitlistForm.waitlistConfirmMins),
      })
      showToast('Política de lista de espera guardada')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error al guardar', 'error')
    } finally { setSavingWaitlist(false) }
  }

  const handleSaveBank = async () => {
    setSavingBank(true)
    try {
      await api.put('/gyms/me', { bankAccount: bankForm })
      showToast('Datos bancarios guardados')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error al guardar', 'error')
    } finally { setSavingBank(false) }
  }

  const handleSaveGateways = async () => {
    setSavingGateways(true)
    try {
      await api.put('/gyms/me', { paymentGateways: gatewaysForm })
      showToast('Pasarelas de pago guardadas')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error al guardar', 'error')
    } finally { setSavingGateways(false) }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = localStorage.getItem('fitapp_token')
      const res = await fetch(`${API_BASE}/api/gyms/me/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast('Logo actualizado correctamente')
      fetchGym()
    } catch (err: any) {
      showToast(err.message || 'Error al subir el logo', 'error')
    } finally { setUploadingLogo(false) }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 12 }}>
        <Loader2 style={{ width: 20, height: 20, color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
        <span style={{ color: 'var(--text-4)', fontSize: 14 }}>Cargando configuración...</span>
      </div>
    )
  }

  // ── Contenido de cada sección ─────────────────────────────────────────────
  const renderSection = () => {
    // ── PERFIL ────────────────────────────────────────────────────────────────
    if (activeSection === 'perfil') return (
      <form onSubmit={handleSubmit}>
        {/* Logo */}
        <SectionCard title="Logo del box" description="Visible en la app móvil y en comunicaciones">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 80, height: 80, borderRadius: 14,
              border: '2px dashed var(--border-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', backgroundColor: 'var(--surface-base)', flexShrink: 0,
            }}>
              {gym?.logoUrl ? (
                <img src={`${API_BASE}${gym.logoUrl}`} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--border-2)' }}>{gym?.name?.[0]}</span>
              )}
            </div>
            <div>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingLogo}
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 13, opacity: uploadingLogo ? 0.6 : 1 }}>
                {uploadingLogo
                  ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                  : <Upload style={{ width: 14, height: 14 }} />}
                {uploadingLogo ? 'Subiendo...' : 'Subir logo'}
              </button>
              <p style={{ color: 'var(--text-4)', fontSize: 12, marginTop: 6 }}>PNG, JPG o SVG — máx. 5MB</p>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
            </div>
          </div>
        </SectionCard>

        {/* Datos del centro */}
        <SectionCard title="Datos del centro" description="Información básica de tu box">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel>Nombre del gimnasio</FieldLabel>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel>Dirección</FieldLabel>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input" />
            </div>
            <div>
              <FieldLabel>Teléfono</FieldLabel>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input" />
            </div>
            <div>
              <FieldLabel>Email de contacto</FieldLabel>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" />
            </div>
            <div>
              <FieldLabel>Instagram</FieldLabel>
              <input value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="@tubox" className="input" />
            </div>
            <div>
              <FieldLabel>Facebook</FieldLabel>
              <input value={form.facebook} onChange={e => setForm(f => ({ ...f, facebook: e.target.value }))} placeholder="facebook.com/tubox" className="input" />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <FieldLabel>Términos y Condiciones del centro</FieldLabel>
            <textarea
              value={form.termsAndConditions}
              onChange={e => setForm(f => ({ ...f, termsAndConditions: e.target.value }))}
              rows={6}
              placeholder="Escribe aquí los términos y condiciones de tu gimnasio. Los alumnos podrán consultarlos en la app..."
              className="input"
              style={{ resize: 'vertical', minHeight: 120 }}
            />
            <p style={{ color: 'var(--text-4)', fontSize: 12, marginTop: 4 }}>Visible para los alumnos en la app móvil</p>
          </div>
        </SectionCard>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SaveButton saving={saving} label={saving ? 'Guardando...' : 'Guardar perfil'} />
        </div>
      </form>
    )

    // ── MARCA Y DISEÑO ────────────────────────────────────────────────────────
    if (activeSection === 'marca') return (
      <div>
        {/* Apariencia (light/dark) */}
        <SectionCard title="Apariencia" description="Modo claro u oscuro del panel admin">
          <div style={{ display: 'flex', gap: 12 }}>
            {(['light', 'dark'] as const).map(t => (
              <button key={t} type="button" onClick={() => toggleTheme(t)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px 16px', borderRadius: 10, border: '2px solid', cursor: 'pointer',
                  transition: 'all 0.15s', fontSize: 13, fontWeight: 600,
                  borderColor: theme === t ? 'var(--primary)' : 'var(--border-2)',
                  backgroundColor: theme === t
                    ? 'color-mix(in srgb, var(--primary) 10%, transparent)'
                    : 'transparent',
                  color: theme === t ? 'var(--primary)' : 'var(--text-3)',
                }}>
                {t === 'light'
                  ? <><Sun style={{ width: 14, height: 14 }} /> Claro</>
                  : <><Moon style={{ width: 14, height: 14 }} /> Oscuro</>}
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Sport theme */}
        <SectionCard title="Tema deportivo" description="Define la paleta de colores del panel según tu disciplina">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12, marginBottom: 20 }}>
            {SPORT_THEMES.map(t => {
              const isActive = sportTheme === t.id
              return (
                <button key={t.id} type="button" onClick={() => setSportTheme(t.id)}
                  style={{
                    padding: '14px 10px', borderRadius: 12, border: '2px solid', cursor: 'pointer',
                    transition: 'all 0.15s', textAlign: 'center',
                    borderColor: isActive ? t.color : 'var(--border-2)',
                    backgroundColor: isActive
                      ? `color-mix(in srgb, ${t.color} 12%, transparent)`
                      : 'transparent',
                    transform: isActive ? 'translateY(-2px)' : 'none',
                    boxShadow: isActive ? `0 4px 16px color-mix(in srgb, ${t.color} 30%, transparent)` : 'none',
                  }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{t.emoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? t.color : 'var(--text-3)' }}>{t.label}</div>
                  {isActive && (
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', margin: '6px auto 0',
                      backgroundColor: t.color,
                    }} />
                  )}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SaveButton saving={savingSport} label={savingSport ? 'Aplicando...' : 'Aplicar tema'} onClick={handleSaveSportTheme} />
          </div>
        </SectionCard>
      </div>
    )

    // ── RESERVAS Y CLASES ─────────────────────────────────────────────────────
    if (activeSection === 'reservas') return (
      <form onSubmit={handleSubmit}>
        <SectionCard title="Políticas de reserva" description="Configura las reglas de reserva y cancelación de clases">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <FieldLabel>Anticipación máxima para reservar</FieldLabel>
              <PillSelector
                value={form.bookingWindowDays}
                options={[
                  { value: 1, label: 'Solo hoy' },
                  { value: 2, label: '2 días' },
                  { value: 3, label: '3 días' },
                  { value: 5, label: '5 días' },
                  { value: 7, label: '7 días' },
                ]}
                onChange={v => setForm(f => ({ ...f, bookingWindowDays: v }))}
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 20 }}>
              <FieldLabel>Corte de reserva — minutos antes de la clase</FieldLabel>
              <PillSelector
                value={form.bookingCutoffMins}
                options={[
                  { value: 0, label: 'Hasta inicio' },
                  { value: 30, label: '30 min antes' },
                  { value: 60, label: '60 min antes' },
                  { value: 120, label: '2 h antes' },
                ]}
                onChange={v => setForm(f => ({ ...f, bookingCutoffMins: v }))}
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 20 }}>
              <FieldLabel>Corte de cancelación — minutos antes de la clase</FieldLabel>
              <PillSelector
                value={form.cancelCutoffMins}
                options={[
                  { value: 0, label: 'Hasta inicio' },
                  { value: 30, label: '30 min antes' },
                  { value: 60, label: '60 min antes' },
                  { value: 120, label: '2 h antes' },
                ]}
                onChange={v => setForm(f => ({ ...f, cancelCutoffMins: v }))}
              />
            </div>
          </div>
        </SectionCard>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SaveButton saving={saving} label={saving ? 'Guardando...' : 'Guardar políticas'} />
        </div>
      </form>
    )

    // ── NOTIFICACIONES ────────────────────────────────────────────────────────
    if (activeSection === 'notificaciones') return (
      <div>
        <SectionCard
          title="Recordatorio de vencimiento"
          description="Cuántos días antes de que expire una membresía se notifica al alumno">
          {gym?.smtpUser && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
              padding: '8px 14px', borderRadius: 8,
              backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
              fontSize: 13, color: '#22c55e',
            }}>
              <CheckCircle style={{ width: 14, height: 14 }} />
              SMTP configurado — {gym.smtpUser}
            </div>
          )}
          <PillSelector
            value={notifForm.expiryReminderDays}
            options={[
              { value: 0, label: 'Desactivado' },
              { value: 1, label: '1 día' },
              { value: 2, label: '2 días' },
              { value: 3, label: '3 días' },
              { value: 5, label: '5 días' },
              { value: 7, label: '7 días' },
              { value: 10, label: '10 días' },
              { value: 14, label: '14 días' },
            ]}
            onChange={v => setNotifForm(f => ({ ...f, expiryReminderDays: v }))}
          />
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <SaveButton saving={savingNotif} label={savingNotif ? 'Guardando...' : 'Guardar'} onClick={handleSaveNotif} />
          </div>
        </SectionCard>
      </div>
    )

    // ── ASISTENCIA ────────────────────────────────────────────────────────────
    if (activeSection === 'asistencia') return (
      <div>
        <SectionCard title="Control de asistencia" description="Cómo se registra la asistencia a clases en tu centro">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
            {([
              { value: 'manual', label: 'Manual',     icon: '✋', desc: 'Coach marca desde la app/web' },
              { value: 'auto',   label: 'Automático', icon: '⚡', desc: 'Se marca al finalizar la clase' },
            ] as const).map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setAttendanceForm(f => ({ ...f, attendanceMode: opt.value }))}
                style={{
                  padding: 16, borderRadius: 12, border: '2px solid', textAlign: 'left',
                  cursor: 'pointer', transition: 'all 0.15s',
                  borderColor: attendanceForm.attendanceMode === opt.value ? 'var(--primary)' : 'var(--border-2)',
                  backgroundColor: attendanceForm.attendanceMode === opt.value
                    ? 'color-mix(in srgb, var(--primary) 10%, transparent)'
                    : 'transparent',
                }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{opt.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 2 }}>{opt.desc}</div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SaveButton saving={savingAttendance} label={savingAttendance ? 'Guardando...' : 'Guardar'} onClick={handleSaveAttendance} />
          </div>
        </SectionCard>
      </div>
    )

    // ── LISTA DE ESPERA ───────────────────────────────────────────────────────
    if (activeSection === 'waitlist') return (
      <div>
        <SectionCard title="Lista de espera" description="Cómo se gestiona la promoción de alumnos cuando hay una cancelación">
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
            Cuando un alumno cancela, el primero en lista de espera recibe un lugar. Puedes requerir que lo confirme en un tiempo límite.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {([
              { value: false, label: 'Directo',           icon: '⚡', desc: 'Pasa a CONFIRMADO inmediatamente + push de aviso' },
              { value: true,  label: 'Con confirmación',  icon: '⏱', desc: 'Tiene un tiempo para confirmar, si no, pasa al siguiente' },
            ] as const).map(opt => (
              <button key={String(opt.value)} type="button"
                onClick={() => setWaitlistForm(f => ({ ...f, waitlistConfirmEnabled: opt.value }))}
                style={{
                  padding: 16, borderRadius: 12, border: '2px solid', textAlign: 'left',
                  cursor: 'pointer', transition: 'all 0.15s',
                  borderColor: waitlistForm.waitlistConfirmEnabled === opt.value ? 'var(--primary)' : 'var(--border-2)',
                  backgroundColor: waitlistForm.waitlistConfirmEnabled === opt.value
                    ? 'color-mix(in srgb, var(--primary) 10%, transparent)'
                    : 'transparent',
                }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{opt.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 2 }}>{opt.desc}</div>
              </button>
            ))}
          </div>

          {waitlistForm.waitlistConfirmEnabled && (
            <div style={{ padding: 16, borderRadius: 12, backgroundColor: 'var(--surface-base)', border: '1px solid var(--border-1)', marginBottom: 16 }}>
              <FieldLabel>Tiempo para confirmar (minutos)</FieldLabel>
              <input type="number" min={5} max={1440} className="input"
                value={waitlistForm.waitlistConfirmMins}
                onChange={e => setWaitlistForm(f => ({ ...f, waitlistConfirmMins: Number(e.target.value) }))} />
              <p style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 8 }}>
                Si no confirma en este tiempo, el lugar pasa al siguiente en lista.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SaveButton saving={savingWaitlist} label={savingWaitlist ? 'Guardando...' : 'Guardar'} onClick={handleSaveWaitlist} />
          </div>
        </SectionCard>
      </div>
    )

    // ── FACTURACIÓN ───────────────────────────────────────────────────────────
    if (activeSection === 'facturacion') return (
      <div>
        <SectionCard
          title="Facturación electrónica (SII / Bsale)"
          description="Emite boletas y facturas electrónicas directamente desde FitHub">
          {gym?.bsaleToken && (
            <span className="badge-green" style={{ marginBottom: 16 }}>Bsale activo</span>
          )}

          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 20,
            backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
            fontSize: 13, color: '#3b82f6',
          }}>
            <p style={{ fontWeight: 700, marginBottom: 4 }}>Integración con Bsale</p>
            <p style={{ color: '#60a5fa', lineHeight: 1.6 }}>
              Necesitas una cuenta en <strong>bsale.io</strong> y una sucursal configurada.
              El access token lo encuentras en Configuración → Integraciones → API en Bsale.
              Los IDs de tipos de documentos los obtienes vía{' '}
              <code style={{ backgroundColor: 'rgba(59,130,246,0.15)', padding: '1px 5px', borderRadius: 4 }}>
                GET /v1/document_types.json
              </code>.
            </p>
          </div>

          {/* Datos emisor */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', marginBottom: 12 }}>Datos del emisor (tu empresa)</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <FieldLabel>RUT emisor</FieldLabel>
                <input value={dteForm.dteRut} onChange={e => setDteForm(f => ({ ...f, dteRut: e.target.value }))} placeholder="76.123.456-7" className="input" />
              </div>
              <div>
                <FieldLabel>Razón social</FieldLabel>
                <input value={dteForm.dteRazonSocial} onChange={e => setDteForm(f => ({ ...f, dteRazonSocial: e.target.value }))} placeholder="Box CrossFit SpA" className="input" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <FieldLabel>Giro económico</FieldLabel>
                <input value={dteForm.dteGiro} onChange={e => setDteForm(f => ({ ...f, dteGiro: e.target.value }))} placeholder="Centros de acondicionamiento físico" className="input" />
              </div>
              <div>
                <FieldLabel>Dirección</FieldLabel>
                <input value={dteForm.dteDireccion} onChange={e => setDteForm(f => ({ ...f, dteDireccion: e.target.value }))} placeholder="Av. Principal 123" className="input" />
              </div>
              <div>
                <FieldLabel>Comuna</FieldLabel>
                <input value={dteForm.dteComuna} onChange={e => setDteForm(f => ({ ...f, dteComuna: e.target.value }))} placeholder="Providencia" className="input" />
              </div>
              <div>
                <FieldLabel>Ciudad</FieldLabel>
                <input value={dteForm.dteCiudad} onChange={e => setDteForm(f => ({ ...f, dteCiudad: e.target.value }))} placeholder="Santiago" className="input" />
              </div>
            </div>
          </div>

          {/* Bsale credentials */}
          <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', marginBottom: 12 }}>Credenciales Bsale</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <FieldLabel>Access Token</FieldLabel>
                <input type="password" value={dteForm.bsaleToken} onChange={e => setDteForm(f => ({ ...f, bsaleToken: e.target.value }))} placeholder="Tu access token de Bsale" className="input" />
              </div>
              <div>
                <FieldLabel>ID Sucursal (officeId)</FieldLabel>
                <input type="number" value={dteForm.bsaleOfficeId} onChange={e => setDteForm(f => ({ ...f, bsaleOfficeId: Number(e.target.value) }))} className="input" />
              </div>
              <div>
                <FieldLabel>ID Lista de precios</FieldLabel>
                <input type="number" value={dteForm.bsalePriceListId} onChange={e => setDteForm(f => ({ ...f, bsalePriceListId: Number(e.target.value) }))} className="input" />
              </div>
              <div>
                <FieldLabel>ID tipo doc. Boleta (39)</FieldLabel>
                <input type="number" value={dteForm.bsaleBoletaTypeId} onChange={e => setDteForm(f => ({ ...f, bsaleBoletaTypeId: Number(e.target.value) }))} placeholder="Ej: 8" className="input" />
              </div>
              <div>
                <FieldLabel>ID tipo doc. Factura (33)</FieldLabel>
                <input type="number" value={dteForm.bsaleFacturaTypeId} onChange={e => setDteForm(f => ({ ...f, bsaleFacturaTypeId: Number(e.target.value) }))} placeholder="Ej: 2" className="input" />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <SaveButton saving={savingDte} label={savingDte ? 'Guardando...' : 'Guardar facturación'} onClick={handleSaveDte} />
          </div>
        </SectionCard>
      </div>
    )

    // ── PAGOS ─────────────────────────────────────────────────────────────────
    if (activeSection === 'pagos') return (
      <div>
        {/* Cuenta bancaria */}
        <SectionCard
          title="Cuenta bancaria para transferencias"
          description="Los alumnos ven estos datos al pagar por transferencia desde la app">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { key: 'ownerName',     label: 'Nombre del titular',       placeholder: 'Box Atlético SpA' },
              { key: 'rut',           label: 'RUT',                       placeholder: '76.123.456-7' },
              { key: 'bank',          label: 'Banco',                     placeholder: 'Banco Estado' },
              { key: 'accountType',   label: 'Tipo de cuenta',            placeholder: 'Cuenta Corriente' },
              { key: 'accountNumber', label: 'Número de cuenta',          placeholder: '00-123456-78' },
              { key: 'email',         label: 'Email para transferencia',  placeholder: 'pagos@mibox.cl' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <FieldLabel>{label}</FieldLabel>
                <input type="text" className="input" placeholder={placeholder}
                  value={(bankForm as any)[key]}
                  onChange={e => setBankForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <SaveButton saving={savingBank} label={savingBank ? 'Guardando...' : 'Guardar cuenta bancaria'} onClick={handleSaveBank} />
          </div>
        </SectionCard>

        {/* Pasarelas */}
        <SectionCard
          title="Pasarelas de pago"
          description="Activa y configura los métodos de pago disponibles para los alumnos en la app">
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
            Las claves secretas se almacenan de forma segura y nunca se exponen al cliente.
          </p>

          {/* Stripe */}
          <GatewayRow label="Stripe"
            enabled={gatewaysForm.stripe.enabled}
            onToggle={() => setGatewaysForm(f => ({ ...f, stripe: { ...f.stripe, enabled: !f.stripe.enabled } }))}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { key: 'publishableKey', label: 'Publishable Key', placeholder: 'pk_live_...' },
                { key: 'secretKey',      label: 'Secret Key',       placeholder: 'sk_live_...' },
                { key: 'webhookSecret',  label: 'Webhook Secret',   placeholder: 'whsec_...' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <FieldLabel>{label}</FieldLabel>
                  <input type="password" className="input" placeholder={placeholder}
                    value={(gatewaysForm.stripe as any)[key]}
                    onChange={e => setGatewaysForm(f => ({ ...f, stripe: { ...f.stripe, [key]: e.target.value } }))} />
                </div>
              ))}
            </div>
          </GatewayRow>

          {/* Flow */}
          <GatewayRow label="Flow Chile"
            enabled={gatewaysForm.flow.enabled}
            onToggle={() => setGatewaysForm(f => ({ ...f, flow: { ...f.flow, enabled: !f.flow.enabled } }))}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              {[
                { key: 'apiKey',    label: 'API Key',    placeholder: 'Flow API Key' },
                { key: 'secretKey', label: 'Secret Key', placeholder: 'Flow Secret Key' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <FieldLabel>{label}</FieldLabel>
                  <input type="password" className="input" placeholder={placeholder}
                    value={(gatewaysForm.flow as any)[key]}
                    onChange={e => setGatewaysForm(f => ({ ...f, flow: { ...f.flow, [key]: e.target.value } }))} />
                </div>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-2)' }}>
              <input type="checkbox" checked={gatewaysForm.flow.sandbox}
                onChange={e => setGatewaysForm(f => ({ ...f, flow: { ...f.flow, sandbox: e.target.checked } }))} />
              Modo sandbox (pruebas)
            </label>
          </GatewayRow>

          {/* Khipu */}
          <GatewayRow label="Khipu"
            enabled={gatewaysForm.khipu.enabled}
            onToggle={() => setGatewaysForm(f => ({ ...f, khipu: { ...f.khipu, enabled: !f.khipu.enabled } }))}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { key: 'receiverId', label: 'Receiver ID', placeholder: 'ID de cobrador' },
                { key: 'secretKey',  label: 'Secret Key',  placeholder: 'Khipu Secret' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <FieldLabel>{label}</FieldLabel>
                  <input type="password" className="input" placeholder={placeholder}
                    value={(gatewaysForm.khipu as any)[key]}
                    onChange={e => setGatewaysForm(f => ({ ...f, khipu: { ...f.khipu, [key]: e.target.value } }))} />
                </div>
              ))}
            </div>
          </GatewayRow>

          {/* Mercado Pago */}
          <GatewayRow label="Mercado Pago"
            enabled={gatewaysForm.mercadopago.enabled}
            onToggle={() => setGatewaysForm(f => ({ ...f, mercadopago: { ...f.mercadopago, enabled: !f.mercadopago.enabled } }))}>
            <div>
              <FieldLabel>Access Token</FieldLabel>
              <input type="password" className="input" placeholder="APP_USR-..."
                value={gatewaysForm.mercadopago.accessToken}
                onChange={e => setGatewaysForm(f => ({ ...f, mercadopago: { ...f.mercadopago, accessToken: e.target.value } }))} />
            </div>
          </GatewayRow>

          {/* MACH */}
          <GatewayRow label="MACH Business"
            enabled={gatewaysForm.mach.enabled}
            onToggle={() => setGatewaysForm(f => ({ ...f, mach: { ...f.mach, enabled: !f.mach.enabled } }))}>
            <div>
              <FieldLabel>API Key</FieldLabel>
              <input type="password" className="input" placeholder="MACH API Key"
                value={gatewaysForm.mach.apiKey}
                onChange={e => setGatewaysForm(f => ({ ...f, mach: { ...f.mach, apiKey: e.target.value } }))} />
            </div>
          </GatewayRow>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
            <SaveButton saving={savingGateways} label={savingGateways ? 'Guardando...' : 'Guardar pasarelas'} onClick={handleSaveGateways} />
          </div>
        </SectionCard>
      </div>
    )

    // ── AVANZADO ──────────────────────────────────────────────────────────────
    if (activeSection === 'avanzado') return (
      <div>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(239,68,68,0.1)',
            }}>
              <Settings2 style={{ width: 18, height: 18, color: '#ef4444' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Zona avanzada</h3>
              <p style={{ fontSize: 13, color: 'var(--text-4)', margin: 0 }}>Opciones adicionales de configuración</p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 16, color: 'var(--text-3)', fontSize: 13 }}>
            No hay opciones avanzadas adicionales en este momento.
          </div>
        </div>
      </div>
    )

    return null
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>

      {/* Header */}
      <div className="fade-up" style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
          Configuracion
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-1)', margin: '4px 0 6px', letterSpacing: '-0.02em' }}>
          Ajustes del box
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Personaliza tu espacio, configura notificaciones y gestiona la facturacion
        </p>
      </div>

      {/* Layout 2 columnas */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>

        {/* Nav lateral */}
        <nav className="card" style={{ padding: 8, borderRadius: 16, position: 'sticky', top: 80 }}>
          {SECTIONS.map(s => {
            const Icon = s.icon
            const isActive = activeSection === s.id
            return (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  textAlign: 'left', backgroundColor: isActive
                    ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                    : 'transparent',
                  color: isActive ? 'var(--primary)' : 'var(--text-3)',
                  fontWeight: isActive ? 700 : 500, fontSize: 13.5,
                  transition: 'all 0.15s', marginBottom: 2,
                }}>
                <Icon style={{ width: 15, height: 15, flexShrink: 0 }} />
                {s.label}
              </button>
            )
          })}
        </nav>

        {/* Contenido de la sección activa */}
        <div className="fade-up" key={activeSection}>
          {renderSection()}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}

      {/* Spinner CSS */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
