'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../../store/auth.store'
import api, { mediaUrl } from '../../../../lib/api'
import { CF_MOVEMENTS } from '../../../../lib/movements'
import {
  ChevronLeft, ChevronRight,
  Clock, Users, Dumbbell, CheckCircle, Circle, Pencil, Trash2, Save,
  Settings2, Search, UserPlus, Plus, X, Zap,
} from 'lucide-react'

/* ─── Interfaces ─────────────────────────────────── */
export interface ClassItem {
  id: string; startsAt: string; endsAt: string; capacity: number
  classType: { id: string; name: string; color: string | null }
  _count: { bookings: number }
  bookings: { id: string }[]
}

export interface ClassDetail {
  id: string; startsAt: string; endsAt: string; capacity: number
  classTypeId: string
  classType: { id: string; name: string; color: string | null }
  coach: { id: string; name: string; email: string; avatarUrl: string | null } | null
  bookings: { id: string; status: string; user: { name: string; email: string; avatarUrl: string | null } }[]
  wods: { id: string; title: string | null; blocks: { id: string; title: string | null; timecap: string | null; order: number; movements: { id: string; movementName: string; repScheme: string | null; weightRookieM: number | null; weightRookieF: number | null; weightScaleM: number | null; weightScaleF: number | null; weightRxM: number | null; weightRxF: number | null; scaledMovement: string | null; notes: string | null; sets: number | null; reps: number | null; roundWeights: any[] | null }[] }[] }[]
}

