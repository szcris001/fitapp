'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'
import { Plus, Pencil, Trash2, Save, X, Check, CreditCard, RefreshCw, ExternalLink } from 'lucide-react'
import { PLAN_COLOR_PRESETS } from '../page'

const card: React.CSSProperties = { backgroundColor: '#13131f', border: '1px solid #2d2d4e', borderRadius: '0.75rem' }
const inp: React.CSSProperties = {
  width: '100%', backgroundColor: '#0f0f1a', border: '1px solid #2d2d4e',
  borderRadius: '0.5rem', padding: '0.625rem 1rem', color: '#e2e8f0',
  outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8',
  marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em',
}

function apiErr(err: any, fallback = 'Error inesperado') {
  const e = err?.response?.data?.error
  if (!e) return fallback
  if (typeof e === 'string') return e
  const field = Object.keys(e.fieldErrors ?? {})[0]
  return field ? `${field}: ${e.fieldErrors[field][0]}` : fallback
}

type Plan = { id: string; slug: string; name: string; description: string | null; priceCLP: number; priceUSD: number; durationDays: number; features: string[]; isActive: boolean; isFree: boolean; color: string | null }
type Sub  = { id: string; gymId: string; planId: string; status: string; startsAt: string; endsAt: string; gym: any; plan: Plan; payments: any[] }
type Payment = { id: string; gymId: string; amount: number; currency: string; gateway: string; status: string; paidAt: string | null; notes: string | null; createdAt: string; gym: any }

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE:    { bg: '#14532d', color: '#4ade80' },
  TRIAL:     { bg: '#422006', color: '#fb923c' },
  EXPIRED:   { bg: '#450a0a', color: '#f87171' },
  CANCELLED: { bg: '#1e293b', color: '#64748b' },
  PAID:      { bg: '#14532d', color: '#4ade80' },
  PENDING:   { bg: '#422006', color: '#fb923c' },
  FAILED:    { bg: '#450a0a', color: '#f87171' },
  REFUNDED:  { bg: '#1e293b', color: '#94a3b8' },
}

const GATEWAY_LABELS: Record<string, string> = { manual: 'Manual', stripe: 'Stripe 🔒', flow: 'Flow 🇨🇱' }

