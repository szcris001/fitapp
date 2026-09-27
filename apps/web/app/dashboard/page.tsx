'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../store/auth.store'
import api from '../../lib/api'
import {
  Users, UserCheck, UserX, CalendarDays,
  AlertTriangle, ArrowRight, Dumbbell,
  ChevronRight, Activity, UserMinus, Wallet,
  X, Search, Banknote, CreditCard, CheckCircle, ExternalLink,
} from 'lucide-react'

/* ─── Tipos pago rápido ──────────────────────────────── */
interface QuickUser { id: string; name: string; email: string; memberships: any[] }

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro',
}
const METHOD_ICON: Record<string, string> = {
  cash: '💵', transfer: '🏦', card: '💳', other: '📋',
}

function ModalBackdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0" style={{ zIndex: 40, backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 50 }} onClick={onClose}><div className="contents" onClick={e => e.stopPropagation()}>{children}</div></div>
    </>
  )
}

function QuickPaySelectModal({ users, onSelect, onClose }: {
  users: QuickUser[]; onSelect: (u: QuickUser) => void; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = search.trim()
    ? users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    : users
  return (
    <ModalBackdrop onClose={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden modal-animate card" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-1)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'color-mix(in srgb, #22c55e 15%, var(--surface-card))' }}>
              <Wallet className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p className="font-semibold" style={{ color: 'var(--text-1)' }}>Registrar pago</p>
              <p className="text-xs" style={{ color: 'var(--text-4)' }}>Selecciona el alumno</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-4)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 border-b" style={{ borderColor: 'var(--border-1)' }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-4)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar alumno..." autoFocus
              className="input text-sm" style={{ paddingLeft: '2.5rem' }} />
          </div>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 130px)' }}>
          {filtered.length === 0
            ? <p className="text-center py-10 text-sm" style={{ color: 'var(--text-4)' }}>Sin resultados</p>
            : filtered.map(u => (
              <button key={u.id} onClick={() => onSelect(u)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors border-b last:border-0"
                style={{ borderColor: 'var(--border-1)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 15%, transparent)', color: 'var(--brand-accent)' }}>
                  {u.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{u.name}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-4)' }}>{u.email}</p>
                </div>
              </button>
            ))
          }
        </div>
      </div>
    </ModalBackdrop>
  )
}

function QuickPaymentModal({ userId, plans, onClose }: {
  userId: string; plans: any[]; onClose: () => void
}) {
  const [mode, setMode]       = useState<'manual' | 'stripe'>('manual')
  const [planId, setPlanId]   = useState(plans[0]?.id || '')
  const [method, setMethod]   = useState<'cash' | 'transfer' | 'card' | 'other'>('cash')
  const [notes, setNotes]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [stripeUrl, setStripeUrl] = useState<string | null>(null)
  const [error, setError]     = useState('')
  const selectedPlan = plans.find(p => p.id === planId)

  const handleManual = async () => {
    if (!planId) return
    setSaving(true); setError('')
    try {
      await api.post('/payments/manual', { userId, planId, paymentMethod: method, paymentNotes: notes || undefined })
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al registrar pago')
    } finally { setSaving(false) }
  }

  const handleStripe = async () => {
    if (!planId) return
    setSaving(true); setError('')
    try {
      const { data } = await api.post('/payments/checkout', { planId, userId })
      setStripeUrl(data.url)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al generar link')
    } finally { setSaving(false) }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden modal-animate card">
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-1)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'color-mix(in srgb, #22c55e 15%, var(--surface-card))' }}>
              <Wallet className="w-4 h-4 text-emerald-500" />
            </div>
            <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Registrar pago</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-4)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="card rounded-xl p-4 space-y-3">
            <label className="block text-sm font-semibold" style={{ color: 'var(--text-2)' }}>Plan</label>
            <select value={planId} onChange={e => setPlanId(e.target.value)} className="input">
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {(p.priceCents / 100).toLocaleString('es-CL')} {p.currency} · {p.durationDays}d</option>
              ))}
            </select>
            {selectedPlan && <p className="text-xs" style={{ color: 'var(--text-4)' }}>Duración: {selectedPlan.durationDays} días · {(selectedPlan.priceCents / 100).toLocaleString('es-CL')} {selectedPlan.currency}</p>}
          </div>
          <div className="card rounded-xl p-4 space-y-3">
            <label className="block text-sm font-semibold" style={{ color: 'var(--text-2)' }}>Método de pago</label>
            <div className="grid grid-cols-2 gap-2">
              {(['manual', 'stripe'] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setStripeUrl(null) }}
                  className="flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all"
                  style={mode === m ? { borderColor: 'var(--brand-accent)', backgroundColor: 'color-mix(in srgb, var(--brand-accent) 10%, var(--surface-card))', color: 'var(--brand-accent)' } : { borderColor: 'var(--border-1)', color: 'var(--text-2)', backgroundColor: 'var(--surface-base)' }}>
                  {m === 'manual' ? <><Banknote className="w-4 h-4 shrink-0" />Pago presencial</> : <><CreditCard className="w-4 h-4 shrink-0" />Stripe</>}
                </button>
              ))}
            </div>
            {mode === 'manual' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-2)' }}>Forma de pago</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['cash', 'transfer', 'card', 'other'] as const).map(m => (
                      <button key={m} onClick={() => setMethod(m)}
                        className="flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-all"
                        style={method === m ? { borderColor: 'var(--brand-accent)', backgroundColor: 'color-mix(in srgb, var(--brand-accent) 8%, var(--surface-card))', color: 'var(--text-1)' } : { borderColor: 'var(--border-1)', color: 'var(--text-3)', backgroundColor: 'transparent' }}>
                        <span>{METHOD_ICON[m]}</span>{METHOD_LABEL[m]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Notas <span className="font-normal" style={{ color: 'var(--text-4)' }}>(opcional)</span></label>
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="N° transferencia, referencia…" className="input" />
                </div>
              </div>
            )}
            {mode === 'stripe' && !stripeUrl && (
              <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: 'var(--surface-base)', border: '1px solid var(--border-1)' }}>
                <p style={{ color: 'var(--text-2)' }}>Se generará un link de pago seguro de Stripe. La membresía se activa automáticamente al completar el pago.</p>
              </div>
            )}
          </div>
          {stripeUrl && (
            <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /><p className="text-sm font-medium text-green-700">Link generado</p></div>
              <a href={stripeUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium text-green-700 underline"><ExternalLink className="w-3.5 h-3.5" />Abrir página de pago</a>
            </div>
          )}
          {error && <div className="text-sm rounded-lg px-3 py-2.5 bg-red-50 border border-red-200 text-red-600">{error}</div>}
          {!stripeUrl && (
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 btn-secondary py-2.5 rounded-xl text-sm">Cancelar</button>
              <button onClick={mode === 'manual' ? handleManual : handleStripe} disabled={saving || !planId}
                className="flex-1 btn-brand py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Procesando...' : mode === 'manual' ? 'Confirmar pago' : 'Generar link Stripe'}
              </button>
            </div>
          )}
          {stripeUrl && <button onClick={onClose} className="w-full btn-secondary py-2.5 rounded-xl text-sm">Cerrar</button>}
        </div>
      </div>
    </ModalBackdrop>
  )
}

