'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api from '../../../lib/api'

// Administración de las pasarelas con las que los gyms le pagan a la plataforma.
// El superadmin decide cuáles están activas; el admin del gym solo ve esas.
// Contrato (GET/PUT /superadmin/billing-gateways): secretos enmascarados en la
// respuesta; enviar "" u omitir conserva el guardado, `null` lo borra.

const card: React.CSSProperties = { backgroundColor: '#13131f', border: '1px solid #2d2d4e', borderRadius: '0.75rem', padding: '1.25rem' }
const inp: React.CSSProperties = {
  width: '100%', backgroundColor: '#0f0f1a', border: '1px solid #2d2d4e',
  borderRadius: '0.5rem', padding: '0.625rem 1rem', color: '#e2e8f0',
  outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8',
  marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em',
}

type Source = 'db' | 'env' | 'none'
type FlowCfg = { enabled?: boolean; sandbox?: boolean; apiKey?: string | null; secretKey?: string | null }
type TransferCfg = {
  enabled?: boolean; bankName?: string; accountType?: string; accountNumber?: string
  holderName?: string; holderRut?: string; contactEmail?: string; instructions?: string
}
type BillingResponse = {
  gateways: { flow?: FlowCfg; stripe?: { enabled?: boolean }; transfer?: TransferCfg }
  source: { flow: Source; stripe: Source; transfer: Source }
  options?: { banks: string[]; accountTypes: string[] }
}

function errMsg(err: any, fallback = 'Error inesperado'): string {
  const d = err?.response?.data
  if (d?.missing?.length) return `${d.error ?? 'Faltan datos'}: ${d.missing.join(', ')}`
  if (typeof d?.error === 'string') return d.error
  return fallback
}

const SOURCE_LABEL: Record<Source, string> = {
  db: 'Configurado en el panel',
  env: 'Usando variables de entorno',
  none: 'Sin configurar',
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onChange}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
        backgroundColor: on ? '#6366f1' : '#2d2d4e', transition: 'background-color .15s',
      }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18,
        borderRadius: '50%', backgroundColor: '#fff', transition: 'left .15s',
      }} />
    </button>
  )
}