export default function SubscriptionsPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()
  const [tab, setTab] = useState<'plans' | 'subscriptions' | 'payments'>('plans')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const [plans, setPlans]           = useState<Plan[]>([])
  const [subs, setSubs]             = useState<Sub[]>([])
  const [payments, setPayments]     = useState<Payment[]>([])
  const [paymentsTotal, setPaymentsTotal] = useState(0)
  const [gyms, setGyms]             = useState<any[]>([])

  // Plan form
  const [editPlan, setEditPlan]     = useState<Plan | null>(null)
  const [planForm, setPlanForm]     = useState<any>({})
  const [savingPlan, setSavingPlan] = useState(false)
  const [creatingPlan, setCreatingPlan] = useState(false)

  // Payment modal
  const [payModal, setPayModal]     = useState<Sub | null>(null)
  const [payForm, setPayForm]       = useState({ gateway: 'manual', amount: '', email: '', notes: '', paidAt: '' })
  const [paying, setPaying]         = useState(false)
  const [gymGateways, setGymGateways] = useState<string[]>(['manual'])

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') { router.push('/dashboard'); return }
    if (user) fetchAll()
  }, [user?.userId])

  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [plansRes, subsRes, paymentsRes, gymsRes] = await Promise.all([
        api.get('/superadmin/fitapp-plans'),
        api.get('/superadmin/gym-subscriptions'),
        api.get('/superadmin/gym-payments'),
        api.get('/superadmin/gyms'),
      ])
      setPlans(plansRes.data)
      setSubs(subsRes.data)
      setPayments(paymentsRes.data.payments)
      setPaymentsTotal(paymentsRes.data.total)
      setGyms(gymsRes.data)
    } catch { router.push('/superadmin') }
    finally { setLoading(false) }
  }

  // ── Plans ──
  const openEditPlan = (p: Plan) => {
    setEditPlan(p)
    setPlanForm({ ...p, features: p.features.join('\n'), color: p.color ?? 'gray' })
    setCreatingPlan(false)
  }

  const openCreatePlan = () => {
    setEditPlan(null)
    setCreatingPlan(true)
    setPlanForm({ name: '', description: '', priceCLP: 0, priceUSD: 0, durationDays: 30, features: '', isActive: true, isFree: false, color: 'blue' })
  }

  const handleSavePlan = async () => {
    setSavingPlan(true)
    try {
      const payload = {
        ...planForm,
        priceCLP: Number(planForm.priceCLP),
        priceUSD: Number(planForm.priceUSD),
        durationDays: Number(planForm.durationDays),
        features: planForm.features ? planForm.features.split('\n').map((f: string) => f.trim()).filter(Boolean) : [],
      }
      if (creatingPlan) {
        const { data } = await api.post('/superadmin/fitapp-plans', payload)
        setPlans(ps => [...ps, data])
        showToast('Plan creado', 'ok')
      } else {
        const { data } = await api.patch(`/superadmin/fitapp-plans/${editPlan!.id}`, payload)
        setPlans(ps => ps.map(p => p.id === data.id ? data : p))
        showToast('Plan actualizado', 'ok')
      }
      setEditPlan(null); setCreatingPlan(false)
    } catch (err) { showToast(apiErr(err), 'err') }
    finally { setSavingPlan(false) }
  }

  const handleDeletePlan = async (p: Plan) => {
    if (!confirm(`¿Eliminar el plan "${p.name}"?`)) return
    try {
      await api.delete(`/superadmin/fitapp-plans/${p.id}`)
      setPlans(ps => ps.filter(x => x.id !== p.id))
      showToast('Plan eliminado', 'ok')
    } catch (err) { showToast(apiErr(err), 'err') }
  }

  // ── Payment modal ──
  const openPayModal = async (sub: Sub) => {
    setPayModal(sub)
    setPayForm({ gateway: 'stripe', amount: String(sub.plan.priceCLP), email: sub.gym.ownerEmail ?? '', notes: '', paidAt: '' })
    try {
      const { data } = await api.get(`/superadmin/gym-payments/gateways/${sub.gymId}`)
      setGymGateways(['stripe', ...data.gateways.filter((g: string) => g !== 'stripe')])
    } catch { setGymGateways(['stripe', 'manual']) }
  }

  const handlePay = async () => {
    if (!payModal) return
    setPaying(true)
    try {
      if (payForm.gateway === 'stripe') {
        const { data } = await api.post(`/superadmin/gyms/${payModal.gymId}/checkout`, {
          planId: payModal.planId,
        })
        window.open(data.checkoutUrl, '_blank')
        showToast('Link de pago Stripe generado — abierto en nueva pestaña', 'ok')
        setPayModal(null)
      } else if (payForm.gateway === 'flow') {
        const { data } = await api.post('/superadmin/gym-payments/flow/create', {
          gymId:          payModal.gymId,
          planId:         payModal.planId,
          subscriptionId: payModal.id,
          amount:         Number(payForm.amount),
          email:          payForm.email,
        })
        window.open(data.paymentUrl, '_blank')
        showToast('Link de pago Flow generado — abierto en nueva pestaña', 'ok')
        setPayModal(null)
      } else {
        await api.post('/superadmin/gym-payments/manual', {
          gymId:          payModal.gymId,
          planId:         payModal.planId,
          subscriptionId: payModal.id,
          amount:         Number(payForm.amount),
          currency:       'CLP',
          notes:          payForm.notes || null,
          paidAt:         payForm.paidAt || null,
        })
        showToast('Pago registrado', 'ok')
        setPayModal(null)
      }
      await fetchAll()
    } catch (err) { showToast(apiErr(err), 'err') }
    finally { setPaying(false) }
  }

  // ── Assign subscription ──
  const handleAssignPlan = async (gymId: string, planId: string) => {
    try {
      await api.post('/superadmin/gym-subscriptions', { gymId, planId })
      showToast('Suscripción asignada', 'ok')
      await fetchAll()
    } catch (err) { showToast(apiErr(err), 'err') }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-500 text-sm">Cargando...</div>

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 relative">
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 100,
          padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 500,
          backgroundColor: toast.type === 'ok' ? '#14532d' : '#450a0a',
          color: toast.type === 'ok' ? '#4ade80' : '#f87171',
          border: `1px solid ${toast.type === 'ok' ? '#166534' : '#7f1d1d'}`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>{toast.msg}</div>
      )}

      {/* Payment modal */}
      {payModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ ...card, width: '100%', maxWidth: 480 }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid #2d2d4e' }}>
              <div>
                <p className="text-white font-semibold text-sm">Registrar pago</p>
                <p style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>{payModal.gym.name} — {payModal.plan.name}</p>
              </div>
              <button onClick={() => setPayModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label style={lbl}>Gateway de pago</label>
                <div className="flex gap-2 flex-wrap">
                  {gymGateways.map(gw => (
                    <button key={gw} type="button" onClick={() => setPayForm(f => ({ ...f, gateway: gw }))}
                      style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        backgroundColor: payForm.gateway === gw ? '#2d1d5e' : '#0f0f1a',
                        color: payForm.gateway === gw ? '#a78bfa' : '#64748b',
                        border: `1px solid ${payForm.gateway === gw ? '#6d4acf' : '#2d2d4e'}`,
                      }}>
                      {GATEWAY_LABELS[gw] ?? gw}
                      {gw === 'flow' && <span style={{ marginLeft: 4, fontSize: 10, color: '#fb923c' }}>🇨🇱</span>}
                    </button>
                  ))}
                </div>
              </div>

              {payForm.gateway !== 'stripe' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={lbl}>Monto (CLP)</label>
                    <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} style={inp} />
                  </div>
                  {payForm.gateway === 'flow' ? (
                    <div>
                      <label style={lbl}>Email del pagador</label>
                      <input type="email" value={payForm.email} onChange={e => setPayForm(f => ({ ...f, email: e.target.value }))} style={inp} />
                    </div>
                  ) : (
                    <div>
                      <label style={lbl}>Fecha de pago</label>
                      <input type="date" value={payForm.paidAt} onChange={e => setPayForm(f => ({ ...f, paidAt: e.target.value }))} style={inp} />
                    </div>
                  )}
                </div>
              )}

              {payForm.gateway === 'manual' && (
                <div>
                  <label style={lbl}>Notas (opcional)</label>
                  <input value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="Ej: Transferencia banco Estado" style={inp} />
                </div>
              )}

              {payForm.gateway === 'stripe' && (
                <div style={{ backgroundColor: '#0f0f1a', borderRadius: 8, padding: '10px 14px', border: '1px solid #2d2d4e' }}>
                  <p style={{ color: '#94a3b8', fontSize: 12 }}>Se generará un link de pago Stripe Checkout. Al completarlo el gimnasio se activará automáticamente vía webhook.</p>
                </div>
              )}
              {payForm.gateway === 'flow' && (
                <div style={{ backgroundColor: '#0f0f1a', borderRadius: 8, padding: '10px 14px', border: '1px solid #2d2d4e' }}>
                  <p style={{ color: '#94a3b8', fontSize: 12 }}>Se generará un link de pago Flow para el gimnasio. El pago se confirmará automáticamente vía webhook.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setPayModal(null)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #2d2d4e', background: 'none', color: '#94a3b8', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handlePay} disabled={paying || (payForm.gateway === 'manual' && !payForm.amount)}
                  style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 10, border: 'none', backgroundColor: paying ? '#1e1e35' : '#7c3aed', color: paying ? '#64748b' : '#fff', fontSize: 14, fontWeight: 700, cursor: paying ? 'not-allowed' : 'pointer' }}>
                  {payForm.gateway !== 'manual' ? <ExternalLink className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  {paying ? 'Procesando...' : payForm.gateway === 'stripe' ? 'Generar link Stripe' : payForm.gateway === 'flow' ? 'Generar link Flow' : 'Registrar pago'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Suscripciones y pagos</h1>
          <p className="text-slate-500 text-sm mt-0.5">Planes de FitApp, suscripciones de gimnasios y cobros</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ backgroundColor: '#0f0f1a', border: '1px solid #2d2d4e' }}>
        {([
          { key: 'plans',         label: `Planes (${plans.length})` },
          { key: 'subscriptions', label: `Suscripciones (${subs.length})` },
          { key: 'payments',      label: `Pagos (${paymentsTotal})` },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '6px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 150ms', backgroundColor: tab === t.key ? '#7c3aed' : 'transparent', color: tab === t.key ? '#fff' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: PLANES ── */}
      {tab === 'plans' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openCreatePlan}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: '#2d1d5e', color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Plus className="w-4 h-4" /> Nuevo plan
            </button>
          </div>

          {(creatingPlan || editPlan) && (
            <div style={{ ...card, padding: 24 }} className="space-y-4">
              <p className="text-white font-semibold text-sm">{creatingPlan ? 'Nuevo plan' : `Editar: ${editPlan?.name}`}</p>
              <div className="grid grid-cols-2 gap-4">
                <div><label style={lbl}>Nombre</label><input value={planForm.name ?? ''} onChange={e => setPlanForm((f: any) => ({ ...f, name: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Descripción</label><input value={planForm.description ?? ''} onChange={e => setPlanForm((f: any) => ({ ...f, description: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Precio CLP</label><input type="number" value={planForm.priceCLP ?? 0} onChange={e => setPlanForm((f: any) => ({ ...f, priceCLP: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Precio USD</label><input type="number" value={planForm.priceUSD ?? 0} onChange={e => setPlanForm((f: any) => ({ ...f, priceUSD: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Duración (días)</label><input type="number" value={planForm.durationDays ?? 30} onChange={e => setPlanForm((f: any) => ({ ...f, durationDays: e.target.value }))} style={inp} /></div>
                <div className="flex items-center gap-6 pt-5">
                  <label style={{ ...lbl, marginBottom: 0, cursor: 'pointer' }}><input type="checkbox" checked={planForm.isActive ?? true} onChange={e => setPlanForm((f: any) => ({ ...f, isActive: e.target.checked }))} style={{ marginRight: 8 }} />Activo</label>
                  <label style={{ ...lbl, marginBottom: 0, cursor: 'pointer' }}><input type="checkbox" checked={planForm.isFree ?? false} onChange={e => setPlanForm((f: any) => ({ ...f, isFree: e.target.checked }))} style={{ marginRight: 8 }} />Gratis</label>
                </div>
              </div>
              <div>
                <label style={lbl}>Color del badge</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(PLAN_COLOR_PRESETS).map(([key, preset]) => (
                    <button key={key} type="button"
                      onClick={() => setPlanForm((f: any) => ({ ...f, color: key }))}
                      title={key}
                      style={{
                        width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
                        backgroundColor: preset.bg, color: preset.color,
                        border: planForm.color === key ? `2px solid ${preset.color}` : '2px solid transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, transition: 'all 120ms',
                        outline: planForm.color === key ? `2px solid ${preset.color}` : 'none',
                        outlineOffset: 1,
                      }}>
                      Aa
                    </button>
                  ))}
                </div>
                {planForm.color && PLAN_COLOR_PRESETS[planForm.color] && (
                  <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#475569' }}>Vista previa:</span>
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
                      backgroundColor: PLAN_COLOR_PRESETS[planForm.color].bg,
                      color: PLAN_COLOR_PRESETS[planForm.color].color,
                    }}>{planForm.name || 'Plan'}</span>
                  </div>
                )}
              </div>
              <div>
                <label style={lbl}>Features (una por línea)</label>
                <textarea value={planForm.features ?? ''} onChange={e => setPlanForm((f: any) => ({ ...f, features: e.target.value }))}
                  style={{ ...inp, resize: 'vertical', minHeight: 100, lineHeight: 1.6, fontFamily: 'inherit' }} />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => { setEditPlan(null); setCreatingPlan(false) }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #2d2d4e', background: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSavePlan} disabled={savingPlan} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <Save className="w-4 h-4" />{savingPlan ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plans.map(p => {
              const pc = p.color && PLAN_COLOR_PRESETS[p.color] ? PLAN_COLOR_PRESETS[p.color] : { bg: '#1e293b', color: '#94a3b8' }
              return (
              <div key={p.id} style={{ ...card, borderLeft: `3px solid ${pc.color}` }} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: pc.color, display: 'inline-block', flexShrink: 0 }} />
                      <span className="font-bold text-white">{p.name}</span>
                      {p.isFree && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, backgroundColor: '#1e3a5f', color: '#60a5fa', fontWeight: 700 }}>GRATIS</span>}
                      {!p.isActive && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, backgroundColor: '#1e293b', color: '#64748b', fontWeight: 700 }}>INACTIVO</span>}
                    </div>
                    {p.description && <p style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>{p.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEditPlan(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 4 }}><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDeletePlan(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 4 }}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex gap-4 mb-3">
                  <div><p style={{ color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CLP / mes</p><p className="text-white font-bold text-lg">{p.priceCLP > 0 ? `$${p.priceCLP.toLocaleString('es-CL')}` : 'Gratis'}</p></div>
                  {p.priceUSD > 0 && <div><p style={{ color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>USD / mes</p><p className="text-white font-bold text-lg">${p.priceUSD}</p></div>}
                  <div><p style={{ color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duración</p><p className="text-white font-bold text-lg">{p.durationDays}d</p></div>
                </div>
                {p.features.length > 0 && (
                  <ul className="space-y-1">
                    {p.features.map((f, i) => <li key={i} style={{ color: '#94a3b8', fontSize: 12 }}>· {f}</li>)}
                  </ul>
                )}
              </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── TAB: SUSCRIPCIONES ── */}
      {tab === 'subscriptions' && (
        <div className="space-y-4">
          {/* Gyms sin suscripción */}
          {gyms.filter(g => !subs.find(s => s.gymId === g.id)).length > 0 && (
            <div style={{ ...card, padding: 16 }}>
              <p className="text-xs font-semibold mb-3" style={{ color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gimnasios sin suscripción asignada</p>
              <div className="space-y-2">
                {gyms.filter(g => !subs.find(s => s.gymId === g.id)).map(g => (
                  <div key={g.id} className="flex items-center justify-between">
                    <span style={{ color: '#94a3b8', fontSize: 13 }}>{g.name}</span>
                    <select onChange={e => { if (e.target.value) handleAssignPlan(g.id, e.target.value) }}
                      defaultValue=""
                      style={{ ...inp, width: 'auto', fontSize: 12, padding: '4px 10px' }}>
                      <option value="">Asignar plan...</option>
                      {plans.filter(p => p.isActive).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#13131f', borderColor: '#2d2d4e' }}>
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: '#2d2d4e', backgroundColor: '#0f0f1a' }}>
                  {['Gimnasio', 'Plan', 'Estado', 'Vence', 'Último pago', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide px-5 py-3.5" style={{ color: '#64748b' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subs.map(s => {
                  const sc = STATUS_COLORS[s.status] ?? STATUS_COLORS.CANCELLED
                  const daysLeft = Math.ceil((new Date(s.endsAt).getTime() - Date.now()) / 86400000)
                  const lastPayment = s.payments[0]
                  return (
                    <tr key={s.id} className="border-b last:border-0" style={{ borderColor: '#2d2d4e' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a1a2e')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-sm text-white">{s.gym.name}</p>
                        <p style={{ color: '#475569', fontSize: 11 }}>{s.gym.country} · {s.gym.ownerEmail}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-white">{s.plan.name}</td>
                      <td className="px-5 py-4">
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, backgroundColor: sc.bg, color: sc.color }}>{s.status}</span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm" style={{ color: daysLeft <= 7 ? '#f87171' : daysLeft <= 14 ? '#fb923c' : '#94a3b8' }}>
                          {new Date(s.endsAt).toLocaleDateString('es-CL')}
                        </p>
                        <p style={{ fontSize: 11, color: '#475569' }}>
                          {daysLeft > 0 ? `${daysLeft}d restantes` : 'Vencida'}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        {lastPayment ? (
                          <div>
                            <p className="text-sm text-white">${lastPayment.amount.toLocaleString('es-CL')} {lastPayment.currency}</p>
                            <p style={{ fontSize: 11, color: '#475569' }}>{GATEWAY_LABELS[lastPayment.gateway] ?? lastPayment.gateway}</p>
                          </div>
                        ) : <span style={{ color: '#475569', fontSize: 13 }}>Sin pagos</span>}
                      </td>
                      <td className="px-5 py-4">
                        <button onClick={() => openPayModal(s)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: 'none', backgroundColor: '#1e1e35', color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          <CreditCard className="w-3.5 h-3.5" /> Cobrar
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {subs.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-600 text-sm">No hay suscripciones registradas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: PAGOS ── */}
      {tab === 'payments' && (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#13131f', borderColor: '#2d2d4e' }}>
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: '#2d2d4e', backgroundColor: '#0f0f1a' }}>
                {['Gimnasio', 'Monto', 'Gateway', 'Estado', 'Fecha', 'Notas'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide px-5 py-3.5" style={{ color: '#64748b' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const sc = STATUS_COLORS[p.status] ?? STATUS_COLORS.PENDING
                return (
                  <tr key={p.id} className="border-b last:border-0" style={{ borderColor: '#2d2d4e' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a1a2e')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-white">{p.gym?.name ?? '—'}</p>
                      <p style={{ color: '#475569', fontSize: 11 }}>{p.gym?.country}</p>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-white">${p.amount.toLocaleString('es-CL')} {p.currency}</td>
                    <td className="px-5 py-4">
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        {GATEWAY_LABELS[p.gateway] ?? p.gateway}
                        {p.gateway === 'flow' && ' 🇨🇱'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, backgroundColor: sc.bg, color: sc.color }}>{p.status}</span>
                    </td>
                    <td className="px-5 py-4 text-sm" style={{ color: '#64748b' }}>
                      {p.paidAt ? new Date(p.paidAt).toLocaleDateString('es-CL') : new Date(p.createdAt).toLocaleDateString('es-CL')}
                    </td>
                    <td className="px-5 py-4 text-sm" style={{ color: '#64748b' }}>{p.notes ?? '—'}</td>
                  </tr>
                )
              })}
              {payments.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-600 text-sm">No hay pagos registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
