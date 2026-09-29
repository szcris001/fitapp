'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../store/auth.store'
import api, { mediaUrl } from '../../lib/api'
import { Plus, Trash2, RotateCcw, AlertTriangle, Pencil } from 'lucide-react'

export const PLAN_COLOR_PRESETS: Record<string, { bg: string; color: string }> = {
  gray:    { bg: '#1e293b', color: '#94a3b8' },
  blue:    { bg: '#1e3a5f', color: '#60a5fa' },
  green:   { bg: '#14532d', color: '#4ade80' },
  purple:  { bg: '#2e1065', color: '#c084fc' },
  violet:  { bg: '#1c2432', color: '#a78bfa' },
  emerald: { bg: '#1a2e1a', color: '#86efac' },
  orange:  { bg: '#422006', color: '#fb923c' },
  red:     { bg: '#450a0a', color: '#f87171' },
  cyan:    { bg: '#0c2a3a', color: '#67e8f9' },
  gold:    { bg: '#3b2800', color: '#fbbf24' },
  pink:    { bg: '#3b0d2a', color: '#f9a8d4' },
}

// Fallback por posición cuando el plan no tiene color asignado
const PLAN_COLORS_FALLBACK = Object.values(PLAN_COLOR_PRESETS)

function planBadge(slug: string, plans: any[]) {
  const plan = plans.find(p => p.slug === slug)
  if (plan?.color && PLAN_COLOR_PRESETS[plan.color]) return PLAN_COLOR_PRESETS[plan.color]
  const idx = plans.findIndex(p => p.slug === slug)
  return PLAN_COLORS_FALLBACK[idx >= 0 ? idx % PLAN_COLORS_FALLBACK.length : 0]
}

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  ACTIVE:    { label: 'Activo',     bg: '#14532d', color: '#4ade80' },
  SUSPENDED: { label: 'Suspendido', bg: '#450a0a', color: '#f87171' },
  TRIAL:     { label: 'Trial',      bg: '#422006', color: '#fb923c' },
}

function ConfirmModal({ gym, onConfirm, onCancel, permanent = false }: {
  gym: any; onConfirm: () => void; onCancel: () => void; permanent?: boolean
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        backgroundColor: '#13131f', border: '1px solid #2d2d4e',
        borderRadius: 16, padding: 32, maxWidth: 420, width: '100%',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          backgroundColor: '#450a0a', display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
        }}>
          <AlertTriangle style={{ color: '#f87171', width: 22, height: 22 }} />
        </div>
        <h3 style={{ color: '#f8fafc', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
          {permanent ? 'Eliminar permanentemente' : 'Eliminar gimnasio'}
        </h3>
        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          {permanent ? (
            <>¿Eliminar <strong style={{ color: '#e2e8f0' }}>{gym.name}</strong> permanentemente?
            <br /><span style={{ color: '#f87171' }}>Esta acción no se puede deshacer.</span> Se borrarán todos los datos del gimnasio.</>
          ) : (
            <>¿Eliminar <strong style={{ color: '#e2e8f0' }}>{gym.name}</strong>? El gimnasio quedará en el historial y podrás restaurarlo en cualquier momento.</>
          )}
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 500,
            border: '1px solid #2d2d4e', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer',
          }}>Cancelar</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 600,
            border: 'none', backgroundColor: '#7f1d1d', color: '#f87171', cursor: 'pointer',
          }}>{permanent ? 'Eliminar para siempre' : 'Eliminar'}</button>
        </div>
      </div>
    </div>
  )
}

