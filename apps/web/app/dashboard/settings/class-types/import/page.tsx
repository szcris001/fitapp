'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../../../store/auth.store'
import api from '../../../../../lib/api'
import * as XLSX from 'xlsx'
import { Upload, Download, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedBlock {
  nombre: string
  duracionMins: number
  notas: string
  esOpcional: boolean
}

interface ParsedClassType {
  nombre: string
  disciplina: string
  color: string
  descripcion: string
  blocks: ParsedBlock[]
  valid: boolean
  errors: string[]
}

const DISCIPLINES = ['crossfit', 'weightlifting', 'endurance', 'hyrox', 'gymnastics', 'manual']

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ImportClassTypesPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<ParsedClassType[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null)
  const [error, setError] = useState('')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) router.push('/login')
  }, [user])

  // ── Plantilla ──────────────────────────────────────────────────────────────

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()

    // Sheet 1: datos principales
    const data = [
      ['tipo_clase', 'disciplina', 'color', 'descripcion', 'bloque_nombre', 'bloque_duracion_mins', 'bloque_notas', 'bloque_opcional'],
      // CrossFit — 5 bloques
      ['CrossFit', 'crossfit', '#6366f1', 'Clase de CrossFit completa', 'Entrada en calor', 10, 'Dinámico y específico', 'No'],
      ['CrossFit', 'crossfit', '#6366f1', '', 'Fuerza / Técnica', 20, 'Back Squat, DL, OHS...', 'No'],
      ['CrossFit', 'crossfit', '#6366f1', '', 'Explicación WOD', 5, 'Demo de movimientos', 'No'],
      ['CrossFit', 'crossfit', '#6366f1', '', 'Metcon', 15, 'Para tiempo o AMRAP', 'No'],
      ['CrossFit', 'crossfit', '#6366f1', '', 'Enfriamiento', 5, 'Stretching y movilidad', 'Sí'],
      // Halterofilía — 4 bloques
      ['Halterofilía', 'weightlifting', '#f59e0b', 'Entrenamiento olímpico', 'Activación y movilidad', 10, '', 'No'],
      ['Halterofilía', 'weightlifting', '#f59e0b', '', 'Técnica', 15, 'Snatch o Clean & Jerk', 'No'],
      ['Halterofilía', 'weightlifting', '#f59e0b', '', 'Fuerza principal', 25, 'Squat o Deadlift', 'No'],
      ['Halterofilía', 'weightlifting', '#f59e0b', '', 'Accesorio', 10, 'Core, espalda...', 'Sí'],
      // Endurance — 3 bloques
      ['Endurance', 'endurance', '#10b981', 'Entrenamiento aeróbico', 'Warm-up', 10, '', 'No'],
      ['Endurance', 'endurance', '#10b981', '', 'Trabajo principal', 35, 'Intervalos o steady state', 'No'],
      ['Endurance', 'endurance', '#10b981', '', 'Cool-down', 5, '', 'Sí'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [
      { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 28 },
      { wch: 22 }, { wch: 22 }, { wch: 28 }, { wch: 16 },
    ]
    // Congelar fila de encabezados
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }
    XLSX.utils.book_append_sheet(wb, ws, 'Tipos de clase')

    // Sheet 2: referencia de disciplinas
    const discData = [
      ['disciplina', 'descripción'],
      ['crossfit', 'CrossFit / Functional fitness'],
      ['weightlifting', 'Halterofilía olímpica'],
      ['endurance', 'Running, remo, bike, triatlón'],
      ['hyrox', 'HYROX'],
      ['gymnastics', 'Gimnasia / Calistenia'],
      ['manual', 'Sin bloques predefinidos (libre)'],
    ]
    const wsDisc = XLSX.utils.aoa_to_sheet(discData)
    wsDisc['!cols'] = [{ wch: 18 }, { wch: 35 }]
    XLSX.utils.book_append_sheet(wb, wsDisc, 'Disciplinas')

    // Sheet 3: instrucciones
    const instrData = [
      ['INSTRUCCIONES'],
      [''],
      ['1. Cada fila representa UN BLOQUE de un tipo de clase.'],
      ['2. Para un tipo de clase con múltiples bloques, repite el nombre en la columna "tipo_clase".'],
      ['3. La "descripcion" solo se necesita en la primera fila del tipo de clase.'],
      ['4. El "color" solo se necesita en la primera fila del tipo de clase.'],
      ['5. Si un tipo de clase ya existe (mismo nombre), se actualizará con los nuevos bloques.'],
      ['6. "bloque_opcional" acepta: Sí / No / true / false / 1 / 0'],
      ['7. Si no quieres bloques, deja las columnas de bloque vacías (solo rellena las 4 primeras).'],
    ]
    const wsInstr = XLSX.utils.aoa_to_sheet(instrData)
    wsInstr['!cols'] = [{ wch: 70 }]
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones')

    XLSX.writeFile(wb, 'plantilla_tipos_de_clase.xlsx')
  }

  // ── Parsing ────────────────────────────────────────────────────────────────

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setResult(null)
    setExpandedIdx(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1 })

        const typeMap = new Map<string, ParsedClassType>()

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (!row || !row[0]) continue

          const nombre = String(row[0] || '').trim()
          const disciplina = String(row[1] || '').trim().toLowerCase()
          const color = String(row[2] || '').trim() || '#6366f1'
          const descripcion = String(row[3] || '').trim()

          const bloqueNombre = String(row[4] || '').trim()
          const bloqueDuracion = row[5] ? Number(row[5]) : 0
          const bloqueNotas = String(row[6] || '').trim()
          const bloqueOpcionalRaw = String(row[7] || '').trim().toLowerCase()
          const bloqueOpcional = ['sí', 'si', 'true', '1'].includes(bloqueOpcionalRaw)

          if (!typeMap.has(nombre)) {
            typeMap.set(nombre, {
              nombre,
              disciplina: disciplina || 'manual',
              color,
              descripcion,
              blocks: [],
              valid: true,
              errors: [],
            })
          }

          const ct = typeMap.get(nombre)!

          // Completar descripcion/color desde la primera fila que los tenga
          if (descripcion && !ct.descripcion) ct.descripcion = descripcion
          if (color && color !== '#6366f1' && ct.color === '#6366f1') ct.color = color

          // Validaciones
          if (!DISCIPLINES.includes(ct.disciplina)) {
            if (!ct.errors.includes(`Disciplina "${ct.disciplina}" no válida`))
              ct.errors.push(`Disciplina "${ct.disciplina}" no válida`)
            ct.valid = false
          }
          if (!/^#[0-9a-f]{6}$/i.test(ct.color)) {
            if (!ct.errors.includes('Color inválido (usa formato #rrggbb)'))
              ct.errors.push('Color inválido (usa formato #rrggbb)')
            ct.valid = false
          }

          // Agregar bloque si tiene nombre
          if (bloqueNombre) {
            if (bloqueDuracion <= 0) {
              ct.errors.push(`Bloque "${bloqueNombre}": duración debe ser > 0`)
              ct.valid = false
            } else {
              ct.blocks.push({
                nombre: bloqueNombre,
                duracionMins: bloqueDuracion,
                notas: bloqueNotas,
                esOpcional: bloqueOpcional,
              })
            }
          }
        }

        setPreview(Array.from(typeMap.values()))
      } catch {
        setError('Error al leer el archivo. Usa la plantilla proporcionada.')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    const valid = preview.filter(ct => ct.valid)
    if (!valid.length) { setError('No hay tipos de clase válidos para importar'); return }

    setImporting(true)
    setError('')
    let created = 0
    let updated = 0
    const errors: string[] = []

    // Cargar tipos existentes para detectar si actualizar o crear
    const { data: existing } = await api.get('/class-types').catch(() => ({ data: [] }))
    const existingNames = new Map<string, string>(existing.map((ct: any) => [ct.name.toLowerCase(), ct.id]))

    for (const ct of valid) {
      try {
        const payload = {
          name: ct.nombre,
          discipline: ct.disciplina,
          color: ct.color,
          description: ct.descripcion || undefined,
          blocks: ct.blocks.map((b, i) => ({
            name: b.nombre,
            durationMins: b.duracionMins,
            notes: b.notas || undefined,
            isOptional: b.esOpcional,
            order: i,
          })),
        }
        const existingId = existingNames.get(ct.nombre.toLowerCase())
        if (existingId) {
          await api.put(`/class-types/${existingId}`, payload)
          updated++
        } else {
          await api.post('/class-types', payload)
          created++
        }
      } catch (err: any) {
        errors.push(`"${ct.nombre}": ${err.response?.data?.error || 'Error al guardar'}`)
      }
    }

    setResult({ created, updated, errors })
    setPreview([])
    setImporting(false)
  }

  const validCount = preview.filter(ct => ct.valid).length
  const invalidCount = preview.filter(ct => !ct.valid).length

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/dashboard/settings/class-types')}
          className="text-sm" style={{ color: 'var(--text-4)' }}>
          ← Tipos de clase
        </button>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
          Importar tipos de clase
        </h1>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm border flex items-center gap-2"
          style={{ backgroundColor: 'color-mix(in srgb, #ef4444 8%, transparent)', borderColor: '#ef444440', color: '#fca5a5' }}>
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card rounded-xl p-5 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="font-semibold" style={{ color: 'var(--text-1)' }}>Importación completada</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            {result.created > 0 && `${result.created} tipos creados`}
            {result.created > 0 && result.updated > 0 && ' · '}
            {result.updated > 0 && `${result.updated} tipos actualizados`}
          </p>
          {result.errors.length > 0 && (
            <ul className="space-y-1 mt-2">
              {result.errors.map((e, i) => (
                <li key={i} className="text-sm flex items-start gap-2" style={{ color: '#fbbf24' }}>
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => router.push('/dashboard/settings/class-types')}
            className="btn-brand text-sm px-4 py-2 mt-2">
            Ver tipos de clase →
          </button>
        </div>
      )}

      {/* Steps */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4" style={{ color: 'var(--brand)' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Paso 1 — Plantilla</h2>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Descarga la plantilla con ejemplos de CrossFit, Halterofilía y Endurance, incluyendo sus bloques. Cada fila es un bloque de un tipo de clase.
          </p>
          <button onClick={downloadTemplate}
            className="w-full py-2 text-sm rounded-lg border transition-colors"
            style={{ borderColor: 'var(--border-1)', color: 'var(--text-2)' }}>
            Descargar plantilla .xlsx
          </button>
        </div>
        <div className="card rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4" style={{ color: 'var(--brand)' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Paso 2 — Subir archivo</h2>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Completa la plantilla y súbela. Los tipos existentes (mismo nombre) se actualizarán con los nuevos bloques.
          </p>
          <button onClick={() => fileRef.current?.click()}
            className="btn-brand w-full py-2 text-sm">
            Seleccionar archivo
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>
                Vista previa — {preview.length} tipo{preview.length !== 1 ? 's' : ''}
              </h2>
              {validCount > 0 && (
                <span className="text-xs px-2 py-1 rounded-full font-medium"
                  style={{ backgroundColor: '#22c55e20', color: '#4ade80' }}>
                  {validCount} válido{validCount !== 1 ? 's' : ''}
                </span>
              )}
              {invalidCount > 0 && (
                <span className="text-xs px-2 py-1 rounded-full font-medium"
                  style={{ backgroundColor: '#ef444420', color: '#fca5a5' }}>
                  {invalidCount} con error
                </span>
              )}
            </div>
            <button onClick={handleImport} disabled={importing || validCount === 0}
              className="btn-brand px-6 py-2 text-sm disabled:opacity-50 font-medium">
              {importing ? 'Importando...' : `Importar ${validCount} tipo${validCount !== 1 ? 's' : ''}`}
            </button>
          </div>

          <div className="space-y-3">
            {preview.map((ct, idx) => (
              <div key={idx} className="card rounded-xl overflow-hidden border"
                style={{ borderColor: ct.valid ? 'var(--border-1)' : '#ef444440' }}>
                {/* Header row */}
                <button
                  className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors"
                  style={{ backgroundColor: 'var(--surface-hover)' }}
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                >
                  <span className="w-5 h-5 rounded-full shrink-0"
                    style={{ backgroundColor: ct.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{ct.nombre}</span>
                      <span className="text-xs px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: 'var(--surface-card)', color: 'var(--text-3)' }}>
                        {ct.disciplina}
                      </span>
                      {ct.blocks.length > 0 && (
                        <span className="text-xs" style={{ color: 'var(--text-4)' }}>
                          {ct.blocks.length} bloque{ct.blocks.length !== 1 ? 's' : ''} · {ct.blocks.reduce((s, b) => s + b.duracionMins, 0)} min total
                        </span>
                      )}
                    </div>
                    {ct.errors.length > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: '#fca5a5' }}>
                        {ct.errors.join(' · ')}
                      </p>
                    )}
                  </div>
                  {ct.valid
                    ? <CheckCircle className="w-4 h-4 shrink-0 text-green-400" />
                    : <XCircle className="w-4 h-4 shrink-0" style={{ color: '#fca5a5' }} />}
                </button>

                {/* Blocks detail */}
                {expandedIdx === idx && ct.blocks.length > 0 && (
                  <div className="px-5 pb-4 pt-2 space-y-2 border-t" style={{ borderColor: 'var(--border-1)' }}>
                    {ct.blocks.map((b, bi) => (
                      <div key={bi} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm"
                        style={{ backgroundColor: 'var(--surface-hover)' }}>
                        <span className="text-xs font-bold w-5 text-right shrink-0"
                          style={{ color: 'var(--text-4)' }}>{bi + 1}</span>
                        <span className="flex-1 font-medium" style={{ color: 'var(--text-1)' }}>{b.nombre}</span>
                        <span className="text-xs px-2 py-0.5 rounded-md shrink-0"
                          style={{ backgroundColor: 'var(--surface-card)', color: 'var(--text-3)' }}>
                          {b.duracionMins} min
                        </span>
                        {b.esOpcional && (
                          <span className="text-xs shrink-0" style={{ color: 'var(--text-4)' }}>opcional</span>
                        )}
                        {b.notas && (
                          <span className="text-xs shrink-0 truncate max-w-[160px]"
                            style={{ color: 'var(--text-4)' }}>{b.notas}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {expandedIdx === idx && ct.blocks.length === 0 && (
                  <div className="px-5 pb-3 pt-2 border-t" style={{ borderColor: 'var(--border-1)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-4)' }}>Sin bloques definidos</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
