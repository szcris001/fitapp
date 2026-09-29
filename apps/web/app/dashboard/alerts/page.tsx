'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'
import { AlertTriangle, Clock, Sparkles, CheckCircle2, TrendingUp } from 'lucide-react'

function AlertsSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <style>{`@keyframes sk{0%,100%{opacity:.4}50%{opacity:.9}}`}</style>
      <div style={{ height: 36, width: 280, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', animation: 'sk 1.5s ease-in-out infinite' }} />
      {[1, 2, 3].map(i => (
        <div key={i} className="card rounded-xl p-4" style={{ display: 'flex', gap: 12, alignItems: 'center', animationDelay: `${i * 100}ms` }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.06)', animation: 'sk 1.5s ease-in-out infinite', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 12, width: '60%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)', animation: 'sk 1.5s ease-in-out infinite' }} />
            <div style={{ height: 10, width: '40%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)', animation: 'sk 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AlertsPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [alerts, setAlerts] = useState<any>(null)
  const [insights, setInsights] = useState<any>(null)
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const router = useRouter()

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) return  // el layout redirige a /login
    fetchAlerts()
  }, [user])

  const fetchAlerts = async () => {
    setLoadingAlerts(true)
    try {
      const { data } = await api.get('/ai/retention-alerts')
      setAlerts(data)
    } catch { /* 401: lib/api.ts refresca o cierra sesión; otros errores no deben sacar al usuario */ }
    finally { setLoadingAlerts(false) }
  }

  const fetchInsights = async () => {
    setLoadingInsights(true)
    try {
      const { data } = await api.get('/ai/insights')
      setInsights(data)
    } catch { setInsights({ error: 'No se pudieron cargar los insights' }) }
    finally { setLoadingInsights(false) }
  }

  if (loadingAlerts) {
    return <AlertsSkeleton />
  }

  const priorityBadge = (p: string) =>
    p === 'high'   ? 'badge-red'    :
    p === 'medium' ? 'badge-yellow' :
                     'badge-green'

  const priorityLabel = (p: string) =>
    p === 'high' ? 'Alta' : p === 'medium' ? 'Media' : 'Baja'

  const priorityCardStyle = (p: string): React.CSSProperties =>
    p === 'high'   ? { backgroundColor: 'rgba(239,68,68,0.08)',   borderColor: 'rgba(239,68,68,0.25)' }  :
    p === 'medium' ? { backgroundColor: 'rgba(245,158,11,0.08)',  borderColor: 'rgba(245,158,11,0.25)' } :
                     { backgroundColor: 'rgba(34,197,94,0.08)',   borderColor: 'rgba(34,197,94,0.25)'  }

  const atRiskCount     = alerts?.atRisk?.length ?? 0
  const expiringSoonCount = alerts?.expiringSoon?.length ?? 0
  const allOk           = atRiskCount === 0 && expiringSoonCount === 0

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      {/* Header mejorado */}
      <div className="fade-up flex items-start justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--text-4)' }}>Centro de alertas</p>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff', fontFamily: 'var(--font-display)' }}>
            Retención <span style={{ background: 'var(--gradient-btn)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>inteligente</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Detecta alumnos en riesgo antes de que abandonen</p>
        </div>
        <button onClick={fetchAlerts} className="btn-secondary px-4 py-2 text-sm shrink-0 mt-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {alerts && (
        <>
          {/* Tarjetas de resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div className="card rounded-xl p-4" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{atRiskCount}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>En riesgo</p>
              </div>
            </div>

            <div className="card rounded-xl p-4" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{expiringSoonCount}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>Por vencer</p>
              </div>
            </div>

            <div className="card rounded-xl p-4" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.3 }}>{allOk ? 'Todo OK' : 'Revisar alertas'}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>Estado general</p>
              </div>
            </div>
          </div>

          {/* Alumnos en riesgo */}
          {atRiskCount > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <h2 className="text-base font-semibold text-red-600">
                  Alumnos en riesgo de abandono — {atRiskCount}
                </h2>
              </div>
              <div className="space-y-3">
                {alerts.atRisk.map((m: any) => (
                  <div
                    key={m.id}
                    className="card rounded-xl p-4 border-l-4 border-l-red-400"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }} className="text-red-600">
                        {m.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{m.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-4)' }}>{m.email}</p>
                        <p className="text-xs mt-1 text-red-500">{m.alert}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                      <button
                        onClick={() => router.push(`/dashboard/users/${m.id ?? m.userId}`)}
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                        style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-2)', border: '1px solid var(--border-1)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--brand-accent)15')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                      >Ver alumno</button>
                      <button
                        onClick={() => router.push(`/dashboard/users?action=pay&userId=${m.id ?? m.userId}`)}
                        className="btn-brand text-xs px-2.5 py-1.5"
                      >Renovar</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Membresías por vencer */}
          {expiringSoonCount > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-amber-500" />
                <h2 className="text-base font-semibold text-amber-700">
                  Membresías por vencer — {expiringSoonCount}
                </h2>
              </div>
              <div className="space-y-3">
                {alerts.expiringSoon.map((m: any) => (
                  <div
                    key={m.userId}
                    className="card rounded-xl p-4 border-l-4 border-l-amber-400"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }} className="text-amber-600">
                        {m.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{m.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                          {m.plan} — vence en{' '}
                          <span className="font-semibold text-amber-600">{m.daysLeft} días</span>
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                      <button
                        onClick={() => router.push(`/dashboard/users/${m.id ?? m.userId}`)}
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                        style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-2)', border: '1px solid var(--border-1)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--brand-accent)15')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                      >Ver alumno</button>
                      <button
                        onClick={() => router.push(`/dashboard/users?action=pay&userId=${m.id ?? m.userId}`)}
                        className="btn-brand text-xs px-2.5 py-1.5"
                      >Renovar</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sin alertas */}
          {allOk && (
            <div className="card rounded-xl p-10 flex flex-col items-center gap-3 text-center">
              <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="font-semibold text-green-600">Sin alertas activas</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Todos tus alumnos están activos y al día</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* AI Insights */}
      <section>
        <div className="card rounded-xl overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-1)' }}>
            <div className="flex items-center gap-3">
              <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(124,58,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles className="w-4 h-4 text-violet-500" />
              </div>
              <div>
                <h2 className="font-semibold text-base" style={{ color: 'var(--text-1)' }}>Insights con IA</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  Recomendaciones personalizadas basadas en los datos de tu gimnasio
                </p>
              </div>
            </div>
            <button
              onClick={fetchInsights}
              disabled={loadingInsights}
              className="btn-brand disabled:opacity-50 text-sm px-4 py-2 flex items-center gap-2 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {loadingInsights ? 'Analizando...' : 'Generar insights'}
            </button>
          </div>

          <div className="p-6">
            {insights && !insights.error && (
              <div className="space-y-4">
                {insights.summary && (
                  <p className="text-sm rounded-lg p-4 leading-relaxed" style={{ color: 'var(--text-2)', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-1)' }}>
                    {insights.summary}
                  </p>
                )}

                {/* insights como array de strings */}
                {Array.isArray(insights.insights) && insights.insights.length > 0 && (
                  typeof insights.insights[0] === 'string' ? (
                    <ul className="space-y-2">
                      {insights.insights.map((item: string, i: number) => (
                        <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--brand-accent)', marginTop: 2, flexShrink: 0 }}>•</span>
                          <span className="text-sm" style={{ color: 'var(--text-2)' }}>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="space-y-3">
                      {insights.insights.map((insight: any, i: number) => (
                        <div key={i} className="rounded-xl border p-4" style={priorityCardStyle(insight.priority)}>
                          <div className="flex items-start gap-3">
                            <span className={`${priorityBadge(insight.priority)} shrink-0 mt-0.5`}>
                              {priorityLabel(insight.priority)}
                            </span>
                            <div>
                              <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{insight.title}</p>
                              <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--text-2)', opacity: 0.85 }}>{insight.description}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* recommendations como array */}
                {Array.isArray(insights.recommendations) && insights.recommendations.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>Recomendaciones</p>
                    <ul className="space-y-2">
                      {insights.recommendations.map((rec: string, i: number) => (
                        <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                          <span className="text-sm" style={{ color: 'var(--text-2)' }}>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {insights?.error && (
              <p className="text-red-500 text-sm">{insights.error}</p>
            )}

            {!insights && !loadingInsights && (
              <div className="text-center py-6">
                <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-4)' }} />
                <p className="text-sm" style={{ color: 'var(--text-4)' }}>
                  Haz clic en &ldquo;Generar insights&rdquo; para obtener recomendaciones personalizadas
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <AthleteProjection />
    </div>
  )
}

/* ─── Proyección de objetivos por alumno (spec §4.11) ───────────────────────
   Llama a la IA solo cuando el admin lo pide (tiene costo por consulta). */
interface Projection {
  athlete: string
  projections?: { movement: string; currentKg: number; projectedKg: number; weeksToGoal: number; confidence: string }[]
  nextMilestones?: { skill: string; nextMilestone: string; estimatedWeeks: number }[]
  coachTip?: string
  raw?: string
}

function AthleteProjection() {
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [userId, setUserId] = useState('')
  const [projection, setProjection] = useState<Projection | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<{ id: string; name: string }[]>('/users', { params: { role: 'MEMBER' } })
      .then(r => setMembers(r.data))
      .catch(() => {})
  }, [])

  const generate = async () => {
    if (!userId) return
    setLoading(true); setError(null); setProjection(null)
    try {
      const { data } = await api.get<Projection>(`/ai/athlete-projection/${userId}`)
      setProjection(data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo generar la proyección')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <div className="card rounded-xl overflow-hidden">
        <div className="px-6 py-5 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border-1)' }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(14,165,233,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp className="w-4 h-4 text-sky-500" />
            </div>
            <div>
              <h2 className="font-semibold text-base" style={{ color: 'var(--text-1)' }}>Proyección por alumno</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                Objetivos de fuerza y próximos hitos según su historial de RMs
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <select value={userId} onChange={e => { setUserId(e.target.value); setProjection(null) }}
              className="text-sm px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--text-1)', border: '1px solid var(--border-1)' }}>
              <option value="">Elegir alumno…</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button onClick={generate} disabled={!userId || loading}
              className="btn-brand disabled:opacity-50 text-sm px-4 py-2 flex items-center gap-2 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
              {loading ? 'Analizando...' : 'Generar proyección'}
            </button>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {!projection && !loading && !error && (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-4)' }}>
              Elige un alumno con RMs registrados y genera su proyección.
            </p>
          )}
          {projection?.raw && (
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-2)' }}>{projection.raw}</p>
          )}
          {!!projection?.projections?.length && (
            <div>
              <h3 className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-3)' }}>Fuerza</h3>
              <div className="divide-y" style={{ borderColor: 'var(--border-1)' }}>
                {projection.projections.map(p => (
                  <div key={p.movement} className="flex items-center justify-between py-2 text-sm">
                    <span style={{ color: 'var(--text-1)' }}>{p.movement}</span>
                    <span style={{ color: 'var(--text-2)' }}>
                      {p.currentKg} kg → <strong>{p.projectedKg} kg</strong> en ~{p.weeksToGoal} sem.
                      <span className="ml-2 text-xs" style={{ color: 'var(--text-4)' }}>confianza {p.confidence}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!!projection?.nextMilestones?.length && (
            <div>
              <h3 className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-3)' }}>Próximos hitos</h3>
              <ul className="space-y-1 text-sm" style={{ color: 'var(--text-2)' }}>
                {projection.nextMilestones.map(m => (
                  <li key={m.skill}><strong>{m.skill}:</strong> {m.nextMilestone} (~{m.estimatedWeeks} sem.)</li>
                ))}
              </ul>
            </div>
          )}
          {projection?.coachTip && (
            <p className="text-sm rounded-lg px-4 py-3" style={{ backgroundColor: 'rgba(14,165,233,0.08)', color: 'var(--text-2)' }}>
              💡 {projection.coachTip}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
