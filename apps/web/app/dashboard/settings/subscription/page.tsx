'use client'
import { useCallback, useEffect, useState } from 'react'
import api from '../../../../lib/api'
import SubscriptionPayModal from '../../components/SubscriptionPayModal'

// Suscripción del gym a Tribu-Box: estado, pago (también por adelantado: la nueva
// suscripción se suma desde el vencimiento vigente) e historial de pagos.

type SubStatus = {
  gym: { id: string; name: string; status: string }
  subscription: {
    planId: string; status: string; startsAt: string; endsAt: string
    plan: { id: string; name: string; priceCLP: number; durationDays: number }
  } | null
  daysLeft: number
  isExpired: boolean
}
type PaymentRow = {
  id: string; amount: number; currency: string; gateway: string; status: string
  reference: string | null; rejectionReason: string | null; createdAt: string; hasReceipt: boolean
}

const GATEWAY_LABEL: Record<string, string> = { flow: 'Flow', stripe: 'Stripe', transfer: 'Transferencia', manual: 'Manual' }
const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  PAID: { text: 'Pagado', color: '#4ade80' },
  PENDING: { text: 'Pendiente', color: '#f59e0b' },
  FAILED: { text: 'Rechazado / fallido', color: '#f87171' },
  REFUNDED: { text: 'Reembolsado', color: '#94a3b8' },
}
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })

export default function GymSubscriptionPage() {
  const [status, setStatus] = useState<SubStatus | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        api.get('/gyms/me/subscription'),
        api.get('/gyms/me/subscription/payments'),
      ])
      setStatus(s.data)
      setPayments(p.data.payments ?? [])
      setError('')
    } catch {
      setError('No se pudo cargar la información de tu suscripción.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="p-8 text-sm opacity-70">Cargando…</div>

  const sub = status?.subscription
  const stateText = !sub ? 'Sin suscripción'
    : status?.isExpired ? 'Vencida'
    : sub.status === 'TRIAL' ? 'Período de prueba'
    : 'Activa'
  const stateColor = !sub || status?.isExpired ? '#f87171' : sub.status === 'TRIAL' ? '#f59e0b' : '#4ade80'
  const box: React.CSSProperties = {
    backgroundColor: 'var(--surface-base, #13131f)', border: '1px solid var(--border, #2d2d4e)',
    borderRadius: 14, padding: 20,
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-bold">Mi suscripción</h1>
      {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

      <section style={box}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Plan</p>
            <p style={{ fontSize: 18, fontWeight: 700 }}>{sub?.plan.name ?? '—'}</p>
            <p style={{ fontSize: 14, marginTop: 6 }}>
              <span style={{ color: stateColor, fontWeight: 600 }}>{stateText}</span>
              {sub && (
                <span style={{ opacity: 0.75 }}>
                  {' · vence el '}{fmtDate(sub.endsAt)}
                  {!status?.isExpired && ` (${status?.daysLeft} día${status?.daysLeft === 1 ? '' : 's'})`}
                </span>
              )}
            </p>
            {sub && (
              <p style={{ fontSize: 13, opacity: 0.65, marginTop: 4 }}>
                {sub.plan.priceCLP > 0 ? `$${sub.plan.priceCLP.toLocaleString('es-CL')} CLP` : 'Gratis'} por {sub.plan.durationDays} días.
                Si pagas antes del vencimiento, el nuevo período se suma al actual.
              </p>
            )}
          </div>
          {sub && sub.plan.priceCLP > 0 && (
            <button onClick={() => setPaying(true)}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: '#6366f1', color: '#fff' }}>
              {status?.isExpired ? 'Renovar ahora' : 'Pagar por adelantado'}
            </button>
          )}
        </div>
      </section>

      <section style={box}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Historial de pagos</h2>
        {payments.length === 0 ? (
          <p style={{ fontSize: 14, opacity: 0.7 }}>Aún no hay pagos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                  <th className="py-2 pr-4">Fecha</th><th className="py-2 pr-4">Monto</th>
                  <th className="py-2 pr-4">Método</th><th className="py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => {
                  const st = STATUS_LABEL[p.status] ?? { text: p.status, color: '#94a3b8' }
                  return (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border, #2d2d4e)' }}>
                      <td className="py-2 pr-4">{fmtDate(p.createdAt)}</td>
                      <td className="py-2 pr-4">${p.amount.toLocaleString('es-CL')} {p.currency}</td>
                      <td className="py-2 pr-4">{GATEWAY_LABEL[p.gateway] ?? p.gateway}</td>
                      <td className="py-2">
                        <span style={{ color: st.color, fontWeight: 600 }}>{st.text}</span>
                        {p.status === 'PENDING' && p.gateway === 'transfer' && (
                          <span style={{ opacity: 0.7 }}>{p.hasReceipt ? ' · en revisión' : ' · falta el comprobante'}</span>
                        )}
                        {p.rejectionReason && <span style={{ opacity: 0.7 }}> · {p.rejectionReason}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {paying && sub && (
        <SubscriptionPayModal planId={sub.planId} onClose={() => { setPaying(false); load() }} />
      )}
    </div>
  )
}
