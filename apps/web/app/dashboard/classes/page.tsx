'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, Plus, X, Trash2 } from 'lucide-react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'

interface Class {
  id: string; startsAt: string; endsAt: string; capacity: number
  classType: { id: string; name: string; color: string | null }
  _count: { bookings: number }
  bookings: { id: string }[]
}

/* ─── Main Page ──────────────────────────────────── */
export default function ClassesPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()
  const calendarRef = useRef<FullCalendar>(null)
  const currentRangeRef = useRef<{ from: string; to: string } | null>(null)
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(false)
  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [classTypes, setClassTypes] = useState<any[]>([])
  const [classTypeFilter, setClassTypeFilter] = useState('all')
  const [showImportMenu, setShowImportMenu] = useState(false)
  // Set of "classTypeId|YYYY-MM-DD" for quick WOD presence lookup
  const [wodKeys, setWodKeys] = useState<Set<string>>(new Set())

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (user) {
      api.get('/class-types').then(({ data }) => setClassTypes(data)).catch(() => {})
    }
  }, [user])

  const localStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const fetchClasses = async (from: string, to: string) => {
    setLoading(true)
    try {
      const [{ data: classData }, { data: wodData }] = await Promise.all([
        api.get(`/classes?from=${from}&to=${to}`),
        api.get(`/wods?from=${from}&to=${to}`),
      ])
      setClasses(classData)
      // Build lookup set: "classTypeId|YYYY-MM-DD"
      const keys = new Set<string>(
        (wodData as any[]).map((w: any) => `${w.classTypeId}|${w.date.split('T')[0]}`)
      )
      setWodKeys(keys)
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }

  const handleDatesSet = (arg: { startStr: string; endStr: string }) => {
    const from = arg.startStr.split('T')[0]
    const to = arg.endStr.split('T')[0]
    currentRangeRef.current = { from, to }
    fetchClasses(from, to)
  }

  const hasWod = (cls: Class) => {
    const dateStr = localStr(new Date(cls.startsAt))
    return wodKeys.has(`${cls.classType.id}|${dateStr}`)
  }

  const openClass = (id: string) => {
    if (!manageMode) router.push(`/dashboard/classes/${id}`)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    setBulkDeleting(true)
    try {
      await api.delete('/classes/bulk', { data: { ids: Array.from(selectedIds) } })
      setSelectedIds(new Set())
      setManageMode(false)
      setConfirmBulkDelete(false)
      if (currentRangeRef.current) fetchClasses(currentRangeRef.current.from, currentRangeRef.current.to)
    } catch { /* ignore */ }
    finally { setBulkDeleting(false) }
  }

  const filteredClasses = classTypeFilter === 'all'
    ? classes
    : classes.filter(c => c.classType.id === classTypeFilter)

  return (
    <div className="flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>

      {/* ── Top toolbar ─────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0 flex-wrap"
        style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-card)' }}>

        {/* Nueva clase */}
        <button onClick={() => router.push('/dashboard/classes/new')}
          className="btn-brand flex items-center gap-2 px-4 py-2 text-sm rounded-xl shrink-0">
          <Plus className="w-4 h-4" /> Nueva clase
        </button>

        <div className="w-px h-6 shrink-0" style={{ backgroundColor: 'var(--border-1)' }} />

        {/* Class type filter pills */}
        {classTypes.length > 0 && (
          <div className="flex items-center gap-1.5 flex-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {[{ id: 'all', name: 'Todas', color: null as string | null }, ...classTypes].map(ct => {
              const active = classTypeFilter === ct.id
              return (
                <button key={ct.id}
                  onClick={() => setClassTypeFilter(classTypeFilter === ct.id && ct.id !== 'all' ? 'all' : ct.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all"
                  style={active ? {
                    backgroundColor: ct.color || 'var(--brand-primary)',
                    color: '#fff',
                  } : {
                    backgroundColor: 'var(--surface-hover)',
                    color: 'var(--text-3)',
                  }}>
                  {ct.color && (
                    <span className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : ct.color }} />
                  )}
                  {ct.name}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex-1" />

        {/* Import dropdown */}
        <div className="relative shrink-0">
          <button onClick={() => setShowImportMenu(m => !m)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border transition-colors"
            style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)', backgroundColor: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            <Plus className="w-3.5 h-3.5" />
            Importar
            <ChevronDown className="w-3 h-3" />
          </button>
          {showImportMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowImportMenu(false)} />
              <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border shadow-xl z-40 overflow-hidden"
                style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--border-1)' }}>
                <button onClick={() => { router.push('/dashboard/classes/import'); setShowImportMenu(false) }}
                  className="flex items-center gap-2.5 px-4 py-2.5 w-full text-sm text-left"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  Clases
                </button>
                <button onClick={() => { router.push('/dashboard/wods/import'); setShowImportMenu(false) }}
                  className="flex items-center gap-2.5 px-4 py-2.5 w-full text-sm text-left"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  WODs
                </button>
              </div>
            </>
          )}
        </div>

        {/* Eliminar clases (selection mode) */}
        <button onClick={() => { setManageMode(!manageMode); setSelectedIds(new Set()); setConfirmBulkDelete(false) }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border transition-colors shrink-0"
          style={manageMode ? {
            borderColor: '#ef4444',
            color: '#ef4444',
            backgroundColor: 'color-mix(in srgb, #ef4444 10%, transparent)',
          } : {
            borderColor: 'var(--border-2)',
            color: 'var(--text-3)',
            backgroundColor: 'transparent',
          }}
          onMouseEnter={e => { if (!manageMode) e.currentTarget.style.backgroundColor = 'var(--surface-hover)' }}
          onMouseLeave={e => { if (!manageMode) e.currentTarget.style.backgroundColor = 'transparent' }}>
          <Trash2 className="w-3.5 h-3.5" />
          {manageMode ? 'Cancelar' : 'Eliminar'}
        </button>
      </div>

      {/* Bulk action bar */}
      {manageMode && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
          style={{ backgroundColor: 'color-mix(in srgb, #ef4444 6%, var(--surface-card))', borderColor: '#ef444430' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedIds(new Set(filteredClasses.map(c => c.id)))}
              className="text-xs font-semibold" style={{ color: '#ef4444' }}>
              Seleccionar todo
            </button>
            {selectedIds.size > 0 && (
              <button onClick={() => setSelectedIds(new Set())}
                className="text-xs font-medium" style={{ color: 'var(--text-4)' }}>
                Quitar selección
              </button>
            )}
            <span className="text-sm" style={{ color: 'var(--text-3)' }}>
              {selectedIds.size > 0
                ? `${selectedIds.size} clase${selectedIds.size > 1 ? 's' : ''} seleccionada${selectedIds.size > 1 ? 's' : ''}`
                : 'Haz clic en las clases que deseas eliminar'}
            </span>
          </div>
          {selectedIds.size > 0 && (
            <button onClick={() => setConfirmBulkDelete(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-medium text-white"
              style={{ backgroundColor: '#ef4444' }}>
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar {selectedIds.size}
            </button>
          )}
        </div>
      )}

      {/* Bulk delete confirm modal */}
      {confirmBulkDelete && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setConfirmBulkDelete(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setConfirmBulkDelete(false)}>
            <div className="w-full max-w-sm rounded-2xl shadow-2xl modal-animate card" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'color-mix(in srgb, #ef4444 15%, var(--surface-card))' }}>
                    <Trash2 className="w-4 h-4" style={{ color: '#ef4444' }} />
                  </div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Eliminar clases</p>
                </div>
                <button onClick={() => setConfirmBulkDelete(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: 'var(--text-4)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-4">
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                  Estás a punto de eliminar <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
                    {selectedIds.size} clase{selectedIds.size > 1 ? 's' : ''}
                  </span>. Se eliminarán también todas las reservas asociadas. Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmBulkDelete(false)}
                    className="flex-1 btn-secondary py-2.5 rounded-xl text-sm">
                    Cancelar
                  </button>
                  <button onClick={handleBulkDelete} disabled={bulkDeleting}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#ef4444' }}>
                    <Trash2 className="w-4 h-4" />
                    {bulkDeleting ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Calendar ──────────────────────────────────── */}
      <div className="flex-1 overflow-hidden" style={{ padding: '16px 48px 16px 48px' }}>
        <style>{`
          .fc { --fc-border-color: var(--border-1); }
          .fc .fc-toolbar { padding: 0 0 10px 0; }
          .fc .fc-toolbar-title { font-size: 15px; font-weight: 700; color: var(--text-1); }
          .fc .fc-button { background: var(--surface-card); border: 1px solid var(--border-2); color: var(--text-2); font-size: 12px; padding: 5px 10px; border-radius: 8px; box-shadow: none; }
          .fc .fc-button:hover { background: var(--surface-hover); border-color: var(--border-2); }
          .fc .fc-button-primary:not(:disabled).fc-button-active,
          .fc .fc-button-primary:not(:disabled):active { background: var(--brand-primary); border-color: var(--brand-primary); color: #fff; }
          .fc .fc-button:focus, .fc .fc-button:focus-visible { box-shadow: none; outline: none; }
          .fc .fc-timegrid-slot { height: 28px; }
          .fc .fc-col-header-cell-cushion { font-size: 12px; font-weight: 600; color: var(--text-2); text-decoration: none; padding: 5px 4px; }
          .fc .fc-timegrid-axis-cushion, .fc .fc-timegrid-slot-label-cushion { font-size: 10px; color: var(--text-4); }
          .fc .fc-event { border-radius: 6px; cursor: pointer; border: none; }
          .fc .fc-event:focus { box-shadow: none; }
          .fc-theme-standard td, .fc-theme-standard th { border-color: var(--border-1); }
          .fc .fc-scrollgrid { border-color: var(--border-1); border-radius: 12px; overflow: hidden; }
          .fc td.fc-day-today { background: color-mix(in srgb, var(--brand-primary) 6%, transparent); }
          .fc .fc-list-event:hover td { background: var(--surface-hover); cursor: pointer; }
          .fc .fc-list-day-cushion { background: var(--surface-card); }
          .fc .fc-list-day-text, .fc .fc-list-day-side-text { color: var(--text-2); text-decoration: none; }
          .fc .fc-list-empty { background: var(--surface-card); }
          .fc .fc-button-group .fc-button { border-radius: 0; }
          .fc .fc-button-group .fc-button:first-child { border-radius: 8px 0 0 8px; }
          .fc .fc-button-group .fc-button:last-child { border-radius: 0 8px 8px 0; }
        `}</style>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="timeGridWeek"
          locale="es"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridWeek,timeGridDay,dayGridMonth,listWeek',
          }}
          buttonText={{
            today: 'Hoy',
            week: 'Semana',
            day: 'Día',
            month: 'Mes',
            list: 'Lista',
          }}
          events={filteredClasses.map(cls => ({
            id: cls.id,
            title: cls.classType.name,
            start: cls.startsAt,
            end: cls.endsAt,
            backgroundColor: (cls.classType.color || '#6366f1') + (selectedIds.has(cls.id) ? '66' : '33'),
            borderColor: cls.classType.color || '#6366f1',
            textColor: cls.classType.color || '#6366f1',
            extendedProps: { cls },
          }))}
          datesSet={handleDatesSet}
          eventClick={(info) => {
            if (manageMode) toggleSelect(info.event.id)
            else openClass(info.event.id)
          }}
          eventContent={(eventInfo) => {
            const cls: Class = eventInfo.event.extendedProps.cls
            const isSelected = selectedIds.has(cls.id)
            const pct = cls._count.bookings / cls.capacity
            const barColor = pct >= 1 ? '#ef4444' : pct >= 0.7 ? '#f59e0b' : '#22c55e'
            const color = cls.classType.color || '#6366f1'
            return (
              <div style={{ padding: '2px 4px', overflow: 'hidden', height: '100%', outline: isSelected ? `2px solid ${color}` : 'none', borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {manageMode && <span style={{ marginRight: 3 }}>{isSelected ? '☑' : '☐'}</span>}
                  {eventInfo.timeText} {cls.classType.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  {cls._count.bookings}/{cls.capacity}
                </div>
                <div style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.15)', marginTop: 2 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, pct * 100)}%`, backgroundColor: barColor, borderRadius: 2 }} />
                </div>
              </div>
            )
          }}
          height="100%"
          scrollTime="07:00:00"
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          allDaySlot={false}
          nowIndicator={true}
          slotDuration="00:30:00"
          expandRows={true}
          firstDay={1}
        />
      </div>


    </div>
  )
}