export default function BillingGatewaysPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [source, setSource] = useState<BillingResponse['source']>({ flow: 'none', stripe: 'none', transfer: 'none' })
  const [stripeEnabled, setStripeEnabled] = useState(false)
  const [options, setOptions] = useState<{ banks: string[]; accountTypes: string[] }>({ banks: [], accountTypes: [] })

  const [flow, setFlow] = useState({ enabled: false, sandbox: true })
  // Secretos: lo guardado llega enmascarado. `typed` = lo que escribe el usuario
  // (vacío = conservar), `cleared` = marcado para borrar (se envía null).
  const [flowMasked, setFlowMasked] = useState({ apiKey: '', secretKey: '' })
  const [flowTyped, setFlowTyped] = useState({ apiKey: '', secretKey: '' })
  const [flowCleared, setFlowCleared] = useState({ apiKey: false, secretKey: false })

  const [transfer, setTransfer] = useState<Required<TransferCfg>>({
    enabled: false, bankName: '', accountType: '', accountNumber: '',
    holderName: '', holderRut: '', contactEmail: '', instructions: '',
  })

  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4500)
  }

  const apply = (data: BillingResponse) => {
    const f = data.gateways.flow ?? {}
    const t = data.gateways.transfer ?? {}
    setSource(data.source)
    if (data.options) setOptions(data.options)
    setStripeEnabled(!!data.gateways.stripe?.enabled)
    setFlow({ enabled: !!f.enabled, sandbox: f.sandbox ?? true })
    setFlowMasked({ apiKey: f.apiKey ?? '', secretKey: f.secretKey ?? '' })
    setFlowTyped({ apiKey: '', secretKey: '' })
    setFlowCleared({ apiKey: false, secretKey: false })
    setTransfer({
      enabled: !!t.enabled, bankName: t.bankName ?? '', accountType: t.accountType ?? '',
      accountNumber: t.accountNumber ?? '', holderName: t.holderName ?? '', holderRut: t.holderRut ?? '',
      contactEmail: t.contactEmail ?? '', instructions: t.instructions ?? '',
    })
  }

  useEffect(() => { loadFromStorage() }, [])

  useEffect(() => {
    if (!user) return
    if (user.role !== 'SUPER_ADMIN') { router.push('/dashboard'); return }
    api.get<BillingResponse>('/superadmin/billing-gateways')
      .then(r => apply(r.data))
      .catch(err => showToast(errMsg(err, 'No se pudo cargar la configuración'), 'err'))
      .finally(() => setLoading(false))
  }, [user?.userId])

  const handleSave = async () => {
    setSaving(true)
    try {
      const flowPayload: FlowCfg = { enabled: flow.enabled, sandbox: flow.sandbox }
      for (const key of ['apiKey', 'secretKey'] as const) {
        if (flowCleared[key]) flowPayload[key] = null
        else if (flowTyped[key].trim()) flowPayload[key] = flowTyped[key].trim()
        // si no se tocó, se omite → el servidor conserva el valor guardado
      }
      const { data } = await api.put<BillingResponse>('/superadmin/billing-gateways', {
        flow: flowPayload,
        transfer,
      })
      apply(data)
      showToast('Pasarelas guardadas', 'ok')
    } catch (err) {
      showToast(errMsg(err), 'err')
    } finally {
      setSaving(false)
    }
  }

  const secretField = (key: 'apiKey' | 'secretKey', label: string) => (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={inp}
          type="password"
          autoComplete="off"
          placeholder={flowCleared[key] ? 'Se borrará al guardar' : flowMasked[key] || 'Sin configurar'}
          value={flowTyped[key]}
          disabled={flowCleared[key]}
          onChange={e => setFlowTyped(s => ({ ...s, [key]: e.target.value }))}
        />
        {(flowMasked[key] || flowCleared[key]) && (
          <button type="button"
            onClick={() => setFlowCleared(s => ({ ...s, [key]: !s[key] }))}
            style={{
              ...inp, width: 'auto', cursor: 'pointer', whiteSpace: 'nowrap',
              color: flowCleared[key] ? '#94a3b8' : '#f87171',
            }}>
            {flowCleared[key] ? 'Deshacer' : 'Borrar'}
          </button>
        )}
      </div>
    </div>
  )

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-500 text-sm">Cargando...</div>

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 100, padding: '12px 20px', borderRadius: 12,
          fontSize: 14, fontWeight: 500,
          backgroundColor: toast.type === 'ok' ? '#14532d' : '#450a0a',
          color: toast.type === 'ok' ? '#4ade80' : '#f87171',
          border: `1px solid ${toast.type === 'ok' ? '#166534' : '#7f1d1d'}`,
        }}>{toast.msg}</div>
      )}

      <h1 className="text-xl font-bold mb-1">Pasarelas de cobro a gimnasios</h1>
      <p className="text-sm mb-6" style={{ color: '#94a3b8' }}>
        Define con qué métodos pagan los gimnasios su suscripción a Tribu-Box. El administrador de cada
        gimnasio solo verá los que actives aquí.
      </p>

      <div className="space-y-5">
        {/* Flow */}
        <section style={card}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Flow Chile</h2>
            <Toggle on={flow.enabled} onChange={() => setFlow(f => ({ ...f, enabled: !f.enabled }))} />
          </div>
          <p className="text-xs mb-4" style={{ color: '#64748b' }}>{SOURCE_LABEL[source.flow]}</p>
          <div className="space-y-4">
            {secretField('apiKey', 'API Key')}
            {secretField('secretKey', 'Secret Key')}
            <label className="flex items-center gap-2 text-sm" style={{ color: '#cbd5e1' }}>
              <input type="checkbox" checked={flow.sandbox}
                onChange={e => setFlow(f => ({ ...f, sandbox: e.target.checked }))} />
              Modo sandbox (pruebas)
            </label>
          </div>
        </section>

        {/* Transferencia */}
        <section style={card}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Transferencia bancaria</h2>
            <Toggle on={transfer.enabled} onChange={() => setTransfer(t => ({ ...t, enabled: !t.enabled }))} />
          </div>
          <p className="text-xs mb-4" style={{ color: '#64748b' }}>
            El gimnasio transfiere, sube el comprobante y tú lo confirmas desde Suscripciones. Estos datos los ve el admin del gym al pagar.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              ['bankName', 'Banco'], ['accountType', 'Tipo de cuenta'],
              ['accountNumber', 'N° de cuenta'], ['holderName', 'Titular'],
              ['holderRut', 'RUT titular'], ['contactEmail', 'Email de contacto'],
            ] as const).map(([k, label]) => {
              const list = k === 'bankName' ? options.banks : k === 'accountType' ? options.accountTypes : null
              return (
                <div key={k}>
                  <label style={lbl}>{label}</label>
                  {list ? (
                    <select style={inp} value={transfer[k]}
                      onChange={e => setTransfer(t => ({ ...t, [k]: e.target.value }))}>
                      <option value="">Selecciona…</option>
                      {/* valor guardado antes de existir la lista cerrada: se muestra para poder reemplazarlo */}
                      {transfer[k] && !list.includes(transfer[k]) && (
                        <option value={transfer[k]}>{transfer[k]} (no está en la lista)</option>
                      )}
                      {list.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input style={inp} value={transfer[k]}
                      onChange={e => setTransfer(t => ({ ...t, [k]: e.target.value }))} />
                  )}
                </div>
              )
            })}
            <div className="md:col-span-2">
              <label style={lbl}>Instrucciones (opcional)</label>
              <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} value={transfer.instructions}
                onChange={e => setTransfer(t => ({ ...t, instructions: e.target.value }))} />
            </div>
          </div>
        </section>

        {/* Stripe: solo informativo (por variables de entorno) */}
        <section style={card}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Stripe</h2>
            <span className="text-xs px-2 py-1 rounded-full"
              style={{ backgroundColor: stripeEnabled ? '#14532d' : '#2d2d4e', color: stripeEnabled ? '#4ade80' : '#94a3b8' }}>
              {stripeEnabled ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <p className="text-xs" style={{ color: '#64748b' }}>
            Se configura solo con variables de entorno del servidor (no está activo en Chile). {SOURCE_LABEL[source.stripe]}.
          </p>
        </section>

        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: '#6366f1', color: '#fff' }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </main>
  )
}
