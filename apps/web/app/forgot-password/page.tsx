'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '../../lib/api'
import { Dumbbell, ArrowLeft, CheckCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [gymSlug, setGymSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/forgot-password', {
        email,
        gymSlug: gymSlug || undefined,
      })
      setSent(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al enviar el correo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--brand-primary)' }}>
            <Dumbbell className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">FitApp</h1>
          <p className="text-slate-500 text-sm mt-1">Recuperar contraseña</p>
        </div>

        <div className="card rounded-2xl p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Correo enviado</p>
                <p className="text-sm text-slate-500 mt-1">
                  Si el correo existe en el sistema, recibirás un link para restablecer tu contraseña. Revisa también la carpeta de spam.
                </p>
              </div>
              <button onClick={() => router.push('/login')}
                className="w-full btn-brand py-2.5 rounded-lg text-sm font-medium">
                Volver al login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-slate-600">
                Ingresa tu email y el slug de tu gimnasio. Te enviaremos un link para restablecer tu contraseña.
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Slug del gimnasio</label>
                <input
                  type="text"
                  value={gymSlug}
                  onChange={e => setGymSlug(e.target.value)}
                  placeholder="ej: crossfit-demo (vacío si eres super admin)"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  className="input"
                />
              </div>

              {error && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <button type="submit" disabled={loading}
                className="w-full btn-brand disabled:opacity-50 py-3 rounded-lg text-sm font-medium">
                {loading ? 'Enviando...' : 'Enviar link de recuperación'}
              </button>

              <button type="button" onClick={() => router.push('/login')}
                className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700 pt-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver al login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
