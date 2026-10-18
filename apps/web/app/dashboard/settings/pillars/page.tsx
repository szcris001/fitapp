'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../../../store/auth.store'
import api from '../../../../lib/api'
import { Award, Plus, Check } from 'lucide-react'

interface Pillar {
  id: string
  type: 'STRENGTH' | 'ATTENDANCE' | 'TENURE' | 'GYMNASTICS' | 'MANUAL'
  name: string
  description: string | null
  icon: string | null
  isActive: boolean
  config: any
}

const TYPE_LABEL: Record<string, string> = {
  STRENGTH: 'Fuerza', ATTENDANCE: 'Asistencia', TENURE: 'Antigüedad', GYMNASTICS: 'Gimnasia',
}

export default function PillarsSettingsPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [pillars, setPillars] = useState<Pillar[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Formulario de nuevo reconocimiento manual
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) return // el layout redirige a /login
    api.get('/pillars').then(({ data }) => setPillars(data ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [user])

  const automatic = pillars.filter(p => p.type !== 'MANUAL').sort((a, b) => TYPE_LABEL[a.type]?.localeCompare(TYPE_LABEL[b.type] ?? ''))
  const manual = pillars.filter(p => p.type === 'MANUAL')

  const save = async (pillar: Pillar, patch: Partial<Pillar>) => {
    setSavingId(pillar.id)
    setError('')
    try {
      const { data } = await api.put(`/pillars/${pillar.id}`, patch)
      setPillars(prev => prev.map(p => p.id === pillar.id ? data : p))
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se pudo guardar el pilar')
    } finally {
      setSavingId(null)
    }
  }

  const addManual = async () => {
    const name = newName.trim()
    if (!name) return
    setSavingId('new')
    setError('')
    try {
      const { data } = await api.post('/pillars', { name, icon: newIcon.trim() || undefined })
      setPillars(prev => [...prev, data])
      setNewName(''); setNewIcon('')
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se pudo crear el reconocimiento')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand-primary)' }} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)' }}>
            <Award className="w-5 h-5" style={{ color: 'var(--brand-primary)' }} />
          </div>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>Pilares de reconocimiento</h1>
            <p className="text-sm" style={{ color: 'var(--text-4)' }}>
              Ajustá cuánto le exigís a tus alumnos para ganar cada pilar, y agregá los reconocimientos que otorgan a mano los coaches.
            </p>
          </div>
        </div>
        {error && <p className="text-xs mt-3" style={{ color: '#ef4444' }}>{error}</p>}
      </div>

      {/* Pilares automáticos */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Automáticos</h2>
        {automatic.map(pillar => (
          <AutomaticPillarCard key={pillar.id} pillar={pillar} saving={savingId === pillar.id} onSave={save} />
        ))}
      </div>

      {/* Reconocimientos manuales */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Otorgados a mano por el coach</h2>
        <p className="text-sm" style={{ color: 'var(--text-4)' }}>
          Sin cálculo automático — el admin/coach elige a quién reconocer desde la ficha del alumno.
        </p>

        <div className="space-y-2">
          {manual.map(pillar => (
            <div key={pillar.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ borderColor: 'var(--border-1)' }}>
              <span className="text-lg">{pillar.icon || '🤝'}</span>
              <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-1)' }}>{pillar.name}</span>
              <ToggleActive pillar={pillar} saving={savingId === pillar.id} onSave={save} />
            </div>
          ))}
        </div>

        <div className="card rounded-xl p-5 border-2 border-dashed" style={{ borderColor: 'var(--brand-primary)' }}>
          <div className="flex gap-3 flex-wrap items-end">
            <div className="w-16">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>Ícono</label>
              <input value={newIcon} onChange={e => setNewIcon(e.target.value)} placeholder="🤝" className="input w-full text-center" />
            </div>
            <div className="flex-1 min-w-40">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>Nombre</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ej: Mejor compañero" className="input w-full" />
            </div>
            <button onClick={addManual} disabled={savingId === 'new' || !newName.trim()}
              className="btn-brand flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50 whitespace-nowrap">
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleActive({ pillar, saving, onSave }: { pillar: Pillar; saving: boolean; onSave: (p: Pillar, patch: Partial<Pillar>) => void }) {
  return (
    <button
      onClick={() => onSave(pillar, { isActive: !pillar.isActive })}
      disabled={saving}
      className="text-xs px-3 py-1 rounded-full font-medium disabled:opacity-50"
      style={pillar.isActive
        ? { backgroundColor: 'var(--surface-hover)', color: 'var(--text-2)' }
        : { backgroundColor: '#ef444415', color: '#ef4444' }}>
      {pillar.isActive ? 'Activo' : 'Inactivo'}
    </button>
  )
}

function AutomaticPillarCard({ pillar, saving, onSave }: { pillar: Pillar; saving: boolean; onSave: (p: Pillar, patch: Partial<Pillar>) => void }) {
  const [config, setConfig] = useState<any>(pillar.config)
  const [dirty, setDirty] = useState(false)

  const set = (key: string, value: unknown) => { setConfig((c: any) => ({ ...c, [key]: value })); setDirty(true) }

  const handleSave = () => {
    const parsed = pillar.type === 'TENURE'
      ? { milestonesMonths: String(config.milestonesMonths).split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n)) }
      : config
    onSave(pillar, { config: parsed })
    setDirty(false)
  }

  return (
    <div className="card rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{pillar.icon}</span>
        <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{pillar.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <ToggleActive pillar={pillar} saving={saving} onSave={onSave} />
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-end">
        {pillar.type === 'STRENGTH' && (
          <>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>Movimientos mínimos con mejora</label>
              <input type="number" min={1} value={config.minMovements} onChange={e => set('minMovements', Number(e.target.value))} className="input w-32" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>% mínimo de mejora</label>
              <input type="number" min={1} value={config.minImprovementPct} onChange={e => set('minImprovementPct', Number(e.target.value))} className="input w-32" />
            </div>
          </>
        )}
        {pillar.type === 'ATTENDANCE' && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>Clases mínimas en el semestre</label>
            <input type="number" min={1} value={config.minClassesAttended} onChange={e => set('minClassesAttended', Number(e.target.value))} className="input w-32" />
          </div>
        )}
        {pillar.type === 'GYMNASTICS' && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>Hitos mínimos desbloqueados</label>
            <input type="number" min={1} value={config.minMilestonesUnlocked} onChange={e => set('minMilestonesUnlocked', Number(e.target.value))} className="input w-32" />
          </div>
        )}
        {pillar.type === 'TENURE' && (
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>Meses de antigüedad que otorgan hito (separados por coma)</label>
            <input
              value={Array.isArray(config.milestonesMonths) ? config.milestonesMonths.join(', ') : config.milestonesMonths}
              onChange={e => set('milestonesMonths', e.target.value)}
              placeholder="6, 12, 24, 36, 60"
              className="input w-full"
            />
          </div>
        )}
        <button onClick={handleSave} disabled={saving || !dirty}
          className="btn-brand flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50 whitespace-nowrap">
          <Check className="w-4 h-4" />
          Guardar
        </button>
      </div>
    </div>
  )
}
