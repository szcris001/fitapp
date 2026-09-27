'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'
import { UserCog, CheckCircle } from 'lucide-react'

export default function SuperAdminProfilePage() {
  const { user, loadFromStorage } = useAuthStore()
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { loadFromStorage() }, [])

  useEffect(() => {
    if (!user) return
    api.get('/auth/me').then(({ data }) => {
      setForm({ name: data.name || '', email: data.email || '', phone: data.phone || '' })
    }).finally(() => setLoading(false))
  }, [user])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    try {
      await api.put('/auth/me', { name: form.name, email: form.email, phone: form.phone || undefined })
      setSuccess('Perfil actualizado correctamente')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al guardar')
    } finally { setSaving(false) }
  }

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirmPassword) { setError('Las contraseñas no coinciden'); return }
    setSavingPw(true); setError(''); setSuccess('')
    try {
      await api.put('/auth/me', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword })
      setSuccess('Contraseña actualizada correctamente')
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cambiar contraseña')
    } finally { setSavingPw(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando...</div>

  return (
    <div className="max-w-xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#2d1d5e' }}>
          <UserCog className="w-5 h-5" style={{ color: '#a78bfa' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Mi perfil</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>Administra tus datos de acceso</p>
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: '#052e16', border: '1px solid #166534', color: '#4ade80' }}>
          <CheckCircle className="w-4 h-4 shrink-0" />{success}
        </div>
      )}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: '#1f0707', border: '1px solid #7f1d1d', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* Datos personales */}
      <form onSubmit={handleSaveProfile} className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: '#13131f', border: '1px solid #2d2d4e' }}>
        <h2 className="font-semibold text-white flex items-center gap-2 text-sm">Datos personales</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>Nombre</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ backgroundColor: '#1e1e35', border: '1px solid #2d2d4e', color: '#e2e8f0' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ backgroundColor: '#1e1e35', border: '1px solid #2d2d4e', color: '#e2e8f0' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>Teléfono</label>
            <input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ backgroundColor: '#1e1e35', border: '1px solid #2d2d4e', color: '#e2e8f0' }}
            />
          </div>
        </div>
        <button type="submit" disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: '#7c3aed', color: '#fff' }}>
          {saving ? 'Guardando...' : 'Guardar datos'}
        </button>
      </form>

      {/* Cambiar contraseña */}
      <form onSubmit={handleSavePassword} className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: '#13131f', border: '1px solid #2d2d4e' }}>
        <h2 className="font-semibold text-white text-sm">Cambiar contraseña</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>Contraseña actual</label>
            <input
              type="password"
              value={pwForm.currentPassword}
              onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
              required
              placeholder="••••••••"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ backgroundColor: '#1e1e35', border: '1px solid #2d2d4e', color: '#e2e8f0' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>Nueva contraseña</label>
            <input
              type="password"
              value={pwForm.newPassword}
              onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ backgroundColor: '#1e1e35', border: '1px solid #2d2d4e', color: '#e2e8f0' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>Confirmar nueva contraseña</label>
            <input
              type="password"
              value={pwForm.confirmPassword}
              onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
              required
              placeholder="Repite la contraseña"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ backgroundColor: '#1e1e35', border: '1px solid #2d2d4e', color: '#e2e8f0' }}
            />
          </div>
        </div>
        <button type="submit" disabled={savingPw}
          className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: '#7c3aed', color: '#fff' }}>
          {savingPw ? 'Guardando...' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  )
}
