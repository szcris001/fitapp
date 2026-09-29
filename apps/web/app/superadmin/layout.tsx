'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '../../store/auth.store'
import { Shield, PlusCircle, LayoutGrid, LogOut, UserCog, Settings, CreditCard } from 'lucide-react'

function SuperAdminLogin() {
  const { login, isLoading } = useAuthStore()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const inputStyle: React.CSSProperties = {
    width: '100%', backgroundColor: '#0f0f1a', border: '1px solid #2d2d4e',
    borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#e2e8f0',
    fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const loggedUser = await login('', email, password)
      if ((loggedUser as any)?.role !== 'SUPER_ADMIN') {
        setError('Acceso denegado. Esta área es exclusiva para Super Admin.')
        useAuthStore.getState().logout()
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Credenciales incorrectas')
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <Shield style={{ width: 28, height: 28, color: '#fff' }} />
          </div>
          <h1 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Super Admin</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.5rem' }}>Acceso exclusivo para administradores de plataforma</p>
        </div>

        {error && (
          <div style={{ backgroundColor: '#450a0a', border: '1px solid #7f1d1d', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#f87171', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.375rem' }}>
              Email
            </label>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@fithub.app"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.375rem' }}>
              Contraseña
            </label>
            <input
              type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button
            type="submit" disabled={isLoading}
            style={{
              backgroundColor: isLoading ? '#4c1d95' : '#7c3aed', color: '#fff',
              border: 'none', borderRadius: '0.5rem', padding: '0.875rem',
              fontSize: '0.9rem', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1, marginTop: '0.5rem',
            }}
          >
            {isLoading ? 'Verificando...' : 'Ingresar al panel'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loadFromStorage, logout } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') router.push('/dashboard')
  }, [user])

  if (!user) return <SuperAdminLogin />
  if (user.role !== 'SUPER_ADMIN') return null

  const navItems = [
    { label: 'Gimnasios',       href: '/superadmin',                   icon: LayoutGrid  },
    { label: 'Crear gimnasio',  href: '/superadmin/new',                icon: PlusCircle  },
    { label: 'Suscripciones',   href: '/superadmin/subscriptions',      icon: CreditCard  },
    { label: 'Configuración',   href: '/superadmin/config',             icon: Settings    },
    { label: 'Mi perfil',       href: '/superadmin/profile',            icon: UserCog     },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0f0f1a', color: '#e2e8f0' }}>
      {/* Topbar */}
      <nav className="sticky top-0 z-50 border-b px-6 py-0 flex items-center justify-between h-14"
        style={{ backgroundColor: '#13131f', borderColor: '#2d2d4e' }}>

        {/* Left: brand + nav */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: '#7c3aed' }}>
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm text-white">FitApp</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: '#2d1d5e', color: '#a78bfa', border: '1px solid #4c3999' }}>
              Super Admin
            </span>
          </div>

          <div className="flex items-center gap-1">
            {navItems.map(item => {
              const Icon = item.icon
              const isActive = item.href === '/superadmin' ? pathname === item.href : pathname.startsWith(item.href)
              return (
                <button key={item.href} onClick={() => router.push(item.href)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={isActive
                    ? { backgroundColor: '#7c3aed', color: '#ffffff' }
                    : { color: '#94a3b8' }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = '#1e1e35' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}>
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: user + actions */}
        <div className="flex items-center gap-4">
          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{user?.email}</span>
          <button onClick={() => logout()}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: '#64748b' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e2e8f0')}
            onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}>
            <LogOut className="w-3.5 h-3.5" />
            Salir
          </button>
        </div>
      </nav>

      {children}
    </div>
  )
}
