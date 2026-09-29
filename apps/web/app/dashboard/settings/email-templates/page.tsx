'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../../store/auth.store'
import api from '../../../../lib/api'
import { Mail, Bell, CreditCard, ChevronDown, ChevronUp, Send, Check, Users, AlertTriangle } from 'lucide-react'

type TemplateKey = 'expiry' | 'payment'

type TemplateData = {
  subject: string
  body: string
}

const TEMPLATES: { key: TemplateKey; label: string; description: string; icon: React.ElementType; vars: string[] }[] = [
  {
    key: 'expiry',
    label: 'Aviso de vencimiento',
    description: 'Se envía automáticamente cuando la membresía de un alumno está por vencer.',
    icon: Bell,
    vars: ['nombre', 'plan', 'dias', 'fecha_vencimiento', 'gimnasio'],
  },
  {
    key: 'payment',
    label: 'Confirmación de pago',
    description: 'Se envía al alumno cuando se registra un pago exitoso en su membresía.',
    icon: CreditCard,
    vars: ['nombre', 'plan', 'monto', 'moneda', 'metodo', 'fecha_vencimiento', 'gimnasio'],
  },
]

const DEFAULTS: Record<TemplateKey, TemplateData> = {
  expiry: {
    subject: '⏰ Tu membresía en {{gimnasio}} vence en {{dias}} días',
    body: 'Hola {{nombre}},\n\nTu plan {{plan}} vence el {{fecha_vencimiento}}. Quedan {{dias}} días.\n\nRenueva pronto para seguir entrenando.',
  },
  payment: {
    subject: '✅ Pago confirmado — {{plan}} en {{gimnasio}}',
    body: 'Hola {{nombre}},\n\nTu pago de {{monto}} {{moneda}} por el plan {{plan}} fue confirmado.\nMétodo: {{metodo}}\nTu membresía vence el {{fecha_vencimiento}}.',
  },
}

const ALL_STATUSES = [
  { value: 'ACTIVE', label: 'Activa' },
  { value: 'TRIAL', label: 'Prueba' },
  { value: 'INACTIVE', label: 'Inactiva' },
  { value: 'EXPIRED', label: 'Vencida' },
]

