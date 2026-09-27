'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../../store/auth.store'
import api from '../../../../lib/api'
import Link from 'next/link'
import { Tag, Plus, Edit2, Trash2, Check, X, FileSpreadsheet } from 'lucide-react'
import {
  IconBarbell, IconWeight, IconDumbbell, IconGymnastics,
  IconRun, IconBolt, IconKayak, IconBike, IconYoga,
  IconSwimming, IconSwords, IconStar, IconTrophy,
  IconBuildingStadium, IconPencil,
  type TablerIcon,
} from '@tabler/icons-react'

const UNS = 'https://images.unsplash.com/photo-'

// ── Disciplinas ───────────────────────────────────────────────────────────────
export const DISCIPLINES: {
  value: string
  label: string
  description: string
  Icon: TablerIcon
  photo: string
}[] = [
  { value: 'crossfit',      label: 'CrossFit',    description: 'WOD funcional de alta intensidad',     Icon: IconBarbell,         photo: `${UNS}1571019613454-1cb2f99b2d8b?w=200&h=200&fit=crop&q=80` },
  { value: 'weightlifting', label: 'Halterofilia', description: 'Snatch, clean & jerk olímpico',       Icon: IconWeight,          photo: `${UNS}1517963879433-6ad2171073f4?w=200&h=200&fit=crop&q=80` },
  { value: 'powerlifting',  label: 'Fuerza',       description: 'Squat, deadlift, press de banca',     Icon: IconDumbbell,        photo: `${UNS}1534438327276-14e5300c3a48?w=200&h=200&fit=crop&q=80` },
  { value: 'gymnastics',    label: 'Gimnasia',     description: 'Muscle-ups, handstands, anillos',     Icon: IconGymnastics,      photo: `${UNS}1574680178814-51290dc37014?w=200&h=200&fit=crop&q=80` },
  { value: 'endurance',     label: 'Endurance',    description: 'Running, remo, ciclismo aeróbico',    Icon: IconRun,             photo: `${UNS}1552674605-db6ffd4facb5?w=200&h=200&fit=crop&q=80` },
  { value: 'hyrox',         label: 'HYROX',        description: 'Formato de carrera funcional',        Icon: IconBolt,            photo: `${UNS}1605296867304-46d5465a13f1?w=200&h=200&fit=crop&q=80` },
  { value: 'rowing',        label: 'Remo',         description: 'Ergómetro de remo y kayak',           Icon: IconKayak,           photo: `${UNS}1519311965067-36d3e5f33d39?w=200&h=200&fit=crop&q=80` },
  { value: 'cycling',       label: 'Ciclismo',     description: 'Assault bike, ski erg, bicicleta',    Icon: IconBike,            photo: `${UNS}1517649763962-0c623066013b?w=200&h=200&fit=crop&q=80` },
  { value: 'mobility',      label: 'Movilidad',    description: 'Yoga, stretching y recuperación',     Icon: IconYoga,            photo: `${UNS}1506126613408-eca07ce68773?w=200&h=200&fit=crop&q=80` },
  { value: 'swimming',      label: 'Natación',     description: 'Técnica de nado y acondicionamiento', Icon: IconSwimming,        photo: `${UNS}1530549387789-4c1017266635?w=200&h=200&fit=crop&q=80` },
  { value: 'boxing',        label: 'Combate',      description: 'Boxeo, muay thai, artes marciales',   Icon: IconSwords,          photo: `${UNS}1549719386-74fd2e52b4d4?w=200&h=200&fit=crop&q=80` },
  { value: 'kids',          label: 'Kids',         description: 'CrossFit adaptado para niños',        Icon: IconStar,            photo: `${UNS}1547137354-f7aad33f17d5?w=200&h=200&fit=crop&q=80` },
  { value: 'competition',   label: 'Competencia',  description: 'Preparación para competencias',       Icon: IconTrophy,          photo: `${UNS}1534258936925-c58bed479fcb?w=200&h=200&fit=crop&q=80` },
  { value: 'open',          label: 'Open Gym',     description: 'Entrenamiento libre',                 Icon: IconBuildingStadium, photo: `${UNS}1534367610401-9f5ed68180aa?w=200&h=200&fit=crop&q=80` },
  { value: 'manual',        label: 'Manual',       description: 'Estructura libre / personalizada',    Icon: IconPencil,          photo: `${UNS}1557804506-669a67965ba0?w=200&h=200&fit=crop&q=80` },
]

