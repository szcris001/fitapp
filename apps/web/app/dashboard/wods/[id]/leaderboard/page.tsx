'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuthStore } from '../../../../../store/auth.store'
import api, { mediaUrl } from '../../../../../lib/api'
import { ChevronLeft, Plus, Trophy, Clock, Dumbbell, RotateCcw, X, Search, Pencil, Trash2 } from 'lucide-react'

/* ─── Types ─────────────────────────────────────── */
interface WodDetail {
  id: string
  title: string | null
  date: string
  scoreType: string
  classTypeId: string
}

interface LeaderboardEntry {
  id: string
  userId: string
  rank: number
  score: number | null
  scoreText: string | null
  scoreFormatted: string
  rx: boolean
  notes: string | null
  user: {
    id: string
    name: string
    avatarUrl?: string | null
  }
}

interface LeaderboardData {
  rx: LeaderboardEntry[]
  scaled: LeaderboardEntry[]
}

interface Member {
  id: string
  name: string
  email: string
}

/* ─── Score-type helpers ─────────────────────────── */
const SCORE_TYPE_META: Record<string, { label: string; icon: React.ElementType; hint: string; winRule: string }> = {
  REPS:   { label: 'Reps / Puntos', icon: Trophy,   hint: 'Mayor puntaje gana',  winRule: 'Mayor es mejor' },
  TIME:   { label: 'Tiempo',         icon: Clock,    hint: 'Menor tiempo gana',   winRule: 'Menor es mejor' },
  WEIGHT: { label: 'Peso',           icon: Dumbbell, hint: 'Mayor peso gana',     winRule: 'Mayor es mejor' },
  ROUNDS: { label: 'Rondas',         icon: RotateCcw,hint: 'Más rondas gana',    winRule: 'Mayor es mejor' },
  CUSTOM: { label: 'Libre',          icon: Trophy,   hint: 'Puntuación libre',    winRule: '' },
}

const SCORE_TYPE_LABELS: Record<string, string> = {
  REPS: 'Reps / Puntos', TIME: 'Tiempo', WEIGHT: 'Peso (kg)', ROUNDS: 'Rondas', CUSTOM: 'Puntaje',
}

