'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../../store/auth.store'
import api from '../../../../lib/api'
import * as XLSX from 'xlsx'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoundWeight {
  reps: number
  rxM: number | null; rxF: number | null
  scaleM: number | null; scaleF: number | null
  rookieM: number | null; rookieF: number | null
}

interface ParsedMovement {
  movementName: string
  repScheme: string | null
  // Flat weights
  weightRxM: number | null;    weightRxF: number | null
  weightScaleM: number | null; weightScaleF: number | null
  weightRookieM: number | null; weightRookieF: number | null
  notes: string | null
  // Per-round weights (null = flat mode)
  roundWeights: RoundWeight[] | null
}

interface ParsedBlock {
  date: string
  classTypeId: string
  classTypeName: string
  wodTitle: string
  blockTitle: string
  timecap: string
  movements: ParsedMovement[]
  valid: boolean
  error?: string
}

interface WodPayload {
  classTypeId: string
  title: string | null
  date: string
  blocks: {
    title: string | null
    timecap: string | null
    movements: ParsedMovement[]
  }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function str(v: any) { return String(v || '').trim() }

/**
 * Parse a weight cell. Returns an array of [H, F] pairs — one per round if multi-round.
 *
 * Formats:
 *   "90/66"          → flat: [[90, 66]]
 *   "90"             → flat: [[90, 90]]
 *   "90-80-70/66-58-52" → per-round: [[90,66],[80,58],[70,52]]
 *   "90-80-70"       → per-round (same H=F): [[90,90],[80,80],[70,70]]
 */
function parseWeightCell(v: any): Array<[number | null, number | null]> {
  const s = str(v).replace(',', '.')
  if (!s) return [[null, null]]

  const slashIdx = s.indexOf('/')
  const hStr = slashIdx >= 0 ? s.slice(0, slashIdx) : s
  const fStr = slashIdx >= 0 ? s.slice(slashIdx + 1) : s

  const hVals = hStr.split('-').map(x => { const n = parseFloat(x.trim()); return isNaN(n) ? null : n })
  const fVals = fStr.split('-').map(x => { const n = parseFloat(x.trim()); return isNaN(n) ? null : n })

  const count = Math.max(hVals.length, fVals.length)
  return Array.from({ length: count }, (_, i) => [
    hVals[i] ?? hVals[0] ?? null,
    fVals[i] ?? fVals[0] ?? null,
  ])
}

/** Parse repScheme "9-7-5" or "21-15-9" → [9,7,5] | [] */
function parseRounds(scheme: string): number[] {
  if (!scheme) return []
  const parts = scheme.split('-').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
  return parts.length > 1 ? parts : []
}

function fmtWeightFlat(m: number | null, f: number | null) {
  if (m == null && f == null) return null
  return m === f ? `${m}kg` : `${m ?? '—'}/${f ?? '—'}kg`
}

function fmtRoundWeights(rws: RoundWeight[]) {
  return rws.map(r => {
    const rx = fmtWeightFlat(r.rxM, r.rxF)
    const sc = fmtWeightFlat(r.scaleM, r.scaleF)
    const rk = fmtWeightFlat(r.rookieM, r.rookieF)
    const parts = [rx && `Rx:${rx}`, sc && `Sc:${sc}`, rk && `Rk:${rk}`].filter(Boolean)
    return `×${r.reps}(${parts.join(' ')})`
  }).join(', ')
}

/**
 * Build a ParsedMovement from raw Excel row fields.
 * Detects per-round mode when any weight column has multiple dash-separated values.
 */
function buildMovement(
  movName: string,
  repScheme: string,
  rxRaw: any, scRaw: any, rkRaw: any,
  notesRaw: any,
): ParsedMovement {
  const rxParsed = parseWeightCell(rxRaw)
  const scParsed = parseWeightCell(scRaw)
  const rkParsed = parseWeightCell(rkRaw)

  const isRoundMode = rxParsed.length > 1 || scParsed.length > 1 || rkParsed.length > 1

  if (isRoundMode) {
    // Use repScheme rounds for reps labels; fall back to indices
    const repsArr = parseRounds(repScheme)
    const numRounds = Math.max(rxParsed.length, scParsed.length, rkParsed.length)

    const roundWeights: RoundWeight[] = Array.from({ length: numRounds }, (_, ri) => {
      // For flat arrays (length 1), broadcast that single value to all rounds
      const rx = rxParsed[ri] ?? rxParsed[0]
      const sc = scParsed[ri] ?? scParsed[0]
      const rk = rkParsed[ri] ?? rkParsed[0]
      return {
        reps: repsArr[ri] ?? ri + 1,
        rxM: rx[0],    rxF: rx[1],
        scaleM: sc[0], scaleF: sc[1],
        rookieM: rk[0], rookieF: rk[1],
      }
    })

    return {
      movementName: movName,
      repScheme: repScheme || null,
      weightRxM: null, weightRxF: null,
      weightScaleM: null, weightScaleF: null,
      weightRookieM: null, weightRookieF: null,
      notes: str(notesRaw) || null,
      roundWeights,
    }
  }

  return {
    movementName: movName,
    repScheme: repScheme || null,
    weightRxM: rxParsed[0][0],    weightRxF: rxParsed[0][1],
    weightScaleM: scParsed[0][0], weightScaleF: scParsed[0][1],
    weightRookieM: rkParsed[0][0], weightRookieF: rkParsed[0][1],
    notes: str(notesRaw) || null,
    roundWeights: null,
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImportWodsPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [classTypes, setClassTypes] = useState<any[]>([])
  const [blocks, setBlocks] = useState<ParsedBlock[]>([])
  const [payloads, setPayloads] = useState<WodPayload[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) return  // el layout redirige a /login
    api.get('/class-types').then(r => setClassTypes(r.data)).catch(() => {})
  }, [user])

