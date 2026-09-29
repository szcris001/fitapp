'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'
import { MessageSquare, Bell, Mail, CheckCircle } from 'lucide-react'

export default function CommunicationsPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [users, setUsers] = useState<any[]>([])
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'push' | 'email'>('push')
  const router = useRouter()

  const [pushForm, setPushForm] = useState({ target: 'all', userId: '', planId: '', title: '', message: '' })
  const [emailForm, setEmailForm] = useState({ target: 'all', userId: '', planId: '', subject: '', body: '' })

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) return  // el layout redirige a /login
    api.get('/users').then(r => setUsers(r.data)).catch(() => {}).finally(() => setLoading(false))
    api.get('/plans').then(r => setPlans(r.data)).catch(() => {})
  }, [user])

  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true); setError(''); setSuccess('')
    try {
      await api.post('/messages/push', {
        target: pushForm.target,
        userId: pushForm.target === 'individual' ? pushForm.userId : undefined,
        planId: pushForm.target === 'plan' ? pushForm.planId : undefined,
        title: pushForm.title,
        message: pushForm.message,
      })
      setSuccess('Notificación enviada correctamente')
      setPushForm({ target: 'all', userId: '', planId: '', title: '', message: '' })
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al enviar la notificación')
    } finally { setSending(false) }
  }

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true); setError(''); setSuccess('')
    try {
      const { data } = await api.post('/messages/email', {
        target: emailForm.target,
        userId: emailForm.target === 'individual' ? emailForm.userId : undefined,
        planId: emailForm.target === 'plan' ? emailForm.planId : undefined,
        subject: emailForm.subject,
        body: emailForm.body,
      })
      // La API responde 200 con sent/failed aunque todos los envíos fallen (p. ej. sin SMTP
      // configurado): solo es éxito si de verdad no falló ninguno
      if (data.failed > 0) {
        setError(data.sent > 0
          ? `Enviado a ${data.sent} de ${data.totalRecipients}; ${data.failed} fallaron. Revisa la configuración SMTP.`
          : `No se pudo enviar a ningún destinatario (${data.failed}). Revisa la configuración SMTP en Configuración.`)
      } else {
        setSuccess('Email enviado correctamente')
        setEmailForm({ target: 'all', userId: '', planId: '', subject: '', body: '' })
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al enviar el email')
    } finally { setSending(false) }
  }

  const targetOptions = [
    { value: 'all',        label: 'Todos los alumnos' },
    { value: 'active',     label: 'Solo alumnos activos' },
    { value: 'expiring',   label: 'Planes por vencer (7 días)' },
    { value: 'inactive',   label: 'Alumnos inactivos' },
    { value: 'plan',       label: 'Alumnos de un plan' },
    { value: 'individual', label: 'Alumno específico' },
  ]

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando...</div>

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h1 className="section-title">Comunicación</h1>
            <p className="text-slate-500 text-sm">Envía mensajes a tus alumnos</p>
          </div>
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />{success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {[
          { value: 'push', label: 'Notificación push', icon: Bell },
          { value: 'email', label: 'Correo electrónico', icon: Mail },
        ].map(t => {
          const Icon = t.icon
          return (
            <button key={t.value} onClick={() => { setTab(t.value as any); setError(''); setSuccess('') }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Push form */}
      {tab === 'push' && (
        <form onSubmit={handleSendPush} className="card rounded-xl p-6 space-y-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Bell className="w-4 h-4 text-slate-400" />
            Enviar notificación push
          </h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Destinatarios</label>
            <select value={pushForm.target} onChange={e => setPushForm(f => ({ ...f, target: e.target.value }))}
              className="input">
              {targetOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {pushForm.target === 'plan' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Plan</label>
              <select value={pushForm.planId} onChange={e => setPushForm(f => ({ ...f, planId: e.target.value }))} required
                className="input">
                <option value="">Seleccionar...</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {pushForm.target === 'individual' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Seleccionar alumno</label>
              <select value={pushForm.userId} onChange={e => setPushForm(f => ({ ...f, userId: e.target.value }))} required
                className="input">
                <option value="">Seleccionar...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Título *</label>
            <input value={pushForm.title} onChange={e => setPushForm(f => ({ ...f, title: e.target.value }))} required
              placeholder="ej: ¡Nuevo WOD disponible!" className="input" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Mensaje *</label>
            <textarea value={pushForm.message} onChange={e => setPushForm(f => ({ ...f, message: e.target.value }))} required
              rows={3} placeholder="Escribe tu mensaje aquí..."
              className="input resize-none" />
          </div>

          {/* Preview */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Vista previa</p>
            <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-md bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <Bell className="w-3 h-3 text-slate-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm leading-tight">{pushForm.title || 'Título de la notificación'}</p>
                  <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{pushForm.message || 'Mensaje de la notificación...'}</p>
                </div>
              </div>
            </div>
          </div>

          <button type="submit" disabled={sending} className="btn-brand w-full py-2.5 disabled:opacity-50">
            {sending ? 'Enviando...' : 'Enviar notificación'}
          </button>
        </form>
      )}

      {/* Email form */}
      {tab === 'email' && (
        <form onSubmit={handleSendEmail} className="card rounded-xl p-6 space-y-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Mail className="w-4 h-4 text-slate-400" />
            Enviar correo electrónico
          </h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Destinatarios</label>
            <select value={emailForm.target} onChange={e => setEmailForm(f => ({ ...f, target: e.target.value }))}
              className="input">
              {targetOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {emailForm.target === 'plan' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Plan</label>
              <select value={emailForm.planId} onChange={e => setEmailForm(f => ({ ...f, planId: e.target.value }))} required
                className="input">
                <option value="">Seleccionar...</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {emailForm.target === 'individual' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Seleccionar alumno</label>
              <select value={emailForm.userId} onChange={e => setEmailForm(f => ({ ...f, userId: e.target.value }))} required
                className="input">
                <option value="">Seleccionar...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Asunto *</label>
            <input value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))} required
              placeholder="ej: Tu membresía está por vencer" className="input" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Cuerpo del correo *</label>
            <textarea value={emailForm.body} onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))} required
              rows={6} placeholder="Escribe el contenido del correo..."
              className="input resize-none" />
          </div>

          <button type="submit" disabled={sending} className="btn-brand w-full py-2.5 disabled:opacity-50">
            {sending ? 'Enviando...' : 'Enviar correo'}
          </button>
        </form>
      )}

      {/* Auto emails */}
      <div className="card rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-slate-50">
          <h3 className="font-semibold text-slate-900 text-sm">Correos automáticos configurados</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {[
            { label: 'Bienvenida al registrarse' },
            { label: 'Membresía próxima a vencer (3 días antes)' },
            { label: 'Membresía vencida' },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between px-6 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-sm text-slate-700">{item.label}</span>
              </div>
              <span className="badge-green">Activo</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
// coach guard added
