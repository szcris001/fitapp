'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../../store/auth.store'
import api from '../../../../lib/api'
import { Plus, X, Search, Check, Dumbbell } from 'lucide-react'
import { CF_MOVEMENTS, CF_CATEGORIES, MOV_CATEGORIES } from '../../../../lib/movements'

interface LibraryMovement {
  name: string
  cat: string
}

function normalize(raw: any[]): LibraryMovement[] {
  return raw.map(item =>
    typeof item === 'string' ? { name: item, cat: 'Personalizado' } : item
  )
}

export default function MovementsPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()

  const [library, setLibrary] = useState<LibraryMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string>('Todos')

  // Formulario movimiento personalizado
  const [customName, setCustomName] = useState('')
  const [customCat, setCustomCat] = useState('Personalizado')

  useEffect(() => { loadFromStorage() }, [])

  useEffect(() => {
    if (!user) return  // el layout redirige a /login
    api.get('/gyms/me/movements-library')
      .then(({ data }) => setLibrary(normalize(data ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  const persist = async (updated: LibraryMovement[]) => {
    setSaving(true)
    try {
      await api.put('/gyms/me/movements-library', { movements: updated })
      setLibrary(updated)
    } catch {
    } finally { setSaving(false) }
  }

  const inLibrary = (name: string) =>
    library.some(m => m.name.toLowerCase() === name.toLowerCase())

  const toggleCF = (name: string, cat: string) => {
    if (inLibrary(name)) {
      persist(library.filter(m => m.name.toLowerCase() !== name.toLowerCase()))
    } else {
      persist([...library, { name, cat }])
    }
  }

  const addCustom = async () => {
    const name = customName.trim()
    if (!name || inLibrary(name)) return
    await persist([...library, { name, cat: customCat }])
    setCustomName('')
  }

  const removeFromLibrary = (name: string) =>
    persist(library.filter(m => m.name.toLowerCase() !== name.toLowerCase()))

  // Catálogo filtrado
  const filteredCF = useMemo(() => {
    const q = search.trim().toLowerCase()
    return CF_MOVEMENTS.filter(m => {
      const matchSearch = !q || m.name.toLowerCase().includes(q)
      const matchCat = activeCat === 'Todos' || m.cat === activeCat
      return matchSearch && matchCat
    })
  }, [search, activeCat])

  const catTabs = ['Todos', ...CF_CATEGORIES.map(c => c.name)]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--brand-primary)' }} />
      </div>
    )
  }

  const customMovements = library.filter(m => !CF_MOVEMENTS.some(cf => cf.name.toLowerCase() === m.name.toLowerCase()))

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
              Los movimientos activados aquí son los que verán tus alumnos en la app para registrar sus marcas personales
            </p>
          </div>
        </div>

        {/* Contador resumen */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold px-3 py-1 rounded-full"
            style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 15%, transparent)', color: 'var(--brand-primary)' }}>
            {library.length} movimientos activos
          </span>
          {saving && (
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>Guardando…</span>
          )}
        </div>
      </div>

      {/* ── Catálogo estándar ── */}
      <div>
        <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
          Catálogo CrossFit estándar
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-3)' }}>
          Activa los movimientos que usa tu gimnasio. Toca uno para agregarlo o quitarlo de tu biblioteca.
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
          const moves = filteredCF.filter(m => m.cat === cat.name)
          if (moves.length === 0) return null
          return (
            <div key={cat.name} className="mb-5">
              <p className="text-xs font-bold mb-2 flex items-center gap-2"
                style={{ color: cat.color, letterSpacing: '0.05em' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                {cat.name.toUpperCase()}
              </p>
              <div className="flex flex-wrap gap-2">
                {moves.map(m => {
                  const active = inLibrary(m.name)
                  return (
                    <button
                      key={m.name}
                      onClick={() => toggleCF(m.name, m.cat)}
                      disabled={saving}
                      title={active ? 'Quitar de mi biblioteca' : 'Agregar a mi biblioteca'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all disabled:opacity-50"
                      style={active
                        ? { backgroundColor: cat.color, color: '#fff', boxShadow: `0 0 0 2px ${cat.color}40` }
                        : { backgroundColor: cat.color + '14', color: cat.color, border: `1px solid ${cat.color}30` }}>
                      {active
                        ? <Check className="w-3.5 h-3.5 shrink-0" />
                        : <Plus className="w-3.5 h-3.5 shrink-0" />}
                      {m.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {filteredCF.length === 0 && (
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
        </div>

        {/* Lista de custom */}
        {customMovements.length === 0 ? (
          <div className="text-center py-8 rounded-xl border border-dashed" style={{ borderColor: 'var(--border-2)' }}>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Sin movimientos propios todavía.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {customMovements.map(m => (
              <span key={m.name}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-2)', border: '1px solid var(--border-1)' }}>
                {m.name}
                <span className="text-xs opacity-60">{m.cat}</span>
                <button
                  onClick={() => removeFromLibrary(m.name)}
                  disabled={saving}
                  className="ml-1 transition-colors disabled:opacity-50"
                  style={{ color: 'var(--text-4)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
