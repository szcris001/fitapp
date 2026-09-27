'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api, { mediaUrl } from '../../../lib/api'
import { Wallet, TrendingUp, CreditCard, CheckCircle, Clock, X, ExternalLink } from 'lucide-react'

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta',
  stripe: 'Online (Stripe)', mercadopago: 'Mercado Pago',
  flow: 'Flow', khipu: 'Khipu', other: 'Otro',
}
const METHOD_ICON: Record<string, string> = {
  cash: '💵', transfer: '🏦', card: '💳', stripe: '🔒',
  mercadopago: '🟦', flow: '🌊', khipu: '🟣', other: '📋',
}
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo', INACTIVE: 'Inactivo', TRIAL: 'Prueba', EXPIRED: 'Expirado',
}

export default function PaymentsPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [revenue, setRevenue] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [tab, setTab] = useState<'history' | 'pending'>('pending')
  const router = useRouter()

  const fetchAll = useCallback(async () => {
    if (!user) return
    const [revRes, histRes, pendRes] = await Promise.all([
      api.get('/payments/revenue'),
      api.get('/payments/history'),
      api.get('/payments/transfer/pending'),
    ])
    setRevenue(revRes.data)
    setHistory(histRes.data)
    setPending(pendRes.data)
  }, [user])

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchAll().catch(() => router.push('/login')).finally(() => setLoading(false))
  }, [user])

  // Auto-switch to history tab when no pending transfers
  useEffect(() => {
    if (!loading && pending.length === 0) setTab('history')
  }, [pending, loading])

  const fmt = (cents: number, currency = 'CLP') =>
    `${(cents / 100).toLocaleString('es-CL')} ${currency}`

  const handleConfirm = async (id: string) => {
    setActionId(id)
    try {
      await api.patch(`/payments/transfer/${id}/confirm`)
      await fetchAll()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al confirmar')
    } finally { setActionId(null) }
  }

  const handleReject = async (id: string) => {
    const reason = window.prompt('Motivo del rechazo (opcional):')
    if (reason === null) return  // cancelled
    setActionId(id)
    try {
      await api.patch(`/payments/transfer/${id}/reject`, { reason })
      await fetchAll()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al rechazar')
    } finally { setActionId(null) }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-sm" style={{ color: 'var(--text-4)' }}>Cargando...</div>
  }

  const statsCards = revenue ? [
    { label: 'Hoy', value: fmt(revenue.today.total), count: revenue.today.count, icon: CheckCircle, accent: '#22c55e' },
    { label: 'Este mes', value: fmt(revenue.month.total), count: revenue.month.count, icon: TrendingUp, accent: '#6366f1' },
    { label: 'Total histórico', value: fmt(revenue.allTime.total), count: revenue.allTime.count, icon: Wallet, accent: '#f59e0b' },
  ] : []

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="section-title">Pagos</h1>
            <p className="text-slate-500 text-sm">Historial de ingresos y gestión de transferencias</p>
          </div>
        </div>
      </div>

      {/* Revenue stats */}
      {revenue && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {statsCards.map(card => {
            const Icon = card.icon
            return (
              <div key={card.label} className="card rounded-xl p-5" style={{ borderLeft: `3px solid ${card.accent}` }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: card.accent + '18' }}>
                    <Icon className="w-4 h-4" style={{ color: card.accent }} />
                  </div>
                  <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
                    {card.count}
                  </span>
                </div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{card.label}</p>
                <p className="text-sm font-bold mt-1" style={{ color: card.accent }}>{card.value}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>{card.count} pagos</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'var(--surface-base)' }}>
        <button
          onClick={() => setTab('pending')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: tab === 'pending' ? 'var(--surface-elevated)' : 'transparent',
            color: tab === 'pending' ? 'var(--text-1)' : 'var(--text-3)',
          }}>
          <Clock className="w-4 h-4" />
          Transferencias pendientes
          {pending.length > 0 && (
            <span className="ml-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
              style={{ backgroundColor: '#ef4444', color: '#fff' }}>
              {pending.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('history')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: tab === 'history' ? 'var(--surface-elevated)' : 'transparent',
            color: tab === 'history' ? 'var(--text-1)' : 'var(--text-3)',
          }}>
          <CreditCard className="w-4 h-4" />
          Historial
        </button>
      </div>

      {/* Pending transfers */}
      {tab === 'pending' && (
        <div className="card rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
              Comprobantes por revisar
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
              {pending.length} pendientes
            </span>
          </div>

          {pending.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#22c55e18' }}>
                <CheckCircle className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-2)' }}>Sin transferencias pendientes</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>
                  Cuando un alumno suba un comprobante, aparecerá aquí
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-1)' }}>
              {pending.map((m: any) => (
                <div key={m.id} className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ backgroundColor: 'var(--brand-accent)' + '20', color: 'var(--brand-accent)' }}>
                    {m.user?.name?.[0]?.toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{m.user?.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-4)' }}>{m.user?.email}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                      {m.plan?.name} · {fmt(m.pricePaid, m.currency)} · {m.plan?.durationDays} días
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-4)' }}>
                      Enviado {new Date(m.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Receipt link */}
                  {m.transferReceiptUrl && (
                    <a
                      href={mediaUrl(m.transferReceiptUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:opacity-80"
                      style={{ borderColor: 'var(--border-1)', color: 'var(--text-2)' }}>
                      <ExternalLink className="w-3.5 h-3.5" />
                      Comprobante
                    </a>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleConfirm(m.id)}
                      disabled={actionId === m.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ backgroundColor: '#22c55e18', color: '#22c55e' }}>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Confirmar
                    </button>
                    <button
                      onClick={() => handleReject(m.id)}
                      disabled={actionId === m.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ backgroundColor: '#ef444418', color: '#ef4444' }}>
                      <X className="w-3.5 h-3.5" />
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payment history */}
      {tab === 'history' && (
        <div className="card rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Historial de pagos</h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
              {history.length} registros
            </span>
          </div>

          {history.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--surface-hover)' }}>
                <CreditCard className="w-6 h-6" style={{ color: 'var(--text-4)' }} />
              </div>
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-2)' }}>Sin pagos registrados</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>
                  Los pagos aparecerán aquí cuando registres membresías
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-base)' }}>
                    {['Alumno', 'Plan', 'Monto', 'Método', 'Fecha', 'Estado'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide px-5 py-3"
                        style={{ color: 'var(--text-4)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((m: any) => (
                    <tr key={m.id} className="border-b last:border-0"
                      style={{ borderColor: 'var(--border-1)' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ backgroundColor: 'var(--brand-accent)' + '20', color: 'var(--brand-accent)' }}>
                            {m.user?.name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{m.user?.name}</p>
                            <p className="text-xs" style={{ color: 'var(--text-4)' }}>{m.user?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-2)' }}>{m.plan?.name}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
                        {(m.pricePaid / 100).toLocaleString('es-CL')} {m.currency}
                      </td>
                      <td className="px-5 py-3.5 text-sm">
                        <span className="flex items-center gap-1.5" style={{ color: 'var(--text-2)' }}>
                          {METHOD_ICON[m.paymentMethod] || '📋'}
                          {METHOD_LABEL[m.paymentMethod] || 'Sin método'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-3)' }}>
                        {m.paidAt ? new Date(m.paidAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`badge-${m.status === 'ACTIVE' ? 'green' : m.status === 'TRIAL' ? 'yellow' : 'gray'}`}>
                          {STATUS_LABEL[m.status] || m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
