'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'
import {
  CreditCard, Plus, Clock, Edit2, Check, X, Trash2,
  Search, FlaskConical, Infinity, Calendar, Layers,
} from 'lucide-react'

// Toda membresía dura 30 días (regla de negocio; la API ignora cualquier otra duración)
const MEMBERSHIP_DAYS = 30

const currencies = ['CLP', 'ARS', 'COP', 'MXN', 'PEN', 'BRL', 'USD']

// ─── Types ───────────────────────────────────────────────────────
type Plan = {
  id: string
  name: string
  description?: string
  priceCents: number
  currency: string
  durationDays: number
  maxClasses?: number | null
  isTrial: boolean
  isActive: boolean
}

type FormShape = {
  name: string
  description: string
  priceCents: string
  currency: string
  maxClasses: string
  isTrial: boolean
}

const emptyForm = (): FormShape => ({
  name: '', description: '', priceCents: '', currency: 'CLP',
  maxClasses: '', isTrial: false,
})

// ─── Skeleton card ───────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="card rounded-xl p-7 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-4 w-16 rounded-full" />
        <div className="skeleton h-6 w-36 rounded-lg" />
        <div className="skeleton h-3.5 w-48 rounded" />
      </div>
      <div className="skeleton h-10 w-28 rounded-lg" />
      <div className="flex flex-col gap-2.5">
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-4 w-5/6 rounded" />
      </div>
      <div className="flex gap-2 mt-auto">
        <div className="skeleton h-9 flex-1 rounded-lg" />
        <div className="skeleton h-9 w-12 rounded-lg" />
      </div>
    </div>
  )
}

// ─── Feature row ─────────────────────────────────────────────────
function FeatureRow({ icon, text, faded }: { icon: React.ReactNode; text: string; faded?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: faded ? 'var(--text-4)' : 'var(--primary)', flexShrink: 0, display: 'flex' }}>
        {icon}
      </span>
      <span style={{ fontSize: 13, color: faded ? 'var(--text-4)' : 'var(--text-2)', fontWeight: 500 }}>
        {text}
      </span>
    </div>
  )
}

// ─── Plan card (read view) ────────────────────────────────────────
function PlanCard({
  plan,
  onEdit,
  onDelete,
}: {
  plan: Plan
  onEdit: (plan: Plan) => void
  onDelete: (id: string) => void
}) {
  const priceDisplay =
    plan.isTrial
      ? 'Gratis'
      : plan.priceCents != null
      ? plan.priceCents.toLocaleString('es-CL')
      : '—'

  return (
    <div
      className="card rounded-xl"
      style={{
        position: 'relative',
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        border: '1px solid var(--border-1)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {plan.isTrial && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              color: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.12)',
              padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(124,58,237,0.25)',
            }}>
              TRIAL
            </span>
          )}
          {!plan.isActive && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              color: 'var(--text-4)', backgroundColor: 'var(--surface-hover)',
              padding: '3px 10px', borderRadius: 20,
            }}>
              PAUSADO
            </span>
          )}
        </div>
        <h3 style={{
          fontSize: 19, fontWeight: 800, color: 'var(--text-1)',
          margin: 0, letterSpacing: '-0.02em',
          fontFamily: 'var(--font-display)',
        }}>
          {plan.name}
        </h3>
        {plan.description && (
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
            {plan.description}
          </p>
        )}
      </div>

      {/* Price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {plan.isTrial ? (
          <span style={{
            fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em',
            fontFamily: 'var(--font-display)',
            background: 'var(--gradient-btn)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Gratis
          </span>
        ) : (
          <>
            <span style={{
              fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em',
              color: 'var(--text-1)', fontFamily: 'var(--font-display)',
            }}>
              {priceDisplay}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-4)', fontWeight: 500 }}>
              {plan.currency} / mes
            </span>
          </>
        )}
      </div>

      {/* Features */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
        <FeatureRow
          icon={<Calendar style={{ width: 14, height: 14 }} />}
          text={`${MEMBERSHIP_DAYS} días de vigencia`}
        />
        <FeatureRow
          icon={<Layers style={{ width: 14, height: 14 }} />}
          text={plan.maxClasses != null ? `${plan.maxClasses} clases incluidas` : 'Clases ilimitadas'}
        />
        {plan.isTrial && (
          <FeatureRow
            icon={<FlaskConical style={{ width: 14, height: 14 }} />}
            text="Plan de prueba"
          />
        )}
        {!plan.isActive && (
          <FeatureRow
            icon={<Clock style={{ width: 14, height: 14 }} />}
            text="Plan pausado"
            faded
          />
        )}
      </div>

      {/* Divider */}
      <div className="divider" />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onEdit(plan)}
          className="btn-secondary flex-1 py-2 text-sm flex items-center justify-center gap-1.5"
          style={{ borderRadius: 10 }}
        >
          <Edit2 style={{ width: 13, height: 13 }} />
          Editar
        </button>
        <button
          onClick={() => onDelete(plan.id)}
          style={{
            padding: '8px 14px', borderRadius: 10, fontSize: 13,
            color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.15)', cursor: 'pointer',
            transition: 'background 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.18)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.08)' }}
        >
          <Trash2 style={{ width: 15, height: 15 }} />
        </button>
      </div>
    </div>
  )
}