/* ─── Skeleton ───────────────────────────────────── */
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg ${className}`} style={{ backgroundColor: 'var(--surface-hover)' }} />
}

/** Puntaje ingresado → número que guarda la API. TIME acepta "m:ss" o segundos; CUSTOM, texto libre. */
function parseScore(raw: string, scoreType: string): number | null {
  const text = raw.trim()
  if (scoreType === 'TIME') {
    const mmss = text.match(/^(\d+):([0-5]\d)$/)
    const seconds = mmss ? Number(mmss[1]) * 60 + Number(mmss[2]) : Number(text)
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  }
  if (scoreType === 'CUSTOM') return Number.parseFloat(text.replace(',', '.')) || 0
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

/* ─── Register/Edit Result Modal ─────────────────── */
function RegisterModal({
  wodId,
  scoreType,
  members,
  editingEntry,
  onClose,
  onSaved,
}: {
  wodId: string
  scoreType: string
  members: Member[]
  editingEntry?: LeaderboardEntry | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEditing = !!editingEntry
  const [search, setSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(
    editingEntry ? { id: editingEntry.userId, name: editingEntry.user.name, email: '' } : null
  )
  // TIME ya viene formateado mm:ss (parseScore lo vuelve a aceptar); CUSTOM usa el texto libre guardado
  const [score, setScore] = useState(() => {
    if (!editingEntry) return ''
    if (scoreType === 'CUSTOM') return editingEntry.scoreText ?? ''
    if (scoreType === 'TIME') return editingEntry.scoreFormatted
    return editingEntry.score != null ? String(editingEntry.score) : ''
  })
  const [isRx, setIsRx] = useState(editingEntry?.rx ?? true)
  const [notes, setNotes] = useState(editingEntry?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8)

  const handleSelect = (m: Member) => {
    setSelectedMember(m)
    setSearch(m.name)
    setShowDropdown(false)
  }

  const handleSave = async () => {
    if (!selectedMember) { setError('Selecciona un atleta'); return }
    if (!score.trim()) { setError('Ingresa el puntaje'); return }
    const value = parseScore(score, scoreType)
    if (value === null) {
      setError(scoreType === 'TIME' ? 'Tiempo inválido: usa mm:ss (ej. 3:45) o segundos' : 'El puntaje debe ser un número')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body = {
        score: value,
        scoreText: scoreType === 'CUSTOM' ? score.trim() : null,
        rx: isRx,
        notes: notes.trim() || null,
      }
      // Mismo formato que la app móvil: score numérico (segundos en TIME) y rx
      if (isEditing) {
        await api.put(`/wods/${wodId}/results/${selectedMember.id}`, body)
      } else {
        await api.post(`/wods/${wodId}/results`, { userId: selectedMember.id, ...body })
      }
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al guardar resultado')
    } finally {
      setSaving(false)
    }
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden modal-animate card"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--gradient-btn)' }}>
              <Plus className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                {isEditing ? 'Editar resultado' : 'Registrar resultado'}
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-4)' }}>{SCORE_TYPE_LABELS[scoreType] ?? 'Puntaje'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Atleta */}
          <div className="relative">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-3)' }}>Atleta</label>
            {isEditing ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-base)', opacity: 0.8 }}>
                <span className="flex-1 text-sm" style={{ color: 'var(--text-1)' }}>{editingEntry!.user.name}</span>
              </div>
            ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-base)' }}>
              <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-4)' }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setShowDropdown(true); if (!e.target.value) setSelectedMember(null) }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Buscar atleta..."
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--text-1)' }}
              />
              {selectedMember && (
                <button onClick={() => { setSelectedMember(null); setSearch('') }}>
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--text-4)' }} />
                </button>
              )}
            </div>
            )}
            {!isEditing && showDropdown && search && !selectedMember && filteredMembers.length > 0 && (
              <div
                className="absolute top-full left-0 right-0 mt-1 rounded-xl border z-10 overflow-hidden"
                style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--border-1)', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}
              >
                {filteredMembers.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={() => handleSelect(m)}
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                    style={{ color: 'var(--text-1)' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="ml-2 text-xs" style={{ color: 'var(--text-4)' }}>{m.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Score */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-3)' }}>
              {SCORE_TYPE_LABELS[scoreType] ?? 'Puntaje'}
            </label>
            <input
              value={score}
              onChange={e => setScore(e.target.value)}
              placeholder={
                scoreType === 'TIME'   ? 'Ej: 3:45 o 225 (segundos)' :
                scoreType === 'WEIGHT' ? 'Ej: 100 (kg)' :
                scoreType === 'ROUNDS' ? 'Ej: 12' :
                'Ej: 150'
              }
              className="input text-sm w-full"
            />
          </div>

          {/* RX / Scaled toggle */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-3)' }}>Categoría</label>
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border-1)' }}>
              {[
                { value: true,  label: 'RX',     desc: 'Peso y movimientos estándar' },
                { value: false, label: 'Scaled',  desc: 'Con modificaciones' },
              ].map(opt => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setIsRx(opt.value)}
                  className="flex-1 py-2.5 px-4 text-sm font-medium transition-all"
                  style={isRx === opt.value
                    ? { background: 'var(--gradient-btn)', color: '#fff' }
                    : { color: 'var(--text-3)', backgroundColor: 'var(--surface-base)' }}
                >
                  {opt.label}
                  <span className="block text-xs font-normal mt-0.5 opacity-75">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-3)' }}>Notas (opcional)</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej: buen tiempo, mejoró su récord personal..."
              className="input text-sm w-full"
            />
          </div>

          {error && (
            <p className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: '#fef2f2', color: '#ef4444' }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--border-1)' }}>
          <button
            onClick={onClose}
            className="text-sm px-5 py-2 rounded-xl border font-medium transition-colors"
            style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-brand flex items-center gap-2 px-5 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Guardar resultado'}
          </button>
        </div>
      </div>
      </div>
    </>
  )
}

/* ─── Podium medal helper ────────────────────────── */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>
  if (rank === 2) return <span className="text-lg">🥈</span>
  if (rank === 3) return <span className="text-lg">🥉</span>
  return (
    <span className="text-sm font-bold tabular-nums w-7 text-center" style={{ color: 'var(--text-4)' }}>
      {rank}
    </span>
  )
}

/* ─── Entry row ──────────────────────────────────── */
function EntryRow({
  entry, scoreType, canEdit, onEdit, onDelete,
}: {
  entry: LeaderboardEntry
  scoreType: string
  canEdit?: boolean
  onEdit?: (entry: LeaderboardEntry) => void
  onDelete?: (entry: LeaderboardEntry) => void
}) {
  const initials = entry.user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
      style={{ borderColor: 'var(--border-1)' }}
    >
      <div className="w-9 flex items-center justify-center shrink-0">
        <RankBadge rank={entry.rank} />
      </div>

      {/* Avatar */}
      <div className="relative shrink-0">
        {entry.user.avatarUrl ? (
          <img
            src={mediaUrl(entry.user.avatarUrl)}
            alt={entry.user.name}
            className="w-9 h-9 rounded-full object-cover"
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: 'var(--gradient-btn)', color: '#fff' }}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Name + notes */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{entry.user.name}</p>
        {entry.notes && (
          <p className="text-xs truncate" style={{ color: 'var(--text-4)' }}>{entry.notes}</p>
        )}
      </div>

      {/* Score */}
      <div className="text-right shrink-0">
        <span
          className="text-sm font-bold tabular-nums"
          style={{ color: entry.rank <= 3 ? 'var(--brand-primary)' : 'var(--text-1)' }}
        >
          {entry.scoreFormatted}
        </span>
        {scoreType === 'TIME' && entry.rank === 1 && (
          <span className="ml-1 text-xs" style={{ color: 'var(--text-4)' }}>⚡</span>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit?.(entry)}
            title="Editar resultado"
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-4)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-2)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-4)' }}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete?.(entry)}
            title="Eliminar resultado"
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-4)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-4)' }}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Column ─────────────────────────────────────── */
function LeaderboardColumn({
  title,
  entries,
  scoreType,
  color,
  canEdit,
  onEdit,
  onDelete,
}: {
  title: string
  entries: LeaderboardEntry[]
  scoreType: string
  color: string
  canEdit?: boolean
  onEdit?: (entry: LeaderboardEntry) => void
  onDelete?: (entry: LeaderboardEntry) => void
}) {
  return (
    <div className="card rounded-2xl overflow-hidden flex-1 min-w-0">
      <div
        className="px-4 py-3 flex items-center gap-2 border-b"
        style={{ borderColor: 'var(--border-1)', backgroundColor: `${color}12` }}
      >
        <Trophy className="w-4 h-4" style={{ color }} />
        <span className="font-semibold text-sm" style={{ color }}>{title}</span>
        <span
          className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: `${color}18`, color }}
        >
          {entries.length} atleta{entries.length !== 1 ? 's' : ''}
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Trophy className="w-8 h-8" style={{ color: 'var(--text-4)' }} />
          <p className="text-sm" style={{ color: 'var(--text-4)' }}>Sin resultados aun</p>
        </div>
      ) : (
        <div>
          {entries.map(entry => (
            <EntryRow key={entry.id} entry={entry} scoreType={scoreType} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Main page ──────────────────────────────────── */
export default function WodLeaderboardPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { user, loadFromStorage } = useAuthStore()
  const wodId = params.id

  const [wod, setWod] = useState<WodDetail | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState<LeaderboardEntry | null>(null)

  const handleEdit = (entry: LeaderboardEntry) => {
    setEditingEntry(entry)
    setShowModal(true)
  }

  const handleDelete = async (entry: LeaderboardEntry) => {
    if (!wod) return
    if (!window.confirm(`¿Eliminar el resultado de ${entry.user.name}?`)) return
    try {
      await api.delete(`/wods/${wod.id}/results/${entry.userId}`)
      fetchData()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Error al eliminar el resultado')
    }
  }

  useEffect(() => { loadFromStorage() }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // GET /wods/:id does not exist — leaderboard endpoint returns scoreType + wodId
      // We also need title/date, so we fetch the full list and pick by id
      const [lbRes] = await Promise.all([
        api.get(`/wods/${wodId}/leaderboard`),
      ])
      const lb = lbRes.data

      // Build WodDetail from leaderboard response (has scoreType, wodId) plus list
      // Fallback: try to get wod info from list query
      let allEntries: LeaderboardEntry[] = []
      let lbScoreType: string = 'REPS'
      if (Array.isArray(lb)) {
        allEntries = lb
      } else if (Array.isArray(lb?.entries)) {
        allEntries = lb.entries
        lbScoreType = lb.scoreType ?? 'REPS'
      }

      // Fetch wod details from the list to get title + date
      const now = new Date()
      const past = new Date(); past.setDate(now.getDate() - 365)
      const future = new Date(); future.setDate(now.getDate() + 60)
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      try {
        const wodsRes = await api.get(`/wods?from=${fmt(past)}&to=${fmt(future)}`)
        const wods: any[] = Array.isArray(wodsRes.data) ? wodsRes.data : wodsRes.data?.wods ?? []
        const found = wods.find(w => w.id === wodId)
        if (found) {
          setWod({
            id: found.id,
            title: found.title ?? null,
            date: found.date,
            scoreType: found.scoreType ?? lbScoreType,
            classTypeId: found.classTypeId,
          })
        } else {
          // Minimal WOD info from leaderboard meta
          setWod({ id: lb.wodId ?? wodId, title: null, date: new Date().toISOString(), scoreType: lbScoreType, classTypeId: '' })
        }
      } catch {
        setWod({ id: lb.wodId ?? wodId, title: null, date: new Date().toISOString(), scoreType: lbScoreType, classTypeId: '' })
      }

      setLeaderboard({
        rx:     allEntries.filter(e => e.rx),
        scaled: allEntries.filter(e => !e.rx),
      })
    } catch {
      setError('No se pudo cargar el leaderboard. Verifica tu conexion o intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [wodId])

  useEffect(() => {
    if (!user) return
    fetchData()
    // Load members for the register modal (coaches/admins only)
    if (user.role === 'ADMIN' || user.role === 'COACH') {
      api.get('/users?role=MEMBER&limit=200')
        .then(({ data }) => setMembers(Array.isArray(data) ? data : data.users ?? data.data ?? []))
        .catch(() => {})
    }
  }, [user, fetchData])

  const canRegister = user?.role === 'ADMIN' || user?.role === 'COACH' || user?.role === 'SUPER_ADMIN'

  const scoreTypeMeta = SCORE_TYPE_META[wod?.scoreType ?? 'REPS'] ?? SCORE_TYPE_META['REPS']
  const ScoreIcon = scoreTypeMeta.icon

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
      return iso
    }
  }

  const totalAthletes = (leaderboard?.rx.length ?? 0) + (leaderboard?.scaled.length ?? 0)
  const hasResults = totalAthletes > 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/classes')}
            className="flex items-center gap-1.5 text-sm transition-colors px-3 py-2 rounded-lg"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ChevronLeft className="w-4 h-4" />
            Volver
          </button>
        </div>
        {canRegister && !loading && !error && (
          <button
            onClick={() => setShowModal(true)}
            className="btn-brand flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Registrar resultado
          </button>
        )}
      </div>

      {/* WOD info card */}
      {loading ? (
        <div className="card rounded-2xl p-6 space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/5" />
        </div>
      ) : wod ? (
        <div className="card rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--gradient-btn)' }}
            >
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
                {wod.title || 'WOD sin titulo'}
              </h1>
              <p className="text-sm mt-0.5 capitalize" style={{ color: 'var(--text-4)' }}>
                {formatDate(wod.date)}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <div
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}
                >
                  <ScoreIcon className="w-3 h-3" />
                  {scoreTypeMeta.label}
                  {scoreTypeMeta.winRule && (
                    <span className="opacity-60">— {scoreTypeMeta.winRule}</span>
                  )}
                </div>
                {hasResults && (
                  <div
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)', color: 'var(--brand-primary)' }}
                  >
                    {totalAthletes} atleta{totalAthletes !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Error state */}
      {error && (
        <div className="card rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#fef2f2' }}>
            <Trophy className="w-7 h-7" style={{ color: '#ef4444' }} />
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-1)' }}>No se pudo cargar</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-4)' }}>{error}</p>
          </div>
          <button
            onClick={fetchData}
            className="btn-brand px-5 py-2 text-sm font-medium"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && !error && (
        <div className="flex gap-4">
          {[1, 2].map(i => (
            <div key={i} className="card rounded-2xl flex-1 overflow-hidden">
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-1)' }}>
                <Skeleton className="h-5 w-24" />
              </div>
              {[1, 2, 3, 4].map(j => (
                <div key={j} className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border-1)' }}>
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-14" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Leaderboard columns */}
      {!loading && !error && leaderboard && (
        <>
          {!hasResults ? (
            <div className="card rounded-2xl p-12 flex flex-col items-center gap-4 text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--gradient-btn)', opacity: 0.7 }}
              >
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>Pizarra vacia</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-4)' }}>
                  {canRegister
                    ? 'Registra el primer resultado con el boton de arriba.'
                    : 'Todavia no hay resultados registrados para este WOD.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex gap-4 flex-wrap">
              {leaderboard.rx.length > 0 && (
                <LeaderboardColumn
                  title="RX"
                  entries={leaderboard.rx}
                  scoreType={wod?.scoreType ?? 'REPS'}
                  color="#6366f1"
                  canEdit={canRegister}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              )}
              {leaderboard.scaled.length > 0 && (
                <LeaderboardColumn
                  title="Scaled"
                  entries={leaderboard.scaled}
                  scoreType={wod?.scoreType ?? 'REPS'}
                  color="#f59e0b"
                  canEdit={canRegister}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              )}
              {/* If only one category has results, show both anyway (empty one shows placeholder) */}
              {leaderboard.rx.length > 0 && leaderboard.scaled.length === 0 && (
                <LeaderboardColumn
                  title="Scaled"
                  entries={[]}
                  scoreType={wod?.scoreType ?? 'REPS'}
                  color="#f59e0b"
                />
              )}
              {leaderboard.scaled.length > 0 && leaderboard.rx.length === 0 && (
                <LeaderboardColumn
                  title="RX"
                  entries={[]}
                  scoreType={wod?.scoreType ?? 'REPS'}
                  color="#6366f1"
                />
              )}
            </div>
          )}
        </>
      )}

      {/* Register/Edit modal */}
      {showModal && wod && (
        <RegisterModal
          wodId={wod.id}
          scoreType={wod.scoreType}
          members={members}
          editingEntry={editingEntry}
          onClose={() => { setShowModal(false); setEditingEntry(null) }}
          onSaved={() => {
            setShowModal(false)
            setEditingEntry(null)
            fetchData()
          }}
        />
      )}
    </div>
  )
}