/* ─── Helpers ────────────────────────────────────── */
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
// Fecha local del navegador (asumida igual a la del gym): evita que toISOString() adelante
// o atrase un día para horarios cercanos a la medianoche (ver CLS-07)
const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`


/* ─── Movement Picker ────────────────────────────── */
function MovementPicker({ value, onChange, extra = [] }: { value: string; onChange: (v: string) => void; extra?: { name: string; cat: string }[] }) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  const allMovements = [
    ...CF_MOVEMENTS,
    ...extra.filter(e => !CF_MOVEMENTS.some(m => m.name.toLowerCase() === e.name.toLowerCase())),
  ]

  const grouped: [string, string[]][] = (() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const bycat: Record<string, string[]> = {}
    for (const m of allMovements) {
      if (m.name.toLowerCase().includes(q)) {
        if (!bycat[m.cat]) bycat[m.cat] = []
        bycat[m.cat].push(m.name)
      }
    }
    return Object.entries(bycat)
  })()

  const handleSelect = (name: string) => {
    onChange(name)
    setQuery(name)
    setOpen(false)
  }

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false)
      if (query && !allMovements.some(m => m.name === query)) {
        setQuery(value)
      }
    }, 150)
  }

  const isValid = !query || allMovements.some(m => m.name === query)

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder="Escribe para buscar movimiento..."
        className="input text-sm w-full"
        style={!isValid ? { borderColor: '#f59e0b', boxShadow: '0 0 0 2px #f59e0b22' } : {}}
        autoComplete="off"
      />
      {open && grouped.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[80] rounded-xl border overflow-y-auto shadow-xl"
          style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--border-1)', maxHeight: 260 }}>
          {grouped.map(([cat, names]) => (
            <div key={cat}>
              <div className="px-3 py-1 text-xs font-semibold sticky top-0"
                style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-4)', letterSpacing: '0.05em' }}>
                {cat}
              </div>
              {names.map(name => (
                <button key={name} onMouseDown={() => handleSelect(name)}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm transition-colors"
                  style={{ color: 'var(--text-1)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-base)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  {name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── WOD Editor Modal ───────────────────────────── */
const CAT_LABELS: Record<string, string> = { all: 'Todas', GIRL: 'Girl', HERO: 'Hero', OPEN: 'Open', GAMES: 'Games' }
const BENCH_CATS = ['all', 'GIRL', 'HERO', 'OPEN', 'GAMES'] as const

function WodEditorModal({
  cls, wod, onClose, onSaved, onDeleted,
}: {
  cls: ClassDetail
  wod: ClassDetail['wods'][0] | null
  onClose: () => void
  onSaved: (updated: ClassDetail) => void
  onDeleted: (updated: ClassDetail) => void
}) {
  type RoundWeight = { reps: number; rookieM: string; rookieF: string; scaleM: string; scaleF: string; rxM: string; rxF: string }
  type MovRow = { movementName: string; repScheme: string; percentage: string; weightRookieM: string; weightRookieF: string; weightScaleM: string; weightScaleF: string; weightRxM: string; weightRxF: string; scaledMovement: string; notes: string; roundWeights: RoundWeight[]; showWeights: boolean }
  type BlockRow = { title: string; scheme: string; timecap: string; notes: string; movements: MovRow[] }

  const emptyMov = (): MovRow => ({ movementName: '', repScheme: '', percentage: '', weightRookieM: '', weightRookieF: '', weightScaleM: '', weightScaleF: '', weightRxM: '', weightRxF: '', scaledMovement: '', notes: '', roundWeights: [], showWeights: false })
  const emptyBlock = (): BlockRow => ({ title: '', scheme: '', timecap: '', notes: '', movements: [emptyMov()] })

  const mapMov = (m: any): MovRow => ({
    movementName:   m.movementName ?? '',
    repScheme:      m.repScheme ?? (m.reps != null ? String(m.reps) : ''),
    percentage:     m.percentage != null ? String(m.percentage) : '',
    weightRookieM:  m.weightRookieM != null ? String(m.weightRookieM) : '',
    weightRookieF:  m.weightRookieF != null ? String(m.weightRookieF) : '',
    weightScaleM:   m.weightScaleM  != null ? String(m.weightScaleM)  : '',
    weightScaleF:   m.weightScaleF  != null ? String(m.weightScaleF)  : '',
    weightRxM:      m.weightRxM     != null ? String(m.weightRxM)     : '',
    weightRxF:      m.weightRxF     != null ? String(m.weightRxF)     : '',
    scaledMovement: m.scaledMovement ?? '',
    notes:          m.notes ?? '',
    showWeights:    !!(m.weightRookieM || m.weightRookieF || m.weightScaleM || m.weightScaleF || m.weightRxM || m.weightRxF || (m.roundWeights && m.roundWeights.length > 0)),
    roundWeights:   (m.roundWeights ?? []).map((r: any) => ({
      reps: r.reps, rookieM: r.rookieM ?? '', rookieF: r.rookieF ?? '',
      scaleM: r.scaleM ?? '', scaleF: r.scaleF ?? '', rxM: r.rxM ?? '', rxF: r.rxF ?? '',
    })),
  })

  const [form, setForm] = useState<{ title: string; scoreType: string; blocks: BlockRow[] }>({
    title: wod?.title || '',
    scoreType: (wod as any)?.scoreType ?? 'REPS',
    blocks: wod?.blocks?.length
      ? wod.blocks.map((b: any) => ({
          title:     b.title ?? '',
          scheme:    b.scheme ?? '',
          timecap:   b.timecap ?? '',
          notes:     b.notes ?? '',
          movements: b.movements?.length ? b.movements.map(mapMov) : [emptyMov()],
        }))
      : [emptyBlock()],
  })
  const [quickText, setQuickText] = useState('')
  const [showQuick, setShowQuick] = useState(false)
  const [unit, setUnit] = useState<'kg' | 'lbs'>('lbs')

  const KG_TO_LBS = 2.20462
  const toDisplay = (kgStr: string) => {
    if (!kgStr) return ''
    if (unit === 'kg') return kgStr
    return String(Math.round(Number(kgStr) * KG_TO_LBS))
  }
  const fromDisplay = (val: string) => {
    if (!val) return ''
    if (unit === 'kg') return val
    return String(Math.round((Number(val) / KG_TO_LBS) * 4) / 4)
  }
  const altHint = (kgStr: string) => {
    if (!kgStr || isNaN(Number(kgStr))) return ''
    const kg = Number(kgStr)
    if (unit === 'kg') return `${Math.round(kg * KG_TO_LBS)} lbs`
    return `${(Math.round(kg * 4) / 4)} kg`
  }
  const [benchmarks, setBenchmarks] = useState<any[]>([])
  const [benchSearch, setBenchSearch] = useState('')
  const [benchCat, setBenchCat] = useState<string>('all')
  const [gender, setGender] = useState<'H' | 'M'>('H')
  const [showBench, setShowBench] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [gymMovements, setGymMovements] = useState<{ name: string; cat: string }[]>([])
  const [expandedMovs, setExpandedMovs] = useState<Set<string>>(new Set())
  const toggleMov = (bi: number, mi: number) => {
    const key = `${bi}-${mi}`
    setExpandedMovs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  useEffect(() => {
    Promise.all([
      api.get('/benchmarks'),
      api.get('/gyms/me/movements-library'),
    ]).then(([benchRes, libRes]) => {
      setBenchmarks(benchRes.data)
      const raw: any[] = libRes.data ?? []
      setGymMovements(raw.map(item =>
        typeof item === 'string' ? { name: item, cat: 'Personalizado' } : item
      ))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const parseWeightPair = (txt: string): [string, string] => {
    const m = txt.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/)
    if (m) return [m[1].replace(',', '.'), m[2].replace(',', '.')]
    const s = txt.match(/(\d+(?:[.,]\d+)?)/)
    return s ? [s[1].replace(',', '.'), ''] : ['', '']
  }

  const parseMovementLine = (line: string): MovRow => {
    let txt = line.trim()
    txt = txt.replace(/^[-•*]+\s+/, '')
    txt = txt.replace(/(\d+)(reps?)\b/gi, '$1 $2')
    txt = txt.replace(/[.*]+$/, '').trim()

    const row = emptyMov()

    const calM = txt.match(/^([\d][\d\-\/]*)\s+cal(?:orías?)?\s+(.+)$/i)
    if (calM) {
      row.repScheme = `${calM[1]} cal`
      const machine = calM[2].trim().toLowerCase()
      if (/\bski\b/.test(machine))              row.movementName = 'Ski Erg'
      else if (/\bbike/i.test(machine))         row.movementName = 'BikeErg'
      else if (/\b(row|remo)\b/i.test(machine)) row.movementName = 'Row'
      else if (/\bassault\b/i.test(machine))    row.movementName = 'Assault Bike'
      else                                      row.movementName = calM[2].trim()
      return row
    }

    const timeM = txt.match(/^(\d+(?:-\d+)?)\s+min(?:utos?)?\s+(?:de\s+)?(.+)$/i)
    if (timeM) {
      row.repScheme = `${timeM[1]} min`
      row.movementName = timeM[2].replace(/\.$/, '').trim()
      return row
    }

    const scaledM = txt.match(/[-—]\s*[Ss]caled[:\s]+(.+)/i)
    if (scaledM) { row.scaledMovement = scaledM[1].trim(); txt = txt.replace(scaledM[0], '').trim() }

    const levelRx     = txt.match(/(?:peso\s+)?[Rr]x\s*:\s*([\d.,/]+)\s*kg/i)
    const levelScale  = txt.match(/(?:peso\s+|paso\s+)?[Ss]cale\s*:\s*([\d.,/]+)\s*kg/i)
    const levelRookie = txt.match(/(?:peso\s+)?[Rr]ookie\s*:\s*([\d.,/]+)\s*kg/i)
    if (levelRookie) { ;[row.weightRookieM, row.weightRookieF] = parseWeightPair(levelRookie[1]); txt = txt.replace(levelRookie[0], '').trim() }
    if (levelScale)  { ;[row.weightScaleM,  row.weightScaleF]  = parseWeightPair(levelScale[1]);  txt = txt.replace(levelScale[0], '').trim() }
    if (levelRx)     { ;[row.weightRxM,     row.weightRxF]     = parseWeightPair(levelRx[1]);     txt = txt.replace(levelRx[0], '').trim() }

    if (!row.weightRxM && !row.weightScaleM && !row.weightRookieM) {
      const dualW = txt.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*kg/i)
      if (dualW) {
        row.weightRxM = dualW[1].replace(',', '.'); row.weightRxF = dualW[2].replace(',', '.')
        txt = txt.replace(dualW[0], '').trim()
      } else {
        const singleW = txt.match(/(\d+(?:[.,]\d+)?)\s*kg/i)
        if (singleW) { row.weightRxM = singleW[1].replace(',', '.'); txt = txt.replace(singleW[0], '').trim() }
      }
    }

    const repM = txt.match(/\b(\d+(?:[x×]\d+|-\d+)+|\d+)\b/)
    if (repM) {
      row.repScheme = repM[1]
      txt = txt.replace(repM[0], '').replace(/^\s*reps?\b\s*/i, '').trim()
    }

    row.movementName = txt.replace(/[-—]/g, ' ').replace(/\s+/g, ' ').trim()
    return row
  }

  const applyQuickText = () => {
    const rawLines = quickText.split('\n').map(l => l.trim()).filter(Boolean)
    if (!rawLines.length) return

    const isScheme = (l: string) =>
      /^EMOM\b/i.test(l) ||
      /^FOR (TIME|QUALITY|REPS)/i.test(l) ||
      /^(AMRAP|TABATA)\b/i.test(l) ||
      /^CADA\s+\d+/i.test(l) ||
      /^EVERY\s+\d+/i.test(l) ||
      /^\d+\s+RONDAS?\s+/i.test(l) ||
      /^\d+\s+MINUTOS?\s+PARA/i.test(l) ||
      /SEGUNDOS?\s+POR\s+\d+/i.test(l) ||
      /^[A-ZÁÉÍÓÚÑ\s]{4,}$/.test(l)

    type PBlock = { title: string; scheme: string; notes: string; movLines: string[] }
    const blocks: PBlock[] = []
    let cur: PBlock = { title: '', scheme: '', notes: '', movLines: [] }

    for (const line of rawLines) {
      if (/^[A-Za-záéíóú]\)\s+\S/.test(line)) {
        if (cur.title || cur.movLines.length) blocks.push(cur)
        cur = { title: line.replace(/^[A-Za-záéíóú]\)\s+/, '').replace(/:$/, '').trim(), scheme: '', notes: '', movLines: [] }
      } else if (!cur.title && !/\d/.test(line) && !/^[-•*]/.test(line) && !line.endsWith(':')) {
        if (cur.movLines.length) blocks.push(cur)
        cur = { title: line.trim(), scheme: '', notes: '', movLines: [] }
      } else if (isScheme(line)) {
        const cleaned = line.replace(/:$/, '').trim()
        cur.scheme = cur.scheme ? `${cur.scheme} · ${cleaned}` : cleaned
      } else if (/^\*/.test(line)) {
        const note = line.replace(/^\*+\s*/, '').trim()
        cur.notes = cur.notes ? `${cur.notes}\n${note}` : note
      } else {
        const stripped = line.replace(/^\d+\)\s*/, '')
        if (stripped) cur.movLines.push(stripped)
      }
    }
    if (cur.title || cur.movLines.length) blocks.push(cur)

    const parsedBlocks: BlockRow[] = blocks.map(b => {
      const movements = b.movLines.map(parseMovementLine).filter(m => m.movementName)
      return {
        title:    b.title,
        scheme:   b.scheme,
        timecap:  '',
        notes:    b.notes,
        movements: movements.length ? movements : [emptyMov()],
      }
    })

    if (!parsedBlocks.length) return
    setForm(f => ({ ...f, blocks: parsedBlocks }))
    setExpandedMovs(new Set())
    setShowQuick(false)
    setQuickText('')
  }

  const applyBenchmark = (b: any) => {
    const movements: MovRow[] = (b.movimientos ?? []).map((m: any) => ({
      movementName:   m.nombre,
      repScheme:      m.repsEsquema ?? '',
      weightRxM:      m.cargaRxKgHombre ? String(m.cargaRxKgHombre) : '',
      weightRxF:      m.cargaRxKgMujer  ? String(m.cargaRxKgMujer)  : '',
      scaledMovement: m.cargaScaled ?? '',
      notes:          m.alturaRxCmHombre ? `Box H: ${m.alturaRxCmHombre}cm / M: ${m.alturaRxCmMujer ?? '?'}cm` : '',
      roundWeights:   [],
      showWeights:    !!(m.cargaRxKgHombre || m.cargaRxKgMujer),
      weightRookieM: '', weightRookieF: '', weightScaleM: '', weightScaleF: '', percentage: '',
    }))
    const timecap = b.duracionMins ? `${b.duracionMins}min` : ''
    setForm(f => ({ ...f, title: b.nombre, blocks: [{ title: b.formato || '', scheme: '', timecap, notes: '', movements: movements.length ? movements : [emptyMov()] }] }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const toN = (v: string) => v ? Number(v) : null
      const blocks = form.blocks.map(b => ({
        title:    b.title    || null,
        scheme:   b.scheme   || null,
        timecap:  b.timecap  || null,
        notes:    b.notes    || null,
        movements: b.movements.filter(m => m.movementName.trim()).map(m => ({
          movementName:   m.movementName.trim(),
          repScheme:      m.repScheme      || null,
          percentage:     toN(m.percentage),
          weightRookieM:  toN(m.weightRookieM),
          weightRookieF:  toN(m.weightRookieF),
          weightScaleM:   toN(m.weightScaleM),
          weightScaleF:   toN(m.weightScaleF),
          weightRxM:      toN(m.weightRxM),
          weightRxF:      toN(m.weightRxF),
          scaledMovement: m.scaledMovement || null,
          notes:          m.notes          || null,
          roundWeights:   m.roundWeights.length > 0
            ? m.roundWeights.map(r => ({
                reps: r.reps,
                rookieM: toN(r.rookieM), rookieF: toN(r.rookieF),
                scaleM:  toN(r.scaleM),  scaleF:  toN(r.scaleF),
                rxM:     toN(r.rxM),     rxF:     toN(r.rxF),
              }))
            : null,
        })),
      }))
      const payload = { classTypeId: cls.classTypeId, title: form.title || null, date: new Date(cls.startsAt).toISOString(), scoreType: form.scoreType, blocks }
      if (wod) { await api.put(`/wods/${wod.id}`, payload) } else { await api.post('/wods', payload) }
      const { data } = await api.get(`/classes/${cls.id}`)
      onSaved(data)
    } catch (err: any) { alert(err?.response?.data?.error || 'Error al guardar WOD') }
    finally { setSaving(false) }
  }

  const deleteWod = async () => {
    if (!wod) return
    setDeleting(true)
    try {
      await api.delete(`/wods/${wod.id}`)
      const { data } = await api.get(`/classes/${cls.id}`)
      onDeleted(data)
    } catch (err: any) { alert(err?.response?.data?.error || 'Error al eliminar WOD') }
    finally { setDeleting(false) }
  }

  const accent = cls.classType.color || 'var(--brand-accent)'
  const filteredBench = benchmarks.filter(b => {
    const catOk = benchCat === 'all' || b.categoria === benchCat
    const searchOk = !benchSearch || b.nombre.toLowerCase().includes(benchSearch.toLowerCase())
    return catOk && searchOk
  })

  const setBlock = (bi: number, field: keyof BlockRow, val: string | MovRow[]) =>
    setForm(f => { const bl = [...f.blocks]; bl[bi] = { ...bl[bi], [field]: val }; return { ...f, blocks: bl } })

  const setMov = (bi: number, mi: number, field: keyof MovRow, val: string | boolean | RoundWeight[]) =>
    setForm(f => {
      const bl = [...f.blocks]
      const mv = [...bl[bi].movements]
      mv[mi] = { ...mv[mi], [field]: val }
      bl[bi] = { ...bl[bi], movements: mv }
      return { ...f, blocks: bl }
    })

  const removeMov = (bi: number, mi: number) =>
    setForm(f => {
      const bl = [...f.blocks]
      bl[bi] = { ...bl[bi], movements: bl[bi].movements.filter((_, i) => i !== mi) }
      return { ...f, blocks: bl }
    })

  const removeBlock = (bi: number) =>
    setForm(f => ({ ...f, blocks: f.blocks.filter((_, i) => i !== bi) }))

  const parseRounds = (scheme: string): number[] => {
    if (!scheme) return []
    const parts = scheme.split('-').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
    return parts.length > 1 ? parts : []
  }
  const toggleRoundWeights = (bi: number, mi: number) => {
    const m = form.blocks[bi].movements[mi]
    if (m.roundWeights.length > 0) {
      setMov(bi, mi, 'roundWeights', [])
    } else {
      const rounds = parseRounds(m.repScheme)
      const rw: RoundWeight[] = rounds.map(r => ({ reps: r, rookieM: '', rookieF: '', scaleM: '', scaleF: '', rxM: '', rxF: '' }))
      setMov(bi, mi, 'roundWeights', rw)
    }
  }
  const setRoundWeight = (bi: number, mi: number, roundIdx: number, field: keyof RoundWeight, val: string) =>
    setForm(f => {
      const bl = [...f.blocks]
      const mv = [...bl[bi].movements]
      const rw = [...mv[mi].roundWeights]
      rw[roundIdx] = { ...rw[roundIdx], [field]: val }
      mv[mi] = { ...mv[mi], roundWeights: rw }
      bl[bi] = { ...bl[bi], movements: mv }
      return { ...f, blocks: bl }
    })

  return (
    <>
      <div className="fixed inset-0 z-[59]" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full flex flex-col rounded-2xl shadow-2xl overflow-hidden modal-animate card"
        style={{ maxWidth: showBench ? 1100 : 820, maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 shrink-0 border-b" style={{ borderColor: 'var(--border-1)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: accent + '22' }}>
            <Dumbbell className="w-5 h-5 shrink-0" style={{ color: accent }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base" style={{ color: 'var(--text-1)' }}>
              {wod ? 'Editar planificación' : 'Nueva planificación'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>
              {cls.classType.name} — {new Date(cls.startsAt).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#f59e0b' }}>
              <span>⚡</span>
              Aplica a todas las clases de {cls.classType.name} de este día
            </p>
          </div>
          <button onClick={() => setShowBench(v => !v)}
            className="btn-brand flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg shrink-0"
            style={showBench ? { opacity: 0.8 } : {}}>
            <Dumbbell className="w-3 h-3" />
            Benchmarks
          </button>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors shrink-0"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Benchmark picker */}
          {showBench && <div className="flex flex-col shrink-0 border-r" style={{ width: 280, borderColor: 'var(--border-1)' }}>
            <div className="px-4 py-3 shrink-0 border-b space-y-2" style={{ borderColor: 'var(--border-1)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>Benchmarks CrossFit</span>
                <div className="flex rounded-lg overflow-hidden border text-xs" style={{ borderColor: 'var(--border-2)' }}>
                  {(['H', 'M'] as const).map(g => (
                    <button key={g} onClick={() => setGender(g)}
                      className="px-2 py-1 font-medium transition-colors"
                      style={gender === g ? { backgroundColor: 'var(--brand-accent)', color: '#fff' } : { color: 'var(--text-3)' }}>
                      {g === 'H' ? '♂' : '♀'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-base)' }}>
                <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-4)' }} />
                <input value={benchSearch} onChange={e => setBenchSearch(e.target.value)}
                  placeholder="Buscar (Fran, Cindy...)"
                  className="flex-1 bg-transparent text-sm outline-none" style={{ color: 'var(--text-1)' }} />
              </div>
              <div className="flex flex-wrap gap-1">
                {BENCH_CATS.map(cat => (
                  <button key={cat} onClick={() => setBenchCat(cat)}
                    className="text-xs px-2 py-0.5 rounded-full font-medium transition-colors"
                    style={benchCat === cat
                      ? { backgroundColor: 'var(--brand-primary)', color: '#fff' }
                      : { backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
                    {CAT_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredBench.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-4)' }}>Sin resultados</p>
              ) : filteredBench.map(b => (
                <div key={b.id} className="px-4 py-2.5 border-b cursor-default"
                  style={{ borderColor: 'var(--border-1)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-base)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{b.nombre}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                          style={{
                            backgroundColor: b.categoria === 'GIRL' ? '#fce7f3' : b.categoria === 'HERO' ? '#dbeafe' : b.categoria === 'OPEN' ? '#fef3c7' : 'var(--surface-hover)',
                            color: b.categoria === 'GIRL' ? '#be185d' : b.categoria === 'HERO' ? '#1d4ed8' : b.categoria === 'OPEN' ? '#92400e' : 'var(--text-3)',
                            fontSize: 10,
                          }}>
                          {CAT_LABELS[b.categoria] || b.categoria}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-4)' }}>
                        {b.formato}{b.duracionMins ? ` · ${b.duracionMins}min` : b.tiempoEstMin ? ` · ~${b.tiempoEstMin}min` : ''}
                      </p>
                      {b.movimientos?.length > 0 && (
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-4)' }}>
                          {b.movimientos.map((m: any) => {
                            const kg = gender === 'H' ? m.cargaRxKgHombre : m.cargaRxKgMujer
                            return kg ? `${m.nombre} ${kg}kg` : m.nombre
                          }).join(', ')}
                        </p>
                      )}
                    </div>
                    <button onClick={() => applyBenchmark(b)}
                      className="shrink-0 text-xs px-2.5 py-1 rounded-lg font-medium mt-0.5 transition-colors"
                      style={{ backgroundColor: 'var(--brand-accent)' + '18', color: 'var(--brand-accent)' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--brand-accent)' + '35')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--brand-accent)' + '18')}>
                      Usar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>}

          {/* WOD form */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 gap-5">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-3)' }}>Título del WOD</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ej. Fran, AMRAP 20, For Time, Día de fuerza..."
                className="input text-sm w-full" />
            </div>

            {/* Score type picker */}
            <div className="card rounded-xl p-4 space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
                Tipo de puntuación
              </label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: 'REPS',   label: 'Reps / Puntos',  icon: '🔢' },
                  { key: 'TIME',   label: 'Tiempo',          icon: '⏱️' },
                  { key: 'WEIGHT', label: 'Peso',            icon: '🏋️' },
                  { key: 'ROUNDS', label: 'Rondas',          icon: '🔄' },
                  { key: 'CUSTOM', label: 'Libre',           icon: '✏️' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, scoreType: opt.key }))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={form.scoreType === opt.key
                      ? { background: 'var(--gradient-btn)', color: '#fff' }
                      : { backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)', border: '1px solid var(--border-1)' }}>
                    <span>{opt.icon}</span> {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bloques */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
                  Bloques
                  <span className="ml-2 font-normal" style={{ color: 'var(--text-4)' }}>
                    {form.blocks.reduce((acc, b) => acc + b.movements.filter(m => m.movementName.trim()).length, 0)} movimientos
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowQuick(v => !v)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                    style={showQuick
                      ? { backgroundColor: 'color-mix(in srgb, var(--brand-accent) 18%, var(--surface-card))', color: 'var(--brand-accent)' }
                      : { backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
                    <Zap className="w-3 h-3" /> Entrada rápida
                  </button>
                  <button onClick={() => setForm(f => ({ ...f, blocks: [...f.blocks, emptyBlock()] }))}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                    style={{ backgroundColor: 'var(--brand-accent)' + '15', color: 'var(--brand-accent)' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--brand-accent)' + '28')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--brand-accent)' + '15')}>
                    <Plus className="w-3 h-3" /> Añadir bloque
                  </button>
                </div>
              </div>

              {/* Parser rápido */}
              {showQuick && (
                <div className="mb-4 rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-base)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>
                    Una línea por movimiento. Se cargará como un bloque. Ejemplos:
                  </p>
                  <p className="text-xs font-mono px-2 py-1 rounded" style={{ color: 'var(--text-4)', backgroundColor: 'var(--surface-hover)', whiteSpace: 'pre' }}>
                    {'Squat Snatch 9-7-5 rookie: 61/43kg scale: 75/55kg rx: 90/66kg — Scaled: Power snatch\nMuscle-up 9-7-5 — Scaled: Jumping muscle-up o pull-up + dip\nBack Squat 5x5\nThruster 21-15-9 61/43kg'}
                  </p>
                  <textarea value={quickText} onChange={e => setQuickText(e.target.value)}
                    placeholder="Pega o escribe aquí los movimientos..."
                    rows={4} className="input text-sm w-full resize-none font-mono" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setShowQuick(false); setQuickText('') }}
                      className="text-xs px-3 py-1.5 rounded-lg border"
                      style={{ borderColor: 'var(--border-2)', color: 'var(--text-3)' }}>
                      Cancelar
                    </button>
                    <button onClick={applyQuickText}
                      className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg font-medium text-white"
                      style={{ backgroundColor: 'var(--brand-accent)' }}>
                      <Zap className="w-3 h-3" /> Parsear y cargar
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {form.blocks.map((block, bi) => (
                  // Sin overflow-hidden aquí: el autocompletado de movimientos es un dropdown
                  // absoluto y un ancestro con overflow-hidden lo recorta pese al z-index.
                  // El redondeo lo aporta el borde del contenedor y, en la cabecera, su propio clip.
                  <div key={bi} className="rounded-xl border"
                    style={{ borderColor: 'var(--border-1)' }}>

                    {/* Cabecera del bloque */}
                    <div className="border-b rounded-t-xl overflow-hidden" style={{ backgroundColor: 'var(--brand-accent)' + '10', borderColor: 'var(--border-1)' }}>
                      <div className="flex items-center gap-2 px-3 py-2">
                        <input value={block.title} onChange={e => setBlock(bi, 'title', e.target.value)}
                          placeholder="A) WOD / B) STRENGTH / Warmup..."
                          className="input text-xs flex-1 font-semibold"
                          style={{ color: 'var(--brand-accent)', backgroundColor: 'transparent', border: 'none', padding: '2px 4px', letterSpacing: '0.02em' }} />
                        {form.blocks.length > 1 && (
                          <button onClick={() => removeBlock(bi)}
                            className="w-6 h-6 flex items-center justify-center rounded shrink-0 transition-colors"
                            style={{ color: 'var(--text-4)' }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.color = '#ef4444' }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-4)' }}>
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 px-3 pb-2">
                        <input value={block.scheme} onChange={e => setBlock(bi, 'scheme', e.target.value)}
                          placeholder="Formato: FOR TIME / EMOM 20 min / CADA 2 MIN × 10 RONDAS..."
                          className="input text-xs flex-1"
                          style={{ backgroundColor: 'transparent', fontWeight: 500 }} />
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs" style={{ color: 'var(--text-4)' }}>⏱</span>
                          <input value={block.timecap} onChange={e => setBlock(bi, 'timecap', e.target.value)}
                            placeholder="Timecap"
                            className="input text-xs w-20"
                            style={{ backgroundColor: 'transparent' }} />
                        </div>
                      </div>
                      <div className="px-3 pb-2">
                        <textarea value={block.notes} onChange={e => setBlock(bi, 'notes', e.target.value)}
                          placeholder="* Instrucciones del coach para este bloque (opcional)..."
                          rows={block.notes ? 2 : 1}
                          className="input text-xs w-full resize-none"
                          style={{ backgroundColor: 'transparent', color: 'var(--text-3)', fontStyle: block.notes ? 'italic' : 'normal' }} />
                      </div>
                    </div>

                    {/* Movimientos del bloque */}
                    <div className="divide-y" style={{ borderColor: 'var(--border-1)' }}>
                      {block.movements.map((m, mi) => {
                        const expanded = expandedMovs.has(`${bi}-${mi}`)
                        const hasWeights = !!(m.weightRxM || m.weightScaleM || m.weightRookieM || m.roundWeights.length)
                        return (
                          <div key={mi} style={{ backgroundColor: 'var(--surface-base)' }}>

                            {/* Fila compacta */}
                            <div className="flex items-center gap-2 px-3 py-2">
                              <div className="flex-1 min-w-0">
                                <MovementPicker
                                  value={m.movementName}
                                  onChange={v => setMov(bi, mi, 'movementName', v)}
                                  extra={gymMovements}
                                />
                              </div>
                              <input value={m.repScheme} onChange={e => setMov(bi, mi, 'repScheme', e.target.value)}
                                placeholder="Reps" className="input text-sm w-24 shrink-0" />
                              <div className="flex items-center gap-1 shrink-0">
                                {m.percentage && (
                                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded tabular-nums"
                                    style={{ backgroundColor: '#818cf820', color: '#6366f1' }}>
                                    @{m.percentage}%
                                  </span>
                                )}
                                {hasWeights && (
                                  <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                                    style={{ backgroundColor: '#f59e0b18', color: '#d97706' }} title="Pesos configurados">⚖</span>
                                )}
                                {m.scaledMovement && (
                                  <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                                    style={{ backgroundColor: '#22c55e18', color: '#16a34a' }} title={`Scaled: ${m.scaledMovement}`}>S</span>
                                )}
                              </div>
                              <button onClick={() => toggleMov(bi, mi)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors shrink-0"
                                title="Editar detalles"
                                style={{ backgroundColor: expanded ? 'var(--brand-accent)' + '18' : 'transparent', color: expanded ? 'var(--brand-accent)' : 'var(--text-4)' }}>
                                <Settings2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => removeMov(bi, mi)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors shrink-0"
                                style={{ color: 'var(--text-4)' }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.color = '#ef4444' }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-4)' }}>
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Panel de detalles expandible */}
                            {expanded && (
                              <div className="px-3 pb-3 space-y-2.5 border-t"
                                style={{ borderColor: 'var(--border-1)', backgroundColor: 'color-mix(in srgb, var(--surface-hover) 60%, transparent)' }}>

                                <div className="flex items-center gap-2 pt-2.5 flex-wrap">
                                  <span className="text-xs font-medium shrink-0" style={{ color: 'var(--text-4)' }}>% RM</span>
                                  <input value={m.percentage} onChange={e => setMov(bi, mi, 'percentage', e.target.value)}
                                    type="number" min="1" max="110" placeholder="—"
                                    className="input text-sm w-16 text-center"
                                    title="% del RM del atleta" />
                                  <button onClick={() => setMov(bi, mi, 'showWeights', !m.showWeights)}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors"
                                    style={m.showWeights
                                      ? { backgroundColor: 'var(--brand-accent)', color: '#fff', borderColor: 'var(--brand-accent)' }
                                      : { backgroundColor: 'transparent', color: 'var(--text-4)', borderColor: 'var(--border-2)' }}>
                                    ⚖ Pesos {m.showWeights ? '▲' : '▼'}
                                  </button>
                                  {parseRounds(m.repScheme).length > 1 && m.showWeights && (
                                    <button onClick={() => toggleRoundWeights(bi, mi)}
                                      className="text-xs px-2 py-1.5 rounded border font-semibold transition-colors"
                                      style={m.roundWeights.length > 0
                                        ? { backgroundColor: 'var(--brand-accent)', color: '#fff', borderColor: 'var(--brand-accent)' }
                                        : { color: 'var(--text-4)', backgroundColor: 'transparent', borderColor: 'var(--border-2)' }}>
                                      Por ronda
                                    </button>
                                  )}
                                  {bi === 0 && mi === 0 && (
                                    <div className="flex rounded-md overflow-hidden border ml-auto" style={{ borderColor: 'var(--border-2)' }}>
                                      {(['kg', 'lbs'] as const).map(u => (
                                        <button key={u} onClick={() => setUnit(u)}
                                          className="text-xs px-2 py-1 font-semibold transition-colors"
                                          style={unit === u
                                            ? { backgroundColor: 'var(--brand-accent)', color: '#fff' }
                                            : { color: 'var(--text-4)', backgroundColor: 'transparent' }}>
                                          {u}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {m.showWeights && (
                                  <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-1)' }}>
                                    {m.roundWeights.length === 0 && (
                                      <>
                                        <div className="grid text-xs font-semibold px-2 py-1"
                                          style={{ gridTemplateColumns: '72px 1fr 1fr', gap: '6px', color: 'var(--text-4)', backgroundColor: 'var(--surface-hover)' }}>
                                          <span />
                                          <span className="text-center">♂ Hombre</span>
                                          <span className="text-center">♀ Mujer</span>
                                        </div>
                                        {([
                                          { label: 'Rookie', bg: '#22c55e18', fg: '#16a34a', mKey: 'weightRookieM', fKey: 'weightRookieF' },
                                          { label: 'Scale',  bg: '#f59e0b18', fg: '#d97706', mKey: 'weightScaleM',  fKey: 'weightScaleF'  },
                                          { label: 'Rx',     bg: '#6366f118', fg: '#4f46e5', mKey: 'weightRxM',     fKey: 'weightRxF'     },
                                        ] as { label: string; bg: string; fg: string; mKey: keyof MovRow; fKey: keyof MovRow }[]).map(row => (
                                          <div key={row.label} className="grid items-center px-2 py-1 border-t"
                                            style={{ gridTemplateColumns: '72px 1fr 1fr', gap: '6px', borderColor: 'var(--border-1)' }}>
                                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded text-center"
                                              style={{ backgroundColor: row.bg, color: row.fg }}>{row.label}</span>
                                            {([row.mKey, row.fKey] as const).map(key => (
                                              <div key={key} className="flex flex-col items-center gap-0.5">
                                                <input value={toDisplay(m[key] as string)}
                                                  type="number" min="0" step={unit === 'kg' ? '0.5' : '1'}
                                                  onChange={e => setMov(bi, mi, key, fromDisplay(e.target.value))}
                                                  placeholder="—" className="input text-sm text-center w-full" />
                                                {m[key] && (
                                                  <span className="text-xs tabular-nums" style={{ color: 'var(--text-4)' }}>
                                                    {altHint(m[key] as string)}
                                                  </span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        ))}
                                      </>
                                    )}
                                    {m.roundWeights.length > 0 && (
                                      <div className="overflow-x-auto">
                                        <div className="grid text-xs font-semibold px-2 py-1"
                                          style={{ gridTemplateColumns: '52px repeat(6, 1fr)', gap: '4px', minWidth: 460, color: 'var(--text-4)', backgroundColor: 'var(--surface-hover)' }}>
                                          <span className="text-center">Ronda</span>
                                          <span className="text-center" style={{ color: '#16a34a' }}>Rk ♂</span>
                                          <span className="text-center" style={{ color: '#16a34a' }}>Rk ♀</span>
                                          <span className="text-center" style={{ color: '#d97706' }}>Sc ♂</span>
                                          <span className="text-center" style={{ color: '#d97706' }}>Sc ♀</span>
                                          <span className="text-center" style={{ color: '#4f46e5' }}>Rx ♂</span>
                                          <span className="text-center" style={{ color: '#4f46e5' }}>Rx ♀</span>
                                        </div>
                                        {m.roundWeights.map((rw, ri) => (
                                          <div key={ri} className="grid items-center px-2 py-1 border-t"
                                            style={{ gridTemplateColumns: '52px repeat(6, 1fr)', gap: '4px', minWidth: 460, borderColor: 'var(--border-1)' }}>
                                            <span className="text-xs font-bold text-center px-1 py-0.5 rounded"
                                              style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-2)' }}>
                                              ×{rw.reps}
                                            </span>
                                            {(['rookieM', 'rookieF', 'scaleM', 'scaleF', 'rxM', 'rxF'] as (keyof RoundWeight)[]).map(field => (
                                              <div key={field} className="flex flex-col items-center gap-0.5">
                                                <input value={toDisplay(rw[field] as string)}
                                                  type="number" min="0" step={unit === 'kg' ? '0.5' : '1'}
                                                  onChange={e => setRoundWeight(bi, mi, ri, field, fromDisplay(e.target.value))}
                                                  placeholder="—" className="input text-xs text-center w-full px-1" />
                                                {(rw[field] as string) && (
                                                  <span className="tabular-nums" style={{ color: 'var(--text-4)', fontSize: '9px' }}>
                                                    {altHint(rw[field] as string)}
                                                  </span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                  <div>
                                    <label className="text-xs mb-1 block" style={{ color: 'var(--text-4)' }}>Escalado / Progresión</label>
                                    <input value={m.scaledMovement} onChange={e => setMov(bi, mi, 'scaledMovement', e.target.value)}
                                      placeholder="Power snatch, Jumping pull-up..." className="input text-xs w-full" style={{ color: 'var(--text-3)' }} />
                                  </div>
                                  <div>
                                    <label className="text-xs mb-1 block" style={{ color: 'var(--text-4)' }}>Notas del coach</label>
                                    <input value={m.notes} onChange={e => setMov(bi, mi, 'notes', e.target.value)}
                                      placeholder="Instrucciones, consejos..." className="input text-xs w-full" style={{ color: 'var(--text-3)' }} />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Añadir movimiento al bloque */}
                    <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border-1)' }}>
                      <button
                        onClick={() => setBlock(bi, 'movements', [...block.movements, emptyMov()])}
                        className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors w-full justify-center border border-dashed"
                        style={{ borderColor: 'var(--border-2)', color: 'var(--text-4)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand-accent)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}>
                        <Plus className="w-3 h-3" /> Añadir movimiento
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--border-1)' }}>
          <div>
            {wod && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)}
                className="text-sm px-4 py-2 rounded-xl border font-medium transition-colors"
                style={{ borderColor: '#fecaca', color: '#ef4444', backgroundColor: '#fef2f2' }}>
                Eliminar WOD
              </button>
            )}
            {wod && confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: 'var(--text-3)' }}>¿Confirmar eliminación?</span>
                <button onClick={() => setConfirmDelete(false)}
                  className="text-sm px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)' }}>
                  Cancelar
                </button>
                <button onClick={deleteWod} disabled={deleting}
                  className="text-sm px-3 py-1.5 rounded-lg font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: '#ef4444' }}>
                  {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose}
              className="text-sm px-5 py-2 rounded-xl border font-medium transition-colors"
              style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving}
              className="btn-brand flex items-center gap-2 px-6 py-2.5 text-sm font-medium disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : wod ? 'Guardar cambios' : 'Crear planificación'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}

/* ─── Class Panel (página dedicada) ─────────────── */
export function ClassPanel({
  classId,
  classIds = [],
  onNavigate,
  onClose,
  onRefresh,
  onDeleted,
}: {
  classId: string
  classIds?: string[]
  onNavigate?: (id: string) => void
  onClose: () => void
  onRefresh: () => void
  onDeleted: () => void
}) {
  const { user: authUser } = useAuthStore()
  const canManage = ['ADMIN', 'COACH'].includes(authUser?.role ?? '')
  const [cls, setCls] = useState<ClassDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [classTypes, setClassTypes] = useState<any[]>([])
  const [coaches, setCoaches] = useState<any[]>([])
  const [editForm, setEditForm] = useState({ classTypeId: '', coachId: '', startTime: '', endTime: '', capacity: 15 })
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [members, setMembers] = useState<any[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [assigning, setAssigning] = useState<string | null>(null)
  const [wodEditMode, setWodEditMode] = useState(false)
  const [attendanceMode, setAttendanceMode] = useState<string>('manual')

  useEffect(() => {
    setLoading(true)
    api.get(`/classes/${classId}`)
      .then(({ data }) => {
        setCls(data)
        const start = new Date(data.startsAt)
        const end = new Date(data.endsAt)
        setEditForm({
          classTypeId: data.classType?.id || '',
          coachId: data.coach?.id || '',
          startTime: `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`,
          endTime: `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`,
          capacity: data.capacity,
        })
      })
      .finally(() => setLoading(false))
    Promise.all([api.get('/class-types'), api.get('/users?role=COACH,ADMIN'), api.get('/gyms/me')])
      .then(([ct, us, gym]) => {
        setClassTypes(ct.data)
        setCoaches(us.data)
        setAttendanceMode(gym.data?.attendanceMode ?? 'manual')
      })
      .catch(() => {})
  }, [classId])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (editMode) setEditMode(false); else onClose() }
      if (e.key === 'ArrowLeft' && prevId && onNavigate) onNavigate(prevId)
      if (e.key === 'ArrowRight' && nextId && onNavigate) onNavigate(nextId)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, editMode])

  const handleSaveEdit = async () => {
    if (!cls) return
    setSaving(true)
    try {
      const baseDate = localDateStr(new Date(cls.startsAt))
      const startsAt = new Date(`${baseDate}T${editForm.startTime}:00`)
      const endsAt = new Date(`${baseDate}T${editForm.endTime}:00`)
      await api.patch(`/classes/${classId}`, {
        classTypeId: editForm.classTypeId || undefined,
        coachId: editForm.coachId || undefined,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        capacity: Number(editForm.capacity),
      })
      const { data } = await api.get(`/classes/${classId}`)
      setCls(data)
      setEditMode(false)
      onRefresh()
    } catch { alert('Error al guardar cambios') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      await api.delete(`/classes/${classId}`)
      onDeleted()
    } catch (err: any) {
      setDeleteError(err?.response?.data?.error || 'Error al eliminar la clase')
    } finally { setDeleting(false) }
  }

  const openAddStudent = async () => {
    setShowAddStudent(true)
    setMemberSearch('')
    if (members.length === 0) {
      try {
        const { data } = await api.get('/users?role=MEMBER')
        setMembers(data)
      } catch { /* ignore */ }
    }
  }

  const assignStudent = async (userId: string) => {
    setAssigning(userId)
    try {
      await api.post('/bookings/assign', { classId, userId })
      const { data } = await api.get(`/classes/${classId}`)
      setCls(data)
      setShowAddStudent(false)
      onRefresh()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Error al añadir al alumno')
    } finally { setAssigning(null) }
  }

  const openWodEditor = () => setWodEditMode(true)

  const markAttendance = async (bookingId: string, attended = true) => {
    setMarking(bookingId)
    try {
      await api.patch(`/bookings/${bookingId}/attend`, { attended })
      const { data } = await api.get(`/classes/${classId}`)
      setCls(data)
      onRefresh()
    } catch { alert(attended ? 'Error al marcar asistencia' : 'Error al desmarcar asistencia') }
    finally { setMarking(null) }
  }

  const removeStudent = async (bookingId: string) => {
    setRemoving(bookingId)
    try {
      await api.delete(`/bookings/${bookingId}/admin`)
      const { data } = await api.get(`/classes/${classId}`)
      setCls(data)
      onRefresh()
    } catch { alert('Error al quitar alumno') }
    finally { setRemoving(null) }
  }

  const accent = cls?.classType.color || 'var(--brand-accent)'
  const confirmed = cls?.bookings.filter(b => b.status === 'CONFIRMED') ?? []
  const attended  = cls?.bookings.filter(b => b.status === 'ATTENDED')  ?? []
  const wod       = cls?.wods?.[0]

  const currentIdx = classIds.indexOf(classId)
  const prevId = currentIdx > 0 ? classIds[currentIdx - 1] : null
  const nextId = currentIdx < classIds.length - 1 ? classIds[currentIdx + 1] : null

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--surface-base)' }}>

      {/* Header de página */}
      <div className="flex items-center gap-3 px-5 py-4 border-b shrink-0"
        style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-card)' }}>

        {/* Botón volver */}
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors shrink-0"
          style={{ borderColor: 'var(--border-2)', color: 'var(--text-3)', backgroundColor: 'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
          <ChevronLeft className="w-4 h-4" />
          Volver
        </button>

        {/* Navegación entre clases */}
        {onNavigate && classIds.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => prevId && onNavigate(prevId)}
              disabled={!prevId}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: 'var(--text-3)', backgroundColor: 'transparent' }}
              onMouseEnter={e => { if (prevId) e.currentTarget.style.backgroundColor = 'var(--surface-hover)' }}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              title="Clase anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => nextId && onNavigate(nextId)}
              disabled={!nextId}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: 'var(--text-3)', backgroundColor: 'transparent' }}
              onMouseEnter={e => { if (nextId) e.currentTarget.style.backgroundColor = 'var(--surface-hover)' }}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              title="Clase siguiente">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Accent icon + título */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: accent + '22' }}>
          <Settings2 className="w-4 h-4" style={{ color: accent }} />
        </div>
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="h-5 w-32 rounded" style={{ backgroundColor: 'var(--surface-hover)' }} />
          ) : (
            <h1 className="font-semibold text-base truncate" style={{ color: 'var(--text-1)' }}>
              {editMode ? 'Editar clase' : cls?.classType.name}
            </h1>
          )}
          {cls && !editMode && (
            <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--text-4)' }}>
              {new Date(cls.startsAt).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          )}
        </div>

        {/* Acciones */}
        {!loading && cls && !editMode && (
          <>
            <button onClick={() => setEditMode(true)} title="Editar clase"
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors shrink-0"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={openWodEditor}
              title={wod ? 'Editar WOD' : 'Añadir WOD'}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors shrink-0"
              style={{ color: wod ? 'var(--brand-accent)' : 'var(--text-3)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              <Dumbbell className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setConfirmDelete(true)} title="Eliminar clase"
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors shrink-0"
              style={{ color: '#ef4444' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fef2f2')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {editMode && (
          <button onClick={() => setEditMode(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors shrink-0"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Contenido principal */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: 'var(--text-4)' }}>Cargando...</p>
        </div>
      ) : editMode && cls ? (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="card rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>Datos de la clase</h3>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Tipo de clase</label>
              <select value={editForm.classTypeId} onChange={e => setEditForm(f => ({ ...f, classTypeId: e.target.value }))}
                className="input text-sm w-full">
                {classTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Coach</label>
              <select value={editForm.coachId} onChange={e => setEditForm(f => ({ ...f, coachId: e.target.value }))}
                className="input text-sm w-full">
                <option value="">Sin asignar</option>
                {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Hora inicio</label>
                <input type="time" value={editForm.startTime}
                  onChange={e => setEditForm(f => ({ ...f, startTime: e.target.value }))}
                  className="input text-sm w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Hora fin</label>
                <input type="time" value={editForm.endTime}
                  onChange={e => setEditForm(f => ({ ...f, endTime: e.target.value }))}
                  className="input text-sm w-full" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Capacidad</label>
              <input type="number" min={1} value={editForm.capacity}
                onChange={e => setEditForm(f => ({ ...f, capacity: Number(e.target.value) }))}
                className="input text-sm w-full" />
            </div>
          </div>
          <button onClick={handleSaveEdit} disabled={saving}
            className="btn-brand w-full py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      ) : cls ? (
        <div className="flex-1 overflow-hidden flex gap-0">

          {/* Columna izquierda: info + WOD */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 border-r" style={{ borderColor: 'var(--border-1)' }}>

            {/* Info + Coach */}
            <div className="card rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-2)' }}>
                <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-4)' }} />
                {fmtTime(cls.startsAt)} – {fmtTime(cls.endsAt)}
              </div>
              <div className="w-px self-stretch shrink-0" style={{ backgroundColor: 'var(--border-1)' }} />
              <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-2)' }}>
                <Users className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-4)' }} />
                {cls.bookings.length}/{cls.capacity}
                {cls.bookings.length >= cls.capacity && (
                  <span className="badge-red ml-1">Llena</span>
                )}
              </div>
              {attended.length > 0 && (
                <>
                  <div className="w-px self-stretch shrink-0" style={{ backgroundColor: 'var(--border-1)' }} />
                  <div className="flex items-center gap-1.5 text-sm text-green-600">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    {attended.length} asistieron
                  </div>
                </>
              )}
              {cls.coach && (
                <>
                  <div className="w-px self-stretch shrink-0 ml-auto" style={{ backgroundColor: 'var(--border-1)' }} />
                  <div className="flex items-center gap-2 shrink-0">
                    {cls.coach.avatarUrl ? (
                      <img src={mediaUrl(cls.coach.avatarUrl)} alt={cls.coach.name}
                        className="w-7 h-7 rounded-full object-cover shrink-0"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement)?.style.setProperty('display', 'flex') }} />
                    ) : null}
                    <div className="w-7 h-7 rounded-full items-center justify-center text-xs font-semibold shrink-0"
                      style={{ backgroundColor: 'var(--brand-accent)25', color: 'var(--brand-accent)', display: cls.coach.avatarUrl ? 'none' : 'flex' }}>
                      {cls.coach.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight" style={{ color: 'var(--text-1)' }}>{cls.coach.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-4)' }}>Coach</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* WOD */}
            {wod ? (
              <div className="card rounded-xl px-4 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-4 h-4" style={{ color: 'var(--brand-accent)' }} />
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                      WOD — {wod.title || 'Sin título'}
                    </h3>
                  </div>
                  <button onClick={openWodEditor}
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                    style={{ color: 'var(--text-4)' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-3">
                  {wod.blocks.map((block) => (
                    <div key={block.id} className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-1)' }}>
                      {(block.title || block.timecap) && (
                        <div className="flex items-center justify-between px-3 py-1.5"
                          style={{ backgroundColor: accent + '15' }}>
                          {block.title && (
                            <span className="text-xs font-bold tracking-wide uppercase" style={{ color: accent }}>
                              {block.title}
                            </span>
                          )}
                          {block.timecap && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto"
                              style={{ backgroundColor: '#f59e0b18', color: '#d97706' }}>
                              ⏱ {block.timecap}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="divide-y" style={{ borderColor: 'var(--border-1)' }}>
                        {block.movements.map((m) => {
                          const hasLevelWeights = m.weightRookieM || m.weightRookieF || m.weightScaleM || m.weightScaleF || m.weightRxM || m.weightRxF
                          const hasRoundWeights = m.roundWeights && m.roundWeights.length > 0
                          const fmt = (v: number | null) => v != null ? `${v}` : '—'
                          const levelRows = [
                            { label: 'Rookie', bg: '#22c55e18', fg: '#16a34a', m: m.weightRookieM, f: m.weightRookieF },
                            { label: 'Scale',  bg: '#f59e0b18', fg: '#d97706', m: m.weightScaleM,  f: m.weightScaleF  },
                            { label: 'Rx',     bg: '#6366f118', fg: '#4f46e5', m: m.weightRxM,     f: m.weightRxF     },
                          ].filter(r => r.m != null || r.f != null)
                          return (
                            <div key={m.id}>
                              <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: 'var(--surface-base)' }}>
                                <div className="w-1.5 h-5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                                <span className="font-semibold text-sm flex-1" style={{ color: 'var(--text-1)' }}>{m.movementName}</span>
                                {(m as any).percentage && (
                                  <span className="text-xs font-bold px-2 py-0.5 rounded"
                                    style={{ backgroundColor: '#6366f118', color: '#6366f1' }}>
                                    {(m as any).percentage}% RM
                                  </span>
                                )}
                                {(m.repScheme || (m.sets && m.reps)) && (
                                  <span className="text-sm font-mono font-bold px-2 py-0.5 rounded"
                                    style={{ backgroundColor: accent + '18', color: accent }}>
                                    {m.repScheme || `${m.sets}×${m.reps}`}
                                  </span>
                                )}
                              </div>
                              {hasLevelWeights && !hasRoundWeights && (
                                <div className="px-3 py-1.5 border-t" style={{ borderColor: 'var(--border-1)' }}>
                                  <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
                                    {levelRows.map(r => (
                                      <div key={r.label} className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded shrink-0"
                                          style={{ backgroundColor: r.bg, color: r.fg }}>{r.label}</span>
                                        <span className="text-xs tabular-nums" style={{ color: 'var(--text-2)' }}>
                                          ♂{fmt(r.m)} / ♀{fmt(r.f)} kg
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {hasRoundWeights && (
                                <div className="border-t overflow-x-auto" style={{ borderColor: 'var(--border-1)' }}>
                                  <table className="w-full text-xs" style={{ minWidth: 400 }}>
                                    <thead>
                                      <tr style={{ backgroundColor: 'var(--surface-hover)' }}>
                                        <th className="px-2 py-1 text-left font-semibold" style={{ color: 'var(--text-4)', width: 52 }}>Ronda</th>
                                        <th className="px-1 py-1 text-center font-semibold" style={{ color: '#16a34a' }}>Rk ♂</th>
                                        <th className="px-1 py-1 text-center font-semibold" style={{ color: '#16a34a' }}>Rk ♀</th>
                                        <th className="px-1 py-1 text-center font-semibold" style={{ color: '#d97706' }}>Sc ♂</th>
                                        <th className="px-1 py-1 text-center font-semibold" style={{ color: '#d97706' }}>Sc ♀</th>
                                        <th className="px-1 py-1 text-center font-semibold" style={{ color: '#4f46e5' }}>Rx ♂</th>
                                        <th className="px-1 py-1 text-center font-semibold" style={{ color: '#4f46e5' }}>Rx ♀</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(m.roundWeights as any[]).map((rw: any, ri: number) => (
                                        <tr key={ri} className="border-t" style={{ borderColor: 'var(--border-1)' }}>
                                          <td className="px-2 py-1.5 font-bold text-center" style={{ color: 'var(--text-2)' }}>×{rw.reps}</td>
                                          {(['rookieM','rookieF','scaleM','scaleF','rxM','rxF'] as const).map(f => (
                                            <td key={f} className="px-1 py-1.5 text-center tabular-nums" style={{ color: rw[f] != null ? 'var(--text-1)' : 'var(--text-4)' }}>
                                              {rw[f] != null ? `${rw[f]}` : '—'}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {(m.scaledMovement || m.notes) && (
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 px-3 py-1.5 border-t text-xs" style={{ borderColor: 'var(--border-1)', color: 'var(--text-4)' }}>
                                  {m.scaledMovement && <span>↓ {m.scaledMovement}</span>}
                                  {m.notes && <span>📝 {m.notes}</span>}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card rounded-xl px-4 py-3">
                <button onClick={openWodEditor}
                  className="flex items-center gap-2 text-sm w-full py-2 px-3 rounded-lg border border-dashed transition-colors"
                  style={{ borderColor: '#f59e0b', color: '#f59e0b', backgroundColor: '#fffbeb' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fef3c7')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fffbeb')}>
                  <Dumbbell className="w-4 h-4 shrink-0" />
                  <span className="font-medium">Sin planificación — añadir WOD</span>
                </button>
              </div>
            )}

          </div>

          {/* Columna derecha: asistentes */}
          <div className="w-96 shrink-0 overflow-y-auto p-4 flex flex-col gap-3">
            <div className="card rounded-xl px-4 py-4 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                  Asistencia
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col text-xs text-right">
                    <span style={{ color: 'var(--text-4)' }}>{confirmed.length} confirmados</span>
                    <span className="text-green-600 font-medium">{attended.length} asistieron</span>
                  </div>
                  <button
                    onClick={openAddStudent}
                    title="Añadir alumno"
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                    style={{ backgroundColor: 'var(--brand-accent)' + '15', color: 'var(--brand-accent)', border: '1px solid ' + 'var(--brand-accent)' + '30' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--brand-accent)' + '25')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--brand-accent)' + '15')}>
                    <UserPlus className="w-3 h-3" /> Añadir
                  </button>
                </div>
              </div>

              {/* Add student search */}
              {showAddStudent && (
                <div className="mb-4 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-1)' }}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-base)' }}>
                    <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-4)' }} />
                    <input
                      autoFocus
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      placeholder="Buscar alumno por nombre o email..."
                      className="flex-1 bg-transparent text-sm outline-none"
                      style={{ color: 'var(--text-1)' }}
                    />
                    <button onClick={() => setShowAddStudent(false)}
                      style={{ color: 'var(--text-4)' }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {members
                      .filter(m => {
                        const q = memberSearch.toLowerCase()
                        return !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
                      })
                      .filter(m => !cls.bookings.some(b => b.user?.email === m.email && b.status !== 'CANCELLED'))
                      .slice(0, 30)
                      .map(m => (
                        <button key={m.id}
                          onClick={() => assignStudent(m.id)}
                          disabled={assigning === m.id}
                          className="flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors disabled:opacity-50"
                          style={{ borderBottom: '1px solid var(--border-1)' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                            style={{ backgroundColor: 'var(--brand-accent)' + '20', color: 'var(--brand-accent)' }}>
                            {m.name[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{m.name}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--text-4)' }}>{m.email}</p>
                          </div>
                          {assigning === m.id
                            ? <span className="text-xs" style={{ color: 'var(--text-4)' }}>...</span>
                            : <Plus className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-accent)' }} />
                          }
                        </button>
                      ))}
                    {members.filter(m => {
                      const q = memberSearch.toLowerCase()
                      return !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
                    }).filter(m => !cls.bookings.some(b => b.user?.email === m.email && b.status !== 'CANCELLED')).length === 0 && (
                      <p className="text-sm text-center py-4" style={{ color: 'var(--text-4)' }}>
                        {memberSearch ? 'Sin resultados' : 'Todos los alumnos ya están en la clase'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {cls.bookings.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Circle className="w-8 h-8" style={{ color: 'var(--text-4)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-3)' }}>Sin reservas aún</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {cls.bookings.map(b => (
                    <div key={b.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                      style={{ backgroundColor: b.status === 'ATTENDED' ? '#dcfce740' : 'transparent' }}>
                      {b.user?.avatarUrl ? (
                        <img src={mediaUrl(b.user.avatarUrl)} alt={b.user.name}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                          onError={e => { const el = e.currentTarget; el.style.display = 'none'; (el.nextElementSibling as HTMLElement)?.style.setProperty('display', 'flex') }} />
                      ) : null}
                      <div className="w-8 h-8 rounded-full items-center justify-center text-xs font-semibold shrink-0"
                        style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-2)', display: b.user?.avatarUrl ? 'none' : 'flex' }}>
                        {b.user?.name?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{b.user?.name}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-4)' }}>{b.user?.email}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {b.status === 'ATTENDED' ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle className="w-3.5 h-3.5" /> Asistió
                            {attendanceMode === 'manual' && (
                              <button
                                onClick={() => markAttendance(b.id, false)}
                                disabled={marking === b.id}
                                title="Quitar asistencia"
                                className="w-5 h-5 flex items-center justify-center rounded transition-colors disabled:opacity-50"
                                style={{ color: 'var(--text-4)' }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.color = '#ef4444' }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-4)' }}>
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ) : b.status === 'CONFIRMED' ? (
                          attendanceMode === 'manual' ? (
                            <button
                              onClick={() => markAttendance(b.id)}
                              disabled={marking === b.id}
                              className="text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50"
                              style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)' }}
                              onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = 'var(--brand-accent)'
                                e.currentTarget.style.color = '#ffffff'
                                e.currentTarget.style.borderColor = 'var(--brand-accent)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = 'transparent'
                                e.currentTarget.style.color = 'var(--text-2)'
                                e.currentTarget.style.borderColor = 'var(--border-2)'
                              }}>
                              {marking === b.id ? '...' : 'Asistencia'}
                            </button>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded" style={{ color: 'var(--text-4)', backgroundColor: 'var(--surface-hover)' }}>
                              Automático
                            </span>
                          )
                        ) : (
                          <span className="badge-red text-xs">Canceló</span>
                        )}
                        {canManage && b.status !== 'CANCELLED' && (
                          <button
                            onClick={() => removeStudent(b.id)}
                            disabled={removing === b.id}
                            title="Quitar alumno de la clase"
                            className="w-6 h-6 flex items-center justify-center rounded-md transition-colors disabled:opacity-50"
                            style={{ color: 'var(--text-4)' }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.color = '#ef4444' }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-4)' }}>
                            {removing === b.id ? '...' : <X className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      ) : null}

      {/* WOD Editor — overlay sobre la página */}
      {wodEditMode && cls && (
        <WodEditorModal
          cls={cls}
          wod={cls.wods?.[0] ?? null}
          onClose={() => setWodEditMode(false)}
          onSaved={(updated) => { setCls(updated); setWodEditMode(false); onRefresh?.() }}
          onDeleted={(updated) => { setCls(updated); setWodEditMode(false); onRefresh?.() }}
        />
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => { setConfirmDelete(false); setDeleteError('') }} />
          <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-sm rounded-2xl shadow-2xl modal-animate pointer-events-auto"
              style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-1)' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'color-mix(in srgb, #ef4444 15%, var(--surface-card))' }}>
                    <Trash2 className="w-4 h-4" style={{ color: '#ef4444' }} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Eliminar clase</p>
                    <p className="text-xs" style={{ color: 'var(--text-4)' }}>Esta acción no se puede deshacer</p>
                  </div>
                </div>
                <button onClick={() => { setConfirmDelete(false); setDeleteError('') }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg"
                  style={{ color: 'var(--text-4)' }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-4">
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                  Se eliminarán también todas las reservas asociadas a esta clase.
                </p>
                {deleteError && (
                  <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, #ef4444 12%, var(--surface-card))', color: '#ef4444' }}>
                    {deleteError}
                  </p>
                )}
                <div className="flex gap-3">
                  <button onClick={() => { setConfirmDelete(false); setDeleteError('') }}
                    className="flex-1 btn-secondary py-2.5 rounded-xl text-sm">
                    Cancelar
                  </button>
                  <button onClick={handleDelete} disabled={deleting}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#ef4444' }}>
                    <Trash2 className="w-4 h-4" />
                    {deleting ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  )
}