export default function EmailTemplatesPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<TemplateKey | null>(null)
  const [blastOpen, setBlastOpen] = useState(false)
  const [saving, setSaving] = useState<TemplateKey | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ url?: string; to?: string } | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const [forms, setForms] = useState<Record<TemplateKey, TemplateData>>({
    expiry: { ...DEFAULTS.expiry },
    payment: { ...DEFAULTS.payment },
  })

  // ── Blast state ──
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([])
  const [blastSubject, setBlastSubject] = useState('')
  const [blastBody, setBlastBody] = useState('')
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['ACTIVE', 'TRIAL'])
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [blastResult, setBlastResult] = useState<{ sent: number; failed: number; total: number } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => { loadFromStorage() }, [])

  useEffect(() => {
    if (!user) return  // el layout redirige a /login
    Promise.all([
      api.get('/gyms/me'),
      api.get('/plans'),
    ]).then(([gymRes, plansRes]) => {
      const data = gymRes.data
      setForms({
        expiry: {
          subject: data.emailExpirySubject || DEFAULTS.expiry.subject,
          body: data.emailExpiryBody || DEFAULTS.expiry.body,
        },
        payment: {
          subject: data.emailPaymentSubject || DEFAULTS.payment.subject,
          body: data.emailPaymentBody || DEFAULTS.payment.body,
        },
      })
      setPlans((plansRes.data ?? []).filter((p: any) => p.isActive !== false))
    }).catch(() => { /* 401: lib/api.ts refresca o cierra sesión; otros errores no deben sacar al usuario */ })
    .finally(() => setLoading(false))
  }, [user])

  // Live preview count
  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true)
    try {
      const params = new URLSearchParams()
      selectedPlanIds.forEach(id => params.append('planIds[]', id))
      selectedStatuses.forEach(s => params.append('statuses[]', s))
      const { data } = await api.get(`/gyms/me/email-blast/preview?${params.toString()}`)
      setPreviewCount(data.count)
    } catch {
      setPreviewCount(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedPlanIds, selectedStatuses])

  useEffect(() => {
    if (blastOpen) fetchPreview()
  }, [selectedPlanIds, selectedStatuses, blastOpen, fetchPreview])

  const handleSave = async (key: TemplateKey) => {
    setSaving(key)
    try {
      const payload = key === 'expiry'
        ? { emailExpirySubject: forms.expiry.subject, emailExpiryBody: forms.expiry.body }
        : { emailPaymentSubject: forms.payment.subject, emailPaymentBody: forms.payment.body }
      await api.put('/gyms/me', payload)
      showToast('Plantilla guardada', true)
    } catch {
      showToast('Error al guardar', false)
    } finally { setSaving(null) }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const { data } = await api.post('/gyms/me/email-test')
      setTestResult({ url: data.previewUrl, to: data.to })
      showToast(`Correo de prueba enviado a ${data.to}`, true)
    } catch {
      showToast('Error al enviar correo de prueba', false)
    } finally { setTesting(false) }
  }

  const handleSendBlast = async () => {
    setSending(true)
    setConfirmOpen(false)
    setBlastResult(null)
    try {
      const { data } = await api.post('/gyms/me/email-blast', {
        subject: blastSubject,
        body: blastBody,
        planIds: selectedPlanIds.length ? selectedPlanIds : undefined,
        statuses: selectedStatuses.length ? selectedStatuses : undefined,
      })
      setBlastResult(data)
      showToast(`Envío completado: ${data.sent} enviados, ${data.failed} fallidos`, data.failed === 0)
    } catch {
      showToast('Error al enviar correos', false)
    } finally { setSending(false) }
  }

  const toggleExpand = (key: TemplateKey) => {
    setExpanded(prev => prev === key ? null : key)
    setBlastOpen(false)
    setTestResult(null)
  }

  const toggleBlast = () => {
    setBlastOpen(prev => !prev)
    setExpanded(null)
    setBlastResult(null)
    setConfirmOpen(false)
  }

  const togglePlan = (id: string) =>
    setSelectedPlanIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const toggleStatus = (s: string) =>
    setSelectedStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand-primary)' }} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 100,
          padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
          backgroundColor: toast.ok ? 'color-mix(in srgb, var(--success) 15%, var(--surface-card))' : 'color-mix(in srgb, var(--error) 15%, var(--surface-card))',
          color: toast.ok ? 'var(--success)' : 'var(--error)',
          border: `1px solid ${toast.ok ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'color-mix(in srgb, var(--error) 30%, transparent)'}`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)' }}>
          <Mail className="w-5 h-5" style={{ color: 'var(--brand-primary)' }} />
        </div>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>Plantillas de correo</h1>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            Personaliza los mensajes automáticos que reciben tus alumnos
          </p>
        </div>
      </div>

      {/* Template cards */}
      <div className="space-y-3 mb-3">
        {TEMPLATES.map(tpl => {
          const Icon = tpl.icon
          const isOpen = expanded === tpl.key
          const form = forms[tpl.key]

          return (
            <div key={tpl.key} className="card rounded-xl overflow-hidden">
              {/* Header row */}
              <button type="button"
                onClick={() => toggleExpand(tpl.key)}
                className="w-full flex items-center justify-between px-5 py-4 transition-colors text-left"
                style={{ backgroundColor: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' }}>
                    <Icon className="w-4 h-4" style={{ color: 'var(--brand-primary)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{tpl.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{tpl.description}</p>
                  </div>
                </div>
                {isOpen
                  ? <ChevronUp className="w-4 h-4 shrink-0" style={{ color: 'var(--text-4)' }} />
                  : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-4)' }} />}
              </button>

              {/* Expanded editor */}
              {isOpen && (
                <div className="border-t px-5 py-5 space-y-4" style={{ borderColor: 'var(--border-1)' }}>
                  {/* Variables */}
                  <div className="px-3 py-2.5 rounded-lg text-xs"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-primary) 15%, transparent)' }}>
                    <span className="font-semibold" style={{ color: 'var(--brand-primary)' }}>Variables disponibles: </span>
                    <span style={{ color: 'var(--text-3)' }}>
                      {tpl.vars.map(v => (
                        <code key={v} className="mx-0.5 px-1 py-0.5 rounded text-xs"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', color: 'var(--brand-primary)' }}>
                          {`{{${v}}}`}
                        </code>
                      ))}
                    </span>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                      Asunto del correo
                    </label>
                    <input
                      value={form.subject}
                      onChange={e => setForms(f => ({ ...f, [tpl.key]: { ...f[tpl.key], subject: e.target.value } }))}
                      className="input text-sm w-full"
                    />
                  </div>

                  {/* Body */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                      Cuerpo del mensaje
                    </label>
                    <textarea
                      value={form.body}
                      onChange={e => setForms(f => ({ ...f, [tpl.key]: { ...f[tpl.key], body: e.target.value } }))}
                      rows={6}
                      className="input text-sm w-full resize-none"
                      style={{ fontFamily: 'monospace', lineHeight: 1.6 }}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button type="button"
                      onClick={() => handleSave(tpl.key)}
                      disabled={saving === tpl.key}
                      className="btn-brand flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50 flex-1">
                      <Check className="w-3.5 h-3.5" />
                      {saving === tpl.key ? 'Guardando...' : 'Guardar plantilla'}
                    </button>
                    <button type="button"
                      onClick={handleTest}
                      disabled={testing}
                      className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm rounded-xl disabled:opacity-50"
                      title="Envía un correo de prueba a tu email">
                      <Send className="w-3.5 h-3.5" />
                      {testing ? 'Enviando...' : 'Probar envío'}
                    </button>
                  </div>

                  {testResult?.url && (
                    <a href={testResult.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs underline block"
                      style={{ color: 'var(--brand-accent)' }}>
                      Ver correo de prueba en Ethereal →
                    </a>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* ── Envío masivo ── */}
        <div className="card rounded-xl overflow-hidden">
          <button type="button"
            onClick={toggleBlast}
            className="w-full flex items-center justify-between px-5 py-4 transition-colors text-left"
            style={{ backgroundColor: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' }}>
                <Users className="w-4 h-4" style={{ color: 'var(--brand-primary)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Envío masivo</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  Envía un correo personalizado a tus alumnos con filtros por plan y estado.
                </p>
              </div>
            </div>
            {blastOpen
              ? <ChevronUp className="w-4 h-4 shrink-0" style={{ color: 'var(--text-4)' }} />
              : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-4)' }} />}
          </button>

          {blastOpen && (
            <div className="border-t px-5 py-5 space-y-5" style={{ borderColor: 'var(--border-1)' }}>

              {/* Filters row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Plan filter */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>
                    Filtrar por plan
                  </p>
                  {plans.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-4)' }}>Sin planes activos</p>
                  ) : (
                    <div className="space-y-1.5">
                      {plans.map(plan => (
                        <label key={plan.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedPlanIds.includes(plan.id)}
                            onChange={() => togglePlan(plan.id)}
                            className="w-3.5 h-3.5 rounded"
                            style={{ accentColor: 'var(--brand-primary)' }}
                          />
                          <span className="text-sm" style={{ color: 'var(--text-2)' }}>{plan.name}</span>
                        </label>
                      ))}
                      {selectedPlanIds.length > 0 && (
                        <button type="button" onClick={() => setSelectedPlanIds([])}
                          className="text-xs mt-1 transition-colors" style={{ color: 'var(--text-4)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}>
                          Limpiar selección
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Status filter */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>
                    Filtrar por estado
                  </p>
                  <div className="space-y-1.5">
                    {ALL_STATUSES.map(s => (
                      <label key={s.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedStatuses.includes(s.value)}
                          onChange={() => toggleStatus(s.value)}
                          className="w-3.5 h-3.5 rounded"
                          style={{ accentColor: 'var(--brand-primary)' }}
                        />
                        <span className="text-sm" style={{ color: 'var(--text-2)' }}>{s.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recipient count */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-primary) 15%, transparent)' }}>
                <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                {previewLoading ? (
                  <span style={{ color: 'var(--text-3)' }}>Calculando destinatarios...</span>
                ) : previewCount !== null ? (
                  <span style={{ color: 'var(--text-2)' }}>
                    <strong style={{ color: 'var(--brand-primary)' }}>{previewCount}</strong> alumno{previewCount !== 1 ? 's' : ''} recibirán este correo
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-4)' }}>No se pudo calcular destinatarios</span>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  Asunto del correo
                </label>
                <input
                  value={blastSubject}
                  onChange={e => setBlastSubject(e.target.value)}
                  placeholder="ej: Novedades en el gimnasio"
                  className="input text-sm w-full"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  Mensaje
                </label>
                <textarea
                  value={blastBody}
                  onChange={e => setBlastBody(e.target.value)}
                  rows={6}
                  placeholder="Escribe tu mensaje aquí..."
                  className="input text-sm w-full resize-none"
                  style={{ lineHeight: 1.6 }}
                />
              </div>

              {/* Send / Confirm */}
              {!confirmOpen ? (
                <button type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={sending || !blastSubject.trim() || !blastBody.trim() || previewCount === 0}
                  className="btn-brand w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50">
                  <Send className="w-4 h-4" />
                  Enviar a {previewCount !== null ? previewCount : '…'} alumno{previewCount !== 1 ? 's' : ''}
                </button>
              ) : (
                <div className="rounded-xl p-4 space-y-3"
                  style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 8%, var(--surface-card))', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)' }}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                      ¿Confirmas el envío a <strong>{previewCount}</strong> alumno{previewCount !== 1 ? 's' : ''}?
                      Esta acción no se puede deshacer.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={handleSendBlast}
                      disabled={sending}
                      className="btn-brand flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50 flex-1">
                      <Send className="w-3.5 h-3.5" />
                      {sending ? 'Enviando...' : 'Confirmar envío'}
                    </button>
                    <button type="button"
                      onClick={() => setConfirmOpen(false)}
                      className="btn-secondary px-4 py-2 text-sm rounded-xl">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Result */}
              {blastResult && (
                <div className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: blastResult.failed === 0
                      ? 'color-mix(in srgb, var(--success) 10%, var(--surface-card))'
                      : 'color-mix(in srgb, #f59e0b 10%, var(--surface-card))',
                    border: `1px solid ${blastResult.failed === 0
                      ? 'color-mix(in srgb, var(--success) 25%, transparent)'
                      : 'color-mix(in srgb, #f59e0b 25%, transparent)'}`,
                    color: 'var(--text-2)',
                  }}>
                  <strong>{blastResult.sent}</strong> enviados · <strong>{blastResult.failed}</strong> fallidos · <strong>{blastResult.total}</strong> total
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
