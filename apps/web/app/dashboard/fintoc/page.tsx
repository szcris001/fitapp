'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'
import { toMajorUnits } from '../../../lib/money'
import {
  Landmark, RefreshCw, CheckCircle, Clock, AlertCircle,
  XCircle, ChevronLeft, ChevronRight, X, Check,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type ReconciliationStatus = 'PENDING' | 'MATCHED' | 'CONFIRMED' | 'REJECTED'
type MatchConfidence = 'exact_rut' | 'amount_only' | 'manual' | null

interface BankMovement {
  id: string
  fintocMovementId: string
  amount: number
  currency: string
  postedAt: string
  description: string | null
  senderRut: string | null
  senderName: string | null
  referenceCode: string | null
  reconciliationStatus: ReconciliationStatus
  matchConfidence: MatchConfidence
  membershipId: string | null
  membership: {
    id: string
    user: { name: string; email: string }
    plan: { name: string }
  } | null
  reviewedAt: string | null
}

interface FintocLink {
  id: string
  bankName: string
  holderName: string
  holderRut: string
  accountNumber: string
  lastSyncAt: string | null
}

interface FintocStatus {
  connected: boolean
  link: FintocLink | null
  pendingCount: number
  matchedCount: number
}

interface MovementsResponse {
  movements: BankMovement[]
  total: number
  limit: number
  offset: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LIMIT = 50

// Movimientos bancarios de Fintoc: CLP (sin decimales)
function fmtAmount(minor: number): string {
  return `$ ${Math.round(toMajorUnits(minor, 'CLP')).toLocaleString('es-CL')}`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

const STATUS_BADGE: Record<ReconciliationStatus, { label: string; cls: string }> = {
  PENDING:   { label: 'Pendiente',    cls: 'badge-yellow' },
  MATCHED:   { label: 'Coincidencia', cls: 'badge-blue'   },
  CONFIRMED: { label: 'Confirmado',   cls: 'badge-green'  },
  REJECTED:  { label: 'Rechazado',    cls: 'badge-red'    },
}

const CONFIDENCE_LABEL: Record<NonNullable<MatchConfidence>, string> = {
  exact_rut:   'RUT exacto',
  amount_only: 'Solo monto',
  manual:      'Manual',
}

type Tab = 'PENDING' | 'MATCHED' | 'CONFIRMED' | 'REJECTED'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'PENDING',   label: 'Pendientes',    icon: Clock        },
  { id: 'MATCHED',   label: 'Coincidencias', icon: AlertCircle  },
  { id: 'CONFIRMED', label: 'Confirmados',   icon: CheckCircle  },
  { id: 'REJECTED',  label: 'Rechazados',    icon: XCircle      },
]

// ── Modal Confirmar ───────────────────────────────────────────────────────────

function ConfirmModal({
  movement,
  onClose,
  onConfirmed,
}: {
  movement: BankMovement
  onClose: () => void
  onConfirmed: () => void
}) {
  const [membershipId, setMembershipId] = useState(movement.membershipId ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const mid = membershipId.trim()
    if (!mid) { setError('Ingresa el ID de membresía'); return }
    setLoading(true)
    setError(null)
    try {
      await api.patch(`/payments/fintoc/movements/${movement.id}/confirm`, { membershipId: mid })
      onConfirmed()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al confirmar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden modal-animate card" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5" style={{ color: 'var(--brand-accent)' }} />
              <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Confirmar movimiento</h2>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-5">
            {/* Datos del movimiento */}
            <div className="rounded-xl p-4 space-y-1.5" style={{ backgroundColor: 'var(--surface-base)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-4)' }}>Monto</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
              {fmtAmount(movement.amount)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-4)' }}>Fecha</span>
            <span className="text-sm" style={{ color: 'var(--text-2)' }}>{fmtDate(movement.postedAt)}</span>
          </div>
          {movement.senderName && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--text-4)' }}>Emisor</span>
              <span className="text-sm" style={{ color: 'var(--text-2)' }}>{movement.senderName}</span>
            </div>
          )}
          {movement.membership && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--text-4)' }}>Alumno</span>
              <span className="text-sm" style={{ color: 'var(--text-2)' }}>
                {movement.membership.user.name} · {movement.membership.plan.name}
              </span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-3)' }}>
              ID de membresía
            </label>
            <input
              type="text"
              value={membershipId}
              onChange={e => setMembershipId(e.target.value)}
              placeholder="UUID de la membresía..."
              disabled={!!movement.membershipId}
              className="w-full px-3 py-2 rounded-lg text-sm border transition-colors"
              style={{
                backgroundColor: movement.membershipId ? 'var(--surface-base)' : 'var(--surface-base)',
                borderColor: 'var(--border-1)',
                color: 'var(--text-1)',
                opacity: movement.membershipId ? 0.7 : 1,
              }}
            />
            {movement.membershipId && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>
                Ya vinculado automaticamente por el matcher.
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#ef444418', color: '#ef4444' }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#22c55e', color: '#fff' }}>
              <Check className="w-4 h-4" />
              {loading ? 'Confirmando...' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-2)' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Cancelar
            </button>
          </div>
          </form>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Modal Rechazar ────────────────────────────────────────────────────────────

function RejectModal({
  movement,
  onClose,
  onRejected,
}: {
  movement: BankMovement
  onClose: () => void
  onRejected: () => void
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.patch(`/payments/fintoc/movements/${movement.id}/reject`, {
        reason: reason.trim() || undefined,
      })
      onRejected()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al rechazar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden modal-animate card" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5" style={{ color: '#ef4444' }} />
              <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Rechazar movimiento</h2>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-5">
            {/* Datos del movimiento */}
            <div className="rounded-xl p-4 space-y-1.5" style={{ backgroundColor: 'var(--surface-base)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-4)' }}>Monto</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
              {fmtAmount(movement.amount)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-4)' }}>Fecha</span>
            <span className="text-sm" style={{ color: 'var(--text-2)' }}>{fmtDate(movement.postedAt)}</span>
          </div>
          {movement.senderName && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--text-4)' }}>Emisor</span>
              <span className="text-sm" style={{ color: 'var(--text-2)' }}>{movement.senderName}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-3)' }}>
              Motivo de rechazo <span style={{ color: 'var(--text-4)' }}>(opcional)</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ej: Transferencia duplicada, monto incorrecto..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm border resize-none transition-colors"
              style={{
                backgroundColor: 'var(--surface-base)',
                borderColor: 'var(--border-1)',
                color: 'var(--text-1)',
              }}
            />
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#ef444418', color: '#ef4444' }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#ef4444', color: '#fff' }}>
              <XCircle className="w-4 h-4" />
              {loading ? 'Rechazando...' : 'Rechazar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-2)' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Cancelar
            </button>
          </div>
          </form>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Tabla de movimientos ──────────────────────────────────────────────────────

function MovementsTable({
  movements,
  total,
  offset,
  onConfirm,
  onReject,
  onPrev,
  onNext,
}: {
  movements: BankMovement[]
  total: number
  offset: number
  onConfirm: (m: BankMovement) => void
  onReject: (m: BankMovement) => void
  onPrev: () => void
  onNext: () => void
}) {
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + LIMIT, total)

  if (movements.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--surface-hover)' }}>
          <Landmark className="w-6 h-6" style={{ color: 'var(--text-4)' }} />
        </div>
        <div>
          <p className="font-medium text-sm" style={{ color: 'var(--text-2)' }}>Sin movimientos</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>
            No hay movimientos en esta categoria
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-base)' }}>
              {['Fecha', 'Monto', 'Emisor', 'Referencia', 'Estado', 'Membresía asociada', 'Acciones'].map(h => (
                <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide px-5 py-3"
                  style={{ color: 'var(--text-4)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movements.map(m => {
              const badge = STATUS_BADGE[m.reconciliationStatus]
              const canAct = m.reconciliationStatus === 'PENDING' || m.reconciliationStatus === 'MATCHED'
              return (
                <tr key={m.id} className="border-b last:border-0"
                  style={{ borderColor: 'var(--border-1)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>

                  {/* Fecha */}
                  <td className="px-5 py-3.5 text-sm tabular-nums whitespace-nowrap"
                    style={{ color: 'var(--text-3)' }}>
                    {fmtDate(m.postedAt)}
                  </td>

                  {/* Monto */}
                  <td className="px-5 py-3.5 text-sm font-bold tabular-nums whitespace-nowrap"
                    style={{ color: 'var(--text-1)' }}>
                    {fmtAmount(m.amount)}
                  </td>

                  {/* Emisor */}
                  <td className="px-5 py-3.5">
                    {m.senderName || m.senderRut ? (
                      <div>
                        {m.senderName && (
                          <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>{m.senderName}</p>
                        )}
                        {m.senderRut && (
                          <p className="text-xs" style={{ color: 'var(--text-4)' }}>{m.senderRut}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm" style={{ color: 'var(--text-4)' }}>—</span>
                    )}
                  </td>

                  {/* Referencia */}
                  <td className="px-5 py-3.5">
                    <div>
                      {m.referenceCode && (
                        <p className="text-xs font-mono px-1.5 py-0.5 rounded inline-block"
                          style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
                          {m.referenceCode}
                        </p>
                      )}
                      {m.description && (
                        <p className="text-xs mt-0.5 max-w-[160px] truncate" style={{ color: 'var(--text-4)' }}
                          title={m.description}>
                          {m.description}
                        </p>
                      )}
                      {!m.referenceCode && !m.description && (
                        <span className="text-sm" style={{ color: 'var(--text-4)' }}>—</span>
                      )}
                    </div>
                  </td>

                  {/* Estado + Confianza */}
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col gap-1">
                      <span className={badge.cls}>{badge.label}</span>
                      {m.matchConfidence && (
                        <span className="text-xs" style={{ color: 'var(--text-4)' }}>
                          {CONFIDENCE_LABEL[m.matchConfidence]}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Membresía */}
                  <td className="px-5 py-3.5">
                    {m.membership ? (
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                          {m.membership.user.name}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-4)' }}>
                          {m.membership.plan.name}
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm" style={{ color: 'var(--text-4)' }}>—</span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="px-5 py-3.5">
                    {canAct ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => onConfirm(m)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                          style={{ backgroundColor: '#22c55e18', color: '#22c55e' }}>
                          <Check className="w-3.5 h-3.5" />
                          Confirmar
                        </button>
                        <button
                          onClick={() => onReject(m)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                          style={{ backgroundColor: '#ef444418', color: '#ef4444' }}>
                          <X className="w-3.5 h-3.5" />
                          Rechazar
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--text-4)' }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {total > LIMIT && (
        <div className="flex items-center justify-between px-5 py-3.5 border-t"
          style={{ borderColor: 'var(--border-1)' }}>
          <span className="text-xs" style={{ color: 'var(--text-4)' }}>
            Mostrando {from}–{to} de {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onPrev}
              disabled={offset === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40"
              style={{ borderColor: 'var(--border-1)', color: 'var(--text-2)' }}
              onMouseEnter={e => { if (offset > 0) e.currentTarget.style.backgroundColor = 'var(--surface-hover)' }}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              <ChevronLeft className="w-3.5 h-3.5" />
              Anterior
            </button>
            <button
              onClick={onNext}
              disabled={to >= total}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40"
              style={{ borderColor: 'var(--border-1)', color: 'var(--text-2)' }}
              onMouseEnter={e => { if (to < total) e.currentTarget.style.backgroundColor = 'var(--surface-hover)' }}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              Siguiente
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page principal ────────────────────────────────────────────────────────────

export default function FintocPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()

  const [status, setStatus] = useState<FintocStatus | null>(null)
  const [movementsData, setMovementsData] = useState<MovementsResponse | null>(null)
  const [tab, setTab] = useState<Tab>('PENDING')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [movLoading, setMovLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [connectLoading, setConnectLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [confirmModal, setConfirmModal] = useState<BankMovement | null>(null)
  const [rejectModal, setRejectModal] = useState<BankMovement | null>(null)

  // Cargar status inicial
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get<FintocStatus>('/payments/fintoc/status')
      setStatus(data)
    } catch {
      // no-op: status falla silenciosamente; la tabla seguirá cargando
    }
  }, [])

  // Cargar movimientos por tab/offset
  const fetchMovements = useCallback(async (currentTab: Tab, currentOffset: number) => {
    setMovLoading(true)
    setError(null)
    try {
      const { data } = await api.get<MovementsResponse>('/payments/fintoc/movements', {
        params: { status: currentTab, limit: LIMIT, offset: currentOffset },
      })
      setMovementsData(data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cargar los movimientos')
    } finally {
      setMovLoading(false)
    }
  }, [])

  useEffect(() => { loadFromStorage() }, [])

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    Promise.all([fetchStatus(), fetchMovements('PENDING', 0)]).finally(() => setLoading(false))
  }, [user])

  // Refetch al cambiar tab u offset
  useEffect(() => {
    if (!user || loading) return
    fetchMovements(tab, offset)
  }, [tab, offset])

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab)
    setOffset(0)
  }

  const handleSync = async () => {
    setSyncLoading(true)
    try {
      // La API consulta los movimientos a Fintoc con el link guardado
      await api.post('/payments/fintoc/sync')
      await Promise.all([fetchStatus(), fetchMovements(tab, offset)])
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al sincronizar')
    } finally {
      setSyncLoading(false)
    }
  }

  // Conectar la cuenta bancaria con el widget de Fintoc (spec §4.8)
  const handleConnect = async () => {
    setConnectLoading(true)
    try {
      const { data } = await api.post<{ widgetToken: string; publicKey: string }>('/payments/fintoc/link-intent')
      const { getFintoc } = await import('@fintoc/fintoc-js')
      const Fintoc = await getFintoc()
      if (!Fintoc) throw new Error('No se pudo cargar el widget de Fintoc')
      const widget = Fintoc.create({
        widgetToken: data.widgetToken,
        publicKey: data.publicKey,
        holderType: 'business',
        product: 'movements',
        country: 'cl',
        onSuccess: async (result: { exchangeToken?: string; exchange_token?: string }) => {
          try {
            await api.post('/payments/fintoc/link/exchange', {
              exchangeToken: result.exchangeToken ?? result.exchange_token,
            })
            await fetchStatus()
          } catch (err: any) {
            alert(err.response?.data?.error || 'No se pudo guardar la conexión con Fintoc')
          } finally {
            setConnectLoading(false)
          }
        },
        onExit: () => setConnectLoading(false),
      })
      widget.open()
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || 'Error al conectar con Fintoc')
      setConnectLoading(false)
    }
  }

  const handleConfirmed = async () => {
    setConfirmModal(null)
    await Promise.all([fetchStatus(), fetchMovements(tab, offset)])
  }

  const handleRejected = async () => {
    setRejectModal(null)
    await Promise.all([fetchStatus(), fetchMovements(tab, offset)])
  }

  // ── Stat cards ─────────────────────────────────────────────────────────────

  const confirmedToday = movementsData?.movements.filter(m => {
    if (m.reconciliationStatus !== 'CONFIRMED') return false
    if (!m.reviewedAt) return false
    const d = new Date(m.reviewedAt)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
  }).length ?? 0

  const statCards = [
    {
      label: 'Pendientes de revisión',
      value: status?.pendingCount ?? 0,
      icon: Clock,
      accent: '#f59e0b',
    },
    {
      label: 'Coincidencias (requieren revisión)',
      value: status?.matchedCount ?? 0,
      icon: AlertCircle,
      accent: '#6366f1',
    },
    {
      label: 'Confirmados hoy',
      value: confirmedToday,
      icon: CheckCircle,
      accent: '#22c55e',
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm" style={{ color: 'var(--text-4)' }}>
        Cargando conciliación...
      </div>
    )
  }

  const link = status?.link ?? null

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      {/* Modales */}
      {confirmModal && (
        <ConfirmModal
          movement={confirmModal}
          onClose={() => setConfirmModal(null)}
          onConfirmed={handleConfirmed}
        />
      )}
      {rejectModal && (
        <RejectModal
          movement={rejectModal}
          onClose={() => setRejectModal(null)}
          onRejected={handleRejected}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: '#6366f118' }}>
            <Landmark className="w-5 h-5" style={{ color: '#6366f1' }} />
          </div>
          <div>
            <h1 className="section-title">Conciliacion Bancaria</h1>
            {link ? (
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-4)' }}>
                {link.bankName} · {link.holderName} · Cuenta {link.accountNumber}
                {link.lastSyncAt && (
                  <span> · Ultima sync {new Date(link.lastSyncAt).toLocaleString('es-CL', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}</span>
                )}
              </p>
            ) : (
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-4)' }}>
                Sin cuenta bancaria conectada
              </p>
            )}
          </div>
        </div>

        {/* Sin cuenta: conectar con el widget. Con cuenta: sincronizar movimientos */}
        {link ? (
          <button
            onClick={handleSync}
            disabled={syncLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 shrink-0"
            style={{ background: 'var(--gradient-btn)', color: '#fff', boxShadow: 'var(--glow)' }}>
            <RefreshCw className={`w-4 h-4 ${syncLoading ? 'animate-spin' : ''}`} />
            {syncLoading ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connectLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 shrink-0"
            style={{ background: 'var(--gradient-btn)', color: '#fff', boxShadow: 'var(--glow)' }}>
            <Landmark className="w-4 h-4" />
            {connectLoading ? 'Conectando...' : 'Conectar cuenta bancaria'}
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="card rounded-xl p-5"
              style={{ borderLeft: `3px solid ${card.accent}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: card.accent + '18' }}>
                  <Icon className="w-4 h-4" style={{ color: card.accent }} />
                </div>
              </div>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
                {card.value}
              </p>
              <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-3)' }}>
                {card.label}
              </p>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'var(--surface-base)' }}>
        {TABS.map(t => {
          const active = tab === t.id
          const Icon = t.icon
          const count = t.id === 'PENDING'
            ? status?.pendingCount
            : t.id === 'MATCHED'
            ? status?.matchedCount
            : undefined
          return (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: active ? 'var(--surface-elevated)' : 'transparent',
                color: active ? 'var(--text-1)' : 'var(--text-3)',
              }}>
              <Icon className="w-4 h-4" />
              {t.label}
              {typeof count === 'number' && count > 0 && (
                <span className="ml-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
                  style={{ backgroundColor: t.id === 'PENDING' ? '#f59e0b' : '#6366f1', color: '#fff' }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tabla */}
      <div className="card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border-1)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
            {TABS.find(t => t.id === tab)?.label}
          </h2>
          {movementsData && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
              {movementsData.total} movimiento{movementsData.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {movLoading ? (
          <div className="flex items-center justify-center py-16 text-sm"
            style={{ color: 'var(--text-4)' }}>
            Cargando movimientos...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#ef444418' }}>
              <AlertCircle className="w-6 h-6" style={{ color: '#ef4444' }} />
            </div>
            <div>
              <p className="font-medium text-sm" style={{ color: 'var(--text-2)' }}>
                Error al cargar
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>{error}</p>
            </div>
            <button
              onClick={() => fetchMovements(tab, offset)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-2)' }}>
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </button>
          </div>
        ) : (
          <MovementsTable
            movements={movementsData?.movements ?? []}
            total={movementsData?.total ?? 0}
            offset={offset}
            onConfirm={m => setConfirmModal(m)}
            onReject={m => setRejectModal(m)}
            onPrev={() => setOffset(o => Math.max(0, o - LIMIT))}
            onNext={() => setOffset(o => o + LIMIT)}
          />
        )}
      </div>
    </div>
  )
}
