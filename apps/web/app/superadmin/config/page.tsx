'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api, { API_BASE } from '../../../lib/api'
import { Send, FlaskConical, Save, Plus, Trash2, ChevronDown, ChevronUp, X, Check, Mail, Image, Upload, RotateCcw } from 'lucide-react'

function apiError(err: any, fallback = 'Error inesperado'): string {
  const e = err?.response?.data?.error
  if (!e) return fallback
  if (typeof e === 'string') return e
  if (e.formErrors?.length) return e.formErrors[0]
  const field = Object.keys(e.fieldErrors ?? {})[0]
  if (field) return `${field}: ${e.fieldErrors[field][0]}`
  return fallback
}

const card: React.CSSProperties = { backgroundColor: '#13131f', border: '1px solid #2d2d4e', borderRadius: '0.75rem' }
const inp: React.CSSProperties = {
  width: '100%', backgroundColor: '#0f0f1a', border: '1px solid #2d2d4e',
  borderRadius: '0.5rem', padding: '0.625rem 1rem', color: '#e2e8f0',
  outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8',
  marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em',
}
const textarea: React.CSSProperties = {
  ...inp, resize: 'vertical', minHeight: 140, lineHeight: 1.6, fontFamily: 'inherit',
}

type Template = {
  id: string; name: string; slug: string; description: string | null
  subject: string; body: string; placeholders: string[]; isSystem: boolean; isActive: boolean
}
type TemplateForm = {
  name: string; description: string; subject: string; body: string; placeholders: string; isActive: boolean
}
type GymOption = { id: string; name: string; status: string; subscriptionPlan: string }

type AssetSlot = { key: string; label: string; page: string; width: number; height: number; note: string; group?: string }
type AssetInfo = { id: string; key: string; url: string; filename: string; sizeBytes: number; mimeType: string; updatedAt: string }

const STATUSES = ['ACTIVE', 'TRIAL', 'SUSPENDED']
const PLANS = ['trial', 'go_pro', 'business', 'business_pro']
const PLAN_LABELS: Record<string, string> = {
  trial: 'Trial', go_pro: 'Go Pro', business: 'Business', business_pro: 'Business Pro',
}

const emptyForm = (): TemplateForm => ({
  name: '', description: '', subject: '', body: '', placeholders: '', isActive: true,
})