export const getDiscipline = (value: string) => DISCIPLINES.find(d => d.value === value)

// ── Thumbnail de disciplina (con fallback al ícono si la foto falla) ──────────
function DisciplineThumb({
  disc, color, fallbackChar, size = 48,
}: {
  disc: ReturnType<typeof getDiscipline>
  color: string
  fallbackChar: string
  size?: number
}) {
  const [err, setErr] = useState(false)
  const sz = `${size}px`
  const radius = size >= 48 ? '12px' : '10px'

  if (disc && !err) {
    return (
      <div style={{ width: sz, height: sz, borderRadius: radius, overflow: 'hidden', flexShrink: 0, border: `2px solid ${color}25` }}>
        <img
          src={disc.photo}
          alt={disc.label}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setErr(true)}
        />
      </div>
    )
  }

  return (
    <div style={{
      width: sz, height: sz, borderRadius: radius, flexShrink: 0,
      backgroundColor: color + '18', border: `1.5px solid ${color}35`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {disc
        ? <disc.Icon size={size * 0.42} stroke={1.75} style={{ color }} />
        : <span style={{ fontSize: size * 0.3, fontWeight: 700, color }}>{fallbackChar}</span>
      }
    </div>
  )
}

const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899',
  '#14b8a6', '#8b5cf6', '#ef4444', '#0ea5e9',
  '#f97316', '#64748b',
]

type ClassTypeForm = { name: string; description: string; color: string; discipline: string }
const emptyForm = (): ClassTypeForm => ({ name: '', description: '', color: '#6366f1', discipline: '' })

