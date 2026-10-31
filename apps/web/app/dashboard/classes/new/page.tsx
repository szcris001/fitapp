'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../../store/auth.store'
import api from '../../../../lib/api'
import { gymLocalToIso, gymCalendarDate } from '../../../../lib/gym-timezone'
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { TimeInput24 } from '../_components/TimeInput24'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// `d` siempre es medianoche UTC de un día calendario (ver gymCalendarDate) — por eso
// todo acá usa los accesores getUTC*/setUTC*, nunca los locales: así la zona horaria
// del navegador de quien crea la clase no corre la semana un día (hallazgo QA).
const getMonday = (d: Date) => {
  const date = new Date(d)
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1))
  return date
}

export default function NewClassPage() {
  const router = useRouter()
  const { user, loadFromStorage } = useAuthStore()
  const [classTypes, setClassTypes] = useState<any[]>([])
  const [coaches, setCoaches]       = useState<any[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  // Date.now() fijo por montaje: React exige render puro
  const [now] = useState(() => Date.now())
  const inTwoMonths = new Date(now + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [weekStart, setWeekStart] = useState(() => getMonday(gymCalendarDate()))

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setUTCDate(weekStart.getUTCDate() + i)
    return d
  })
  const weekDayIndex = (i: number) => weekDays[i].getUTCDay()

  const navigateWeek = (dir: 1 | -1) => {
    const next = new Date(weekStart)
    next.setUTCDate(weekStart.getUTCDate() + dir * 7)
    if (dir === -1 && next < getMonday(gymCalendarDate())) return
    setWeekStart(next)
    setForm(f => ({ ...f, startDate: next.toISOString().split('T')[0], recurringDays: [] }))
  }

  const weekLabel = () => {
    const end = weekDays[6]
    return `${weekDays[0].getUTCDate()} – ${end.getUTCDate()} ${end.toLocaleString('es-CL', { month: 'short', timeZone: 'UTC' })} ${end.getUTCFullYear()}`
  }

  const [form, setForm] = useState({
    classTypeId: '',
    coachId: '',
    capacity: 15,
    recurring: true,
    startDate: getMonday(gymCalendarDate()).toISOString().split('T')[0],
    singleDate: gymCalendarDate().toISOString().split('T')[0],
    recurringDays: [] as number[],
    recurringUntil: inTwoMonths,
    timeBlocks: [{ start: '06:00', end: '07:00' }],
  })

  useEffect(() => { loadFromStorage() }, [])

  useEffect(() => {
    if (!user) return
    Promise.all([api.get('/class-types'), api.get('/users?role=COACH,ADMIN')])
      .then(([ct, us]) => {
        setClassTypes(ct.data)
        setCoaches(us.data)
      })
      .catch(() => {})
  }, [user])

  const toggleDay  = (day: number) => setForm(f => ({
    ...f,
    recurringDays: f.recurringDays.includes(day)
      ? f.recurringDays.filter(d => d !== day)
      : [...f.recurringDays, day],
  }))

  const addTimeBlock    = () => setForm(f => ({ ...f, timeBlocks: [...f.timeBlocks, { start: '08:00', end: '09:00' }] }))
  const removeTimeBlock = (i: number) => setForm(f => ({ ...f, timeBlocks: f.timeBlocks.filter((_, idx) => idx !== i) }))
  const updateTimeBlock = (i: number, key: 'start' | 'end', val: string) =>
    setForm(f => ({ ...f, timeBlocks: f.timeBlocks.map((b, idx) => idx === i ? { ...b, [key]: val } : b) }))

  const weeksUntil = Math.max(1, Math.ceil(
    (new Date(form.recurringUntil).getTime() - now) / (7 * 24 * 60 * 60 * 1000)
  ))
  const totalClasses = form.recurring
    ? form.recurringDays.length * form.timeBlocks.length * weeksUntil
    : form.timeBlocks.length

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.classTypeId)                                     { setError('Selecciona un tipo de clase'); return }
    if (!form.coachId)                                         { setError('Selecciona un coach'); return }
    if (form.recurring && form.recurringDays.length === 0)     { setError('Selecciona al menos un día'); return }
    if (form.timeBlocks.length === 0)                          { setError('Agrega al menos un bloque horario'); return }

    setLoading(true)
    setError('')
    let totalCreated = 0
    let errors = 0
    const baseDate = form.recurring ? form.startDate : form.singleDate

    for (const block of form.timeBlocks) {
      try {
        // Hora de pared en la zona del gym, no la del navegador de quien crea la clase
        // (ver gym-timezone.ts) — si no, dos admins en zonas distintas crean/ven la
        // "misma" clase en horas reales distintas.
        const startsAt = gymLocalToIso(baseDate, block.start)
        const endsAt   = gymLocalToIso(baseDate, block.end)
        const result = await api.post('/classes', {
          classTypeId: form.classTypeId,
          coachId: form.coachId,
          startsAt, endsAt,
          capacity: Number(form.capacity),
          ...(form.recurring
            ? { frequency: 'RECURRING', recurringDays: form.recurringDays, recurringUntil: form.recurringUntil }
            : { frequency: 'ONCE' }),
        })
        totalCreated += result.data.created || 1
      } catch { errors++ }
    }

    setLoading(false)
    if (errors === 0) {
      setSuccess(`${totalCreated} clases creadas exitosamente`)
      setTimeout(() => router.push('/dashboard/classes'), 1500)
    } else {
      setError(`${errors} bloques fallaron. ${totalCreated} clases creadas.`)
    }
  }

  return (
    <div className="px-6 py-8 flex flex-col" style={{ minHeight: '100%' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <button onClick={() => router.push('/dashboard/classes')}
          className="w-8 h-8 flex items-center justify-center rounded-lg btn-secondary">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5" style={{ color: 'var(--brand-accent)' }} />
          <div>
            <h1 className="section-title">Nueva clase</h1>
            <p className="text-sm" style={{ color: 'var(--text-4)' }}>Configura el horario</p>
          </div>
        </div>
      </div>

      {/* Form: 2 columns */}
      <form onSubmit={handleCreate} className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* ── Columna izquierda: configuración + planes ── */}
        <div className="space-y-5">

          {error   && <div className="text-sm rounded-xl px-4 py-3" style={{ backgroundColor: '#ef444418', color: '#ef4444', border: '1px solid #ef444430' }}>{error}</div>}
          {success && <div className="text-sm rounded-xl px-4 py-3" style={{ backgroundColor: '#22c55e18', color: '#22c55e', border: '1px solid #22c55e30' }}>{success}</div>}

          {/* Config base */}
          <div className="card rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>Configuración</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Tipo de clase</label>
                <select value={form.classTypeId} onChange={e => setForm(f => ({ ...f, classTypeId: e.target.value }))} className="input text-sm">
                  <option value="">Seleccionar...</option>
                  {classTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Coach</label>
                <select value={form.coachId} onChange={e => setForm(f => ({ ...f, coachId: e.target.value }))} className="input text-sm">
                  <option value="">Seleccionar...</option>
                  {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Capacidad</label>
                <input type="number" min={1} max={100} value={form.capacity}
                  onChange={e => setForm(f => ({ ...f, capacity: Number(e.target.value) }))}
                  className="input text-sm" />
              </div>
              {form.recurring ? (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Repetir hasta</label>
                  <input type="date" value={form.recurringUntil} min={form.startDate}
                    onChange={e => setForm(f => ({ ...f, recurringUntil: e.target.value }))}
                    className="input text-sm" />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Fecha</label>
                  <input type="date" value={form.singleDate} min={gymCalendarDate().toISOString().split('T')[0]}
                    onChange={e => setForm(f => ({ ...f, singleDate: e.target.value }))}
                    className="input text-sm" />
                </div>
              )}
            </div>
          </div>

          {/* ¿Se repite? */}
          <div className="card rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>¿Se repite?</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                {form.recurring ? 'Se crea todas las semanas en los días elegidos' : 'Clase única, solo para la fecha elegida'}
              </p>
            </div>
            <button type="button" onClick={() => setForm(f => ({ ...f, recurring: !f.recurring }))}
              role="switch" aria-checked={form.recurring}
              className="relative w-11 h-6 rounded-full shrink-0 transition-colors"
              style={{ backgroundColor: form.recurring ? 'var(--brand-primary)' : 'var(--border-2)' }}>
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                style={{ transform: form.recurring ? 'translateX(22px)' : 'translateX(2px)' }} />
            </button>
          </div>
        </div>

        {/* ── Columna derecha: días + bloques horarios + submit ── */}
        <div className="space-y-5">

          {/* Días (solo si se repite) */}
          {form.recurring && (
            <div className="card rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>Días de la semana</h3>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => navigateWeek(-1)}
                    className="w-6 h-6 flex items-center justify-center rounded"
                    style={{ color: 'var(--text-3)', backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-2)' }}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>{weekLabel()}</span>
                  <button type="button" onClick={() => navigateWeek(1)}
                    className="w-6 h-6 flex items-center justify-center rounded"
                    style={{ color: 'var(--text-3)', backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-2)' }}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                {weekDays.map((date, i) => {
                  const dow = weekDayIndex(i)
                  const selected = form.recurringDays.includes(dow)
                  const isPast = date < gymCalendarDate()
                  return (
                    <button key={i} type="button" onClick={() => !isPast && toggleDay(dow)}
                      className="flex-1 flex flex-col items-center py-2 rounded-xl font-medium transition-colors"
                      style={selected
                        ? { backgroundColor: 'var(--brand-primary)', color: '#fff' }
                        : isPast
                          ? { backgroundColor: 'transparent', color: 'var(--text-4)', border: '1px solid var(--border-1)', opacity: 0.4, cursor: 'not-allowed' }
                          : { backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)', border: '1px solid var(--border-2)' }}>
                      <span className="text-xs">{DAYS[dow]}</span>
                      <span className="text-base font-bold leading-tight">{date.getUTCDate()}</span>
                    </button>
                  )
                })}
              </div>
              {form.recurringDays.length > 0 && (
                <p className="text-xs" style={{ color: 'var(--text-4)' }}>
                  Desde {weekDays[0].toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' })} · repite los: {form.recurringDays.sort((a, b) => a - b).map(d => DAYS[d]).join(', ')}
                </p>
              )}
            </div>
          )}

          {/* Bloques horarios */}
          <div className="card rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>Bloques horarios</h3>
              <button type="button" onClick={addTimeBlock}
                className="text-xs font-semibold" style={{ color: 'var(--brand-primary)' }}>
                + Agregar bloque
              </button>
            </div>
            <div className="space-y-2">
              {form.timeBlocks.map((block, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2"
                  style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border-1)' }}>
                  <span className="text-xs w-4 shrink-0" style={{ color: 'var(--text-4)' }}>{i + 1}.</span>
                  <div className="flex items-center gap-2 flex-1">
                    <TimeInput24 value={block.start} onChange={v => updateTimeBlock(i, 'start', v)} />
                    <span className="text-xs" style={{ color: 'var(--text-4)' }}>→</span>
                    <TimeInput24 value={block.end} onChange={v => updateTimeBlock(i, 'end', v)} />
                  </div>
                  {form.timeBlocks.length > 1 && (
                    <button type="button" onClick={() => removeTimeBlock(i)}
                      className="w-6 h-6 flex items-center justify-center rounded shrink-0" style={{ color: '#ef4444' }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Resumen */}
          <div className="rounded-xl px-4 py-3 text-sm"
            style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, var(--surface-card))', border: '1px solid color-mix(in srgb, var(--brand-primary) 20%, var(--border-1))' }}>
            {form.recurring ? (
              <>
                <span style={{ color: 'var(--text-3)' }}>Se crearán aprox. </span>
                <span className="font-bold" style={{ color: 'var(--text-1)' }}>{form.recurringDays.length * form.timeBlocks.length}</span>
                <span style={{ color: 'var(--text-3)' }}> clases/semana · </span>
                <span className="font-bold" style={{ color: 'var(--text-1)' }}>~{totalClasses}</span>
                <span style={{ color: 'var(--text-3)' }}> en total hasta {form.recurringUntil}</span>
              </>
            ) : (
              <>
                <span style={{ color: 'var(--text-3)' }}>Se creará</span>{' '}
                <span className="font-bold" style={{ color: 'var(--text-1)' }}>{totalClasses}</span>
                <span style={{ color: 'var(--text-3)' }}> clase{totalClasses !== 1 ? 's' : ''} única{totalClasses !== 1 ? 's' : ''} el {form.singleDate}</span>
              </>
            )}
          </div>

          {/* Botones */}
          <div className="flex gap-3">
            <button type="button" onClick={() => router.push('/dashboard/classes')}
              className="flex-1 btn-secondary py-3 rounded-xl text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 btn-brand py-3 rounded-xl text-sm font-medium disabled:opacity-50">
              {loading ? 'Creando...' : form.recurring ? `Crear ~${totalClasses} clases` : 'Crear clase'}
            </button>
          </div>
        </div>

      </form>
    </div>
  )
}
