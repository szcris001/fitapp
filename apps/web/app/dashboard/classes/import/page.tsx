'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../../store/auth.store'
import api from '../../../../lib/api'
import * as XLSX from 'xlsx'

interface PreviewRow {
  fecha: string
  tipoCls: string
  horaInicio: string
  horaFin: string
  capacidad: number
  coachEmail: string
  classTypeId: string
  coachId: string
  valid: boolean
  error?: string
}

export default function ImportClassesPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [classTypes, setClassTypes] = useState<any[]>([])
  const [coaches, setCoaches] = useState<any[]>([])
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) { router.push('/login'); return }
    Promise.all([api.get('/class-types'), api.get('/users?role=COACH,ADMIN')])
      .then(([ct, us]) => { setClassTypes(ct.data); setCoaches(us.data) })
      .catch(() => {})
  }, [user])

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const ex = classTypes[0]?.name || 'CrossFit'
    const coach = coaches[0]?.email || 'coach@gimnasio.cl'
    const data = [
      ['tipo_clase', 'fecha', 'hora_inicio', 'hora_fin', 'capacidad', 'coach_email'],
      [ex, '2026-04-01', '06:00', '07:00', 15, coach],
      [ex, '2026-04-01', '08:00', '09:00', 15, coach],
      [ex, '2026-04-02', '06:00', '07:00', 15, coach],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 28 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Clases')

    // Reference sheets
    if (classTypes.length > 0) {
      const ctData = [['tipo_clase'], ...classTypes.map(ct => [ct.name])]
      const wsct = XLSX.utils.aoa_to_sheet(ctData)
      wsct['!cols'] = [{ wch: 25 }]
      XLSX.utils.book_append_sheet(wb, wsct, 'Tipos de clase')
    }
    if (coaches.length > 0) {
      const coachData = [['nombre', 'email'], ...coaches.map(c => [c.name, c.email])]
      const wsCo = XLSX.utils.aoa_to_sheet(coachData)
      wsCo['!cols'] = [{ wch: 25 }, { wch: 30 }]
      XLSX.utils.book_append_sheet(wb, wsCo, 'Coaches')
    }

    XLSX.writeFile(wb, 'plantilla_clases.xlsx')
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setResult(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1 })

        const parsed: PreviewRow[] = []
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (!row || !row[0]) continue

          const tipoCls = String(row[0] || '').trim()
          const fecha = String(row[1] || '').trim()
          const horaInicio = String(row[2] || '').trim()
          const horaFin = String(row[3] || '').trim()
          const capacidad = row[4] ? Number(row[4]) : 15
          const coachEmail = String(row[5] || '').trim().toLowerCase()

          const ct = classTypes.find(c => c.name.toLowerCase() === tipoCls.toLowerCase())
          const coach = coaches.find(c => c.email.toLowerCase() === coachEmail)

          let err: string | undefined
          if (!tipoCls) err = 'Sin tipo de clase'
          else if (!ct) err = `Tipo "${tipoCls}" no existe`
          else if (!fecha) err = 'Sin fecha'
          else if (!horaInicio || !horaFin) err = 'Hora incompleta'
          else if (!coach) err = `Coach "${coachEmail}" no encontrado`

          parsed.push({
            fecha, tipoCls, horaInicio, horaFin, capacidad, coachEmail,
            classTypeId: ct?.id || '',
            coachId: coach?.id || '',
            valid: !err,
            error: err,
          })
        }
        setPreview(parsed)
      } catch {
        setError('Error al leer el archivo. Usa la plantilla proporcionada.')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleImport = async () => {
    const valid = preview.filter(r => r.valid)
    if (valid.length === 0) { setError('No hay clases válidas para importar'); return }
    setImporting(true)
    setError('')
    const errors: string[] = []
    let created = 0

    for (const row of valid) {
      try {
        const startsAt = new Date(`${row.fecha}T${row.horaInicio}:00`).toISOString()
        const endsAt = new Date(`${row.fecha}T${row.horaFin}:00`).toISOString()
        await api.post('/classes', {
          classTypeId: row.classTypeId,
          coachId: row.coachId,
          startsAt,
          endsAt,
          capacity: row.capacidad,
          frequency: 'ONCE',
        })
        created++
      } catch (err: any) {
        errors.push(`${row.fecha} ${row.horaInicio}: ${err.response?.data?.error || 'Error'}`)
      }
    }

    setResult({ created, errors })
    setPreview([])
    setImporting(false)
  }

  const validCount = preview.filter(r => r.valid).length
  const invalidCount = preview.filter(r => !r.valid).length

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.push('/dashboard/classes')}
          className="text-gray-400 hover:text-white transition-colors text-sm">← Clases</button>
        <h1 className="text-2xl font-bold">Importar clases por Excel</h1>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 rounded-lg px-4 py-3 text-sm mb-6">{error}</div>
      )}

      {result && (
        <div className="bg-green-900/20 border border-green-800 text-green-400 rounded-lg px-4 py-4 mb-6">
          <p className="font-medium">Importación completada</p>
          <p className="text-sm mt-1">{result.created} clases creadas correctamente</p>
          {result.errors.length > 0 && (
            <ul className="text-yellow-400 text-sm mt-2 space-y-1">
              {result.errors.map((e, i) => <li key={i}>⚠ {e}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="font-medium mb-2">Paso 1 — Descarga la plantilla</h2>
          <p className="text-gray-400 text-sm mb-4">
            Incluye hojas de referencia con los tipos de clase y coaches disponibles en tu gimnasio.
          </p>
          <button onClick={downloadTemplate}
            className="bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg border border-gray-700 transition-colors">
            Descargar plantilla .xlsx
          </button>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="font-medium mb-2">Paso 2 — Sube el archivo</h2>
          <p className="text-gray-400 text-sm mb-4">
            Completa la plantilla y súbela aquí para previsualizar antes de crear las clases.
          </p>
          <button onClick={() => fileRef.current?.click()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            Seleccionar archivo
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {preview.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="font-semibold">Vista previa — {preview.length} filas</h2>
              {validCount > 0 && <span className="bg-green-900/40 text-green-400 text-xs px-2 py-1 rounded-full">{validCount} válidas</span>}
              {invalidCount > 0 && <span className="bg-red-900/40 text-red-400 text-xs px-2 py-1 rounded-full">{invalidCount} con error</span>}
            </div>
            <button onClick={handleImport} disabled={importing || validCount === 0}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm px-6 py-2 rounded-lg transition-colors font-medium">
              {importing ? 'Creando clases...' : `Crear ${validCount} clases`}
            </button>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Fecha</th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Tipo</th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Horario</th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Cap.</th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Coach</th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-800 last:border-0 ${!row.valid ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-gray-300">{row.fecha}</td>
                    <td className="px-4 py-3 text-gray-300">{row.tipoCls}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{row.horaInicio} – {row.horaFin}</td>
                    <td className="px-4 py-3 text-gray-400">{row.capacidad}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-[140px]">{row.coachEmail}</td>
                    <td className="px-4 py-3">
                      {row.valid
                        ? <span className="bg-green-900/40 text-green-400 text-xs px-2 py-1 rounded-full">OK</span>
                        : <span className="bg-red-900/40 text-red-400 text-xs px-2 py-1 rounded-full">{row.error}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  )
}
