'use client'
import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '../../../../store/auth.store'
import api from '../../../../lib/api'
import { Plus, X, Search, Dumbbell } from 'lucide-react'
import { CF_CATEGORIES, MOV_CATEGORIES } from '../../../../lib/movements'

interface Movement {
  id: string
  nombre: string
  categoria: string
  isOfficial: boolean
}

const FALLBACK_COLOR = { color: '#6366f1', bg: '#eef2ff' }
const colorFor = (cat: string) => CF_CATEGORIES.find(c => c.name === cat) ?? { ...FALLBACK_COLOR, name: cat }

export default function MovementsPage() {
  const { user, loadFromStorage } = useAuthStore()

  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string>('Todos')

  // Formulario movimiento personalizado
  const [customName, setCustomName] = useState('')
  const [customCat, setCustomCat] = useState('Personalizado')

  useEffect(() => { loadFromStorage() }, [])

  useEffect(() => {
    if (!user) return  // el layout redirige a /login
    api.get('/movements')
      .then(({ data }) => setMovements(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  const officialMovements = useMemo(() => movements.filter(m => m.isOfficial), [movements])
  const customMovements = useMemo(() => movements.filter(m => !m.isOfficial), [movements])

  const addCustom = async () => {
    const nombre = customName.trim()
    if (!nombre) return
    setSaving(true)
    setError('')
    try {
      const { data } = await api.post('/movements', { nombre, categoria: customCat })
      setMovements(prev => [...prev, data])
      setCustomName('')
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se pudo agregar el movimiento')
    } finally {
      setSaving(false)
    }
  }

  const removeCustom = async (id: string) => {
    setSaving(true)
    try {
      await api.delete(`/movements/${id}`)
      setMovements(prev => prev.filter(m => m.id !== id))
    } catch {
    } finally { setSaving(false) }
  }

  // Catálogo oficial filtrado (solo lectura)
  const filteredOfficial = useMemo(() => {
    const q = search.trim().toLowerCase()
    return officialMovements.filter(m => {
      const matchSearch = !q || m.nombre.toLowerCase().includes(q)
      const matchCat = activeCat === 'Todos' || m.categoria === activeCat
      return matchSearch && matchCat
    })
  }, [officialMovements, search, activeCat])

  const catTabs = ['Todos', ...CF_CATEGORIES.map(c => c.name)]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--brand-primary)' }} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">

      {/* ── Encabezado ── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)' }}>
            <Dumbbell className="w-5 h-5" style={{ color: 'var(--brand-primary)' }} />
          </div>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>
              Biblioteca de movimientos
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              El catálogo oficial está disponible para todos los gimnasios. Acá podés sumar los movimientos propios de tu box.
            </p>
          </div>
        </div>
      </div>

      {/* ── Catálogo oficial (solo lectura) ── */}
      <div>
        <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
          Catálogo CrossFit estándar
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-3)' }}>
          Siempre disponible para tus alumnos y coaches al registrar marcas o armar un WOD — es de referencia, no se puede desactivar.
        </p>

        {/* Buscador */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-4)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar movimiento…"
            className="input w-full pl-9"
          />
        </div>

        {/* Tabs de categoría */}
        <div className="flex gap-1.5 flex-wrap mb-4">
          {catTabs.map(cat => {
            const cfCat = CF_CATEGORIES.find(c => c.name === cat)
            const isActive = activeCat === cat
            return (
              <button key={cat} onClick={() => setActiveCat(cat)}
                className="text-xs px-3 py-1 rounded-full font-medium transition-colors"
                style={isActive
                  ? { backgroundColor: cfCat?.color ?? 'var(--brand-primary)', color: '#fff' }
                  : { backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
                {cat}
              </button>
            )
          })}
        </div>

        {/* Grid de movimientos por categoría */}
        {(activeCat === 'Todos' ? CF_CATEGORIES : CF_CATEGORIES.filter(c => c.name === activeCat)).map(cat => {
          const moves = filteredOfficial.filter(m => m.categoria === cat.name)
          if (moves.length === 0) return null
          return (
            <div key={cat.name} className="mb-5">
              <p className="text-xs font-bold mb-2 flex items-center gap-2"
                style={{ color: cat.color, letterSpacing: '0.05em' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                {cat.name.toUpperCase()}
              </p>
              <div className="flex flex-wrap gap-2">
                {moves.map(m => (
                  <span
                    key={m.id}
                    className="px-3 py-1.5 rounded-full text-sm font-medium"
                    style={{ backgroundColor: cat.color + '14', color: cat.color, border: `1px solid ${cat.color}30` }}>
                    {m.nombre}
                  </span>
                ))}
              </div>
            </div>
          )
        })}

        {filteredOfficial.length === 0 && (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-3)' }}>
            No hay movimientos que coincidan con la búsqueda.
          </p>
        )}
      </div>

      {/* ── Movimientos personalizados ── */}
      <div>
        <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
          Movimientos propios del gimnasio
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-3)' }}>
          Agrega movimientos que uses en tu box y no estén en el catálogo estándar.
        </p>

        {/* Formulario */}
        <div className="card rounded-xl p-5 border-2 mb-4" style={{ borderColor: 'var(--brand-primary)', borderStyle: 'dashed' }}>
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-40">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>Nombre</label>
              <input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
                placeholder="ej: Sled Push, Ski Jump, Battle Rope…"
                className="input w-full"
              />
            </div>
            <div className="min-w-40">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>Categoría</label>
              <select value={customCat} onChange={e => setCustomCat(e.target.value)} className="input w-full">
                {MOV_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button
              onClick={addCustom}
              disabled={saving || !customName.trim()}
              className="btn-brand flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50 whitespace-nowrap">
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          </div>
          {error && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>{error}</p>}
        </div>

        {/* Lista de custom */}
        {customMovements.length === 0 ? (
          <div className="text-center py-8 rounded-xl border border-dashed" style={{ borderColor: 'var(--border-2)' }}>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Sin movimientos propios todavía.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {customMovements.map(m => {
              const cat = colorFor(m.categoria)
              return (
                <span key={m.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-2)', border: '1px solid var(--border-1)' }}>
                  {m.nombre}
                  <span className="text-xs" style={{ color: cat.color }}>{m.categoria}</span>
                  <button
                    onClick={() => removeCustom(m.id)}
                    disabled={saving}
                    className="ml-1 transition-colors disabled:opacity-50"
                    style={{ color: 'var(--text-4)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
