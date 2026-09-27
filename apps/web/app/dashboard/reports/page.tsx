'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'
import {
  DollarSign, TrendingUp, BarChart2, Clock,
  AlertTriangle, Sparkles, CheckCircle2, Wallet, CreditCard,
  Users, Activity, CalendarDays, Trophy,
} from 'lucide-react'

/* ─── Analytics helpers ─────────────────────────────────────────────────── */

type OccupancyPeriod = '7d' | '30d' | '3m' | '6m' | '1y'

const PERIOD_LABELS: Record<OccupancyPeriod, string> = {
  '7d': '7 días', '30d': '30 días', '3m': '3 meses', '6m': '6 meses', '1y': '1 año',
}

/* Skeleton genérico */
function SkeletonBlock({ h = 'h-8', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`skeleton ${h} ${w} rounded-lg`} />
}

/* ─── Gráfica de barras SVG ─────────────────────────────────────────────── */
function EmptyChart() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <BarChart2 className="w-8 h-8" style={{ color: 'var(--border-1)' }} />
      <p className="text-sm" style={{ color: 'var(--text-4)' }}>Sin datos para el período seleccionado</p>
    </div>
  )
}

function OccupancyBarChart({ data, period }: { data: { label: string; pct: number }[]; period: OccupancyPeriod }) {
  if (data.length === 0) return <EmptyChart />
  const MAX_H = 120
  const BAR_W = period === '7d' ? 32 : period === '30d' ? 12 : 20
  const GAP   = period === '7d' ? 16 : period === '30d' ? 6  : 10
  const totalW = data.length * (BAR_W + GAP)
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <svg width={totalW} height={MAX_H + 40} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const barH = (d.pct / 100) * MAX_H
          const x = i * (BAR_W + GAP)
          const y = MAX_H - Math.max(barH, 2)
          const isHigh = d.pct >= 80
          return (
            <g key={i}>
              <rect x={x} y={y} width={BAR_W} height={Math.max(barH, 2)}
                rx={4} fill={isHigh ? '#22c55e' : 'url(#barGrad)'} />
              <text x={x + BAR_W / 2} y={MAX_H + 14} textAnchor="middle"
                fontSize={9} fill="var(--text-4)" fontFamily="sans-serif">
                {d.label}
              </text>
              {d.pct > 0 && (
                <text x={x + BAR_W / 2} y={y - 4} textAnchor="middle"
                  fontSize={9} fill="var(--text-3)" fontFamily="sans-serif">
                  {d.pct}%
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ─── Donut de género ───────────────────────────────────────────────────── */
interface GenderDonutProps { male: number; female: number; other: number; total: number }

function GenderDonut({ male, female, other, total }: GenderDonutProps) {
  if (total === 0) {
    return <p className="text-sm text-center py-4" style={{ color: 'var(--text-4)' }}>Sin datos de género</p>
  }
  const R = 40, CX = 60, CY = 60, STROKE = 16
  const circ = 2 * Math.PI * R
  const mPct = male  / total
  const fPct = female / total
  const oPct = other  / total

  // Offsets: empezar desde las 12 (rotate -90deg en transform)
  const mDash = mPct * circ
  const fDash = fPct * circ
  const oDash = oPct * circ

  const mOffset = 0
  const fOffset = -mDash
  const oOffset = -(mDash + fDash)

  const segments = [
    { dash: mDash, offset: mOffset, color: 'var(--brand-primary)', label: `H: ${male}`, pct: Math.round(mPct * 100) },
    { dash: fDash, offset: fOffset, color: '#f472b6',              label: `M: ${female}`, pct: Math.round(fPct * 100) },
    { dash: oDash, offset: oOffset, color: 'var(--text-4)',         label: `Otro: ${other}`, pct: Math.round(oPct * 100) },
  ].filter(s => s.dash > 0)

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={120} height={120} viewBox="0 0 120 120">
        {/* Fondo */}
        <circle cx={CX} cy={CY} r={R} fill="none"
          stroke="var(--surface-hover)" strokeWidth={STROKE} />
        {segments.map((s, i) => (
          <circle key={i} cx={CX} cy={CY} r={R} fill="none"
            stroke={s.color} strokeWidth={STROKE}
            strokeDasharray={`${s.dash} ${circ}`}
            strokeDashoffset={s.offset}
            strokeLinecap="butt"
            style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px` }}
          />
        ))}
        <text x={CX} y={CY - 5} textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text-1)">{total}</text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize="9" fill="var(--text-4)">total</text>
      </svg>
      <div className="flex flex-wrap gap-3 justify-center text-xs">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: 'var(--brand-primary)' }} />
          <span style={{ color: 'var(--text-2)' }}>Hombres: {male} ({Math.round(mPct * 100)}%)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full inline-block bg-pink-400" />
          <span style={{ color: 'var(--text-2)' }}>Mujeres: {female} ({Math.round(fPct * 100)}%)</span>
        </span>
        {other > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: 'var(--text-4)' }} />
            <span style={{ color: 'var(--text-2)' }}>Otro: {other} ({Math.round(oPct * 100)}%)</span>
          </span>
        )}
      </div>
    </div>
  )
}

/* ─── Mini sparkline (SVG inline) ───────────────────────────────────────── */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const W = 64, H = 24
  const step = W / (values.length - 1)
  const pts = values.map((v, i) => `${i * step},${H - (v / max) * H}`).join(' ')
  return (
    <svg width={W} height={H} className="ml-2 opacity-70">
      <polyline points={pts} fill="none" stroke="var(--brand-primary)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', stripe: 'Online (Stripe)', other: 'Otro',
}
const METHOD_ICON: Record<string, string> = {
  cash: '💵', transfer: '🏦', card: '💳', stripe: '🔒', other: '📋',
}
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo', INACTIVE: 'Inactivo', TRIAL: 'Prueba', EXPIRED: 'Expirado',
}

/* ─── Donut Chart ───────────────────────────────── */
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null
  const radius = 54, cx = 70, cy = 70, strokeW = 18
  const circumference = 2 * Math.PI * radius
  const slices = data.map((d, i) => {
    const pct = d.value / total
    const before = data.slice(0, i).reduce((sum, prev) => sum + prev.value / total, 0)
    return { ...d, pct, dasharray: `${pct * circumference} ${circumference}`, dashoffset: circumference * (1 - before) }
  })
  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      {slices.map((s, i) => (
        <circle key={i} cx={cx} cy={cy} r={radius} fill="none"
          stroke={s.color} strokeWidth={strokeW}
          strokeDasharray={s.dasharray} strokeDashoffset={s.dashoffset}
          strokeLinecap="butt"
          style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
        />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text-1)">{data.length}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize="10" fill="var(--text-4)">atletas</text>
    </svg>
  )
}

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#ef4444', '#0ea5e9']

type Tab = 'ingresos' | 'alertas' | 'evolucion' | 'pagos' | 'analitica'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'ingresos',  label: 'Ingresos',    icon: BarChart2      },
  { id: 'alertas',   label: 'Alertas IA',  icon: AlertTriangle  },
  { id: 'evolucion', label: 'Evolución',   icon: TrendingUp     },
  { id: 'pagos',     label: 'Pagos',       icon: Wallet         },
  { id: 'analitica', label: 'Analítica',   icon: Activity       },
]

export default function ReportsPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [tab, setTab] = useState<Tab>('ingresos')
  const router = useRouter()

  // Ingresos state
  const [revenue, setRevenue] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [attendance, setAttendance] = useState<any[]>([])
  const [loadingIngresos, setLoadingIngresos] = useState(false)

  // Alertas state
  const [alerts, setAlerts] = useState<any>(null)
  const [insights, setInsights] = useState<any>(null)
  const [loadingAlerts, setLoadingAlerts] = useState(false)
  const [loadingInsights, setLoadingInsights] = useState(false)

  // Evolución state
  const [evolution, setEvolution] = useState<any[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loadingEvolution, setLoadingEvolution] = useState(false)

  // Pagos state
  const [paymentsRevenue, setPaymentsRevenue] = useState<any>(null)
  const [paymentsHistory, setPaymentsHistory] = useState<any[]>([])
  const [loadingPagos, setLoadingPagos] = useState(false)

  // Analítica state
  const [gymStats, setGymStats] = useState<any>(null)
  const [occupancy, setOccupancy] = useState<any>(null)
  const [plans, setPlans] = useState<any[]>([])
  const [occupancyPeriod, setOccupancyPeriod] = useState<OccupancyPeriod>('7d')
  const [loadingAnalitica, setLoadingAnalitica] = useState(false)
  const [errorAnalitica, setErrorAnalitica] = useState<string | null>(null)

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchIngresos()
  }, [user])

  useEffect(() => {
    if (!user) return
    if (tab === 'alertas' && !alerts) fetchAlerts()
    if (tab === 'evolucion' && evolution.length === 0) fetchEvolucion()
    if (tab === 'pagos' && !paymentsRevenue) fetchPagos()
    if (tab === 'analitica' && !gymStats) fetchAnalitica(occupancyPeriod)
  }, [tab, user])

  // Re-fetch ocupación cuando cambia el período
  useEffect(() => {
    if (!user || tab !== 'analitica' || !gymStats) return
    fetchOccupancy(occupancyPeriod)
  }, [occupancyPeriod])

  const fetchIngresos = async () => {
    setLoadingIngresos(true)
    try {
      const [revRes, histRes, attRes] = await Promise.all([
        api.get('/payments/revenue'),
        api.get('/payments/history'),
        api.get('/classes/attendance'),
      ])
      setRevenue(revRes.data)
      setHistory(histRes.data)
      setAttendance(attRes.data)
    } catch { router.push('/login') }
    finally { setLoadingIngresos(false) }
  }

  const fetchAlerts = async () => {
    setLoadingAlerts(true)
    try {
      const { data } = await api.get('/ai/retention-alerts')
      setAlerts(data)
    } catch { router.push('/login') }
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

  const fetchPagos = async () => {
    setLoadingPagos(true)
    try {
      const [revRes, histRes] = await Promise.all([
        api.get('/payments/revenue'),
        api.get('/payments/history'),
      ])
      setPaymentsRevenue(revRes.data)
      setPaymentsHistory(histRes.data)
    } catch {}
    finally { setLoadingPagos(false) }
  }

  const fetchEvolucion = async () => {
    setLoadingEvolution(true)
    try {
      const { data } = await api.get('/rms/gym-evolution')
      setEvolution(data)
      if (data.length > 0) setSelected(data[0].movementName)
    } catch {}
    finally { setLoadingEvolution(false) }
  }

  const fetchAnalitica = async (period: OccupancyPeriod) => {
    setLoadingAnalitica(true)
    setErrorAnalitica(null)
    const [statsRes, occRes, plansRes] = await Promise.allSettled([
      api.get('/gyms/me/stats'),
      api.get(`/gyms/me/occupancy?period=${period}`),
      api.get('/plans'),
    ])
    if (statsRes.status === 'fulfilled') setGymStats(statsRes.value.data)
    else setErrorAnalitica('No se pudieron cargar las estadísticas del gimnasio')
    if (occRes.status === 'fulfilled') setOccupancy(occRes.value.data)
    if (plansRes.status === 'fulfilled') setPlans(plansRes.value.data)
    setLoadingAnalitica(false)
  }

  const fetchOccupancy = async (period: OccupancyPeriod) => {
    try {
      const { data } = await api.get(`/gyms/me/occupancy?period=${period}`)
      setOccupancy(data)
    } catch {
      // silencioso: mantiene datos anteriores
    }
  }

  const formatMoney = (cents: number) => cents.toLocaleString('es-CL')

  const priorityStyle = (p: string) =>
    p === 'high'   ? 'border-red-200 bg-red-50 text-red-800'       :
    p === 'medium' ? 'border-amber-200 bg-amber-50 text-amber-800'  :
                     'border-green-200 bg-green-50 text-green-800'

  const priorityBadge = (p: string) =>
    p === 'high' ? 'badge-red' : p === 'medium' ? 'badge-yellow' : 'badge-green'

  const priorityLabel = (p: string) =>
    p === 'high' ? 'Alta' : p === 'medium' ? 'Media' : 'Baja'

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="section-title">Reportes</h1>
            <p className="text-slate-500 text-sm">Finanzas, alertas de retención y evolución de alumnos</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)', width: 'fit-content' }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={active ? {
                backgroundColor: 'var(--surface-card)',
                color: 'var(--brand-primary)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
              } : {
                color: 'var(--text-4)',
              }}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab: Ingresos ── */}
      {tab === 'ingresos' && (
        <div className="space-y-8">
          {loadingIngresos ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando reportes...</div>
          ) : (
            <>
              {revenue && (
                <section>
                  <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Resumen de ingresos</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { label: 'Hoy',             value: revenue.today.total,   count: revenue.today.count,   icon: DollarSign, bg: 'bg-green-50',  color: 'text-green-600'  },
                      { label: 'Este mes',        value: revenue.month.total,   count: revenue.month.count,   icon: TrendingUp, bg: 'bg-blue-50',   color: 'text-blue-600'   },
                      { label: 'Total histórico', value: revenue.allTime.total, count: revenue.allTime.count, icon: BarChart2,  bg: 'bg-violet-50', color: 'text-violet-600' },
                    ].map(card => {
                      const Icon = card.icon
                      return (
                        <div key={card.label} className="card rounded-xl p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                              <Icon className={`w-5 h-5 ${card.color}`} />
                            </div>
                            <span className="text-xs text-slate-400">{card.count} pago{card.count !== 1 ? 's' : ''}</span>
                          </div>
                          <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{formatMoney(card.value)}</p>
                          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>{card.label}</p>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {attendance.length > 0 && (
                <section>
                  <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                    <Clock className="w-4 h-4" style={{ color: 'var(--text-4)' }} />
                    Asistencia por horario
                  </h2>
                  <div className="card rounded-xl p-6 space-y-4">
                    {attendance.map((slot: any) => {
                      const maxBookings = Math.max(...attendance.map((s: any) => s.bookings))
                      const pct = maxBookings > 0 ? (slot.bookings / maxBookings) * 100 : 0
                      return (
                        <div key={slot.hour} className="flex items-center gap-4">
                          <span className="text-sm w-16 shrink-0" style={{ color: 'var(--text-3)' }}>{slot.hour}</span>
                          <div className="flex-1 rounded-full h-2" style={{ backgroundColor: 'var(--surface-hover)' }}>
                            <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: 'var(--brand-primary)' }} />
                          </div>
                          <div className="text-right w-36 shrink-0">
                            <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{slot.bookings} reservas</span>
                            <span className="text-xs ml-2" style={{ color: 'var(--text-4)' }}>({slot.total} clases)</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Historial de pagos</h2>
                {history.length === 0 ? (
                  <div className="card rounded-xl p-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                      <DollarSign className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-slate-500 text-sm">No hay pagos registrados aún</p>
                  </div>
                ) : (
                  <div className="card rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-hover)' }}>
                          {['Alumno', 'Plan', 'Monto', 'Fecha', 'Estado'].map(h => (
                            <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide px-6 py-3" style={{ color: 'var(--text-4)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((m: any) => (
                          <tr key={m.id} className="border-b last:border-0 transition-colors"
                            style={{ borderColor: 'var(--border-1)' }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-brand-avatar flex items-center justify-center text-xs font-semibold shrink-0">
                                  {m.user.name[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{m.user.name}</p>
                                  <p className="text-xs" style={{ color: 'var(--text-4)' }}>{m.user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-2)' }}>{m.plan.name}</td>
                            <td className="px-6 py-4 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{formatMoney(m.pricePaid)} {m.currency}</td>
                            <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-3)' }}>
                              {m.paidAt ? new Date(m.paidAt).toLocaleDateString('es-CL') : <span style={{ color: 'var(--text-4)' }}>—</span>}
                            </td>
                            <td className="px-6 py-4">
                              <span className={m.status === 'ACTIVE' ? 'badge-green' : 'badge-gray'}>
                                {m.status === 'ACTIVE' ? 'Activo' : m.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Alertas IA ── */}
      {tab === 'alertas' && (
        <div className="space-y-8">
          {loadingAlerts ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando alertas...</div>
          ) : alerts && (
            <>
              {alerts.atRisk.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <h2 className="text-base font-semibold text-red-600">Alumnos en riesgo de abandono — {alerts.atRisk.length}</h2>
                  </div>
                  <div className="space-y-3">
                    {alerts.atRisk.map((m: any) => (
                      <div key={m.id} className="card rounded-xl p-4 border-l-4 border-l-red-400 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-sm font-semibold text-red-600 shrink-0">
                            {m.name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{m.name}</p>
                            <p className="text-xs" style={{ color: 'var(--text-4)' }}>{m.email}</p>
                            <p className="text-red-500 text-xs mt-1">{m.alert}</p>
                          </div>
                        </div>
                        <button onClick={() => router.push(`/dashboard/users/${m.id}`)}
                          className="text-sm font-medium shrink-0 ml-4 transition-colors"
                          style={{ color: 'var(--text-4)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}
                        >Ver alumno →</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {alerts.expiringSoon.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <h2 className="text-base font-semibold text-amber-700">Membresías por vencer — {alerts.expiringSoon.length}</h2>
                  </div>
                  <div className="space-y-3">
                    {alerts.expiringSoon.map((m: any) => (
                      <div key={m.userId} className="card rounded-xl p-4 border-l-4 border-l-amber-400 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-sm font-semibold text-amber-600 shrink-0">
                            {m.name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{m.name}</p>
                            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                              {m.plan} — vence en <span className="font-semibold text-amber-600">{m.daysLeft} días</span>
                            </p>
                          </div>
                        </div>
                        <button onClick={() => router.push(`/dashboard/users/${m.userId}`)}
                          className="text-sm font-medium shrink-0 ml-4 transition-colors"
                          style={{ color: 'var(--text-4)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}
                        >Renovar →</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {alerts.atRisk.length === 0 && alerts.expiringSoon.length === 0 && (
                <div className="card rounded-xl p-10 flex flex-col items-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-green-700">Sin alertas activas</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Todos tus alumnos están activos y al día</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* AI Insights */}
          <div className="card rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-1)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-violet-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-base" style={{ color: 'var(--text-1)' }}>Insights con IA</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>Recomendaciones basadas en los datos de tu gimnasio</p>
                </div>
              </div>
              <button onClick={fetchInsights} disabled={loadingInsights}
                className="btn-brand disabled:opacity-50 text-sm px-4 py-2 flex items-center gap-2 shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
                {loadingInsights ? 'Analizando...' : 'Generar insights'}
              </button>
            </div>
            <div className="p-6">
              {insights && !insights.error && (
                <div className="space-y-4">
                  {insights.summary && (
                    <p className="text-sm rounded-lg p-4 leading-relaxed" style={{ color: 'var(--text-2)', backgroundColor: 'var(--surface-hover)' }}>
                      {insights.summary}
                    </p>
                  )}
                  <div className="space-y-3">
                    {insights.insights?.map((insight: any, i: number) => (
                      <div key={i} className={`rounded-xl border p-4 ${priorityStyle(insight.priority)}`}>
                        <div className="flex items-start gap-3">
                          <span className={`${priorityBadge(insight.priority)} shrink-0 mt-0.5`}>{priorityLabel(insight.priority)}</span>
                          <div>
                            <p className="font-semibold text-sm">{insight.title}</p>
                            <p className="text-sm mt-1 opacity-80 leading-relaxed">{insight.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {insights?.error && <p className="text-red-500 text-sm">{insights.error}</p>}
              {!insights && !loadingInsights && (
                <div className="text-center py-6">
                  <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--border-1)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-4)' }}>Haz clic en &ldquo;Generar insights&rdquo; para obtener recomendaciones</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Pagos ── */}
      {tab === 'pagos' && (
        <div className="space-y-6">
          {loadingPagos ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando pagos...</div>
          ) : (
            <>
              {paymentsRevenue && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Hoy',             value: paymentsRevenue.today.total,   count: paymentsRevenue.today.count,   icon: CheckCircle2, accent: '#22c55e' },
                    { label: 'Este mes',        value: paymentsRevenue.month.total,   count: paymentsRevenue.month.count,   icon: TrendingUp,   accent: '#6366f1' },
                    { label: 'Total histórico', value: paymentsRevenue.allTime.total, count: paymentsRevenue.allTime.count, icon: Wallet,       accent: '#f59e0b' },
                  ].map(card => {
                    const Icon = card.icon
                    return (
                      <div key={card.label} className="card rounded-xl p-5" style={{ borderLeft: `3px solid ${card.accent}` }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: card.accent + '18' }}>
                            <Icon className="w-4 h-4" style={{ color: card.accent }} />
                          </div>
                          <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{card.count}</span>
                        </div>
                        <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{card.label}</p>
                        <p className="text-sm font-bold mt-1" style={{ color: card.accent }}>{card.value.toLocaleString('es-CL')}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>{card.count} pagos</p>
                      </div>
                    )
                  })}
                </div>
              )}

              {(() => {
                const breakdown = paymentsHistory.reduce((acc: Record<string, number>, m: any) => {
                  const method = m.paymentMethod || 'other'
                  acc[method] = (acc[method] || 0) + 1
                  return acc
                }, {})
                return Object.keys(breakdown).length > 0 ? (
                  <div className="card rounded-xl p-5">
                    <h2 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-1)' }}>Medios de pago utilizados</h2>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(breakdown).map(([method, count]) => (
                        <div key={method} className="flex items-center gap-2 px-4 py-2 rounded-xl border"
                          style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-base)' }}>
                          <span className="text-lg">{METHOD_ICON[method] || '📋'}</span>
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{METHOD_LABEL[method] || method}</p>
                            <p className="text-xs" style={{ color: 'var(--text-4)' }}>{count as number} pagos</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              })()}

              <div className="card rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
                  <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Historial de pagos</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
                    {paymentsHistory.length} registros
                  </span>
                </div>
                {paymentsHistory.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--surface-hover)' }}>
                      <CreditCard className="w-6 h-6" style={{ color: 'var(--text-4)' }} />
                    </div>
                    <p className="font-medium text-sm" style={{ color: 'var(--text-2)' }}>Sin pagos registrados</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-hover)' }}>
                          {['Alumno', 'Plan', 'Monto', 'Método', 'Fecha', 'Estado'].map(h => (
                            <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide px-5 py-3" style={{ color: 'var(--text-4)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paymentsHistory.map((m: any) => (
                          <tr key={m.id} className="border-b last:border-0"
                            style={{ borderColor: 'var(--border-1)' }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                  style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 20%, transparent)', color: 'var(--brand-accent)' }}>
                                  {m.user?.name?.[0]?.toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{m.user?.name}</p>
                                  <p className="text-xs" style={{ color: 'var(--text-4)' }}>{m.user?.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-2)' }}>{m.plan?.name}</td>
                            <td className="px-5 py-3.5 text-sm font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
                              {m.pricePaid.toLocaleString('es-CL')} {m.currency}
                            </td>
                            <td className="px-5 py-3.5 text-sm">
                              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-2)' }}>
                                {METHOD_ICON[m.paymentMethod] || '📋'}
                                {METHOD_LABEL[m.paymentMethod] || 'Sin método'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-3)' }}>
                              {m.paidAt ? new Date(m.paidAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`badge-${m.status === 'ACTIVE' ? 'green' : m.status === 'TRIAL' ? 'yellow' : 'gray'}`}>
                                {STATUS_LABEL[m.status] || m.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Analítica ── */}
      {tab === 'analitica' && (
        <div className="space-y-8">
          {/* Error global */}
          {errorAnalitica && (
            <div className="card rounded-xl p-5 border-l-4 border-l-red-400 flex items-center justify-between">
              <p className="text-sm text-red-600">{errorAnalitica}</p>
              <button onClick={() => fetchAnalitica(occupancyPeriod)}
                className="btn-secondary text-sm px-3 py-1.5 rounded-lg ml-4">
                Reintentar
              </button>
            </div>
          )}

          {/* ─── Sección 1: KPIs ─── */}
          <section>
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Resumen del gimnasio</h2>
            {loadingAnalitica && !gymStats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="card rounded-xl p-5 space-y-3">
                    <SkeletonBlock h="h-6" w="w-1/2" />
                    <SkeletonBlock h="h-8" w="w-3/4" />
                    <SkeletonBlock h="h-4" w="w-full" />
                  </div>
                ))}
              </div>
            ) : gymStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Tasa de retención */}
                {(() => {
                  const pct = gymStats.members.total > 0
                    ? ((gymStats.members.active / gymStats.members.total) * 100).toFixed(1)
                    : '0.0'
                  const num = parseFloat(pct)
                  const badgeClass = num >= 70 ? 'badge-green' : num >= 40 ? 'badge-yellow' : 'badge-red'
                  return (
                    <div className="card rounded-xl p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)' }}>
                          <TrendingUp className="w-4 h-4" style={{ color: 'var(--brand-primary)' }} />
                        </div>
                        <span className={badgeClass}>{pct}%</span>
                      </div>
                      <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{pct}%</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>Tasa de retención</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>
                        {gymStats.members.active} activos / {gymStats.members.total} totales
                      </p>
                    </div>
                  )
                })()}

                {/* Ocupación promedio */}
                <div className="card rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: 'color-mix(in srgb, #6366f1 12%, transparent)' }}>
                      <BarChart2 className="w-4 h-4 text-indigo-500" />
                    </div>
                    {occupancy && (
                      <Sparkline values={(occupancy.history ?? []).map((h: any) => h.pct)} />
                    )}
                  </div>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
                    {occupancy ? `${occupancy.avgOccupancy}%` : '—'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>Ocupación promedio</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>
                    {occupancy ? `${occupancy.totalClasses} clases en el período` : 'Cargando...'}
                  </p>
                </div>

                {/* Clases hoy */}
                <div className="card rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: 'color-mix(in srgb, #22c55e 12%, transparent)' }}>
                      <CalendarDays className="w-4 h-4 text-green-500" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{gymStats.todayClasses}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>Clases hoy</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>Programadas para hoy</p>
                </div>

                {/* Membresías por vencer */}
                {(() => {
                  const expiring = gymStats.expiringMemberships?.length ?? 0
                  return (
                    <div className="card rounded-xl p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 12%, transparent)' }}>
                          <Clock className="w-4 h-4 text-amber-500" />
                        </div>
                        {expiring > 0 && <span className="badge-yellow">{expiring}</span>}
                      </div>
                      <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{expiring}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>Por vencer (7 días)</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>Membresías próximas a expirar</p>
                    </div>
                  )
                })()}
              </div>
            )}
          </section>

          {/* ─── Sección 2: Gráfica de ocupación ─── */}
          <section>
            <div className="card rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center justify-between flex-wrap gap-3"
                style={{ borderColor: 'var(--border-1)' }}>
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                  Ocupación de clases
                </h2>
                <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--surface-hover)' }}>
                  {(['7d', '30d', '3m', '6m', '1y'] as OccupancyPeriod[]).map(p => (
                    <button key={p} onClick={() => setOccupancyPeriod(p)}
                      className="px-3 py-1 rounded-md text-xs font-medium transition-all"
                      style={occupancyPeriod === p ? {
                        backgroundColor: 'var(--surface-card)',
                        color: 'var(--brand-primary)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
                      } : { color: 'var(--text-4)' }}>
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-6 py-5">
                {loadingAnalitica && !occupancy ? (
                  <div className="space-y-3">
                    <SkeletonBlock h="h-5" w="w-1/4" />
                    <SkeletonBlock h="h-32" w="w-full" />
                  </div>
                ) : occupancy ? (
                  <>
                    <div className="flex items-center gap-6 mb-4 text-xs" style={{ color: 'var(--text-3)' }}>
                      <span>
                        <span className="font-semibold text-base" style={{ color: 'var(--text-1)' }}>{occupancy.avgOccupancy}%</span>
                        {' '}promedio
                      </span>
                      <span>{occupancy.totalBookings} reservas</span>
                      <span>{occupancy.totalCapacity} cupos totales</span>
                    </div>
                    <OccupancyBarChart data={occupancy.history ?? []} period={occupancyPeriod} />
                    <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--text-4)' }}>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm inline-block bg-green-500" />
                        Alta ocupación (≥ 80%)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--brand-primary)', opacity: 0.7 }} />
                        Normal
                      </span>
                    </div>
                  </>
                ) : (
                  <EmptyChart />
                )}
              </div>
            </div>
          </section>

          {/* ─── Secciones 3 y 4 en grid ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ─── Sección 3: Distribución género ─── */}
            <div className="card rounded-xl p-5">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'color-mix(in srgb, #f472b6 12%, transparent)' }}>
                  <Users className="w-4 h-4 text-pink-400" />
                </div>
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Distribución por género</h2>
              </div>
              {loadingAnalitica && !gymStats ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <SkeletonBlock h="h-24" w="w-24" />
                  <SkeletonBlock h="h-4" w="w-3/4" />
                </div>
              ) : gymStats ? (
                <GenderDonut
                  male={gymStats.members.male}
                  female={gymStats.members.female}
                  other={gymStats.members.other}
                  total={gymStats.members.total}
                />
              ) : null}
            </div>

            {/* ─── Sección 4: Top tipo y horario peak ─── */}
            <div className="card rounded-xl p-5">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)' }}>
                  <Trophy className="w-4 h-4" style={{ color: 'var(--brand-primary)' }} />
                </div>
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Insights de ocupación</h2>
              </div>
              {loadingAnalitica && !occupancy ? (
                <div className="space-y-3">
                  <SkeletonBlock h="h-14" w="w-full" />
                  <SkeletonBlock h="h-14" w="w-full" />
                </div>
              ) : occupancy ? (
                <div className="space-y-3">
                  {occupancy.topType ? (
                    <div className="rounded-xl p-4 flex items-center gap-3"
                      style={{ backgroundColor: 'var(--surface-hover)' }}>
                      <span className="text-xl shrink-0">🏆</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-4)' }}>
                          Tipo más popular
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-1)' }}>
                            {occupancy.topType.name}
                          </p>
                          <span className="badge-green shrink-0">{occupancy.topType.pct}% ocup.</span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>
                          {occupancy.topType.classes} clase{occupancy.topType.classes !== 1 ? 's' : ''} en el período
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: 'var(--surface-hover)' }}>
                      <p className="text-xs" style={{ color: 'var(--text-4)' }}>Sin datos de tipo de clase</p>
                    </div>
                  )}

                  {occupancy.topSlot ? (
                    <div className="rounded-xl p-4 flex items-center gap-3"
                      style={{ backgroundColor: 'var(--surface-hover)' }}>
                      <span className="text-xl shrink-0">⏰</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-4)' }}>
                          Horario peak
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                            {occupancy.topSlot.hour}
                          </p>
                          <span className="badge-green shrink-0">{occupancy.topSlot.pct}% ocup.</span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>
                          {occupancy.topSlot.classes} clase{occupancy.topSlot.classes !== 1 ? 's' : ''} en ese horario
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: 'var(--surface-hover)' }}>
                      <p className="text-xs" style={{ color: 'var(--text-4)' }}>Sin datos de horario</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text-4)' }}>Sin datos disponibles</p>
              )}
            </div>
          </div>

          {/* ─── Sección 5: Planes disponibles ─── */}
          <section>
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Planes activos del gimnasio</h2>
            {loadingAnalitica && plans.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="card rounded-xl p-5 space-y-3">
                    <SkeletonBlock h="h-5" w="w-2/3" />
                    <SkeletonBlock h="h-6" w="w-1/2" />
                    <SkeletonBlock h="h-4" w="w-full" />
                  </div>
                ))}
              </div>
            ) : plans.length === 0 ? (
              <div className="card rounded-xl p-10 text-center">
                <p className="text-sm" style={{ color: 'var(--text-4)' }}>No hay planes configurados</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.map((plan: any) => {
                  // Contar alumnos activos en este plan usando expiringMemberships + datos disponibles
                  const activeInPlan = gymStats?.expiringMemberships?.filter(
                    (m: any) => m.plan?.name === plan.name
                  ).length ?? null
                  return (
                    <div key={plan.id} className="card rounded-xl p-5"
                      style={{ borderLeft: '3px solid color-mix(in srgb, var(--brand-primary) 50%, transparent)' }}>
                      <div className="flex items-start justify-between mb-3">
                        <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{plan.name}</p>
                        {plan.isTrial && <span className="badge-yellow text-xs">Trial</span>}
                      </div>
                      <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                        {plan.priceCents.toLocaleString('es-CL')}
                        <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-4)' }}>
                          {plan.currency}
                        </span>
                      </p>
                      {plan.durationDays && (
                        <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                          Duración: {plan.durationDays} días
                        </p>
                      )}
                      {plan.maxClasses != null && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                          Máx. {plan.maxClasses} clases
                        </p>
                      )}
                      {plan.description && (
                        <p className="text-xs mt-2 leading-relaxed line-clamp-2" style={{ color: 'var(--text-4)' }}>
                          {plan.description}
                        </p>
                      )}
                      {activeInPlan !== null && activeInPlan > 0 && (
                        <p className="text-xs mt-2 font-medium text-amber-600">
                          {activeInPlan} membresía{activeInPlan !== 1 ? 's' : ''} por vencer
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ─── Alumnos sin membresía activa ─── */}
          {gymStats?.inactiveMembers?.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                <Users className="w-4 h-4" style={{ color: 'var(--text-4)' }} />
                Alumnos sin membresía activa
                <span className="badge-gray">{gymStats.inactiveMembers.length}</span>
              </h2>
              <div className="card rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-hover)' }}>
                      {['Alumno', 'Email', 'Registrado'].map(h => (
                        <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide px-5 py-3"
                          style={{ color: 'var(--text-4)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gymStats.inactiveMembers.map((m: any) => (
                      <tr key={m.id} className="border-b last:border-0"
                        style={{ borderColor: 'var(--border-1)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 20%, transparent)', color: 'var(--brand-accent)' }}>
                              {m.name?.[0]?.toUpperCase()}
                            </div>
                            <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{m.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm" style={{ color: 'var(--text-3)' }}>{m.email}</td>
                        <td className="px-5 py-3 text-sm" style={{ color: 'var(--text-4)' }}>
                          {new Date(m.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Tab: Evolución ── */}
      {tab === 'evolucion' && (
        <div>
          {loadingEvolution ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando evolución...</div>
          ) : evolution.length === 0 ? (
            <div className="card rounded-xl p-16 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--surface-hover)' }}>
                <TrendingUp className="w-7 h-7" style={{ color: 'var(--text-4)' }} />
              </div>
              <div>
                <p className="font-medium" style={{ color: 'var(--text-2)' }}>Sin datos de evolución aún</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-4)' }}>Los RMs registrados por los alumnos aparecerán aquí</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {evolution.map(mov => {
                  const isSelected = selected === mov.movementName
                  return (
                    <button key={mov.movementName} onClick={() => setSelected(mov.movementName)}
                      className="rounded-xl border p-4 text-left transition-all"
                      style={isSelected ? {
                        borderColor: 'var(--brand-primary)',
                        backgroundColor: 'color-mix(in srgb, var(--brand-primary) 10%, var(--surface-card))',
                        boxShadow: '0 0 0 2px color-mix(in srgb, var(--brand-primary) 20%, transparent)',
                      } : {
                        backgroundColor: 'var(--surface-card)',
                        borderColor: 'var(--border-1)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      }}>
                      <p className="font-medium text-sm truncate mb-2" style={{ color: 'var(--text-1)' }}>{mov.movementName}</p>
                      <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
                        {mov.maxKg}<span className="text-sm font-normal ml-1" style={{ color: 'var(--text-4)' }}>kg</span>
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>{mov.totalRecords} registros</p>
                    </button>
                  )
                })}
              </div>

              {evolution.find(e => e.movementName === selected) && (() => {
                const selectedMovement = evolution.find(e => e.movementName === selected)!
                const byUser: Record<string, { name: string; records: { weightKg: number; recordedAt: string }[] }> = {}
                for (const r of selectedMovement.records) {
                  if (!byUser[r.userId]) byUser[r.userId] = { name: r.userName, records: [] }
                  byUser[r.userId].records.push({ weightKg: r.weightKg, recordedAt: r.recordedAt })
                }
                const users = Object.entries(byUser).map(([, data], i) => {
                  const sorted = [...data.records].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
                  return { name: data.name, maxKg: sorted[sorted.length - 1]?.weightKg || 0, initial: sorted[0]?.weightKg || 0, records: sorted, color: PALETTE[i % PALETTE.length] }
                })
                const donutData = users.map(u => ({ label: u.name, value: u.maxKg, color: u.color }))
                return (
                  <div className="card rounded-xl p-6">
                    <div className="flex items-start gap-6">
                      <div className="shrink-0 flex flex-col items-center gap-3">
                        <DonutChart data={donutData} />
                        <p className="text-xs font-medium" style={{ color: 'var(--text-4)' }}>Max kg por atleta</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="font-semibold text-base mb-4" style={{ color: 'var(--text-1)' }}>
                          {selectedMovement.movementName}
                          <span className="font-normal text-sm ml-2" style={{ color: 'var(--text-4)' }}>— Progreso por atleta</span>
                        </h2>
                        <div className="space-y-3">
                          {users.map((u, i) => {
                            const improvement = +(u.maxKg - u.initial).toFixed(1)
                            const maxAll = Math.max(...users.map(x => x.maxKg))
                            const barPct = maxAll > 0 ? Math.round((u.maxKg / maxAll) * 100) : 0
                            return (
                              <div key={i} className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white" style={{ backgroundColor: u.color }}>
                                  {u.name[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{u.name}</span>
                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{u.maxKg} kg</span>
                                      {improvement > 0 && <span className="text-xs font-medium text-green-600">+{improvement}</span>}
                                    </div>
                                  </div>
                                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-hover)' }}>
                                    <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: u.color }} />
                                  </div>
                                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>{u.records.length} registros</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