// ─── Edit card (inline) ───────────────────────────────────────────
function EditCard({
  plan,
  onSave,
  onCancel,
  saving,
}: {
  plan: Plan
  onSave: (id: string, form: FormShape) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<FormShape>({
    name: plan.name,
    description: plan.description || '',
    priceCents: String(plan.priceCents),
    currency: plan.currency,
    maxClasses: plan.maxClasses != null ? String(plan.maxClasses) : '',
    isTrial: plan.isTrial ?? false,
  })

  return (
    <div className="card rounded-xl p-7 space-y-5" style={{ border: '1px solid var(--primary)' }}>
      <div className="flex items-center justify-between">
        <h3 style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)', margin: 0 }}>
          Editar plan
        </h3>
        <button
          onClick={onCancel}
          style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>
      <PlanFormFields form={form} setForm={setForm} currencies={currencies} />
      <button
        onClick={() => onSave(plan.id, form)}
        disabled={saving}
        className="btn-brand w-full py-2.5 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Check style={{ width: 14, height: 14 }} />
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────
function EmptyState({ hasSearch, onCreateClick }: { hasSearch: boolean; onCreateClick: () => void }) {
  return (
    <div
      className="card rounded-xl"
      style={{
        padding: '72px 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        textAlign: 'center',
      }}
    >
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--primary-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CreditCard style={{ width: 28, height: 28, color: 'var(--primary)' }} />
      </div>
      <div>
        <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-1)', margin: '0 0 6px' }}>
          {hasSearch ? 'Sin resultados' : 'Sin planes todavia'}
        </p>
        <p style={{ color: 'var(--text-3)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          {hasSearch
            ? 'Intenta con otro termino de busqueda.'
            : 'Crea tu primer plan de membresia para empezar a registrar alumnos.'}
        </p>
      </div>
      {!hasSearch && (
        <button
          onClick={onCreateClick}
          className="btn-brand flex items-center gap-2 px-5 py-2.5 text-sm"
          style={{ marginTop: 8 }}
        >
          <Plus style={{ width: 15, height: 15 }} />
          Crear primer plan
        </button>
      )}
    </div>
  )
}

// ─── Form fields (shared create / edit) ──────────────────────────
function PlanFormFields({
  form,
  setForm,
  currencies,
}: {
  form: FormShape
  setForm: React.Dispatch<React.SetStateAction<FormShape>>
  currencies: string[]
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Trial toggle */}
      <div className="col-span-2">
        <label className="flex items-center gap-2.5 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={form.isTrial}
            onChange={e =>
              setForm(f => ({
                ...f,
                isTrial: e.target.checked,
                priceCents: e.target.checked ? '0' : f.priceCents,
              }))
            }
            className="w-4 h-4 rounded"
            style={{ accentColor: 'var(--primary)' }}
          />
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>Plan de prueba</span>
          <span style={{ fontSize: 12, color: 'var(--text-4)' }}>(gratuito, membresia TRIAL)</span>
        </label>
      </div>

      {/* Name */}
      <div className="col-span-2">
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-3)', marginBottom: 6 }}>
          Nombre *
        </label>
        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          required
          placeholder="ej: Clase de Prueba, Plan Mensual..."
          className="input"
        />
      </div>

      {/* Description */}
      <div className="col-span-2">
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-3)', marginBottom: 6 }}>
          Descripcion
        </label>
        <input
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Que incluye este plan..."
          className="input"
        />
      </div>

      {/* Price + currency (only when not trial) */}
      {!form.isTrial && (
        <>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-3)', marginBottom: 6 }}>
              Precio *
            </label>
            <input
              type="number" min={0}
              value={form.priceCents}
              onChange={e => setForm(f => ({ ...f, priceCents: e.target.value }))}
              required
              placeholder="30000"
              className="input"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-3)', marginBottom: 6 }}>
              Moneda
            </label>
            <select
              value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              className="input"
            >
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </>
      )}

      {/* Max classes */}
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-3)', marginBottom: 6 }}>
          Max. clases por dia
        </label>
        <input
          type="number" min={1}
          value={form.maxClasses}
          onChange={e => setForm(f => ({ ...f, maxClasses: e.target.value }))}
          placeholder="Sin limite"
          className="input"
        />
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────
export default function PlansPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [createForm, setCreateForm] = useState<FormShape>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchPlans()
  }, [user])

  // Auto-dismiss success toast
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(''), 3500)
    return () => clearTimeout(t)
  }, [success])

  const fetchPlans = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/plans')
      setPlans(data)
    } catch {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.post('/plans', {
        name: createForm.name,
        description: createForm.description || undefined,
        priceCents: createForm.isTrial ? 0 : Number(createForm.priceCents),
        currency: createForm.currency,
        maxClasses: createForm.maxClasses ? Number(createForm.maxClasses) : undefined,
        isTrial: createForm.isTrial,
      })
      setSuccess('Plan creado correctamente')
      setShowCreate(false)
      setCreateForm(emptyForm())
      fetchPlans()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al crear el plan')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEdit = async (planId: string, form: FormShape) => {
    setSavingEdit(true)
    setError('')
    try {
      await api.put(`/plans/${planId}`, {
        name: form.name,
        description: form.description || undefined,
        priceCents: form.isTrial ? 0 : Number(form.priceCents),
        currency: form.currency,
        maxClasses: form.maxClasses ? Number(form.maxClasses) : null,
        isTrial: form.isTrial,
      })
      setSuccess('Plan actualizado correctamente')
      setEditingId(null)
      fetchPlans()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al actualizar el plan')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async (planId: string) => {
    if (!confirm('Desactivar este plan? Los alumnos que lo tienen activo no se veran afectados.')) return
    try {
      await api.delete(`/plans/${planId}`)
      setSuccess('Plan desactivado')
      fetchPlans()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al desactivar')
    }
  }

  const filteredPlans = plans.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px' }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 40 }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--primary)', margin: '0 0 6px', textTransform: 'uppercase' }}>
          Configuracion de planes
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="section-title" style={{ fontSize: '2rem', marginBottom: 6 }}>
              Planes de membresia
            </h1>
            <p style={{ color: 'var(--text-3)', fontSize: 14, margin: 0 }}>
              Define los planes que ofreceras a tus alumnos
            </p>
          </div>
          <button
            onClick={() => { setShowCreate(!showCreate); setEditingId(null); setError(''); setSuccess('') }}
            className="btn-brand flex items-center gap-2 px-5 py-2.5 text-sm"
          >
            <Plus style={{ width: 15, height: 15 }} />
            {showCreate ? 'Cancelar' : 'Nuevo plan'}
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <Search style={{
          position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
          width: 15, height: 15, color: 'var(--text-4)', pointerEvents: 'none',
        }} />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Buscar por nombre o descripcion..."
          className="input"
          style={{ paddingLeft: '2.5rem' }}
        />
      </div>

      {/* ── Toasts ── */}
      {success && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
          color: '#22c55e', borderRadius: 12, padding: '12px 16px',
          fontSize: 14, marginBottom: 20, fontWeight: 500,
        }}>
          <Check style={{ width: 15, height: 15, flexShrink: 0 }} />
          {success}
        </div>
      )}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
          color: '#ef4444', borderRadius: 12, padding: '12px 16px',
          fontSize: 14, marginBottom: 20, fontWeight: 500,
        }}>
          <X style={{ width: 15, height: 15, flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* ── Create form ── */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="card rounded-xl fade-up"
          style={{ padding: 28, marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-1)', margin: 0, fontFamily: 'var(--font-display)' }}>
              Nuevo plan
            </h2>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: 4 }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
          <PlanFormFields form={createForm} setForm={setCreateForm} currencies={currencies} />
          <button
            type="submit"
            disabled={saving}
            className="btn-brand w-full py-2.5 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus style={{ width: 15, height: 15 }} />
            {saving ? 'Guardando...' : 'Crear plan'}
          </button>
        </form>
      )}

      {/* ── Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : filteredPlans.length === 0 ? (
        <EmptyState
          hasSearch={searchQuery.length > 0}
          onCreateClick={() => setShowCreate(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPlans.map(plan =>
            editingId === plan.id ? (
              <EditCard
                key={plan.id}
                plan={plan}
                onSave={handleSaveEdit}
                onCancel={() => setEditingId(null)}
                saving={savingEdit}
              />
            ) : (
              <PlanCard
                key={plan.id}
                plan={plan}
                onEdit={p => { setEditingId(p.id); setShowCreate(false) }}
                onDelete={handleDelete}
              />
            )
          )}
        </div>
      )}

      {/* ── Summary strip ── */}
      {!loading && plans.length > 0 && (
        <div style={{
          marginTop: 40, display: 'flex', gap: 24, flexWrap: 'wrap',
        }}>
          {[
            { label: 'Total de planes', value: plans.length },
            { label: 'Planes activos', value: plans.filter(p => p.isActive).length },
            { label: 'Planes trial', value: plans.filter(p => p.isTrial).length },
          ].map(stat => (
            <div key={stat.label} className="card rounded-xl" style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{
                fontSize: 26, fontWeight: 900, color: 'var(--primary)',
                fontFamily: 'var(--font-display)', letterSpacing: '-0.03em',
              }}>
                {stat.value}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 500 }}>{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