export default function PlatformConfigPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()

  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [testing, setTesting]     = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [toast, setToast]         = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [smtp, setSmtp]           = useState({ host: '', port: '587', user: '', pass: '', from: '', reminderDays: '7' })
  const [emailOpen, setEmailOpen]   = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [assetSlots, setAssetSlots] = useState<AssetSlot[]>([])
  const [assetMap, setAssetMap]     = useState<Record<string, AssetInfo>>({})
  const [assetVersions, setAssetVersions] = useState<Record<string, number>>({})
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [deletingKey, setDeletingKey]   = useState<string | null>(null)

  const [templates, setTemplates] = useState<Template[]>([])
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [editForm, setEditForm]   = useState<TemplateForm>(emptyForm())
  const [savingTpl, setSavingTpl] = useState(false)
  const [creating, setCreating]   = useState(false)
  const [newForm, setNewForm]     = useState<TemplateForm>(emptyForm())
  const [savingNew, setSavingNew] = useState(false)

  // Send modal
  const [sendModal, setSendModal]       = useState<Template | null>(null)
  const [gyms, setGyms]                 = useState<GymOption[]>([])
  const [filterStatus, setFilterStatus] = useState<string[]>(['ACTIVE'])
  const [filterPlan, setFilterPlan]     = useState<string[]>([])
  const [filterGyms, setFilterGyms]     = useState<string[]>([])
  const [sending, setSending]           = useState(false)

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') { router.push('/dashboard'); return }
    if (user) fetchAll()
  }, [user?.userId])

  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchAll = async () => {
    try {
      const [cfgRes, tplRes, gymsRes, assetsRes] = await Promise.all([
        api.get('/superadmin/config'),
        api.get('/superadmin/email-templates'),
        api.get('/superadmin/email-templates/gyms'),
        api.get('/superadmin/config/assets'),
      ])
      const d = cfgRes.data
      setSmtp({
        host: d.smtpHost ?? '', port: String(d.smtpPort ?? 587),
        user: d.smtpUser ?? '', pass: d.smtpPass ?? '', from: d.smtpFrom ?? '',
        reminderDays: String(d.subExpiryReminderDays ?? 7),
      })
      setTemplates(tplRes.data)
      setGyms(gymsRes.data)
      setAssetSlots(assetsRes.data.slots)
      setAssetMap(assetsRes.data.assets)
    } catch { router.push('/superadmin') }
    finally { setLoading(false) }
  }

  const handleUploadAsset = async (key: string, file: File) => {
    setUploadingKey(key)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post(`/superadmin/config/assets/${key}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAssetMap(m => ({ ...m, [key]: data }))
      setAssetVersions(v => ({ ...v, [key]: Date.now() }))
      showToast('Imagen subida correctamente', 'ok')
    } catch (err: any) {
      showToast(apiError(err, 'Error al subir imagen'), 'err')
    } finally { setUploadingKey(null) }
  }

  const handleDeleteAsset = async (key: string) => {
    if (!confirm('¿Eliminar imagen? Se usará la imagen por defecto.')) return
    setDeletingKey(key)
    try {
      await api.delete(`/superadmin/config/assets/${key}`)
      setAssetMap(m => { const n = { ...m }; delete n[key]; return n })
      showToast('Imagen eliminada', 'ok')
    } catch (err: any) {
      showToast(apiError(err, 'Error al eliminar'), 'err')
    } finally { setDeletingKey(null) }
  }

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch('/superadmin/config', {
        smtpHost: smtp.host || null, smtpPort: smtp.port ? Number(smtp.port) : null,
        smtpUser: smtp.user || null, smtpPass: smtp.pass || null,
        smtpFrom: smtp.from || null, subExpiryReminderDays: Number(smtp.reminderDays) || 7,
      })
      showToast('Configuración guardada', 'ok')
    } catch (err: any) {
      showToast(apiError(err, 'Error al guardar'), 'err')
    } finally { setSaving(false) }
  }

  const handleTestEmail = async () => {
    if (!testEmail) return
    setTesting(true)
    try {
      const { data } = await api.post('/superadmin/config/test-email', { to: testEmail })
      if (data.ethereal && data.previewUrl) {
        showToast('Sin SMTP real — abriendo Ethereal', 'err')
        window.open(data.previewUrl, '_blank')
      } else {
        showToast(`Correo de prueba enviado a ${testEmail}`, 'ok')
      }
    } catch (err: any) {
      showToast(apiError(err, 'Error al enviar prueba'), 'err')
    } finally { setTesting(false) }
  }

  const openEdit = (tpl: Template) => {
    if (expanded === tpl.id) { setExpanded(null); return }
    setExpanded(tpl.id)
    setEditForm({
      name: tpl.name, description: tpl.description ?? '',
      subject: tpl.subject, body: tpl.body,
      placeholders: (tpl.placeholders ?? []).join(', '),
      isActive: tpl.isActive,
    })
  }

  const handleSaveTpl = async (tpl: Template) => {
    setSavingTpl(true)
    try {
      const placeholders = editForm.placeholders
        ? editForm.placeholders.split(',').map(p => p.trim()).filter(Boolean) : []
      const { data } = await api.patch(`/superadmin/email-templates/${tpl.id}`, {
        name: editForm.name, description: editForm.description || null,
        subject: editForm.subject, body: editForm.body,
        placeholders, isActive: editForm.isActive,
      })
      setTemplates(ts => ts.map(t => t.id === tpl.id ? data : t))
      setExpanded(null)
      showToast('Plantilla guardada', 'ok')
    } catch (err: any) {
      showToast(apiError(err, 'Error al guardar'), 'err')
    } finally { setSavingTpl(false) }
  }

  const handleDeleteTpl = async (tpl: Template) => {
    if (!confirm(`¿Eliminar la plantilla "${tpl.name}"?`)) return
    try {
      await api.delete(`/superadmin/email-templates/${tpl.id}`)
      setTemplates(ts => ts.filter(t => t.id !== tpl.id))
      showToast('Plantilla eliminada', 'ok')
    } catch (err: any) {
      showToast(apiError(err, 'Error al eliminar'), 'err')
    }
  }

  const openSendModal = (tpl: Template) => {
    setSendModal(tpl)
    setFilterStatus(['ACTIVE'])
    setFilterPlan([])
    setFilterGyms([])
  }

  const toggleItem = (list: string[], set: (v: string[]) => void, val: string) => {
    set(list.includes(val) ? list.filter(x => x !== val) : [...list, val])
  }

  // Gyms that match current status+plan filters (for the gym selector)
  const filteredGymOptions = gyms.filter(g => {
    if (filterStatus.length && !filterStatus.includes(g.status)) return false
    if (filterPlan.length && !filterPlan.includes(g.subscriptionPlan)) return false
    return true
  })

  // Count of gyms that will receive the email
  const recipientCount = filterGyms.length > 0
    ? filterGyms.length
    : filteredGymOptions.length

  const handleSend = async () => {
    if (!sendModal) return
    setSending(true)
    try {
      const filters: any = {}
      if (filterStatus.length) filters.status = filterStatus
      if (filterPlan.length)   filters.subscriptionPlan = filterPlan
      if (filterGyms.length)   filters.gymIds = filterGyms

      const { data } = await api.post(`/superadmin/email-templates/${sendModal.id}/send`, { filters })
      showToast(`Enviado: ${data.sent} OK · ${data.failed} fallaron`, data.failed > 0 ? 'err' : 'ok')
      setSendModal(null)
    } catch (err: any) {
      showToast(apiError(err, 'Error al enviar'), 'err')
    } finally { setSending(false) }
  }

  const handleCreateTpl = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingNew(true)
    try {
      const placeholders = newForm.placeholders
        ? newForm.placeholders.split(',').map(p => p.trim()).filter(Boolean) : []
      const { data } = await api.post('/superadmin/email-templates', {
        name: newForm.name, description: newForm.description || null,
        subject: newForm.subject, body: newForm.body,
        placeholders, isActive: newForm.isActive,
      })
      setTemplates(ts => [...ts, data])
      setCreating(false)
      setNewForm(emptyForm())
      showToast('Plantilla creada', 'ok')
    } catch (err: any) {
      showToast(apiError(err, 'Error al crear'), 'err')
    } finally { setSavingNew(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-500 text-sm">Cargando...</div>
  )

  return (
    <main className="max-w-2xl mx-auto px-6 py-8 relative">
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 100,
          padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 500,
          backgroundColor: toast.type === 'ok' ? '#14532d' : '#450a0a',
          color: toast.type === 'ok' ? '#4ade80' : '#f87171',
          border: `1px solid ${toast.type === 'ok' ? '#166534' : '#7f1d1d'}`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Send Modal ── */}
      {sendModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{ ...card, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid #2d2d4e' }}>
              <div>
                <p className="text-white font-semibold text-sm">Enviar plantilla</p>
                <p style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>{sendModal.name}</p>
              </div>
              <button onClick={() => setSendModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Filtro: Estado */}
              <div>
                <label style={lbl}>Estado del gimnasio</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {STATUSES.map(s => (
                    <button key={s} type="button"
                      onClick={() => toggleItem(filterStatus, setFilterStatus, s)}
                      style={{
                        padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', transition: 'all 120ms',
                        backgroundColor: filterStatus.includes(s) ? '#2d1d5e' : '#0f0f1a',
                        color: filterStatus.includes(s) ? '#a78bfa' : '#64748b',
                        border: `1px solid ${filterStatus.includes(s) ? '#6d4acf' : '#2d2d4e'}`,
                      }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtro: Plan */}
              <div>
                <label style={lbl}>Plan de suscripción <span style={{ color: '#475569', fontWeight: 400, textTransform: 'none' }}>(vacío = todos)</span></label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {PLANS.map(p => (
                    <button key={p} type="button"
                      onClick={() => toggleItem(filterPlan, setFilterPlan, p)}
                      style={{
                        padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', transition: 'all 120ms',
                        backgroundColor: filterPlan.includes(p) ? '#2d1d5e' : '#0f0f1a',
                        color: filterPlan.includes(p) ? '#a78bfa' : '#64748b',
                        border: `1px solid ${filterPlan.includes(p) ? '#6d4acf' : '#2d2d4e'}`,
                      }}>
                      {PLAN_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtro: Gimnasios específicos */}
              <div>
                <label style={lbl}>
                  Gimnasios específicos{' '}
                  <span style={{ color: '#475569', fontWeight: 400, textTransform: 'none' }}>
                    (vacío = todos los que coincidan con los filtros anteriores)
                  </span>
                </label>
                <div style={{
                  maxHeight: 180, overflowY: 'auto', border: '1px solid #2d2d4e',
                  borderRadius: 8, backgroundColor: '#0f0f1a', marginTop: 4,
                }}>
                  {filteredGymOptions.length === 0 ? (
                    <p style={{ color: '#475569', fontSize: 12, padding: '12px 16px' }}>
                      Ningún gimnasio coincide con los filtros
                    </p>
                  ) : (
                    filteredGymOptions.map(g => {
                      const selected = filterGyms.includes(g.id)
                      return (
                        <div key={g.id}
                          onClick={() => toggleItem(filterGyms, setFilterGyms, g.id)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '9px 14px', cursor: 'pointer',
                            backgroundColor: selected ? 'rgba(109,74,207,0.12)' : 'transparent',
                            borderBottom: '1px solid #1a1a2e',
                          }}>
                          <div>
                            <span style={{ color: selected ? '#a78bfa' : '#e2e8f0', fontSize: 13 }}>{g.name}</span>
                            <span style={{ color: '#475569', fontSize: 11, marginLeft: 8 }}>
                              {PLAN_LABELS[g.subscriptionPlan] ?? g.subscriptionPlan} · {g.status}
                            </span>
                          </div>
                          {selected && <Check className="w-4 h-4" style={{ color: '#a78bfa', flexShrink: 0 }} />}
                        </div>
                      )
                    })
                  )}
                </div>
                {filterGyms.length > 0 && (
                  <button onClick={() => setFilterGyms([])}
                    style={{ marginTop: 6, background: 'none', border: 'none', color: '#475569', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                    Limpiar selección
                  </button>
                )}
              </div>

              {/* Resumen */}
              <div style={{ backgroundColor: '#0f0f1a', borderRadius: 10, padding: '12px 16px', border: '1px solid #2d2d4e' }}>
                <p style={{ color: '#94a3b8', fontSize: 13 }}>
                  Se enviará a <strong style={{ color: '#a78bfa' }}>{recipientCount} gimnasio{recipientCount !== 1 ? 's' : ''}</strong>
                  {filterGyms.length > 0 ? ' seleccionados manualmente' : ' que coinciden con los filtros'}
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setSendModal(null)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #2d2d4e',
                    background: 'none', color: '#94a3b8', fontSize: 14, cursor: 'pointer',
                  }}>
                  Cancelar
                </button>
                <button onClick={handleSend} disabled={sending || recipientCount === 0}
                  style={{
                    flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px', borderRadius: 10, border: 'none',
                    backgroundColor: sending || recipientCount === 0 ? '#1e1e35' : '#7c3aed',
                    color: sending || recipientCount === 0 ? '#64748b' : '#fff',
                    fontSize: 14, fontWeight: 700,
                    cursor: sending || recipientCount === 0 ? 'not-allowed' : 'pointer',
                  }}>
                  <Send className="w-4 h-4" />
                  {sending ? 'Enviando...' : `Enviar a ${recipientCount} gimnasio${recipientCount !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Configuración del sistema</h1>
        <p className="text-slate-500 text-sm mt-0.5">Ajustes generales de la plataforma</p>
      </div>

      {/* ── Sección: Email ── */}
      <div style={{ ...card, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => setEmailOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#1e1e35', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Mail style={{ width: 16, height: 16, color: '#a78bfa' }} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>Servidor de correo y plantillas</p>
              <p style={{ color: '#475569', fontSize: 12, marginTop: 1 }}>SMTP transaccional y plantillas de email para gimnasios</p>
            </div>
          </div>
          {emailOpen
            ? <ChevronUp style={{ width: 18, height: 18, color: '#64748b', flexShrink: 0 }} />
            : <ChevronDown style={{ width: 18, height: 18, color: '#64748b', flexShrink: 0 }} />}
        </button>

        {emailOpen && (
          <div style={{ borderTop: '1px solid #2d2d4e', padding: '24px 20px' }} className="space-y-6">

      {/* ── SMTP ── */}
      <form onSubmit={handleSaveSmtp} className="space-y-6">
        <div style={{ backgroundColor: '#0f0f1a', border: '1px solid #2d2d4e', borderRadius: '0.75rem' }} className="p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-white text-sm">Servidor de correo (SMTP)</h2>
            <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
              Servidor transaccional de la plataforma para correos a gimnasios
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label style={lbl}>Host SMTP</label>
              <input value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))}
                placeholder="smtp.resend.com" style={inp} />
            </div>
            <div>
              <label style={lbl}>Puerto</label>
              <input value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: e.target.value }))}
                placeholder="465" style={inp} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={lbl}>Usuario</label>
              <input value={smtp.user} onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))}
                placeholder="resend" style={inp} />
            </div>
            <div>
              <label style={lbl}>Contraseña / API Key</label>
              <input type="password" value={smtp.pass}
                onChange={e => setSmtp(s => ({ ...s, pass: e.target.value }))}
                placeholder={smtp.pass === '••••••••' ? 'Configurada (editar para cambiar)' : 're_...'}
                style={inp} />
            </div>
          </div>

          <div>
            <label style={lbl}>Remitente (From)</label>
            <input value={smtp.from} onChange={e => setSmtp(s => ({ ...s, from: e.target.value }))}
              placeholder='FitApp <onboarding@resend.dev>' style={inp} />
          </div>

          <div className="grid grid-cols-2 gap-4" style={{ borderTop: '1px solid #2d2d4e', paddingTop: 16 }}>
            <div>
              <label style={lbl}>Días de anticipación (suscripción)</label>
              <input type="number" min={1} max={90} value={smtp.reminderDays}
                onChange={e => setSmtp(s => ({ ...s, reminderDays: e.target.value }))}
                style={{ ...inp, width: 100 }} />
              <p style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>
                Días antes del vencimiento FitApp para avisar
              </p>
            </div>
            <div>
              <label style={lbl}>Enviar correo de prueba</label>
              <div className="flex gap-2">
                <input value={testEmail} onChange={e => setTestEmail(e.target.value)}
                  type="email" placeholder="correo@ejemplo.com"
                  style={{ ...inp, flex: 1 }} />
                <button type="button" onClick={handleTestEmail} disabled={testing || !testEmail}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '0 14px', borderRadius: 8, border: 'none',
                    backgroundColor: '#1e1e35', color: '#a78bfa',
                    fontSize: 13, fontWeight: 600,
                    cursor: testing || !testEmail ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap', opacity: testing || !testEmail ? 0.5 : 1,
                  }}>
                  <FlaskConical className="w-4 h-4" />
                  {testing ? 'Enviando...' : 'Probar'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px', borderRadius: 10, border: 'none',
            backgroundColor: saving ? '#4c1d95' : '#7c3aed', color: '#fff',
            fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          }}>
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar configuración SMTP'}
        </button>
      </form>

      {/* ── Plantillas ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Plantillas de correo</h2>
            <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
              Selecciona una plantilla para editarla o crea una nueva
            </p>
          </div>
          <button
            onClick={() => { setCreating(c => !c); setExpanded(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, border: 'none',
              backgroundColor: creating ? '#1e1e35' : '#2d1d5e',
              color: creating ? '#64748b' : '#a78bfa',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            {creating ? <X className="w-4 h-4" /> : <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}
            {creating ? 'Cancelar' : 'Nueva plantilla'}
          </button>
        </div>

        {creating && (
          <form onSubmit={handleCreateTpl} style={{ ...card, padding: 24 }} className="space-y-4">
            <p className="text-sm font-semibold text-white mb-2">Nueva plantilla</p>
            <TemplateFormFields form={newForm} setForm={setNewForm} inp={inp} lbl={lbl} textarea={textarea} />
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => { setCreating(false); setNewForm(emptyForm()) }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #2d2d4e', background: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="submit" disabled={savingNew || !newForm.name || !newForm.subject || !newForm.body}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  backgroundColor: '#7c3aed', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  opacity: savingNew || !newForm.name || !newForm.subject || !newForm.body ? 0.5 : 1,
                }}>
                <Check className="w-4 h-4" />
                {savingNew ? 'Creando...' : 'Crear plantilla'}
              </button>
            </div>
          </form>
        )}

        {templates.map(tpl => (
          <div key={tpl.id} style={card}>
            <div className="flex items-center justify-between p-5 cursor-pointer" onClick={() => openEdit(tpl)}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">{tpl.name}</span>
                    {tpl.isSystem && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                        backgroundColor: '#1e1e35', color: '#818cf8', border: '1px solid #3d2d7e',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                      }}>Sistema</span>
                    )}
                    {!tpl.isActive && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                        backgroundColor: '#1a1a1a', color: '#6b7280', border: '1px solid #374151',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                      }}>Inactiva</span>
                    )}
                  </div>
                  {tpl.description && (
                    <p style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>{tpl.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-3 shrink-0">
                {!tpl.isSystem && (
                  <button onClick={e => { e.stopPropagation(); handleDeleteTpl(tpl) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 6 }}
                    title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={e => { e.stopPropagation(); openSendModal(tpl) }}
                  disabled={!tpl.isActive}
                  style={{ background: 'none', border: 'none', cursor: tpl.isActive ? 'pointer' : 'not-allowed', color: '#a78bfa', padding: 6, opacity: !tpl.isActive ? 0.3 : 1 }}
                  title="Enviar">
                  <Send className="w-4 h-4" />
                </button>
                {expanded === tpl.id
                  ? <ChevronUp className="w-4 h-4 text-slate-500" />
                  : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </div>
            </div>

            {expanded === tpl.id && (
              <div style={{ borderTop: '1px solid #2d2d4e', padding: 20 }} className="space-y-4">
                <TemplateFormFields form={editForm} setForm={setEditForm} inp={inp} lbl={lbl} textarea={textarea} />
                <div className="flex justify-end gap-3 pt-1">
                  <button type="button" onClick={() => setExpanded(null)}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #2d2d4e', background: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button onClick={() => handleSaveTpl(tpl)} disabled={savingTpl}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      backgroundColor: '#7c3aed', color: '#fff',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: savingTpl ? 0.6 : 1,
                    }}>
                    <Save className="w-4 h-4" />
                    {savingTpl ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {templates.length === 0 && !creating && (
          <p className="text-center text-slate-600 text-sm py-8">No hay plantillas. Crea la primera.</p>
        )}
      </div>

          </div>
        )}
      </div>

      {/* ── Sección: Imágenes de fondo ── */}
      <div style={{ ...card, marginBottom: 24 }}>
        <button type="button" onClick={() => setAssetsOpen(o => !o)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#1e1e35', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Image style={{ width: 16, height: 16, color: '#a78bfa' }} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>Imágenes de fondo</p>
              <p style={{ color: '#475569', fontSize: 12, marginTop: 1 }}>Personaliza los fondos de la plataforma desde aquí</p>
            </div>
          </div>
          {assetsOpen
            ? <ChevronUp style={{ width: 18, height: 18, color: '#64748b', flexShrink: 0 }} />
            : <ChevronDown style={{ width: 18, height: 18, color: '#64748b', flexShrink: 0 }} />}
        </button>

        {assetsOpen && (
          <div style={{ borderTop: '1px solid #2d2d4e', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {(['shared', 'web', 'mobile'] as const).map(group => {
              const groupSlots = assetSlots.filter(s => (s.group ?? 'web') === group)
              if (groupSlots.length === 0) return null
              const groupLabel = group === 'shared' ? '🔗 Compartido' : group === 'web' ? '🖥 Web' : '📱 Móvil'
              return (
                <div key={group}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>{groupLabel}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                    {groupSlots.map(slot => {
                const asset = assetMap[slot.key]
                const isUploading = uploadingKey === slot.key
                const isDeleting  = deletingKey  === slot.key
                const previewUrl  = asset ? `${API_BASE}${asset.url}?v=${assetVersions[slot.key] ?? 0}` : null
                const sizeMB      = asset ? (asset.sizeBytes / 1024 / 1024).toFixed(1) : null

                return (
                  <div key={slot.key} style={{ backgroundColor: '#0f0f1a', border: '1px solid #2d2d4e', borderRadius: 12, overflow: 'hidden' }}>
                    {/* Preview */}
                    <div style={{ position: 'relative', width: '100%', paddingTop: slot.key === 'platform_logo' ? '40%' : slot.key === 'login_logo_animated' ? '30%' : '56.25%', backgroundColor: '#1a1a2e', overflow: 'hidden' }}>
                      {previewUrl ? (
                        slot.key === 'login_logo_animated' ? (
                          <iframe src={previewUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: 'transparent' }} sandbox="allow-scripts allow-same-origin" scrolling="no" />
                        ) : (
                          <img src={previewUrl} alt={slot.label}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: slot.key === 'platform_logo' ? 'contain' : 'cover', padding: slot.key === 'platform_logo' ? '12px' : 0 }} />
                        )
                      ) : (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <Image style={{ width: 24, height: 24, color: '#2d2d4e' }} />
                          <span style={{ color: '#2d2d4e', fontSize: 10 }}>Sin imagen</span>
                        </div>
                      )}
                      {/* Overlay badge si tiene imagen */}
                      {asset && (
                        <div style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 6px', fontSize: 10, color: '#94a3b8' }}>
                          {sizeMB} MB
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ padding: '10px 12px' }}>
                      <p style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{slot.label}</p>
                      <p style={{ color: '#475569', fontSize: 11, marginBottom: 2 }}>{slot.page}</p>
                      <p style={{ color: '#3d3d5e', fontSize: 10, marginBottom: 8 }}>{slot.note}</p>

                      {/* Specs */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                        {slot.width > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6, backgroundColor: '#1c2432', color: '#60a5fa' }}>
                            {slot.width} × {slot.height} px
                          </span>
                        )}
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6, backgroundColor: '#1c2432', color: '#60a5fa' }}>
                          {slot.key === 'platform_logo' ? 'SVG · PNG · WebP' : slot.key === 'login_logo_animated' ? 'Solo HTML animado' : 'JPG · PNG · WebP'}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6, backgroundColor: '#1c2432', color: '#60a5fa' }}>
                          máx 3 MB
                        </span>
                      </div>

                      {/* Acciones */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <label style={{ flex: 1 }}>
                          <input type="file" accept={slot.key === 'platform_logo' ? 'image/svg+xml,image/png,image/webp' : slot.key === 'login_logo_animated' ? 'text/html,.html' : 'image/jpeg,image/png,image/webp'} style={{ display: 'none' }}
                            disabled={isUploading}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadAsset(slot.key, f); e.target.value = '' }} />
                          <span style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                            padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            backgroundColor: isUploading ? '#1e1e35' : '#2d1d5e',
                            color: isUploading ? '#475569' : '#a78bfa',
                            border: '1px solid #4c3999',
                          }}>
                            {isUploading ? <><RotateCcw style={{ width: 12, height: 12 }} /> Subiendo...</> : <><Upload style={{ width: 12, height: 12 }} /> Subir</>}
                          </span>
                        </label>
                        {asset && (
                          <button onClick={() => handleDeleteAsset(slot.key)} disabled={isDeleting}
                            style={{ padding: '6px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: '#475569', transition: 'all 120ms' }}
                            title="Eliminar imagen (usar default)"
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#450a0a'; e.currentTarget.style.color = '#f87171' }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#475569' }}>
                            <Trash2 style={{ width: 14, height: 14 }} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  )
                })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

function TemplateFormFields({ form, setForm, inp, lbl, textarea }: {
  form: TemplateForm
  setForm: React.Dispatch<React.SetStateAction<any>>
  inp: React.CSSProperties
  lbl: React.CSSProperties
  textarea: React.CSSProperties
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label style={lbl}>Nombre</label>
          <input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))}
            placeholder="Nombre de la plantilla" style={inp} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label style={lbl}>Descripción</label>
          <input value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))}
            placeholder="Uso de esta plantilla (opcional)" style={inp} />
        </div>
      </div>
      <div>
        <label style={lbl}>Asunto</label>
        <input value={form.subject} onChange={e => setForm((f: any) => ({ ...f, subject: e.target.value }))}
          placeholder="Asunto del correo" style={inp} />
      </div>
      <div>
        <label style={lbl}>Cuerpo</label>
        <textarea value={form.body} onChange={e => setForm((f: any) => ({ ...f, body: e.target.value }))}
          placeholder="Escribe el cuerpo del correo..." style={textarea} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={lbl}>Variables disponibles</label>
          <input value={form.placeholders} onChange={e => setForm((f: any) => ({ ...f, placeholders: e.target.value }))}
            placeholder="{{nombre}}, {{gimnasio}}, {{plan}}" style={inp} />
          <p style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>Separadas por coma</p>
        </div>
        <div className="flex items-center gap-3 pt-5">
          <label style={{ ...lbl, marginBottom: 0, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive}
              onChange={e => setForm((f: any) => ({ ...f, isActive: e.target.checked }))}
              style={{ marginRight: 8 }} />
            Activa
          </label>
        </div>
      </div>
    </>
  )
}