interface TodayClass {
  id: string; startsAt: string; endsAt: string; capacity: number
  classType: { name: string; color: string | null }
  _count: { bookings: number }
}
interface ExpiringMembership {
  userId: string; endsAt: string
  user: { name: string; email: string }
  plan: { name: string }
}
interface InactiveMember {
  id: string; name: string; email: string; createdAt: string
}
interface Stats {
  members: { total: number; active: number; trial: number; inactive: number; male: number; female: number; other: number }
  todayClasses: number
  expiringMemberships: ExpiringMembership[]
  inactiveMembers: InactiveMember[]
}
interface OccupancyData {
  avgOccupancy: number
  totalClasses: number
  totalBookings: number
  totalCapacity: number
  history: { label: string; pct: number; bookings: number; capacity: number }[]
  topType: { name: string; color: string | null; pct: number; classes: number } | null
  topSlot: { hour: string; pct: number; classes: number } | null
}
interface TodayWod {
  id: string; title: string; date: string
}

type Period = '7d' | '30d' | '3m' | '6m' | '1y'
const PERIODS: { key: Period; label: string }[] = [
  { key: '7d',  label: '7 días'  },
  { key: '30d', label: '30 días' },
  { key: '3m',  label: '3 meses' },
  { key: '6m',  label: '6 meses' },
  { key: '1y',  label: '1 año'   },
]

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

const daysLeft = (endsAt: string) =>
  Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000)

/* ─── SVG Donut chart ─────────────────────────────────────── */
function DonutChart({
  segments, size = 108, thickness = 18, centerValue, centerLabel,
}: {
  segments: { value: number; color: string; label: string }[]
  size?: number; thickness?: number
  centerValue?: string | number; centerLabel?: string
}) {
  const r = (size - thickness) / 2
  const cx = size / 2
  const C  = 2 * Math.PI * r
  const total = segments.reduce((s, g) => s + Math.max(g.value, 0), 0)
  let acc = 0

  return (
    <svg width={size} height={size} style={{ overflow: 'visible' }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#1e293b" strokeWidth={thickness} />
      {total > 0 && segments.filter(g => g.value > 0).map((seg, i) => {
        const len    = (seg.value / total) * C
        const offset = C / 4 - (acc / total) * C
        acc += seg.value
        return (
          <circle key={i} cx={cx} cy={cx} r={r} fill="none"
            stroke={seg.color} strokeWidth={thickness - 3}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={offset}
            strokeLinecap="butt" />
        )
      })}
      {centerValue !== undefined && (
        <text x={cx} y={cx - (centerLabel ? 7 : 0)} textAnchor="middle" dominantBaseline="middle"
          fill="#f1f5f9" fontSize={size * 0.19} fontWeight={800} fontFamily="system-ui">
          {centerValue}
        </text>
      )}
      {centerLabel && (
        <text x={cx} y={cx + 13} textAnchor="middle" dominantBaseline="middle"
          fill="#475569" fontSize={size * 0.1} fontFamily="system-ui">
          {centerLabel}
        </text>
      )}
    </svg>
  )
}

/* ─── Sparkline ───────────────────────────────────────────── */
function Sparkline({ data, color, height = 48 }: { data: { label: string; pct: number }[]; color: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} />
  const values = data.map(d => d.pct)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1)
  const W = 100, H = height

  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - ((v - min) / range) * (H * 0.8) - H * 0.1,
  }))

  const linePath = pts.map((p, i) => {
    if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
    const prev = pts[i - 1]
    const cpx = ((prev.x + p.x) / 2).toFixed(1)
    return `C${cpx},${prev.y.toFixed(1)} ${cpx},${p.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')

  const areaPath = `${linePath} L${W},${H} L0,${H} Z`
  const gradId = `sg${color.replace(/[^a-z0-9]/gi, '')}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={2.5} fill={color} />
    </svg>
  )
}