// ── Selector de disciplina ────────────────────────────────────────────────────
function DisciplinePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set())
  const markErr = (val: string) => setImgErrors(prev => new Set([...prev, val]))

  return (
    <div className="grid grid-cols-5 gap-2">
      {DISCIPLINES.map(({ value: val, label, description, Icon, photo }) => {
        const selected = value === val
        const hasErr = imgErrors.has(val)
        return (
          <button
            key={val}
            type="button"
            onClick={() => onChange(selected ? '' : val)}
            title={description}
            className="flex flex-col items-center rounded-xl border overflow-hidden transition-all"
            style={selected
              ? { borderColor: 'var(--brand-primary)', boxShadow: '0 0 0 2px var(--brand-primary)' }
              : { borderColor: 'var(--border-1)' }
            }
          >
            {/* Foto */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '1', overflow: 'hidden', backgroundColor: 'var(--surface-hover)' }}>
              {!hasErr ? (
                <img
                  src={photo}
                  alt={label}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  onError={() => markErr(val)}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={22} stroke={1.5} style={{ color: selected ? 'var(--brand-primary)' : 'var(--text-3)' }} />
                </div>
              )}
              {selected && (
                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(99,102,241,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check className="w-5 h-5" style={{ color: 'white', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
                </div>
              )}
            </div>
            {/* Label */}
            <span
              className="text-xs font-medium leading-tight text-center py-1.5 px-1"
              style={{ color: selected ? 'var(--brand-primary)' : 'var(--text-4)' }}
            >
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Campos del formulario ─────────────────────────────────────────────────────
function ClassTypeFields({
  form,
  setForm,
}: {
  form: ClassTypeForm
  setForm: (fn: (f: ClassTypeForm) => ClassTypeForm) => void
}) {
  const set = (k: keyof ClassTypeForm, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
            Nombre *
          </label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            required
            placeholder="ej: CrossFit, Yoga, Weightlifting"
            className="input"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
            Descripción
          </label>
          <input
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Descripción opcional..."
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-2)' }}>
          Disciplina
          <span className="ml-1 font-normal" style={{ color: 'var(--text-4)' }}>(define la foto representativa)</span>
        </label>
        <DisciplinePicker value={form.discipline} onChange={v => set('discipline', v)} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-2)' }}>Color</label>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => set('color', c)}
                className="w-7 h-7 rounded-full border-2 transition-transform"
                style={{
                  backgroundColor: c,
                  borderColor: form.color === c ? '#fff' : 'transparent',
                  transform: form.color === c ? 'scale(1.15)' : 'scale(1)',
                }}
              />
            ))}
          </div>
          <input
            type="color"
            value={form.color}
            onChange={e => set('color', e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border-0"
            title="Color personalizado"
          />
        </div>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function ClassTypesPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()
  const [classTypes, setClassTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState<ClassTypeForm>(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ClassTypeForm>(emptyForm())
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchTypes()
  }, [user])

  const fetchTypes = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/class-types')
      setClassTypes(data)
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }

  const buildPayload = (f: ClassTypeForm) => ({
    name: f.name,
    description: f.description || undefined,
    color: f.color,
    discipline: f.discipline || undefined,
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.post('/class-types', buildPayload(form))
      setSuccess('Tipo de clase creado')
      setShowForm(false)
      setForm(emptyForm())
      fetchTypes()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al crear')
    } finally { setSaving(false) }
  }

  const startEdit = (ct: any) => {
    setEditingId(ct.id)
    setEditForm({
      name: ct.name,
      description: ct.description || '',
      color: ct.color || '#6366f1',
      discipline: ct.discipline || '',
    })
  }

  const handleSaveEdit = async (id: string) => {
    setSavingEdit(true)
    setError('')
    try {
      await api.put(`/class-types/${id}`, buildPayload(editForm))
      setSuccess('Tipo de clase actualizado')
      setEditingId(null)
      fetchTypes()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al actualizar')
    } finally { setSavingEdit(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este tipo de clase?')) return
    try {
      await api.delete(`/class-types/${id}`)
      setSuccess('Tipo de clase eliminado')
      fetchTypes()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al eliminar')
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)' }}
          >
            <Tag className="w-5 h-5" style={{ color: 'var(--brand-primary)' }} />
          </div>
          <div>
            <h1 className="section-title">Tipos de clase</h1>
            <p className="text-sm" style={{ color: 'var(--text-4)' }}>
              Gestiona los tipos de clases del gimnasio
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/settings/class-types/import"
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border font-medium transition-colors"
            style={{ borderColor: 'var(--border-1)', color: 'var(--text-2)', backgroundColor: 'var(--surface-card)' }}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importar Excel
          </Link>
          <button
            onClick={() => { setShowForm(!showForm); setEditingId(null); setError(''); setSuccess('') }}
            className="btn-brand flex items-center gap-2 px-4 py-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            {showForm ? 'Cancelar' : 'Nuevo tipo'}
          </button>
        </div>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Formulario nuevo */}
      {showForm && (
        <form onSubmit={handleCreate} className="card rounded-xl p-6 space-y-5">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
            Nuevo tipo de clase
          </h2>
          <ClassTypeFields form={form} setForm={setForm as any} />
          <button
            type="submit"
            disabled={saving}
            className="btn-brand w-full py-2.5 text-sm disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Crear tipo de clase'}
          </button>
        </form>
      )}

      {/* Lista */}
      {loading ? (
        <div className="card rounded-xl p-20 text-center text-sm" style={{ color: 'var(--text-4)' }}>
          Cargando...
        </div>
      ) : classTypes.length === 0 ? (
        <div className="card rounded-xl p-16 flex flex-col items-center gap-4 text-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--surface-hover)' }}
          >
            <Tag className="w-7 h-7" style={{ color: 'var(--text-4)' }} />
          </div>
          <div>
            <p className="font-medium" style={{ color: 'var(--text-2)' }}>No hay tipos de clase</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-4)' }}>
              Crea tipos para poder programar clases
            </p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-brand px-5 py-2 text-sm">
            + Crear tipo
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {classTypes.map(ct => {
            const disc = getDiscipline(ct.discipline)
            const color = ct.color || '#6366f1'
            return (
              <div key={ct.id} className="card rounded-xl p-4">
                {editingId === ct.id ? (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                        Editar tipo
                      </h3>
                      <button onClick={() => setEditingId(null)} style={{ color: 'var(--text-4)' }}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <ClassTypeFields form={editForm} setForm={setEditForm as any} />
                    <button
                      onClick={() => handleSaveEdit(ct.id)}
                      disabled={savingEdit}
                      className="btn-brand w-full py-2 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {/* Foto disciplina */}
                    <DisciplineThumb disc={disc} color={color} fallbackChar={ct.name[0]} size={48} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                          {ct.name}
                        </p>
                        {disc && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: color + '14', color }}
                          >
                            {disc.label}
                          </span>
                        )}
                      </div>
                      {ct.description && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-4)' }}>
                          {ct.description}
                        </p>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(ct)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--text-4)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(ct.id)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--text-4)' }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = '#fee2e2'
                          e.currentTarget.style.color = '#dc2626'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.color = 'var(--text-4)'
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
