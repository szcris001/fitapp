'use client'
import { useEffect, useState } from 'react'
import api from '../../../lib/api'

// Pago de la suscripción del gym a Tribu-Box. Solo se ofrecen las pasarelas que el
// superadmin dejó activas (GET /gyms/me/billing/gateways). El monto lo fija el
// servidor a partir del plan: aquí solo se manda { planId, gateway }.

type BankInfo = {
  bankName?: string; accountType?: string; accountNumber?: string
  holderName?: string; holderRut?: string; contactEmail?: string; instructions?: string
}
type GatewayOption = { gateway: 'flow' | 'stripe' | 'transfer'; label: string; sandbox?: boolean; transfer?: BankInfo }
type TransferResult = { paymentId: string; reference: string; amountCLP: number; bank: BankInfo }

const BOX: React.CSSProperties = {
  backgroundColor: 'var(--surface-base, #13131f)', border: '1px solid var(--border, #2d2d4e)',
  borderRadius: 14, width: '100%', maxWidth: 460, padding: 22, color: 'inherit',
}

function errMsg(err: any, fallback: string): string {
  const e = err?.response?.data?.error
  return typeof e === 'string' ? e : fallback
}

export default function SubscriptionPayModal({ planId, onClose }: { planId: string; onClose: () => void }) {
  const [options, setOptions] = useState<GatewayOption[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [transfer, setTransfer] = useState<TransferResult | null>(null)
  const [uploaded, setUploaded] = useState(false)

  useEffect(() => {
    api.get('/gyms/me/billing/gateways')
      .then(r => setOptions(r.data.gateways ?? []))
      .catch(err => { setOptions([]); setError(errMsg(err, 'No se pudieron cargar los métodos de pago')) })
  }, [])

  const pay = async (gateway: GatewayOption['gateway']) => {
    setBusy(gateway); setError('')
    try {
      const { data } = await api.post('/gyms/me/subscription/checkout', { planId, gateway })
      if (data.type === 'redirect' && typeof data.url === 'string' && /^https:\/\//.test(data.url)) {
        window.location.href = data.url
        return
      }
      if (data.type === 'transfer') setTransfer(data)
    } catch (err) {
      setError(errMsg(err, 'No se pudo iniciar el pago. Intenta de nuevo o contacta a soporte.'))
    } finally {
      setBusy(null)
    }
  }

  const uploadReceipt = async (file: File) => {
    if (!transfer) return
    setBusy('receipt'); setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      await api.post(`/gyms/me/subscription/payments/${transfer.paymentId}/receipt`, form)
      setUploaded(true)
    } catch (err) {
      setError(errMsg(err, 'No se pudo subir el comprobante (JPG, PNG, WebP o PDF de hasta 5 MB).'))
    } finally {
      setBusy(null)
    }
  }

  const bankRows: [string, string | undefined][] = transfer ? [
    ['Banco', transfer.bank.bankName], ['Tipo de cuenta', transfer.bank.accountType],
    ['N° de cuenta', transfer.bank.accountNumber], ['Titular', transfer.bank.holderName],
    ['RUT', transfer.bank.holderRut], ['Email', transfer.bank.contactEmail],
  ] : []

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={BOX} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Pagar suscripción</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, fontSize: 18 }}>✕</button>
        </div>

        {!transfer && (
          <>
            {options === null && <p style={{ fontSize: 14, opacity: 0.7 }}>Cargando métodos de pago…</p>}
            {options?.length === 0 && !error && (
              <p style={{ fontSize: 14, opacity: 0.8 }}>
                Por ahora no hay métodos de pago habilitados. Contacta a soporte de Tribu-Box.
              </p>
            )}
            <div className="space-y-2">
              {options?.map(o => (
                <button key={o.gateway} onClick={() => pay(o.gateway)} disabled={busy !== null}
                  style={{
                    width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    border: '1px solid var(--border, #2d2d4e)', background: 'transparent', color: 'inherit',
                    fontSize: 14, fontWeight: 600, opacity: busy && busy !== o.gateway ? 0.5 : 1,
                  }}>
                  {busy === o.gateway ? 'Procesando…' : o.label}
                  {o.sandbox && <span style={{ marginLeft: 8, fontSize: 11, color: '#f59e0b' }}>modo pruebas</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {transfer && (
          <div className="space-y-3" style={{ fontSize: 14 }}>
            <p>
              Transfiere <strong>${transfer.amountCLP.toLocaleString('es-CL')} CLP</strong> con la
              referencia <strong>{transfer.reference}</strong> y sube el comprobante.
            </p>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 13 }}>
              {bankRows.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt style={{ opacity: 0.6 }}>{k}</dt><dd>{v}</dd>
                </div>
              ))}
            </dl>
            {transfer.bank.instructions && <p style={{ fontSize: 13, opacity: 0.8 }}>{transfer.bank.instructions}</p>}
            {uploaded ? (
              <p style={{ color: '#4ade80', fontWeight: 600 }}>
                Comprobante enviado. Activaremos tu suscripción cuando lo confirmemos.
              </p>
            ) : (
              <label style={{ display: 'block' }}>
                <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>Comprobante (JPG, PNG, WebP o PDF, máx. 5 MB)</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                  disabled={busy === 'receipt'} style={{ display: 'block', marginTop: 6, fontSize: 13 }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadReceipt(f) }} />
              </label>
            )}
          </div>
        )}

        {error && <p style={{ marginTop: 12, fontSize: 13, color: '#f87171' }}>{error}</p>}
      </div>
    </div>
  )
}
