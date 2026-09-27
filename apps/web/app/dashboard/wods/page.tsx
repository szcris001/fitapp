'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'
import {
  ChevronRight, RefreshCw,
  Dumbbell, Tv2, Medal, Users,
} from 'lucide-react'

/* ─── Types ──────────────────────────────────────────── */
interface BenchmarkResult {
  id: string; scoreType: string; scoreValue: number
  scoreNotes?: string; isRx: boolean; recordedAt: string
  user: { id: string; name: string; avatarUrl?: string; gender?: string }
}
interface BenchmarkBoard {
  id: string; nombre: string; categoria: string; formato: string
  duracionMins?: number; tiempoEstMin?: number
  movimientos: { nombre: string; repsEsquema?: string }[]
  resultados: BenchmarkResult[]
}
interface RmBoard {
  movement: string
  records: { id: string; weightKg: number; recordedAt: string; user: { id: string; name: string; gender?: string } }[]
}

/* ─── Utils ──────────────────────────────────────────── */
const CAT_COLOR: Record<string, string> = {
  GIRL: '#ec4899', HERO: '#3b82f6', OPEN: '#f59e0b', GAMES: '#22c55e', CUSTOM: '#8b5cf6',
}
function fmtScore(r: BenchmarkResult) {
  if (r.scoreType === 'TIME') {
    const s = Math.round(r.scoreValue)
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(s % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }
  if (r.scoreType === 'ROUNDS') return `${r.scoreValue} rondas${r.scoreNotes ? ` (${r.scoreNotes})` : ''}`
  if (r.scoreType === 'WEIGHT') return `${r.scoreValue} kg`
  return `${r.scoreValue}${r.scoreNotes ? ` (${r.scoreNotes})` : ''}`
}
function Skeleton() {
  return <div className="animate-pulse rounded-xl" style={{ backgroundColor: 'var(--surface-hover)', height: 72 }} />
}

/* ─── Tabs ───────────────────────────────────────────── */
type Tab = 'benchmarks' | 'rms'
const TABS: { id: Tab; label: string; Icon: any }[] = [
  { id: 'benchmarks', label: 'Benchmarks',   Icon: Medal    },
  { id: 'rms',        label: 'Récords (RM)', Icon: Dumbbell },
]

/* ═══════════════════════════════════════════════════════ */
export default function WodsPage() {
  const router = useRouter()
  const { user, loadFromStorage } = useAuthStore()
  const [tab, setTab] = useState<Tab>('benchmarks')

  // Benchmarks board
  const [benchmarks, setBenchmarks] = useState<BenchmarkBoard[]>([])
  const [loadingBench, setLoadingBench] = useState(false)

  // RMs board
  const [rms, setRms]           = useState<RmBoard[]>([])
  const [loadingRms, setLoadingRms]   = useState(false)

  const [error, setError]       = useState<string | null>(null)

  useEffect(() => { loadFromStorage() }, [])

  const fetchBenchmarks = useCallback(async () => {
    setLoadingBench(true); setError(null)
    try {
      const { data } = await api.get('/benchmarks/board')
      setBenchmarks(data)
    } catch { setError('No se pudieron cargar los benchmarks.') }
    finally { setLoadingBench(false) }
  }, [])

  const fetchRms = useCallback(async () => {
    setLoadingRms(true); setError(null)
    try {
      const { data } = await api.get('/rms/gym-board')
      setRms(data)
    } catch { setError('No se pudieron cargar los récords.') }
    finally { setLoadingRms(false) }
  }, [])

  useEffect(() => {
    if (!user) return
    if (tab === 'benchmarks') fetchBenchmarks()
    if (tab === 'rms')        fetchRms()
  }, [user, tab])

  return (
    <div className="px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
            Pizarra
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-4)' }}>
            Benchmarks y récords del box
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open('/dashboard/wods/tv', '_blank')}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-medium transition-colors"
            style={{ backgroundColor: '#1e1b4b', color: '#a5b4fc', border: '1px solid #3730a3' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2e2b6b')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1e1b4b')}
          >
            <Tv2 className="w-4 h-4" />
            Modo TV
          </button>
          </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)', width: 'fit-content' }}>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id} onClick={() => setTab(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === id
              ? { backgroundColor: 'var(--surface-card)', color: 'var(--text-1)', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }
              : { color: 'var(--text-4)', backgroundColor: 'transparent' }}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="card rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
          <p className="text-sm" style={{ color: 'var(--text-4)' }}>{error}</p>
          <button onClick={() => { if (tab === 'benchmarks') fetchBenchmarks(); else fetchRms() }}
            className="btn-brand flex items-center gap-2 px-4 py-2 text-sm">
            <RefreshCw className="w-3.5 h-3.5" /> Reintentar
          </button>
        </div>
      )}

      {/* ── Tab Benchmarks ────────────────────────────── */}
      {tab === 'benchmarks' && (
        <div className="space-y-5">
          {loadingBench ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} />)}</div>
          ) : benchmarks.length === 0 ? (
            <div className="card rounded-2xl p-12 text-center">
              <Medal className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-4)', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: 'var(--text-4)' }}>Sin resultados registrados aún</p>
            </div>
          ) : benchmarks.map(b => {
            const catColor = CAT_COLOR[b.categoria] ?? '#6366f1'
            // Ordenar resultados: TIME ascendente, resto descendente
            const sorted = [...b.resultados].sort((a, x) =>
              a.scoreType === 'TIME' ? a.scoreValue - x.scoreValue : x.scoreValue - a.scoreValue
            )
            const top3 = sorted.slice(0, 3)
            if (sorted.length === 0) return null
            return (
              <div key={b.id} className="card rounded-2xl overflow-hidden">
                {/* Benchmark header */}
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ backgroundColor: catColor + '20', color: catColor }}>
                      {b.categoria}
                    </span>
                    <div>
                      <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{b.nombre}</p>
                      <p className="text-xs" style={{ color: 'var(--text-4)' }}>{b.formato}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--text-4)' }}>{sorted.length} resultados</span>
                    <button onClick={() => router.push(`/dashboard/wods/benchmarks/${b.id}`)}
                      className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1"
                      style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
                      Ver todo <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {/* Top 3 */}
                <div>
                  {top3.map((r, i) => (
                    <div key={r.id} className="flex items-center gap-4 px-5 py-3 border-b last:border-0" style={{ borderColor: 'var(--border-1)' }}>
                      <span className="text-base w-6 text-center shrink-0">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                      </span>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 15%, transparent)', color: 'var(--brand-accent)' }}>
                        {r.user.name[0]}
                      </div>
                      <span className="flex-1 font-medium text-sm" style={{ color: 'var(--text-1)' }}>{r.user.name}</span>
                      <span className="font-bold text-sm" style={{ color: i === 0 ? '#f59e0b' : 'var(--text-2)' }}>
                        {fmtScore(r)}
                      </span>
                      {r.isRx && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#22c55e15', color: '#22c55e' }}>Rx</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tab RMs ───────────────────────────────────── */}
      {tab === 'rms' && (
        <div className="space-y-4">
          {loadingRms ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} />)}</div>
          ) : rms.length === 0 ? (
            <div className="card rounded-2xl p-12 text-center">
              <Dumbbell className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-4)', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: 'var(--text-4)' }}>Sin récords registrados aún</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {rms.map(({ movement, records }) => (
                <div key={movement} className="card rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border-1)' }}>
                    <Dumbbell className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-accent)' }} />
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{movement}</span>
                    <span className="ml-auto text-xs" style={{ color: 'var(--text-4)' }}>
                      <Users className="w-3 h-3 inline mr-1" />{records.length}
                    </span>
                  </div>
                  <div>
                    {records.slice(0, 5).map((r, i) => (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0" style={{ borderColor: 'var(--border-1)' }}>
                        <span className="text-sm w-5 text-center shrink-0" style={{ color: 'var(--text-4)' }}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                        </span>
                        <span className="flex-1 text-sm" style={{ color: 'var(--text-2)' }}>{r.user.name}</span>
                        <span className="font-bold text-sm" style={{ color: i === 0 ? '#f59e0b' : 'var(--text-1)' }}>
                          {r.weightKg} kg
                        </span>
                      </div>
                    ))}
                    {records.length > 5 && (
                      <div className="px-4 py-2 text-xs" style={{ color: 'var(--text-4)' }}>
                        +{records.length - 5} más
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
