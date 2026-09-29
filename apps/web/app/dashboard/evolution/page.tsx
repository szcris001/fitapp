'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'
import { TrendingUp, Users, CalendarCheck, Dumbbell, DollarSign } from 'lucide-react'

// ── Bar Chart (SVG) ───────────────────────────────────────────────────────────
function BarChart({
  data, valueKey, color, formatValue,
}: {
  data: any[]
  valueKey: string
  color: string
  formatValue?: (v: number) => string
}) {
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  const H = 120, W = 100, barW = 22, gap = 10

  return (
    <svg
      viewBox={`0 0 ${data.length * (barW + gap)} ${H + 28}`}
      className="w-full"
      style={{ maxHeight: 160 }}
    >
      {data.map((d, i) => {
        const val = d[valueKey]
        const barH = max > 0 ? Math.round((val / max) * H) : 0
        const x = i * (barW + gap)
        const y = H - barH
        return (
          <g key={i}>
            {/* Background rail */}
            <rect x={x} y={0} width={barW} height={H} rx={4} fill="var(--surface-hover)" />
            {/* Bar */}
            <rect x={x} y={y} width={barW} height={barH} rx={4} fill={color} opacity={0.85} />
            {/* Value label */}
            {val > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="9" fill="var(--text-3)" fontWeight="600">
                {formatValue ? formatValue(val) : val}
              </text>
            )}
            {/* Month label */}
            <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize="9" fill="var(--text-4)">
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
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
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text-1)">
        {data.length}
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize="10" fill="var(--text-4)">atletas</text>
    </svg>
  )
}

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#ef4444', '#0ea5e9']

function fmtCLP(v: number) {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`
  if (v >= 1000) return `${Math.round(v / 1000)}k`
  return String(v)
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EvolutionPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [stats, setStats] = useState<any>(null)
  const [evolution, setEvolution] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRM, setSelectedRM] = useState('')
  const router = useRouter()

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) return  // el layout redirige a /login
    Promise.all([
      api.get('/analytics/gym-stats'),
      api.get('/rms/gym-evolution'),
    ]).then(([statsRes, rmRes]) => {
      setStats(statsRes.data)
      setEvolution(rmRes.data)
      if (rmRes.data.length > 0) setSelectedRM(rmRes.data[0].movementName)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [user])

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-sm" style={{ color: 'var(--text-4)' }}>Cargando...</div>
  }

  const kpis = stats?.kpis ?? {}
  const months: any[] = stats?.months ?? []
  const selectedMovement = evolution.find(e => e.movementName === selectedRM)

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, #14b8a6 15%, transparent)' }}>
          <TrendingUp className="w-5 h-5" style={{ color: '#14b8a6' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Evolución del gimnasio</h1>
          <p className="text-sm" style={{ color: 'var(--text-4)' }}>Crecimiento, asistencia e ingresos — últimos 6 meses</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Users, label: 'Total miembros', value: kpis.totalMembers ?? 0, color: '#6366f1', sub: `${kpis.activeMembers ?? 0} activos` },
          { icon: CalendarCheck, label: 'Clases totales', value: kpis.totalClasses ?? 0, color: '#22c55e', sub: 'programadas' },
          { icon: Dumbbell, label: 'Asistencias', value: kpis.attendedBookings ?? 0, color: '#f59e0b', sub: 'históricas' },
          { icon: DollarSign, label: 'Membresías activas', value: kpis.activeMembers ?? 0, color: '#ec4899', sub: 'en vigencia' },
        ].map(({ icon: Icon, label, value, color, sub }) => (
          <div key={label} className="card rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <span className="text-xs font-semibold" style={{ color: 'var(--text-4)' }}>{label}</span>
            </div>
            <p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{value.toLocaleString()}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Monthly charts */}
      {months.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card rounded-2xl p-5">
            <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Nuevos miembros</p>
            <BarChart data={months} valueKey="newMembers" color="#6366f1" />
          </div>
          <div className="card rounded-2xl p-5">
            <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Asistencias</p>
            <BarChart data={months} valueKey="attendances" color="#22c55e" />
          </div>
          <div className="card rounded-2xl p-5">
            <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Ingresos (CLP)</p>
            <BarChart data={months} valueKey="revenueCLP" color="#f59e0b" formatValue={fmtCLP} />
          </div>
        </div>
      )}

      {/* RM Evolution */}
      <div>
        <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-1)' }}>
          Récords personales — por movimiento
        </h2>

        {evolution.length === 0 ? (
          <div className="card rounded-2xl p-12 flex flex-col items-center gap-3 text-center">
            <Dumbbell className="w-10 h-10" style={{ color: 'var(--text-4)' }} />
            <p className="font-medium" style={{ color: 'var(--text-3)' }}>Sin RMs registrados aún</p>
            <p className="text-sm" style={{ color: 'var(--text-4)' }}>Los récords personales de los alumnos aparecerán aquí</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Movement pills */}
            <div className="flex flex-wrap gap-2">
              {evolution.map(mov => (
                <button key={mov.movementName} onClick={() => setSelectedRM(mov.movementName)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border transition-all"
                  style={selectedRM === mov.movementName ? {
                    backgroundColor: 'var(--brand-primary)',
                    borderColor: 'var(--brand-primary)',
                    color: '#fff',
                  } : {
                    backgroundColor: 'var(--surface-card)',
                    borderColor: 'var(--border-1)',
                    color: 'var(--text-3)',
                  }}>
                  {mov.movementName}
                  <span className="ml-1.5 opacity-60 text-xs">{mov.maxKg} kg</span>
                </button>
              ))}
            </div>

            {/* Selected movement detail */}
            {selectedMovement && (() => {
              const byUser: Record<string, { name: string; records: any[] }> = {}
              for (const r of selectedMovement.records) {
                if (!byUser[r.userId]) byUser[r.userId] = { name: r.userName, records: [] }
                byUser[r.userId].records.push(r)
              }
              const users = Object.entries(byUser).map(([, data], i) => {
                const sorted = [...data.records].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
                return {
                  name: data.name,
                  maxKg: sorted[sorted.length - 1]?.weightKg || 0,
                  initial: sorted[0]?.weightKg || 0,
                  records: sorted,
                  color: PALETTE[i % PALETTE.length],
                }
              }).sort((a, b) => b.maxKg - a.maxKg)

              const donutData = users.map(u => ({ label: u.name, value: u.maxKg, color: u.color }))
              const maxAll = Math.max(...users.map(u => u.maxKg), 1)

              return (
                <div className="card rounded-2xl p-6">
                  <div className="flex flex-col md:flex-row items-start gap-6">
                    <div className="shrink-0 flex flex-col items-center gap-2">
                      <DonutChart data={donutData} />
                      <p className="text-xs" style={{ color: 'var(--text-4)' }}>Max kg por atleta</p>
                    </div>
                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex items-baseline gap-2 mb-1">
                        <h3 className="font-bold text-base" style={{ color: 'var(--text-1)' }}>{selectedMovement.movementName}</h3>
                        <span className="text-xs" style={{ color: 'var(--text-4)' }}>
                          {selectedMovement.totalRecords} registros · máx {selectedMovement.maxKg} kg · avg {selectedMovement.avgKg} kg
                        </span>
                      </div>
                      <div className="space-y-3 mt-4">
                        {users.map((u, i) => {
                          const improvement = +(u.maxKg - u.initial).toFixed(1)
                          const barPct = Math.round((u.maxKg / maxAll) * 100)
                          return (
                            <div key={i} className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                                style={{ backgroundColor: u.color }}>
                                {u.name[0]?.toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{u.name}</span>
                                  <div className="flex items-center gap-2 ml-2 shrink-0">
                                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{u.maxKg} kg</span>
                                    {improvement > 0 && (
                                      <span className="text-xs font-semibold text-green-500">+{improvement}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-hover)' }}>
                                  <div className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${barPct}%`, backgroundColor: u.color }} />
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
    </div>
  )
}
