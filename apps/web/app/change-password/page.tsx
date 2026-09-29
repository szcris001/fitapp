'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../store/auth.store'
import api from '../../lib/api'

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { user, logout } = useAuthStore()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setLoading(true)
    try {
      await api.put('/auth/me', { currentPassword, newPassword })
      // Update stored user to clear mustChangePassword
      const stored = localStorage.getItem('fitapp_user')
      if (stored) {
        const u = JSON.parse(stored)
        u.mustChangePassword = false
        localStorage.setItem('fitapp_user', JSON.stringify(u))
      }
      router.push(user?.role === 'SUPER_ADMIN' ? '/superadmin' : '/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cambiar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#080808',
    }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '40px 24px' }}>
        {/* Logo */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, #6366F1, #818CF8)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20, boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: '#fff' }}>F</span>
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800,
            color: '#F8F8F8', letterSpacing: '-0.03em', marginBottom: 8,
          }}>Cambia tu contraseña</h2>
          <p style={{ fontSize: 14, color: '#666', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
            Por seguridad, debes establecer una nueva contraseña antes de continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Campo oculto para que el navegador sepa qué credencial actualizar */}
          <input type="hidden" autoComplete="username" value={user?.email ?? ''} readOnly />

          {[
            { label: 'Contraseña temporal',        key: 'current', autoComplete: 'current-password', value: currentPassword, onChange: setCurrentPassword },
            { label: 'Nueva contraseña',           key: 'new',     autoComplete: 'new-password',     value: newPassword,    onChange: setNewPassword },
            { label: 'Confirmar nueva contraseña', key: 'confirm', autoComplete: 'new-password',     value: confirm,        onChange: setConfirm },
          ].map(field => (
            <div key={field.key}>
              <label style={{
                display: 'block', fontSize: 12, fontWeight: 600, color: '#888',
                marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase',
                fontFamily: 'var(--font-body)',
              }}>{field.label}</label>
              <input
                type="password"
                autoComplete={field.autoComplete}
                value={field.value}
                onChange={e => field.onChange(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12, padding: '12px 16px', fontSize: 15,
                  color: '#F8F8F8', outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'var(--font-body)',
                  transition: 'border-color 150ms, box-shadow 150ms',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>
          ))}

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10, padding: '10px 14px', fontSize: 13,
              color: '#F87171', fontFamily: 'var(--font-body)',
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4, width: '100%',
              background: 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
              border: 'none', borderRadius: 12, padding: '14px',
              fontSize: 15, fontWeight: 700, color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              boxShadow: '0 4px 20px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {loading ? 'Guardando...' : 'Establecer nueva contraseña'}
          </button>

          <button
            type="button"
            onClick={() => logout()}
            style={{
              width: '100%', background: 'none',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px',
              fontSize: 14, color: '#555', cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  )
}