/* ─── Legend row ──────────────────────────────────────────── */
function Legend({ items }: { items: { label: string; value: number; color: string; total: number }[] }) {
  return (
    <div className="space-y-1.5 w-full mt-2">
      {items.map(it => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: it.color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-3)' }}>{it.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{it.value}</span>
            <span style={{ color: 'var(--text-4)', minWidth: 28, textAlign: 'right' }}>
              {it.total > 0 ? `${Math.round((it.value / it.total) * 100)}%` : '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Dashboard Skeleton ──────────────────────────────────── */
function DashboardSkeleton() {
  return (
    <>
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      <div className="px-6 py-8 space-y-6">
        {/* Header skeleton */}
        <div style={{ animation: 'skeletonPulse 1.5s ease-in-out infinite' }}>
          <div style={{ height: 12, width: 160, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 10 }} />
          <div style={{ height: 36, width: 280, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' }} />
        </div>
        {/* KPI strip skeleton */}
        <div className="card rounded-xl" style={{ display: 'flex', overflow: 'hidden', animation: 'skeletonPulse 1.5s ease-in-out infinite' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px',
              borderLeft: i > 0 ? '1px solid var(--border-1)' : 'none',
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
              <div>
                <div style={{ height: 26, width: 48, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 6 }} />
                <div style={{ height: 10, width: 72, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' }} />
              </div>
            </div>
          ))}
        </div>
        {/* Main grid skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Left col */}
          <div className="lg:col-span-3 space-y-5">
            <div className="card rounded-xl" style={{ height: 220, animation: 'skeletonPulse 1.5s ease-in-out infinite', backgroundColor: 'rgba(255,255,255,0.06)' }} />
            <div className="card rounded-xl" style={{ height: 260, animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: '120ms', backgroundColor: 'rgba(255,255,255,0.06)' }} />
          </div>
          {/* Right col */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card rounded-xl" style={{ height: 180, animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: '60ms', backgroundColor: 'rgba(255,255,255,0.06)' }} />
            <div className="card rounded-xl" style={{ height: 200, animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: '180ms', backgroundColor: 'rgba(255,255,255,0.06)' }} />
            <div className="card rounded-xl" style={{ height: 140, animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: '240ms', backgroundColor: 'rgba(255,255,255,0.06)' }} />
          </div>
        </div>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [stats, setStats]             = useState<Stats | null>(null)
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([])
  const [todayWods, setTodayWods]     = useState<TodayWod[]>([])
  const [occupancy, setOccupancy]     = useState<OccupancyData | null>(null)
  const [period, setPeriod]           = useState<Period>('7d')
  const [loadingOcc, setLoadingOcc]   = useState(false)
  const [loading, setLoading]         = useState(true)
  const [showAllClasses, setShowAllClasses] = useState(false)
  const [showQuickPay, setShowQuickPay] = useState(false)
  const [quickPayUserId, setQuickPayUserId] = useState<string | null>(null)
  const [quickUsers, setQuickUsers]   = useState<QuickUser[]>([])
  const [quickPlans, setQuickPlans]   = useState<any[]>([])
  const router = useRouter()
  const isCoach = user?.role === 'COACH'

  useEffect(() => { loadFromStorage() }, [])

  useEffect(() => {
    if (!user) { router.push('/login'); return }

    const today = new Date().toISOString().split('T')[0]

    if (isCoach) {
      Promise.all([
        api.get(`/classes?from=${today}&to=${today}`).catch(() => ({ data: [] })),
        api.get(`/wods?from=${today}&to=${today}`).catch(() => ({ data: [] })),
      ]).then(([clsRes, wodRes]) => {
        setTodayClasses((clsRes.data || []).sort((a: TodayClass, b: TodayClass) => a.startsAt.localeCompare(b.startsAt)))
        setTodayWods(wodRes.data || [])
      }).finally(() => setLoading(false))
      return
    }

    Promise.all([
      api.get('/gyms/me/stats'),
      api.get(`/classes?from=${today}&to=${today}`),
      api.get('/gyms/me/occupancy?period=7d'),
    ]).then(([statsRes, classesRes, occRes]) => {
      setStats(statsRes.data)
      setTodayClasses(classesRes.data.sort((a: TodayClass, b: TodayClass) =>
        a.startsAt.localeCompare(b.startsAt)))
      setOccupancy(occRes.data)
    }).catch(() => router.push('/login'))
      .finally(() => setLoading(false))
  }, [user])

  const fetchOccupancy = useCallback(async (p: Period) => {
    setLoadingOcc(true)
    try {
      const { data } = await api.get(`/gyms/me/occupancy?period=${p}`)
      setOccupancy(data)
    } catch {}
    finally { setLoadingOcc(false) }
  }, [])

  const handlePeriod = (p: Period) => {
    setPeriod(p)
    fetchOccupancy(p)
  }

  const hour = new Date().getHours()
  const greeting  = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'
  const dateLabel = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  if (!user) return null

  /* ─── COACH VIEW ──────────────────────── */
  if (isCoach) {
    if (loading) return <DashboardSkeleton />

    const now = new Date()

    return (
      <div className="px-6 py-8 space-y-6">
        {/* Header */}
        <div className="fade-up">
          <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--text-4)' }}>{dateLabel}</p>
          <h1 className="mt-1 font-display" style={{
            fontFamily: 'var(--font-display)',
            fontSize: 32, fontWeight: 800,
            letterSpacing: '-0.04em', color: '#ffffff', lineHeight: 1.1,
          }}>
            {greeting}, <span style={{
              background: 'var(--gradient-btn)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{user.name.split(' ')[0]}</span>
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Clases de hoy */}
          <div className="lg:col-span-3 card rounded-xl overflow-hidden" style={{ animationDelay: '60ms' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-1)' }}>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5" style={{ color: 'var(--brand-accent)' }} />
                <h2 className="font-semibold text-xs" style={{ color: 'var(--text-1)' }}>Clases de hoy</h2>
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
                  {todayClasses.length}
                </span>
              </div>
              <button onClick={() => router.push('/dashboard/classes')}
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color: 'var(--brand-accent)' }}>
                Ver todo <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {todayClasses.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CalendarDays className="w-8 h-8" style={{ color: 'var(--text-4)', opacity: 0.4 }} />
                <p className="text-xs" style={{ color: 'var(--text-4)' }}>Sin clases programadas hoy</p>
              </div>
            ) : (
              <div>
                {todayClasses.map(cls => {
                  const start = new Date(cls.startsAt)
                  const end = new Date(cls.endsAt)
                  const isLive = start <= now && now <= end
                  const pct = Math.round((cls._count.bookings / cls.capacity) * 100)
                  const accent = cls.classType.color || 'var(--brand-accent)'
                  const countColor = pct >= 100 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e'
                  return (
                    <div key={cls.id}
                      onClick={() => router.push(`/dashboard/classes/${cls.id}`)}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors border-b last:border-0"
                      style={{ borderColor: 'var(--border-1)' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                      <span className="tabular-nums shrink-0 font-medium" style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 36 }}>
                        {fmtTime(cls.startsAt)}
                      </span>
                      <span className="flex-1 min-w-0 truncate font-medium" style={{ fontSize: 13, color: 'var(--text-1)' }}>
                        {cls.classType.name}
                      </span>
                      {isLive && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: '#22c55e18', color: '#22c55e' }}>
                          EN VIVO
                        </span>
                      )}
                      <span className="tabular-nums shrink-0 font-semibold" style={{ fontSize: 12, color: countColor }}>
                        {cls._count.bookings}/{cls.capacity}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right col coach */}
          <div className="lg:col-span-2 space-y-4">
            {/* WOD del día */}
            <div className="card rounded-xl p-4" style={{ animationDelay: '120ms' }}>
              <div className="flex items-center gap-2 mb-3">
                <Dumbbell className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>WOD del día</p>
              </div>
              {todayWods.length > 0 ? (
                <>
                  <p className="font-semibold text-sm mb-3" style={{ color: 'var(--text-1)' }}>
                    {todayWods[0].title}
                  </p>
                  <button onClick={() => router.push('/dashboard/wods')}
                    className="w-full btn-brand py-2 rounded-lg text-sm font-medium">
                    Gestionar WODs
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-4)' }}>Sin WOD publicado hoy</p>
                  <button onClick={() => router.push('/dashboard/wods')}
                    className="w-full btn-secondary py-2 rounded-lg text-sm font-medium">
                    Publicar WOD
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    )
  }

  /* ─── ADMIN VIEW ──────────────────────── */
  if (loading) {
    return <DashboardSkeleton />
  }

  const activeRate = stats ? Math.round((stats.members.active / Math.max(stats.members.total, 1)) * 100) : 0
  const expiring = stats?.expiringMemberships ?? []

  const healthColor = activeRate >= 70 ? '#22c55e' : activeRate >= 50 ? '#f59e0b' : '#ef4444'
  const healthLabel = activeRate >= 70 ? 'Excelente' : activeRate >= 50 ? 'Regular' : 'Critico'
  const healthBadgeBg = activeRate >= 70 ? '#22c55e18' : activeRate >= 50 ? '#f59e0b18' : '#ef444418'

  const kpiCards = stats ? [
    {
      label: 'Total alumnos', value: stats.members.total,
      icon: Users, accent: '#6366f1',
      sub: `${stats.members.active} activos hoy`,
    },
    {
      label: 'Alumnos activos', value: stats.members.active,
      icon: UserCheck, accent: '#22c55e',
      sub: `${activeRate}% del total`,
      progress: activeRate,
    },
    {
      label: 'En prueba', value: stats.members.trial,
      icon: Activity, accent: '#f59e0b',
      sub: 'membresías trial',
    },
    {
      label: 'Inactivos', value: stats.members.inactive,
      icon: UserX, accent: '#ef4444',
      sub: 'sin membresía activa',
    },
  ] : []

  /* Donut data */
  const membershipSegs = stats ? [
    { value: stats.members.active,   color: '#22c55e', label: 'Activos'   },
    { value: stats.members.trial,    color: '#f59e0b', label: 'Trial'     },
    { value: stats.members.inactive, color: '#ef4444', label: 'Inactivos' },
  ] : []

  const genderSegs = stats ? [
    { value: stats.members.male,   color: '#6366f1', label: 'Hombres' },
    { value: stats.members.female, color: '#ec4899', label: 'Mujeres' },
    { value: stats.members.other,  color: '#94a3b8', label: 'Otro'    },
  ] : []

  const occColor = occupancy
    ? occupancy.avgOccupancy >= 80 ? '#22c55e'
    : occupancy.avgOccupancy >= 50 ? '#6366f1'
    : '#f59e0b'
    : '#6366f1'

  return (
    <div className="px-6 py-8 space-y-6">

      {/* Header */}
      <div className="fade-up flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--text-4)', fontFamily: 'var(--font-body)' }}>{dateLabel}</p>
          <h1 className="mt-1" style={{
            fontFamily: 'var(--font-display)',
            fontSize: 32, fontWeight: 800,
            letterSpacing: '-0.04em', color: '#ffffff', lineHeight: 1.1,
          }}>
            {greeting},{' '}
            <span style={{
              background: 'var(--gradient-btn)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{user.name.split(' ')[0]}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 mt-1 shrink-0">
          <button
            onClick={() => router.push('/dashboard/classes/new')}
            className="btn-secondary flex items-center gap-2 px-3 py-2 text-sm"
          >
            <CalendarDays className="w-4 h-4" />Nueva clase
          </button>
          <button
            onClick={() => router.push('/dashboard/users?action=pay')}
            className="btn-brand flex items-center gap-2 px-4 py-2 text-sm"
          >
            <Wallet className="w-4 h-4" />Registrar pago
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {stats && (
        <div className="card rounded-xl" style={{ display: 'flex', overflow: 'hidden' }}>
          {kpiCards.map((card, i) => {
            const Icon = card.icon
            return (
              <div key={card.label} style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px',
                borderLeft: i > 0 ? '1px solid var(--border-1)' : 'none',
                animationDelay: `${i * 60}ms`,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: card.accent + '18', border: `1px solid ${card.accent}28`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon style={{ width: 15, height: 15, color: card.accent }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{
                      fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800,
                      lineHeight: 1, letterSpacing: '-0.03em',
                      background: `linear-gradient(135deg, ${card.accent}, ${card.accent}BB)`,
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>{card.value}</span>
                    {card.progress !== undefined && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: card.accent, opacity: 0.8 }}>
                        {card.progress}%
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {card.label}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Left col — 3 cols */}
        <div className="lg:col-span-3 space-y-5">

          {/* Today's classes */}
          <div className="card rounded-xl overflow-hidden" style={{ animationDelay: '0ms' }}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b"
              style={{ borderColor: 'var(--border-1)' }}>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5" style={{ color: 'var(--brand-accent)' }} />
                <h2 className="font-semibold text-xs" style={{ color: 'var(--text-1)' }}>Próximas clases</h2>
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
                  {todayClasses.filter(c => new Date(c.endsAt) > new Date()).length}/{todayClasses.length}
                </span>
              </div>
              <button onClick={() => router.push('/dashboard/classes')}
                className="flex items-center gap-1 text-xs font-medium transition-colors"
                style={{ color: 'var(--brand-accent)' }}>
                Ver todo <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {(() => {
              const now = new Date()
              const upcoming = todayClasses.filter(cls => new Date(cls.endsAt) > now)
              if (upcoming.length === 0) return (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <CalendarDays className="w-8 h-8" style={{ color: 'var(--text-4)', opacity: 0.4 }} />
                  <p className="text-xs" style={{ color: 'var(--text-4)' }}>
                    {todayClasses.length > 0 ? 'Todas las clases de hoy han terminado' : 'Sin clases hoy'}
                  </p>
                </div>
              )
              const visible = showAllClasses ? upcoming : upcoming.slice(0, 3)
              const hidden = upcoming.length - 3
              return (
                <>
                  <div>
                    {visible.map(cls => {
                      const now2 = new Date()
                      const start = new Date(cls.startsAt)
                      const end = new Date(cls.endsAt)
                      const isLive = start <= now2 && now2 <= end
                      const pct = Math.round((cls._count.bookings / cls.capacity) * 100)
                      const accent = cls.classType.color || 'var(--brand-accent)'
                      const countColor = pct >= 100 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e'
                      return (
                        <div key={cls.id}
                          onClick={() => router.push(`/dashboard/classes/${cls.id}`)}
                          className="flex items-center gap-2 px-3 py-1 cursor-pointer transition-colors"
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                          <div className="w-0.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                          <span className="tabular-nums shrink-0" style={{ fontSize: 10, color: 'var(--text-3)', minWidth: 32 }}>{fmtTime(cls.startsAt)}</span>
                          <span className="flex-1 min-w-0 truncate" style={{ fontSize: 11, color: 'var(--text-1)', fontWeight: 500 }}>{cls.classType.name}</span>
                          {isLive && (
                            <span className="shrink-0 px-1 rounded" style={{ fontSize: 9, fontWeight: 600, backgroundColor: '#22c55e18', color: '#22c55e' }}>•live</span>
                          )}
                          <span className="tabular-nums shrink-0" style={{ fontSize: 10, color: countColor, fontWeight: 500 }}>
                            {cls._count.bookings}/{cls.capacity}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {upcoming.length > 3 && (
                    <button
                      onClick={() => setShowAllClasses(v => !v)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium border-t transition-colors"
                      style={{ borderColor: 'var(--border-1)', color: 'var(--text-4)' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      {showAllClasses
                        ? <>Mostrar menos <ChevronRight className="w-3 h-3 rotate-[-90deg]" /></>
                        : <>{hidden} clase{hidden !== 1 ? 's' : ''} más <ChevronRight className="w-3 h-3 rotate-90" /></>}
                    </button>
                  )}
                </>
              )
            })()}
          </div>

          {/* ── Ocupación de clases ── */}
          <div className="card rounded-xl overflow-hidden" style={{ animationDelay: '60ms' }}>
            {/* Header con selector de período */}
            <div className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: 'var(--border-1)' }}>
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4" style={{ color: 'var(--brand-accent)' }} />
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Ocupación de clases</h2>
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                {PERIODS.map(p => (
                  <button key={p.key} onClick={() => handlePeriod(p.key)}
                    style={{
                      padding: '3px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                      border: 'none', cursor: 'pointer', transition: 'all 120ms',
                      backgroundColor: period === p.key ? 'var(--brand-accent)' : 'transparent',
                      color: period === p.key ? '#fff' : 'var(--text-4)',
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 py-4">
              {loadingOcc ? (
                <div style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'var(--text-4)', fontSize: 13 }}>Calculando...</span>
                </div>
              ) : occupancy ? (
                <>
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                  {/* Número grande */}
                  <div style={{ flexShrink: 0 }}>
                    <div style={{
                      fontSize: 52, fontWeight: 800, lineHeight: 1,
                      letterSpacing: '-0.04em', fontFamily: 'var(--font-display)',
                      background: `linear-gradient(135deg, ${occColor}, ${occColor}99)`,
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>
                      {occupancy.avgOccupancy}<span style={{ fontSize: 24, fontWeight: 700 }}>%</span>
                    </div>
                    <p style={{ color: 'var(--text-4)', fontSize: 11, marginTop: 4 }}>promedio</p>
                    <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                      <div>
                        <p style={{ color: 'var(--text-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Clases</p>
                        <p style={{ color: 'var(--text-2)', fontWeight: 700, fontSize: 15 }}>{occupancy.totalClasses}</p>
                      </div>
                      <div>
                        <p style={{ color: 'var(--text-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reservas</p>
                        <p style={{ color: 'var(--text-2)', fontWeight: 700, fontSize: 15 }}>{occupancy.totalBookings}</p>
                      </div>
                      <div>
                        <p style={{ color: 'var(--text-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capacidad</p>
                        <p style={{ color: 'var(--text-2)', fontWeight: 700, fontSize: 15 }}>{occupancy.totalCapacity}</p>
                      </div>
                    </div>
                  </div>

                  {/* Sparkline + barra */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Barra general */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-4)', fontSize: 11 }}>Ocupación total del período</span>
                        <span style={{ color: 'var(--text-2)', fontSize: 11, fontWeight: 600 }}>
                          {occupancy.totalCapacity > 0
                            ? `${Math.round((occupancy.totalBookings / occupancy.totalCapacity) * 100)}%`
                            : '—'}
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, backgroundColor: 'var(--surface-hover)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 999,
                          width: `${occupancy.totalCapacity > 0 ? Math.round((occupancy.totalBookings / occupancy.totalCapacity) * 100) : 0}%`,
                          background: `linear-gradient(90deg, ${occColor}, ${occColor}99)`,
                          transition: 'width 500ms ease',
                        }} />
                      </div>
                    </div>
                    {/* Sparkline */}
                    <Sparkline data={occupancy.history} color={occColor} height={52} />
                    {/* Leyenda x-axis: primero y último label */}
                    {occupancy.history.length > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ color: 'var(--text-4)', fontSize: 10 }}>{occupancy.history[0].label}</span>
                        <span style={{ color: 'var(--text-4)', fontSize: 10 }}>{occupancy.history[occupancy.history.length - 1].label}</span>
                      </div>
                    )}
                  </div>
                </div>

              {/* Top tipo + top horario */}
              {(occupancy.topType || occupancy.topSlot) && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                  marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-1)',
                }}>
                  {/* Top tipo */}
                  <div style={{
                    backgroundColor: 'var(--surface-hover)', borderRadius: 10, padding: '10px 12px',
                    borderLeft: `3px solid ${occupancy.topType?.color ?? 'var(--brand-accent)'}`,
                  }}>
                    <p style={{ color: 'var(--text-4)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                      Tipo más concurrido
                    </p>
                    {occupancy.topType ? (
                      <>
                        <p style={{ color: 'var(--text-1)', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>
                          {occupancy.topType.name}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                          <div style={{ flex: 1, height: 4, borderRadius: 999, backgroundColor: '#1e293b', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 999,
                              width: `${occupancy.topType.pct}%`,
                              backgroundColor: occupancy.topType.color ?? 'var(--brand-accent)',
                            }} />
                          </div>
                          <span style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                            {occupancy.topType.pct}%
                          </span>
                        </div>
                        <p style={{ color: 'var(--text-4)', fontSize: 10, marginTop: 3 }}>
                          {occupancy.topType.classes} clase{occupancy.topType.classes !== 1 ? 's' : ''} en el período
                        </p>
                      </>
                    ) : (
                      <p style={{ color: 'var(--text-4)', fontSize: 12 }}>Sin datos</p>
                    )}
                  </div>

                  {/* Top horario */}
                  <div style={{
                    backgroundColor: 'var(--surface-hover)', borderRadius: 10, padding: '10px 12px',
                    borderLeft: '3px solid #6366f1',
                  }}>
                    <p style={{ color: 'var(--text-4)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                      Horario más concurrido
                    </p>
                    {occupancy.topSlot ? (
                      <>
                        <p style={{ color: 'var(--text-1)', fontWeight: 700, fontSize: 20, lineHeight: 1.1, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                          {occupancy.topSlot.hour}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                          <div style={{ flex: 1, height: 4, borderRadius: 999, backgroundColor: '#1e293b', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 999,
                              width: `${occupancy.topSlot.pct}%`,
                              backgroundColor: '#6366f1',
                            }} />
                          </div>
                          <span style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                            {occupancy.topSlot.pct}%
                          </span>
                        </div>
                        <p style={{ color: 'var(--text-4)', fontSize: 10, marginTop: 3 }}>
                          {occupancy.topSlot.classes} clase{occupancy.topSlot.classes !== 1 ? 's' : ''} en el período
                        </p>
                      </>
                    ) : (
                      <p style={{ color: 'var(--text-4)', fontSize: 12 }}>Sin datos</p>
                    )}
                  </div>
                </div>
              )}
                </>
              ) : (
                <p style={{ color: 'var(--text-4)', fontSize: 13 }}>Sin datos disponibles</p>
              )}
            </div>
          </div>

        </div>

        {/* Right col — 2 cols */}
        <div className="lg:col-span-2 space-y-4">

          {/* Membresías por vencer */}
          <div className="card rounded-xl overflow-hidden" style={{ animationDelay: '0ms' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: 'var(--border-1)' }}>
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Por vencer</h2>
                {expiring.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                    {expiring.length}
                  </span>
                )}
              </div>
              <button onClick={() => router.push('/dashboard/users')}
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color: 'var(--brand-accent)' }}>
                Ver <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {expiring.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: '#dcfce7' }}>
                  <UserCheck className="w-4 h-4 text-green-600" />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>Sin vencimientos próximos</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border-1)' }}>
                {expiring.slice(0, 5).map(m => {
                  const days = daysLeft(m.endsAt)
                  return (
                    <div key={m.userId} className="flex items-center justify-between px-5 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate" style={{ color: 'var(--text-1)' }}>{m.user.name}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-4)' }}>{m.plan.name}</p>
                      </div>
                      <span className={`shrink-0 ml-3 text-xs px-2.5 py-1 rounded-full font-semibold ${
                        days <= 2 ? 'bg-red-100 text-red-600' :
                        days <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>{days}d</span>
                    </div>
                  )
                })}
                {expiring.length > 5 && (
                  <div className="px-5 py-3">
                    <button onClick={() => router.push('/dashboard/users')}
                      className="text-xs font-medium flex items-center gap-1"
                      style={{ color: 'var(--brand-accent)' }}>
                      +{expiring.length - 5} más <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Composición del box (dos donuts) ── */}
          {stats && (
            <div className="card rounded-xl p-4" style={{ animationDelay: '60ms' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-4"
                style={{ color: 'var(--text-4)' }}>Composición del box</p>

              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* Donut 1: membresías */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <p style={{ color: 'var(--text-4)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Membresías
                  </p>
                  <DonutChart
                    segments={membershipSegs}
                    centerValue={stats.members.total}
                    centerLabel="total"
                  />
                  <Legend items={[
                    { label: 'Activos',   value: stats.members.active,   color: '#22c55e', total: stats.members.total },
                    { label: 'Trial',     value: stats.members.trial,    color: '#f59e0b', total: stats.members.total },
                    { label: 'Inactivos', value: stats.members.inactive, color: '#ef4444', total: stats.members.total },
                  ]} />
                </div>

                {/* Divider */}
                <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'var(--border-1)' }} />

                {/* Donut 2: género */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <p style={{ color: 'var(--text-4)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Género
                  </p>
                  <DonutChart
                    segments={genderSegs}
                    centerValue={`${Math.round((stats.members.male / Math.max(stats.members.total, 1)) * 100)}%`}
                    centerLabel="♂"
                  />
                  <Legend items={[
                    { label: 'Hombres', value: stats.members.male,   color: '#6366f1', total: stats.members.total },
                    { label: 'Mujeres', value: stats.members.female, color: '#ec4899', total: stats.members.total },
                    { label: 'Otro',    value: stats.members.other,  color: '#94a3b8', total: stats.members.total },
                  ]} />
                </div>
              </div>
            </div>
          )}

          {/* ── Salud del box ── */}
          {stats && (
            <div className="card rounded-xl p-4" style={{ animationDelay: '120ms' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
                  Salud del box
                </p>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: healthBadgeBg, color: healthColor }}>
                  {healthLabel}
                </span>
              </div>

              {/* Número grande */}
              <div className="flex items-baseline gap-1 mb-3">
                <span style={{
                  fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 800,
                  lineHeight: 1, letterSpacing: '-0.04em',
                  background: `linear-gradient(135deg, ${healthColor}, ${healthColor}99)`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>{activeRate}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: healthColor, opacity: 0.7 }}>%</span>
                <span className="text-xs ml-1" style={{ color: 'var(--text-4)' }}>activos</span>
              </div>

              {/* Barra de progreso */}
              <div style={{ height: 5, borderRadius: 999, backgroundColor: 'var(--surface-hover)', overflow: 'hidden', marginBottom: 12 }}>
                <div style={{
                  height: '100%', borderRadius: 999,
                  width: `${activeRate}%`,
                  background: `linear-gradient(90deg, ${healthColor}, ${healthColor}99)`,
                  transition: 'width 600ms ease',
                }} />
              </div>

              {/* 3 métricas */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>Por vencer (7d)</span>
                  <span className="text-xs font-semibold" style={{ color: expiring.length > 5 ? '#ef4444' : '#22c55e' }}>
                    {expiring.length > 5 ? '⚠️' : ''} {expiring.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>Sin membresía</span>
                  <span className="text-xs font-semibold" style={{
                    color: stats.members.total > 0 && (stats.members.inactive / stats.members.total) > 0.3
                      ? '#ef4444' : '#22c55e'
                  }}>
                    {stats.members.total > 0 && (stats.members.inactive / stats.members.total) > 0.3 ? '😴' : ''} {stats.members.inactive}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>En trial</span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                    🆕 {stats.members.trial}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Inactivos recientes */}
          {stats && stats.inactiveMembers.length > 0 && (
            <div className="card rounded-xl overflow-hidden" style={{ animationDelay: '180ms' }}>
              <div className="flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor: 'var(--border-1)' }}>
                <div className="flex items-center gap-2.5">
                  <UserMinus className="w-4 h-4 text-slate-400" />
                  <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Inactivos</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
                    {stats.members.inactive}
                  </span>
                </div>
                <button onClick={() => router.push('/dashboard/users?status=inactive')}
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: 'var(--brand-accent)' }}>
                  Ver <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border-1)' }}>
                {stats.inactiveMembers.slice(0, 4).map(m => (
                  <button key={m.id} onClick={() => router.push(`/dashboard/users/${m.id}`)}
                    className="flex items-center gap-3 px-5 py-3 w-full text-left transition-colors"
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--surface-hover)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
                        {m.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate" style={{ color: 'var(--text-2)' }}>{m.name}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-4)' }} />
                  </button>
                ))}
              </div>
            </div>
          )}


        </div>
      </div>
    </div>
  )
}