export default function SuperAdminPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [gyms, setGyms] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [confirmGym, setConfirmGym] = useState<any>(null)
  const [fitPlans, setFitPlans] = useState<any[]>([])
  const [confirmPermanent, setConfirmPermanent] = useState<any>(null)
  const router = useRouter()

  useEffect(() => { loadFromStorage() }, [])

  useEffect(() => {
    if (!user) return  // el layout redirige a /login
    if (user.role !== 'SUPER_ADMIN') { router.push('/dashboard'); return }
    fetchData()
  }, [user?.userId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [gymsRes, historyRes, statsRes, plansRes] = await Promise.all([
        api.get('/superadmin/gyms'),
        api.get('/superadmin/gyms/history'),
        api.get('/superadmin/stats'),
        api.get('/superadmin/fitapp-plans'),
      ])
      setGyms(gymsRes.data)
      setHistory(historyRes.data)
      setStats(statsRes.data)
      setFitPlans(plansRes.data)
    } catch { /* 401: lib/api.ts refresca o cierra sesión; otros errores no deben sacar al usuario */ }
    finally { setLoading(false) }
  }

  const updateStatus = async (gymId: string, status: string) => {
    setUpdating(gymId)
    try {
      await api.patch(`/superadmin/gyms/${gymId}/status`, { status })
      setGyms(gs => gs.map(g => g.id === gymId ? { ...g, status } : g))
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al actualizar')
    } finally { setUpdating(null) }
  }

  const updatePlan = async (gymId: string, subscriptionPlan: string) => {
    setUpdating(gymId)
    try {
      await api.patch(`/superadmin/gyms/${gymId}/subscription`, { subscriptionPlan })
      setGyms(gs => gs.map(g => g.id === gymId ? { ...g, subscriptionPlan } : g))
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al actualizar')
    } finally { setUpdating(null) }
  }

  const deleteGym = async (gymId: string) => {
    setConfirmGym(null)
    setUpdating(gymId)
    try {
      await api.delete(`/superadmin/gyms/${gymId}`)
      const deleted = gyms.find(g => g.id === gymId)
      setGyms(gs => gs.filter(g => g.id !== gymId))
      if (deleted) setHistory(h => [{ ...deleted, deletedAt: new Date().toISOString(), status: 'SUSPENDED' }, ...h])
      setStats((s: any) => s ? { ...s, totalGyms: s.totalGyms - 1, deletedGyms: (s.deletedGyms || 0) + 1 } : s)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al eliminar')
    } finally { setUpdating(null) }
  }

  const permanentDeleteGym = async (gymId: string) => {
    setConfirmPermanent(null)
    setUpdating(gymId)
    try {
      await api.delete(`/superadmin/gyms/${gymId}/permanent`)
      setHistory(h => h.filter(g => g.id !== gymId))
      setStats((s: any) => s ? { ...s, deletedGyms: Math.max(0, (s.deletedGyms || 0) - 1) } : s)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al eliminar')
    } finally { setUpdating(null) }
  }

  const restoreGym = async (gymId: string) => {
    setUpdating(gymId)
    try {
      await api.post(`/superadmin/gyms/${gymId}/restore`)
      const restored = history.find(g => g.id === gymId)
      setHistory(h => h.filter(g => g.id !== gymId))
      if (restored) setGyms(gs => [{ ...restored, deletedAt: null, status: 'ACTIVE' }, ...gs])
      setStats((s: any) => s ? { ...s, totalGyms: s.totalGyms + 1, deletedGyms: Math.max(0, (s.deletedGyms || 0) - 1) } : s)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al restaurar')
    } finally { setUpdating(null) }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-500 text-sm">Cargando...</div>
  }

  const activeList = tab === 'active' ? gyms : history

  return (
    <>
      {confirmGym && (
        <ConfirmModal
          gym={confirmGym}
          onConfirm={() => deleteGym(confirmGym.id)}
          onCancel={() => setConfirmGym(null)}
        />
      )}
      {confirmPermanent && (
        <ConfirmModal
          gym={confirmPermanent}
          permanent
          onConfirm={() => permanentDeleteGym(confirmPermanent.id)}
          onCancel={() => setConfirmPermanent(null)}
        />
      )}

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Gimnasios</h1>
            <p className="text-slate-500 text-sm mt-0.5">Gestiona todos los tenants de la plataforma</p>
          </div>
          <button onClick={() => router.push('/superadmin/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white"
            style={{ backgroundColor: '#7c3aed' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#6d28d9')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#7c3aed')}>
            <Plus className="w-4 h-4" />
            Nuevo gimnasio
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {[
              { label: 'Total activos',  value: stats.totalGyms,    accent: '#a78bfa' },
              { label: 'Activos',        value: stats.activeGyms,   accent: '#4ade80' },
              { label: 'Suspendidos',    value: stats.suspendedGyms,accent: '#f87171' },
              { label: 'Total miembros', value: stats.totalMembers, accent: '#60a5fa' },
              { label: 'En historial',   value: stats.deletedGyms || 0, accent: '#64748b' },
            ].map(card => (
              <div key={card.label} className="rounded-xl border p-5"
                style={{ backgroundColor: '#13131f', borderColor: '#2d2d4e' }}>
                <p className="text-slate-400 text-sm mb-1">{card.label}</p>
                <p className="text-3xl font-bold tabular-nums" style={{ color: card.accent }}>{card.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit"
          style={{ backgroundColor: '#0f0f1a', border: '1px solid #2d2d4e' }}>
          {([
            { key: 'active',  label: `Activos (${gyms.length})` },
            { key: 'history', label: `Historial (${history.length})` },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: '6px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'pointer', transition: 'all 150ms',
                backgroundColor: tab === t.key ? '#7c3aed' : 'transparent',
                color: tab === t.key ? '#fff' : '#64748b',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: '#13131f', borderColor: '#2d2d4e' }}>
          {activeList.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              {tab === 'active' ? 'No hay gimnasios activos' : 'El historial está vacío'}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: '#2d2d4e', backgroundColor: '#0f0f1a' }}>
                  {tab === 'active'
                    ? ['Gimnasio', 'Admin', 'Miembros', 'Plan', 'Estado', 'Creado', ''].map(h => (
                        <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide px-6 py-3.5"
                          style={{ color: '#64748b' }}>{h}</th>
                      ))
                    : ['Gimnasio', 'Admin', 'Miembros', 'Plan', 'Eliminado', ''].map(h => (
                        <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide px-6 py-3.5"
                          style={{ color: '#64748b' }}>{h}</th>
                      ))
                  }
                </tr>
              </thead>
              <tbody>
                {activeList.map(gym => {
                  const planInfo = planBadge(gym.subscriptionPlan, fitPlans)
                  const planLabel = fitPlans.find(p => p.slug === gym.subscriptionPlan)?.name ?? gym.subscriptionPlan
                  const statusInfo = STATUS_BADGE[gym.status] || STATUS_BADGE.ACTIVE
                  return (
                    <tr key={gym.id} className="border-b last:border-0 transition-colors"
                      style={{ borderColor: '#2d2d4e' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a1a2e')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>

                      {/* Gimnasio */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center text-sm font-bold shrink-0"
                            style={{ backgroundColor: tab === 'history' ? '#1e293b' : '#7c3aed', color: tab === 'history' ? '#64748b' : '#fff' }}>
                            {gym.logoUrl
                              ? <img src={mediaUrl(gym.logoUrl)} className="w-full h-full object-cover" alt="" />
                              : gym.name[0]}
                          </div>
                          <div>
                            <p className="font-medium text-sm" style={{ color: tab === 'history' ? '#64748b' : '#fff' }}>{gym.name}</p>
                            <p className="text-xs" style={{ color: '#475569' }}>{gym.slug}</p>
                          </div>
                        </div>
                      </td>

                      {/* Admin */}
                      <td className="px-6 py-4">
                        {gym.users?.[0] ? (
                          <div>
                            <p className="text-sm" style={{ color: tab === 'history' ? '#64748b' : '#fff' }}>{gym.users[0].name}</p>
                            <p className="text-xs" style={{ color: '#475569' }}>{gym.users[0].email}</p>
                          </div>
                        ) : <span className="text-slate-500 text-sm">—</span>}
                      </td>

                      {/* Miembros */}
                      <td className="px-6 py-4 text-sm text-slate-400">{gym._count?.users || 0}</td>

                      {/* Plan */}
                      <td className="px-6 py-4">
                        {tab === 'active' ? (
                          <select value={gym.subscriptionPlan}
                            onChange={e => updatePlan(gym.id, e.target.value)}
                            disabled={updating === gym.id}
                            className="text-xs px-2.5 py-1 rounded-full font-medium border-0 cursor-pointer outline-none"
                            style={{ backgroundColor: planInfo.bg, color: planInfo.color }}>
                            {fitPlans.length > 0
                              ? fitPlans.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)
                              : <option value={gym.subscriptionPlan}>{planLabel}</option>
                            }
                          </select>
                        ) : (
                          <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                            style={{ backgroundColor: planInfo.bg, color: planInfo.color }}>
                            {planLabel}
                          </span>
                        )}
                      </td>

                      {/* Estado / Eliminado */}
                      <td className="px-6 py-4">
                        {tab === 'active' ? (
                          <select value={gym.status}
                            onChange={e => updateStatus(gym.id, e.target.value)}
                            disabled={updating === gym.id}
                            className="text-xs px-2.5 py-1 rounded-full font-medium border-0 cursor-pointer outline-none"
                            style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }}>
                            <option value="ACTIVE">Activo</option>
                            <option value="TRIAL">Trial</option>
                            <option value="SUSPENDED">Suspendido</option>
                          </select>
                        ) : (
                          <div>
                            <p className="text-xs" style={{ color: '#f87171' }}>
                              {new Date(gym.deletedAt).toLocaleDateString('es-CL')}
                            </p>
                            <p className="text-xs" style={{ color: '#475569' }}>
                              {new Date(gym.deletedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        )}
                      </td>

                      {/* Creado (solo tab activos) */}
                      {tab === 'active' && (
                        <td className="px-6 py-4 text-sm" style={{ color: '#64748b' }}>
                          {new Date(gym.createdAt).toLocaleDateString('es-CL')}
                        </td>
                      )}

                      {/* Acciones */}
                      <td className="px-6 py-4">
                        {tab === 'active' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button
                              onClick={() => router.push(`/superadmin/${gym.id}`)}
                              title="Editar gimnasio"
                              style={{
                                padding: '6px 8px', borderRadius: 8, border: 'none',
                                backgroundColor: 'transparent', cursor: 'pointer',
                                color: '#475569', transition: 'all 150ms',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e1e35'; e.currentTarget.style.color = '#a78bfa' }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#475569' }}>
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setConfirmGym(gym)}
                              disabled={updating === gym.id}
                              title="Eliminar gimnasio"
                              style={{
                                padding: '6px 8px', borderRadius: 8, border: 'none',
                                backgroundColor: 'transparent', cursor: 'pointer',
                                color: '#475569', transition: 'all 150ms',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#450a0a'; e.currentTarget.style.color = '#f87171' }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#475569' }}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              onClick={() => restoreGym(gym.id)}
                              disabled={updating === gym.id}
                              title="Restaurar gimnasio"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: 8, border: 'none',
                                backgroundColor: '#14532d', cursor: 'pointer',
                                color: '#4ade80', fontSize: 12, fontWeight: 600,
                                transition: 'all 150ms',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#166534')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#14532d')}>
                              <RotateCcw className="w-3.5 h-3.5" />
                              {updating === gym.id ? '...' : 'Restaurar'}
                            </button>
                            <button
                              onClick={() => setConfirmPermanent(gym)}
                              disabled={updating === gym.id}
                              title="Eliminar permanentemente"
                              style={{
                                padding: '6px 8px', borderRadius: 8, border: 'none',
                                backgroundColor: 'transparent', cursor: 'pointer',
                                color: '#475569', transition: 'all 150ms',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#450a0a'; e.currentTarget.style.color = '#f87171' }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#475569' }}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  )
}
