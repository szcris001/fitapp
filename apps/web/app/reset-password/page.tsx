'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '../../lib/api'
import { Dumbbell, CheckCircle, XCircle } from 'lucide-react'

function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) setError('Link inválido o expirado')
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    if (password.length < 6) { setError('Mínimo 6 caracteres'); return }
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/reset-password', { token, password })
      setDone(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al restablecer la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--brand-primary)' }}>
            <Dumbbell className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">FitApp</h1>
          <p className="text-slate-500 text-sm mt-1">Nueva contraseña</p>
        </div>

        <div className="card rounded-2xl p-8">
          {!token ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <XCircle className="w-7 h-7 text-red-500" />
              </div>
              <p className="font-semibold text-slate-900">Link inválido</p>
              <p className="text-sm text-slate-500">Este link no es válido o ya expiró.</p>
              <button onClick={() => router.push('/forgot-password')}
                className="w-full btn-brand py-2.5 rounded-lg text-sm font-medium">
                Solicitar nuevo link
              </button>
            </div>
          ) : done ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Contraseña actualizada</p>
                <p className="text-sm text-slate-500 mt-1">Ya puedes iniciar sesión con tu nueva contraseña.</p>
              </div>
              <button onClick={() => router.push('/login')}
                className="w-full btn-brand py-2.5 rounded-lg text-sm font-medium">
                Ir al login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nueva contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmar contraseña</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  required
                  className="input"
                />
              </div>

              {error && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <button type="submit" disabled={loading || !password || !confirm}
                className="w-full btn-brand disabled:opacity-50 py-3 rounded-lg text-sm font-medium">
                {loading ? 'Guardando...' : 'Establecer nueva contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