  // ─── Template ────────────────────────────────────────────────────────────

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const t1 = classTypes[0]?.name || 'CrossFit'
    const t2 = classTypes[1]?.name || t1
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0]

    const headers = [
      'fecha', 'tipo_clase', 'titulo_wod', 'bloque', 'timecap',
      'movimiento1', 'reps1', 'rx1(H/M)', 'scale1(H/M)', 'rookie1(H/M)', 'notas1',
      'movimiento2', 'reps2', 'rx2(H/M)', 'scale2(H/M)', 'rookie2(H/M)', 'notas2',
      'movimiento3', 'reps3', 'rx3(H/M)', 'scale3(H/M)', 'rookie3(H/M)', 'notas3',
      'movimiento4', 'reps4', 'rx4(H/M)', 'scale4(H/M)', 'rookie4(H/M)', 'notas4',
      'movimiento5', 'reps5', 'rx5(H/M)', 'scale5(H/M)', 'rookie5(H/M)', 'notas5',
    ]

    const data = [
      headers,
      // Bloque 1 — calentamiento sin pesos
      [today, t1, 'Fuerza + Metcon', 'Calentamiento', '10min',
        'Row', '5min', '', '', '', 'Ritmo aeróbico',
        'Muscle Snatch', '3x5', '', '', '', '',
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      // Bloque 2 — fuerza con pesos PLANOS
      [today, t1, '', 'Fuerza', '20min',
        'Back Squat', '5-5-5', '130/90', '100/70', '80/55', 'Pausa 2seg abajo',
        'Romanian Deadlift', '4x8', '80/55', '60/42', '50/35', '',
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      // Bloque 3 — metcon con pesos POR RONDA (formato "rx-rx-rx/rf-rf-rf")
      [today, t1, '', 'Metcon', 'For Time',
        'Squat Snatch', '9-7-5', '90-80-70/66-58-52', '70-62-55/50-44-38', '55-48-42/38-33-28', 'Pesos progresivos por ronda',
        'Thruster', '21-15-9', '43/30', '35/25', '25/15', '',
        'Pull-up', '21-15-9', '', '', '', 'Banded si es necesario',
        '', '', '', '', '', '', '', '', '', '', '', ''],
      // Otro día, otro tipo
      [tomorrow, t2, 'Olímpico', 'Técnica + Metcon', '15min',
        'Power Clean', '3x3', '80/55', '65/45', '50/35', '',
        'Hang Snatch', '5-4-3-2-1', '70-75-80-85-90/50-54-57-61-64', '', '', 'Peso progresivo por ronda',
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ]

    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = headers.map((_, i) => ({ wch: i < 5 ? 16 : 22 }))
    XLSX.utils.book_append_sheet(wb, ws, 'WODs')

    // Tipos de clase
    if (classTypes.length > 0) {
      const refData = [['tipo_clase', 'descripcion', 'id'], ...classTypes.map(ct => [ct.name, ct.description || '', ct.id])]
      const wsRef = XLSX.utils.aoa_to_sheet(refData)
      wsRef['!cols'] = [{ wch: 25 }, { wch: 35 }, { wch: 38 }]
      XLSX.utils.book_append_sheet(wb, wsRef, 'Tipos de clase')
    }

    // Instrucciones
    const instrData = [
      ['INSTRUCCIONES DE LA PLANTILLA'],
      [''],
      ['ESTRUCTURA GENERAL'],
      ['• Cada fila = un BLOQUE de entrenamiento'],
      ['• Misma fecha + tipo_clase en varias filas → se agrupan en UN SOLO WOD con varios bloques'],
      ['• El título del WOD solo se lee de la primera fila del grupo'],
      [''],
      ['COLUMNAS OBLIGATORIAS'],
      ['• fecha        → formato YYYY-MM-DD  (ej: 2026-05-12)'],
      ['• tipo_clase   → nombre exacto del tipo (ver hoja "Tipos de clase")'],
      ['• movimiento1  → al menos un movimiento por bloque'],
      [''],
      ['COLUMNAS OPCIONALES'],
      ['• titulo_wod   → nombre del WOD (solo en la primera fila del grupo)'],
      ['• bloque       → nombre del bloque (Calentamiento, Fuerza, Metcon, EMOM…)'],
      ['• timecap      → tiempo del bloque (AMRAP 15, For Time, EMOM 20…)'],
      [''],
      ['PESOS — dos formatos posibles:'],
      [''],
      ['  1) PESO PLANO — igual en todas las rondas'],
      ['     Formato: "H/M"  →  "90/66"  (hombre 90kg / mujer 66kg)'],
      ['     Si H y M son iguales: solo escribe el número  →  "20"'],
      [''],
      ['  2) PESO POR RONDA — distinto en cada ronda (ej: "9-7-5")'],
      ['     Formato: "H1-H2-H3/F1-F2-F3"  →  "90-80-70/66-58-52"'],
      ['     Ronda 1: 90/66kg,  Ronda 2: 80/58kg,  Ronda 3: 70/52kg'],
      ['     Si H y F son iguales en todas las rondas: "90-80-70"'],
      ['     Si un nivel es plano y otro por ronda, el plano se aplica a todas las rondas'],
      [''],
      ['EJEMPLO con Squat Snatch 9-7-5:'],
      ['     rx1(H/M): 90-80-70/66-58-52   → pesos distintos por ronda'],
      ['     scale1(H/M): 70/50            → mismo peso todas las rondas'],
      ['     rookie1(H/M): 50/35           → mismo peso todas las rondas'],
      [''],
      ['ESQUEMA DE REPS (reps1, reps2…)'],
      ['• Texto libre: "21-15-9",  "5x5",  "AMRAP",  "3x3",  "Max reps",  "5min"'],
      ['• Para pesos por ronda, el esquema debe tener el mismo número de valores'],
      ['  que los pesos: "9-7-5" → 3 rondas → pesos en grupos de 3'],
      [''],
      ['MOVIMIENTOS'],
      ['• Hasta 5 movimientos por bloque (mov1 … mov5)'],
      ['• Si necesitas más de 5, divide en sub-bloques en filas separadas'],
    ]
    const wsInstr = XLSX.utils.aoa_to_sheet(instrData)
    wsInstr['!cols'] = [{ wch: 75 }]
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones')

    XLSX.writeFile(wb, 'plantilla_wods.xlsx')
  }

  // ─── File parsing ────────────────────────────────────────────────────────

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setResult(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const raw = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(raw, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1 })

        const parsed: ParsedBlock[] = []

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          // Solo se saltea una fila genuinamente vacía (ej. espaciadora al final del
          // Excel) — si tiene CUALQUIER dato pero le falta la fecha, debe seguir y
          // marcarse "Sin fecha" más abajo, no desaparecer sin avisar.
          if (!row || row.every((c: any) => !str(c))) continue

          const date      = str(row[0])
          const tipoCls   = str(row[1]).toLowerCase()
          const wodTitle  = str(row[2])
          const blockTitle = str(row[3])
          const timecap   = str(row[4])

          const ct = classTypes.find(c => {
            const n = (c.name || '').toLowerCase()
            return n === tipoCls || n.includes(tipoCls) || tipoCls.includes(n)
          })

          const movements: ParsedMovement[] = []
          for (let m = 0; m < 5; m++) {
            const base = 5 + m * 6
            const movName = str(row[base])
            if (!movName) break
            movements.push(buildMovement(
              movName,
              str(row[base + 1]),
              row[base + 2], row[base + 3], row[base + 4],
              row[base + 5],
            ))
          }

          const valid = !!ct && !!date && movements.length > 0
          const errorMsg = !date ? 'Sin fecha'
            : !ct ? `Tipo no encontrado: "${tipoCls}"`
            : movements.length === 0 ? 'Sin movimientos'
            : undefined

          parsed.push({ date, classTypeId: ct?.id || '', classTypeName: ct?.name || tipoCls, wodTitle, blockTitle, timecap, movements, valid, error: errorMsg })
        }

        // Group into WOD payloads by date+classTypeId
        const wodMap = new Map<string, WodPayload>()
        parsed.forEach(b => {
          if (!b.valid) return
          const key = `${b.classTypeId}|${b.date}`
          if (!wodMap.has(key)) {
            wodMap.set(key, { classTypeId: b.classTypeId, title: b.wodTitle || null, date: b.date, blocks: [] })
          }
          const wod = wodMap.get(key)!
          if (!wod.title && b.wodTitle) wod.title = b.wodTitle
          wod.blocks.push({ title: b.blockTitle || null, timecap: b.timecap || null, movements: b.movements })
        })

        setBlocks(parsed)
        setPayloads(Array.from(wodMap.values()))
      } catch {
        setError('Error al leer el archivo. Usa la plantilla descargada.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // ─── Import ──────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (payloads.length === 0) { setError('No hay planificaciones válidas'); return }
    setImporting(true); setError('')
    try {
      const { data } = await api.post('/wods/import', payloads)
      setResult(data)
      setBlocks([])
      setPayloads([])
      if (fileRef.current) fileRef.current.value = ''
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al importar')
    } finally { setImporting(false) }
  }

  const validCount   = blocks.filter(b => b.valid).length
  const invalidCount = blocks.filter(b => !b.valid).length

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.push('/dashboard/classes')}
          className="text-sm transition-colors" style={{ color: 'var(--text-4)' }}>
          ← Clases
        </button>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
          Importar planificaciones por Excel
        </h1>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border px-4 py-3 mb-6 text-sm flex items-start gap-2"
        style={{ borderColor: '#6366f130', backgroundColor: '#6366f108', color: 'var(--text-3)' }}>
        <span style={{ color: '#6366f1', flexShrink: 0, marginTop: 1 }}>⚡</span>
        <div className="space-y-0.5">
          <span>Una planificación aplica a <strong>todas las clases del mismo tipo ese día</strong>. Cada fila = un bloque. Misma fecha + tipo → mismo WOD.</span>
          <div className="flex flex-wrap gap-4 mt-1 text-xs" style={{ color: 'var(--text-4)' }}>
            <span>Peso plano: <code className="px-1 rounded" style={{ backgroundColor: 'var(--surface-hover)' }}>90/66</code></span>
            <span>Peso por ronda: <code className="px-1 rounded" style={{ backgroundColor: 'var(--surface-hover)' }}>90-80-70/66-58-52</code></span>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border px-4 py-3 text-sm mb-6"
          style={{ borderColor: '#ef444440', backgroundColor: '#ef444410', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border px-4 py-4 mb-6"
          style={{ borderColor: '#22c55e40', backgroundColor: '#22c55e10', color: '#22c55e' }}>
          <p className="font-semibold">Importación completada</p>
          <p className="text-sm mt-1">{result.created} WODs importados correctamente</p>
          {result.errors?.length > 0 && (
            <ul className="text-sm mt-2 space-y-0.5" style={{ color: '#f59e0b' }}>
              {result.errors.map((e: string, i: number) => <li key={i}>⚠ {e}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Steps */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center text-white"
              style={{ backgroundColor: 'var(--brand-accent)' }}>1</span>
            <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Descarga la plantilla</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-4)' }}>
            Incluye tus tipos de clase, ejemplos con pesos por ronda e instrucciones detalladas.
          </p>
          <button onClick={downloadTemplate}
            className="text-sm px-4 py-2 rounded-lg border transition-colors"
            style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            ⬇ Descargar plantilla .xlsx
          </button>
        </div>
        <div className="card rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center text-white"
              style={{ backgroundColor: 'var(--brand-accent)' }}>2</span>
            <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Sube el archivo completado</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-4)' }}>
            Previsualiza los datos antes de importar para detectar errores.
          </p>
          <button onClick={() => fileRef.current?.click()}
            className="btn-brand text-sm px-4 py-2">
            Seleccionar archivo
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {/* Column reference */}
      <div className="card rounded-xl p-4 mb-6 overflow-x-auto">
        <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-3)' }}>Estructura de columnas</h3>
        <table className="text-xs w-full" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              {[
                { label: 'fecha', note: 'YYYY-MM-DD', req: true },
                { label: 'tipo_clase', note: 'nombre exacto', req: true },
                { label: 'titulo_wod', note: 'primera fila del grupo', req: false },
                { label: 'bloque', note: 'Calentamiento, Metcon…', req: false },
                { label: 'timecap', note: 'AMRAP 15, For Time…', req: false },
                { label: 'movimiento1', note: 'requerido', req: true },
                { label: 'reps1', note: '21-15-9, 5x5…', req: false },
                { label: 'rx1(H/M)', note: '90/66 ó 90-80-70/66-58-52', req: false },
                { label: 'scale1(H/M)', note: 'igual formato', req: false },
                { label: 'rookie1(H/M)', note: 'igual formato', req: false },
                { label: 'notas1', note: '', req: false },
                { label: 'movimiento2…', note: 'misma estructura ×5', req: false },
              ].map(col => (
                <th key={col.label} className="text-left px-2 py-1.5 font-semibold whitespace-nowrap"
                  style={{
                    backgroundColor: col.req ? 'var(--brand-accent)' + '18' : 'var(--surface-hover)',
                    color: col.req ? 'var(--brand-accent)' : 'var(--text-4)',
                    borderBottom: '1px solid var(--border-1)',
                    fontSize: 11,
                  }}>
                  {col.label}
                  {col.note && <div className="font-normal mt-0.5" style={{ color: 'var(--text-4)', opacity: 0.75, fontSize: 10 }}>{col.note}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ color: 'var(--text-3)', fontSize: 11 }}>
              {['2026-05-12', 'CrossFit', 'Fuerza+Metcon', 'Fuerza', '20min',
                'Back Squat', '5-5-5', '130/90', '100/70', '80/55', 'Pausa 2seg', '…'].map((v, i) => (
                <td key={i} className="px-2 py-1.5 font-mono"
                  style={{ borderBottom: '1px solid var(--border-1)' }}>{v}</td>
              ))}
            </tr>
            <tr style={{ color: 'var(--text-3)', fontSize: 11 }}>
              {['2026-05-12', 'CrossFit', '', 'Metcon', 'For Time',
                'Squat Snatch', '9-7-5', '90-80-70/66-58-52', '70-62-55/50-44-38', '55-48-42/38-33-28', 'Por ronda', '…'].map((v, i) => (
                <td key={i} className="px-2 py-1.5 font-mono"
                  style={{ color: i === 7 || i === 8 || i === 9 ? 'var(--brand-accent)' : undefined }}>
                  {v || <span style={{ opacity: 0.4 }}>—</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className="text-xs mt-2" style={{ color: 'var(--text-4)' }}>
          Las dos filas tienen la misma fecha y tipo → un solo WOD con 2 bloques.
          En el 2° bloque, Squat Snatch tiene pesos distintos por ronda (<span style={{ color: 'var(--brand-accent)' }}>en azul</span>).
        </p>
      </div>

      {/* Preview */}
      {blocks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>
                Vista previa — {blocks.length} bloques → {payloads.length} WODs
              </h2>
              {validCount > 0 && (
                <span className="text-xs px-2 py-1 rounded-full font-medium"
                  style={{ backgroundColor: '#22c55e18', color: '#16a34a' }}>
                  {validCount} bloques OK
                </span>
              )}
              {invalidCount > 0 && (
                <span className="text-xs px-2 py-1 rounded-full font-medium"
                  style={{ backgroundColor: '#ef444418', color: '#ef4444' }}>
                  {invalidCount} con error
                </span>
              )}
            </div>
            <button onClick={handleImport} disabled={importing || payloads.length === 0}
              className="btn-brand text-sm px-6 py-2 font-medium disabled:opacity-50">
              {importing ? 'Importando…' : `Importar ${payloads.length} WODs`}
            </button>
          </div>

          {/* Detail table */}
          <div className="card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-hover)' }}>
                    {['Fecha', 'Tipo', 'WOD', 'Bloque', 'Timecap', 'Movimientos y pesos', 'Estado'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--text-4)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((b, bi) => (
                    <tr key={bi} className="border-b last:border-0"
                      style={{ borderColor: 'var(--border-1)', opacity: b.valid ? 1 : 0.55 }}>
                      <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-4)' }}>{b.date}</td>
                      <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-2)' }}>{b.classTypeName}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-3)' }}>{b.wodTitle || <span style={{ color: 'var(--text-4)' }}>—</span>}</td>
                      <td className="px-3 py-2 font-semibold" style={{ color: 'var(--brand-accent)' }}>
                        {b.blockTitle || <span style={{ color: 'var(--text-4)', fontWeight: 'normal' }}>Sin nombre</span>}
                      </td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-4)' }}>{b.timecap || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          {b.movements.map((m, mi) => {
                            const hasRounds = m.roundWeights && m.roundWeights.length > 0
                            const hasFlat   = !hasRounds && (m.weightRxM != null || m.weightScaleM != null || m.weightRookieM != null)
                            return (
                              <div key={mi}>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold" style={{ color: 'var(--text-2)' }}>{m.movementName}</span>
                                  {m.repScheme && (
                                    <span className="px-1.5 py-0.5 rounded font-mono font-semibold"
                                      style={{ backgroundColor: 'var(--brand-accent)' + '18', color: 'var(--brand-accent)' }}>
                                      {m.repScheme}
                                    </span>
                                  )}
                                  {hasRounds && (
                                    <span className="px-1.5 py-0.5 rounded text-xs font-medium"
                                      style={{ backgroundColor: '#f59e0b18', color: '#d97706' }}>
                                      por ronda
                                    </span>
                                  )}
                                </div>
                                {/* Flat weights */}
                                {hasFlat && (
                                  <div className="flex gap-1.5 mt-0.5 flex-wrap">
                                    {[
                                      { label: 'Rx', m: m.weightRxM, f: m.weightRxF, color: '#4f46e5' },
                                      { label: 'Sc', m: m.weightScaleM, f: m.weightScaleF, color: '#d97706' },
                                      { label: 'Rk', m: m.weightRookieM, f: m.weightRookieF, color: '#16a34a' },
                                    ].filter(r => r.m != null || r.f != null).map(r => (
                                      <span key={r.label} className="px-1.5 py-0.5 rounded"
                                        style={{ backgroundColor: r.color + '15', color: r.color, fontSize: 10 }}>
                                        {r.label}: {fmtWeightFlat(r.m, r.f)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {/* Per-round weights */}
                                {hasRounds && (
                                  <div className="mt-0.5 flex gap-1 flex-wrap">
                                    {m.roundWeights!.map((rw, ri) => {
                                      const parts = [
                                        rw.rxM != null ? `Rx:${fmtWeightFlat(rw.rxM, rw.rxF)}` : null,
                                        rw.scaleM != null ? `Sc:${fmtWeightFlat(rw.scaleM, rw.scaleF)}` : null,
                                        rw.rookieM != null ? `Rk:${fmtWeightFlat(rw.rookieM, rw.rookieF)}` : null,
                                      ].filter(Boolean)
                                      return (
                                        <span key={ri} className="px-1.5 py-0.5 rounded"
                                          style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)', fontSize: 10 }}>
                                          ×{rw.reps}: {parts.join(' ')}
                                        </span>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {b.valid
                          ? <span className="px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: '#22c55e18', color: '#16a34a' }}>OK</span>
                          : <span className="px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: '#ef444418', color: '#ef4444' }}>
                              {b.error}
                            </span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* WOD summary */}
          <div className="card rounded-xl p-4">
            <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-3)' }}>
              Resumen — {payloads.length} WODs a crear
            </h3>
            <div className="space-y-2">
              {payloads.map((w, i) => {
                const ct = classTypes.find(c => c.id === w.classTypeId)
                const totalMovs = w.blocks.reduce((a, b) => a + b.movements.length, 0)
                const hasWeights = w.blocks.some(b => b.movements.some(m =>
                  m.weightRxM != null || m.roundWeights?.length
                ))
                const hasRoundWeights = w.blocks.some(b => b.movements.some(m => m.roundWeights?.length))
                return (
                  <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0 flex-wrap"
                    style={{ borderColor: 'var(--border-1)' }}>
                    <span className="font-mono text-xs px-2 py-0.5 rounded"
                      style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-4)' }}>
                      {w.date}
                    </span>
                    <span className="font-semibold text-sm" style={{ color: ct?.color || 'var(--brand-accent)' }}>
                      {ct?.name}
                    </span>
                    {w.title && <span className="text-sm" style={{ color: 'var(--text-2)' }}>&ldquo;{w.title}&rdquo;</span>}
                    <div className="flex items-center gap-2 ml-auto flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-4)' }}>
                        {w.blocks.length} bloque{w.blocks.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-4)' }}>
                        {totalMovs} mov.
                      </span>
                      {hasWeights && !hasRoundWeights && (
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#6366f118', color: '#6366f1' }}>⚖ pesos</span>
                      )}
                      {hasRoundWeights && (
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#f59e0b18', color: '#d97706' }}>⚖ por ronda</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
