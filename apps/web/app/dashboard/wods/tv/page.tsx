'use client'
import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '../../../../store/auth.store'
import api from '../../../../lib/api'

/* ─── Types ── */
interface BenchmarkResult {
  id: string; scoreType: string; scoreValue: number; scoreNotes?: string; isRx: boolean
  user: { id: string; name: string }
}
interface BenchmarkBoard {
  id: string; nombre: string; categoria: string; formato: string
  resultados: BenchmarkResult[]
}
interface RmBoard {
  movement: string
  records: { id: string; weightKg: number; user: { id: string; name: string } }[]
}

/* ─── Utils ── */
const CAT_COLOR: Record<string, string> = {
  GIRL: '#f472b6', HERO: '#60a5fa', OPEN: '#fbbf24', GAMES: '#4ade80', CUSTOM: '#a78bfa',
}
function fmtScore(r: BenchmarkResult) {
  if (r.scoreType === 'TIME') {
    const s = Math.round(r.scoreValue)
    return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`
  }
  if (r.scoreType === 'ROUNDS') return `${r.scoreValue} rds${r.scoreNotes ? ` +${r.scoreNotes}` : ''}`
  if (r.scoreType === 'WEIGHT') return `${r.scoreValue} kg`
  return `${r.scoreValue}`
}
const MEDALS = ['🥇', '🥈', '🥉']

/* ─── Slide: Benchmark Leaderboard ── */
function BenchmarkSlide({ b }: { b: BenchmarkBoard }) {
  const sorted = [...b.resultados].sort((a, x) =>
    a.scoreType === 'TIME' ? a.scoreValue - x.scoreValue : x.scoreValue - a.scoreValue
  ).slice(0, 8)
  const catColor = CAT_COLOR[b.categoria] ?? '#a78bfa'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '60px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.15em', color: catColor, textTransform: 'uppercase' }}>
          {b.categoria} · {b.formato}
        </span>
        <h1 style={{ fontSize: 72, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.03em', marginTop: 8 }}>
          {b.nombre}
        </h1>
      </div>

      {/* Leaderboard */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sorted.map((r, i) => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 24,
            backgroundColor: i === 0 ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${i === 0 ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 16, padding: '18px 28px',
          }}>
            <span style={{ fontSize: 32, width: 40, textAlign: 'center', flexShrink: 0 }}>
              {MEDALS[i] ?? <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.3)' }}>{i + 1}</span>}
            </span>
            <span style={{ flex: 1, fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
              {r.user.name}
            </span>
            <span style={{
              fontSize: 36, fontWeight: 900, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)',
              color: i === 0 ? '#fbbf24' : 'rgba(255,255,255,0.9)',
            }}>
              {fmtScore(r)}
            </span>
            {r.isRx && (
              <span style={{ fontSize: 13, fontWeight: 800, color: '#4ade80', backgroundColor: 'rgba(74,222,128,0.1)', borderRadius: 6, padding: '4px 10px', letterSpacing: '0.05em' }}>
                Rx
              </span>
            )}
          </div>
        ))}
        {sorted.length === 0 && (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 24, textAlign: 'center', marginTop: 40 }}>
            Sin resultados aún
          </p>
        )}
      </div>
    </div>
  )
}

/* ─── Slide: RM Movement ── */
function RmSlide({ data }: { data: RmBoard }) {
  const top = data.records.slice(0, 8)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '60px 80px' }}>
      <div style={{ marginBottom: 40 }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.15em', color: '#a78bfa', textTransform: 'uppercase' }}>
          Récord máximo (RM)
        </span>
        <h1 style={{ fontSize: 72, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.03em', marginTop: 8 }}>
          {data.movement}
        </h1>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {top.map((r, i) => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 24,
            backgroundColor: i === 0 ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${i === 0 ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 16, padding: '18px 28px',
          }}>
            <span style={{ fontSize: 32, width: 40, textAlign: 'center', flexShrink: 0 }}>
              {MEDALS[i] ?? <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.3)' }}>{i + 1}</span>}
            </span>
            <span style={{ flex: 1, fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
              {r.user.name}
            </span>
            <span style={{
              fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)',
              color: i === 0 ? '#a78bfa' : 'rgba(255,255,255,0.9)',
            }}>
              {r.weightKg} <span style={{ fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>kg</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════ */
export default function TvPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [benchmarks, setBenchmarks] = useState<BenchmarkBoard[]>([])
  const [rms, setRms]               = useState<RmBoard[]>([])
  const [loading, setLoading]       = useState(true)
  const [slideIndex, setSlideIndex] = useState(0)
  const SLIDE_DURATION = 8000 // 8 segundos por slide

  useEffect(() => { loadFromStorage() }, [])

  const fetchAll = useCallback(async () => {
    try {
      const [bRes, rRes] = await Promise.all([
        api.get('/benchmarks/board'),
        api.get('/rms/gym-board'),
      ])
      // Solo benchmarks con resultados
      setBenchmarks((bRes.data as BenchmarkBoard[]).filter(b => b.resultados.length > 0))
      setRms(rRes.data)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (user) fetchAll() }, [user, fetchAll])

  // Construir lista de slides: benchmarks primero, luego RMs
  const slides: { type: 'benchmark' | 'rm'; data: any }[] = [
    ...benchmarks.map(b => ({ type: 'benchmark' as const, data: b })),
    ...rms.map(r => ({ type: 'rm' as const, data: r })),
  ]

  // Auto-avance
  useEffect(() => {
    if (slides.length === 0) return
    const id = setInterval(() => {
      setSlideIndex(i => (i + 1) % slides.length)
    }, SLIDE_DURATION)
    return () => clearInterval(id)
  }, [slides.length])

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') window.close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const current = slides[slideIndex]
  const now = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#060606', color: '#fff',
      fontFamily: 'var(--font-body)', position: 'relative', overflow: 'hidden',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, opacity: 0.03,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
      }} />

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 24 }}>Cargando datos...</p>
        </div>
      ) : slides.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 28 }}>Sin datos para mostrar</p>
          <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: 16 }}>Registra benchmarks o RMs para que aparezcan aquí</p>
        </div>
      ) : (
        <>
          {/* Slide content */}
          <div style={{ height: 'calc(100vh - 80px)', position: 'relative' }}>
            {current?.type === 'benchmark' && <BenchmarkSlide b={current.data} />}
            {current?.type === 'rm'        && <RmSlide data={current.data} />}
          </div>

          {/* Footer */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, height: 72,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 40px', backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
          }}>
            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 6 }}>
              {slides.map((_, i) => (
                <button key={i} onClick={() => setSlideIndex(i)} style={{
                  width: i === slideIndex ? 24 : 6, height: 6, borderRadius: 99, border: 'none', cursor: 'pointer',
                  backgroundColor: i === slideIndex ? '#fff' : 'rgba(255,255,255,0.2)',
                  transition: 'all 0.3s',
                }} />
              ))}
            </div>

            {/* Clock */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>
                ESC para salir
              </span>
              <span style={{ fontSize: 24, fontWeight: 800, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                {now}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
