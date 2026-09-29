'use client'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api, { API_BASE } from '../../../lib/api'
import { toMajorUnits } from '../../../lib/money'
import {
  Users, Search, UserPlus, Upload, X, CheckCircle, AlertCircle,
  Wallet, CreditCard, Banknote, RefreshCw, ExternalLink,
  Edit2, Camera, ArrowLeft, Building2, Globe, Smartphone, KeyRound, Download,
} from 'lucide-react'
import * as XLSX from 'xlsx'

/* ─── Types ─────────────────────────────────────────── */
interface UserRow {
  id: string
  name: string
  email: string
  phone: string | null
  gender: string | null
  source: string | null
  avatarUrl: string | null
  createdAt: string
  memberships: { status: string; endsAt: string; plan: { id: string; name: string } }[]
}
interface ImportRow { name: string; email: string; phone?: string; gender?: string }
interface ImportResult { row: ImportRow; ok: boolean; error?: string }

/* ─── Constants ─────────────────────────────────────── */
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ACTIVE:   { label: 'Activo',    cls: 'badge-green'  },
  TRIAL:    { label: 'Prueba',    cls: 'badge-yellow' },
  INACTIVE: { label: 'Inactivo', cls: 'badge-red'    },
  EXPIRED:  { label: 'Expirado', cls: 'badge-gray'   },
}
const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', stripe: 'Pago online', other: 'Otro',
}
const METHOD_ICON: Record<string, string> = {
  cash: '💵', transfer: '🏦', card: '💳', stripe: '🔒', other: '📋',
}
const SOURCE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  presencial: { label: 'BOX presencial', icon: Building2, color: '#6366f1' },
  internet:   { label: 'Internet',       icon: Globe,      color: '#0ea5e9' },
  app:        { label: 'App móvil/web',  icon: Smartphone, color: '#10b981' },
}

/* ─── Modal wrapper ─────────────────────────────────── */
function ModalBackdrop({ onClose, zBack = 40, zFront = 50, children }: {
  onClose: () => void; zBack?: number; zFront?: number; children: React.ReactNode
}) {
  return (
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: zBack, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />
      <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: zFront }} onClick={onClose}>
        <div className="contents" onClick={e => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </>
  )
}

/* ─── Payment Modal ─────────────────────────────────── */
function PaymentModal({ userId, plans, onClose, onSuccess, zBase = 60 }: {
  userId: string; plans: any[]; onClose: () => void; onSuccess: () => void; zBase?: number
}) {
  const [mode, setMode]             = useState<'manual' | 'stripe'>('manual')
  const [planId, setPlanId]         = useState(plans[0]?.id || '')
  const [method, setMethod]         = useState<'cash' | 'transfer' | 'card' | 'other'>('cash')
  const [notes, setNotes]           = useState('')
  const [invoiceType, setInvoiceType] = useState<'none' | 'boleta' | 'factura'>('none')
  const [receiverRut, setReceiverRut]   = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [saving, setSaving]         = useState(false)
  const [stripeUrl, setStripeUrl]   = useState<string | null>(null)
  const [error, setError]           = useState('')

  const selectedPlan = plans.find(p => p.id === planId)
  const fmt = (p: any) => p ? `${toMajorUnits(p.priceCents, p.currency).toLocaleString('es-CL')} ${p.currency}` : ''

  const handleManual = async () => {
    if (!planId) return
    if (invoiceType === 'factura' && !receiverRut) { setError('RUT requerido para factura'); return }
    setSaving(true); setError('')
    try {
      await api.post('/payments/manual', {
        userId, planId, paymentMethod: method,
        paymentNotes: notes || undefined,
        invoiceType: invoiceType !== 'none' ? invoiceType : undefined,
        receiverRut: invoiceType === 'factura' ? receiverRut : undefined,
        receiverName: invoiceType === 'factura' ? receiverName : undefined,
      })
      onSuccess(); onClose()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al registrar pago')
    } finally { setSaving(false) }
  }

  const handleStripe = async () => {
    if (!planId) return
    setSaving(true); setError('')
    try {
      const { data } = await api.post('/payments/checkout', { planId, userId })
      setStripeUrl(data.url)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al generar link')
    } finally { setSaving(false) }
  }

  return (
    <ModalBackdrop onClose={onClose} zBack={zBase} zFront={zBase + 10}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden modal-animate card">
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-1)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'color-mix(in srgb, #22c55e 15%, var(--surface-card))' }}>
              <Wallet className="w-4 h-4 text-emerald-500" />
            </div>
            <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Registrar pago</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-4)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Plan selector */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Plan</label>
            <select value={planId} onChange={e => setPlanId(e.target.value)} className="input">
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {toMajorUnits(p.priceCents, p.currency).toLocaleString('es-CL')} {p.currency} · {p.durationDays}d
                </option>
              ))}
            </select>
            {selectedPlan && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>
                Duración: {selectedPlan.durationDays} días · {fmt(selectedPlan)}
              </p>
            )}
          </div>
          {/* Mode */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-2)' }}>Método de pago</label>
            <div className="grid grid-cols-2 gap-2">
              {(['manual', 'stripe'] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setStripeUrl(null) }}
                  className="flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all"
                  style={mode === m ? {
                    borderColor: 'var(--brand-accent)',
                    backgroundColor: 'color-mix(in srgb, var(--brand-accent) 10%, var(--surface-card))',
                    color: 'var(--brand-accent)',
                  } : { borderColor: 'var(--border-1)', color: 'var(--text-2)', backgroundColor: 'var(--surface-base)' }}>
                  {m === 'manual' ? <><Banknote className="w-4 h-4 shrink-0" />Pago presencial</> : <><CreditCard className="w-4 h-4 shrink-0" />Stripe</>}
                </button>
              ))}
            </div>
          </div>
          {mode === 'manual' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-2)' }}>Forma de pago</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['cash', 'transfer', 'card', 'other'] as const).map(m => (
                    <button key={m} onClick={() => setMethod(m)}
                      className="flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-all"
                      style={method === m ? {
                        borderColor: 'var(--brand-accent)',
                        backgroundColor: 'color-mix(in srgb, var(--brand-accent) 8%, var(--surface-card))',
                        color: 'var(--text-1)',
                      } : { borderColor: 'var(--border-1)', color: 'var(--text-3)', backgroundColor: 'transparent' }}>
                      <span>{METHOD_ICON[m]}</span>{METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
                  Notas <span className="font-normal" style={{ color: 'var(--text-4)' }}>(opcional)</span>
                </label>
                <input value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="N° transferencia, referencia…" className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-2)' }}>Documento tributario</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['none', 'boleta', 'factura'] as const).map(t => (
                    <button key={t} onClick={() => setInvoiceType(t)}
                      className="p-2.5 rounded-lg border text-xs font-medium transition-all"
                      style={invoiceType === t ? {
                        borderColor: 'var(--brand-accent)',
                        backgroundColor: 'color-mix(in srgb, var(--brand-accent) 8%, var(--surface-card))',
                        color: 'var(--text-1)',
                      } : { borderColor: 'var(--border-1)', color: 'var(--text-3)', backgroundColor: 'transparent' }}>
                      {t === 'none' ? 'Sin doc.' : t === 'boleta' ? '📄 Boleta' : '🧾 Factura'}
                    </button>
                  ))}
                </div>
              </div>
              {invoiceType === 'factura' && (
                <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: 'var(--surface-base)', border: '1px solid var(--border-1)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Datos del receptor</p>
                  <input value={receiverRut} onChange={e => setReceiverRut(e.target.value)}
                    placeholder="RUT receptor ej: 76.123.456-7" className="input text-sm" />
                  <input value={receiverName} onChange={e => setReceiverName(e.target.value)}
                    placeholder="Razón social" className="input text-sm" />
                </div>
              )}
            </div>
          )}
          {mode === 'stripe' && !stripeUrl && (
            <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: 'var(--surface-base)', border: '1px solid var(--border-1)' }}>
              <p style={{ color: 'var(--text-2)' }}>Se generará un link de pago seguro de Stripe. La membresía se activa automáticamente al completar el pago.</p>
            </div>
          )}
          {stripeUrl && (
            <div className="rounded-xl p-4 space-y-3 bg-green-50 border border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium text-green-700">Link generado</p>
              </div>
              <p className="text-xs text-green-600 break-all">{stripeUrl}</p>
              <a href={stripeUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium text-green-700 underline">
                <ExternalLink className="w-3.5 h-3.5" />Abrir página de pago
              </a>
            </div>
          )}
          {error && <div className="text-sm rounded-lg px-3 py-2.5 bg-red-50 border border-red-200 text-red-600">{error}</div>}
          {!stripeUrl && (
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 btn-secondary py-2.5 rounded-xl text-sm">Cancelar</button>
              <button onClick={mode === 'manual' ? handleManual : handleStripe}
                disabled={saving || !planId}
                className="flex-1 btn-brand py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Procesando...' : mode === 'manual' ? 'Confirmar pago' : 'Generar link Stripe'}
              </button>
            </div>
          )}
          {stripeUrl && <button onClick={onClose} className="w-full btn-secondary py-2.5 rounded-xl text-sm">Cerrar</button>}
        </div>
      </div>
    </ModalBackdrop>
  )
}

/* ─── Quick Pay Select Modal ─────────────────────────── */
function QuickPaySelectModal({ users, onSelect, onClose }: {
  users: UserRow[]; onSelect: (u: UserRow) => void; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = search.trim()
    ? users.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      )
    : users

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden modal-animate card" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-1)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'color-mix(in srgb, #22c55e 15%, var(--surface-card))' }}>
              <Wallet className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p className="font-semibold" style={{ color: 'var(--text-1)' }}>Registrar pago</p>
              <p className="text-xs" style={{ color: 'var(--text-4)' }}>Selecciona el alumno</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-4)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 border-b" style={{ borderColor: 'var(--border-1)' }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-4)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar alumno..." autoFocus
              className="input text-sm"
              style={{ paddingLeft: '2.5rem' }} />
          </div>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 130px)' }}>
          {filtered.length === 0 ? (
            <p className="text-center py-10 text-sm" style={{ color: 'var(--text-4)' }}>Sin resultados</p>
          ) : (
            filtered.map(u => (
              <button key={u.id} onClick={() => onSelect(u)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors border-b last:border-0"
                style={{ borderColor: 'var(--border-1)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 15%, transparent)', color: 'var(--brand-accent)' }}>
                  {u.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{u.name}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-4)' }}>{u.email}</p>
                </div>
                {u.memberships?.[0]?.plan?.name && (
                  <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
                    {u.memberships[0].plan.name}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </ModalBackdrop>
  )
}

/* ─── Search params watcher (detects ?action=pay on every navigation) ── */
function SearchParamsWatcher({ onPayAction }: { onPayAction: () => void }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    if (searchParams?.get('action') === 'pay') {
      onPayAction()
      router.replace('/dashboard/users', { scroll: false })
    }
  }, [searchParams])
  return null
}

/* ─── Users Page ─────────────────────────────────────── */
export default function UsersPage() {
  const { user, loadFromStorage } = useAuthStore()
  const isCoach = user?.role === 'COACH'
  const [users, setUsers]       = useState<UserRow[]>([])
  const [filtered, setFiltered] = useState<UserRow[]>([])
  const [plans, setPlans]       = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter]     = useState('all')
  const [search, setSearch]     = useState('')

  // Modals
  const [payUserId, setPayUserId]       = useState<string | null>(null)
  const [showQuickPay, setShowQuickPay] = useState(false)

  // Import
  const [showImport, setShowImport]       = useState(false)
  const [importRows, setImportRows]       = useState<ImportRow[]>([])
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const [importing, setImporting]         = useState(false)

  // Export CSV
  const [exporting, setExporting] = useState(false)

  const router = useRouter()

  useEffect(() => { loadFromStorage() }, [])

  // showQuickPay is triggered by SearchParamsWatcher below

  useEffect(() => {
    if (!user) return  // el layout redirige a /login
    fetchUsers()
    api.get('/plans').then(r => setPlans(r.data)).catch(() => {})
  }, [user, statusFilter])

  useEffect(() => {
    let result = users
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.phone?.includes(q)
      )
    }
    if (planFilter !== 'all') {
      result = result.filter(u => u.memberships?.[0]?.plan?.name === planFilter)
    }
    setFiltered(result)
  }, [search, users, planFilter])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const { data } = await api.get(`/users${params}`)
      setUsers(data)
      setFiltered(data)
    } catch { /* 401: lib/api.ts refresca o cierra sesión; otros errores no deben sacar al usuario */ }
    finally { setLoading(false) }
  }

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<any>(ws, { defval: '' })
      const rows: ImportRow[] = raw.map(r => ({
        name: String(r['Nombre'] || r['name'] || r['NOMBRE'] || '').trim(),
        email: String(r['Email'] || r['email'] || r['EMAIL'] || r['Correo'] || '').trim(),
        phone: String(r['Teléfono'] || r['Telefono'] || r['phone'] || '').trim() || undefined,
        gender: String(r['Género'] || r['Genero'] || r['gender'] || '').trim() || undefined,
      })).filter(r => r.name && r.email)
      setImportRows(rows); setImportResults([]); setShowImport(true)
    }
    reader.readAsBinaryString(file); e.target.value = ''
  }

  const handleRunImport = async () => {
    setImporting(true)
    const results: ImportResult[] = []
    for (const row of importRows) {
      try {
        await api.post('/users', { ...row, password: Math.random().toString(36).slice(-8), role: 'MEMBER' })
        results.push({ row, ok: true })
      } catch (err: any) {
        results.push({ row, ok: false, error: err.response?.data?.error || 'Error' })
      }
    }
    setImportResults(results); setImporting(false)
    if (results.filter(r => r.ok).length > 0) fetchUsers()
  }

  const getStatusBadge = (memberships: UserRow['memberships']) => {
    const active = memberships?.[0]
    if (!active) return <span className="badge-gray">Sin plan</span>
    const cfg = STATUS_BADGE[active.status] || STATUS_BADGE.EXPIRED
    return <span className={cfg.cls}>{cfg.label}</span>
  }

  const uniquePlanNames = Array.from(new Set(
    users.map(u => u.memberships?.[0]?.plan?.name).filter(Boolean)
  )) as string[]

  const statusChips = [
    { value: 'ACTIVE',   label: 'Activos'   },
    { value: 'TRIAL',    label: 'En prueba' },
    { value: 'INACTIVE', label: 'Inactivos' },
  ]

  const canExport = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const handleExportCSV = async () => {
    setExporting(true)
    try {
      const response = await api.get('/users/export?format=csv', {
        responseType: 'blob',
      })
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `miembros_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error al exportar:', err)
      alert('No se pudo exportar. Intenta de nuevo.')
    } finally {
      setExporting(false)
    }
  }

  const handleRowClick = (u: UserRow) => {
    router.push(`/dashboard/users/${u.id}`)
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <Suspense fallback={null}>
        <SearchParamsWatcher onPayAction={() => setShowQuickPay(true)} />
      </Suspense>

      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="section-title">Alumnos</h1>
            <p className="text-slate-500 text-sm">Gestiona los miembros de tu gimnasio</p>
          </div>
        </div>
        {!isCoach && (
          <div className="flex items-center gap-2">
            {canExport && (
              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm rounded-lg disabled:opacity-60"
              >
                {exporting ? (
                  <div
                    className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: 'var(--text-3)' }}
                  />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {exporting ? 'Exportando...' : 'Exportar CSV'}
              </button>
            )}
            <label className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm rounded-lg cursor-pointer">
              <Upload className="w-4 h-4" />Importar Excel
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileImport} />
            </label>
            <button onClick={() => setShowQuickPay(true)} className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm rounded-lg">
              <Wallet className="w-4 h-4" />Registrar pago
            </button>
            <button onClick={() => router.push('/dashboard/users/new')} className="btn-brand flex items-center gap-2 px-4 py-2 text-sm">
              <UserPlus className="w-4 h-4" />Nuevo alumno
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative min-w-0 flex-1" style={{ minWidth: '160px' }}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar alumno..."
            className="input text-sm w-full"
            style={{ paddingLeft: '2.5rem' }} />
        </div>
        <select
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value)}
          className="input text-sm shrink-0"
          style={{ width: '160px' }}
        >
          <option value="all">Todos los planes</option>
          {uniquePlanNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <div className="flex gap-2 shrink-0 flex-wrap">
          {statusChips.map(f => (
            <button key={f.value}
              onClick={() => setStatusFilter(statusFilter === f.value ? 'all' : f.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === f.value ? 'text-white' : 'bg-white text-slate-600 hover:text-slate-900 border border-gray-200'
              }`}
              style={statusFilter === f.value ? { backgroundColor: 'var(--brand-accent)' } : {}}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card rounded-xl p-20 text-center text-slate-400 text-sm">Cargando alumnos...</div>
      ) : filtered.length === 0 ? (
        <div className="card rounded-xl p-20 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
            <Users className="w-7 h-7 text-slate-300" />
          </div>
          <div>
            <p className="font-medium text-slate-700">
              {search ? `Sin resultados para "${search}"` : 'No hay alumnos en esta categoría'}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {search ? 'Intenta con otro término de búsqueda' : 'Añade alumnos para empezar'}
            </p>
          </div>
        </div>
      ) : (
        <div className="card rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border-1)' }}>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-3)' }}>
              {filtered.length} alumno{filtered.length !== 1 ? 's' : ''}
              {search && <span style={{ opacity: 0.7 }}> — &ldquo;{search}&rdquo;</span>}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-1)' }}>
                  {['Alumno', 'Plan', 'Estado', 'Origen', 'Vence', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide px-5 py-3"
                      style={{ color: 'var(--text-4)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const srcCfg = u.source ? SOURCE_CONFIG[u.source] : null
                  const SrcIcon = srcCfg?.icon
                  return (
                    <tr key={u.id} className="border-b last:border-0"
                      style={{ borderColor: 'var(--border-1)' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                            style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--brand-accent)' }}>
                            {u.name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{u.name}</p>
                            <p className="text-xs" style={{ color: 'var(--text-4)' }}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-2)' }}>
                        {u.memberships?.[0]?.plan?.name || <span style={{ color: 'var(--text-4)' }}>—</span>}
                      </td>
                      <td className="px-5 py-3.5">{getStatusBadge(u.memberships)}</td>
                      <td className="px-5 py-3.5">
                        {srcCfg && SrcIcon ? (
                          <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full w-fit"
                            style={{ backgroundColor: srcCfg.color + '18', color: srcCfg.color }}>
                            <SrcIcon className="w-3 h-3" />{srcCfg.label}
                          </span>
                        ) : <span className="text-sm" style={{ color: 'var(--text-4)' }}>—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-3)' }}>
                        {u.memberships?.[0]?.endsAt
                          ? new Date(u.memberships[0].endsAt).toLocaleDateString('es-CL')
                          : <span style={{ color: 'var(--text-4)' }}>—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <button onClick={() => handleRowClick(u)}
                          className="text-sm font-medium transition-opacity"
                          style={{ color: 'var(--brand-accent)' }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                          Ver →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showQuickPay && (
        <QuickPaySelectModal
          users={users}
          onClose={() => setShowQuickPay(false)}
          onSelect={u => { setShowQuickPay(false); setPayUserId(u.id) }}
        />
      )}

      {payUserId && (
        <PaymentModal
          userId={payUserId}
          plans={plans}
          onClose={() => setPayUserId(null)}
          onSuccess={() => { setPayUserId(null); fetchUsers() }}
          zBase={40}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <ModalBackdrop onClose={() => { if (!importing) setShowImport(false) }}>
          <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden modal-animate"
            style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-1)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-1)' }}>
              <div>
                <p className="font-semibold" style={{ color: 'var(--text-1)' }}>Importar alumnos desde Excel</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>
                  {importRows.length} alumno{importRows.length !== 1 ? 's' : ''} detectados
                </p>
              </div>
              <button onClick={() => setShowImport(false)} disabled={importing}>
                <X className="w-5 h-5" style={{ color: 'var(--text-3)' }} />
              </button>
            </div>

            {importResults.length === 0 ? (
              <>
                <div className="p-4 text-xs" style={{ backgroundColor: 'var(--surface-base)', borderBottom: '1px solid var(--border-1)', color: 'var(--text-4)' }}>
                  Columnas: <strong>Nombre</strong>, <strong>Email</strong>, <strong>Teléfono</strong> (opcional), <strong>Género</strong> (M/F).
                </div>
                <div className="overflow-auto max-h-80">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--surface-base)', borderBottom: '1px solid var(--border-1)' }}>
                        {['Nombre', 'Email', 'Teléfono', 'Género'].map(h => (
                          <th key={h} className="text-left px-4 py-2 text-xs font-semibold" style={{ color: 'var(--text-4)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((r, i) => (
                        <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--border-1)' }}>
                          <td className="px-4 py-2" style={{ color: 'var(--text-1)' }}>{r.name}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>{r.email}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>{r.phone || '—'}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>{r.gender || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 flex gap-3 border-t" style={{ borderColor: 'var(--border-1)' }}>
                  <button onClick={() => setShowImport(false)} className="flex-1 btn-secondary py-2.5 rounded-xl text-sm">Cancelar</button>
                  <button onClick={handleRunImport} disabled={importing || importRows.length === 0}
                    className="flex-1 btn-brand py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
                    {importing ? 'Importando...' : `Importar ${importRows.length} alumnos`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="overflow-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--surface-base)', borderBottom: '1px solid var(--border-1)' }}>
                        {['Alumno', 'Email', 'Resultado'].map(h => (
                          <th key={h} className="text-left px-4 py-2 text-xs font-semibold" style={{ color: 'var(--text-4)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importResults.map((r, i) => (
                        <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--border-1)' }}>
                          <td className="px-4 py-2" style={{ color: 'var(--text-1)' }}>{r.row.name}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>{r.row.email}</td>
                          <td className="px-4 py-2">
                            {r.ok
                              ? <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle className="w-3.5 h-3.5" />Creado</span>
                              : <span className="flex items-center gap-1 text-red-500 text-xs"><AlertCircle className="w-3.5 h-3.5" />{r.error}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-1)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                    {importResults.filter(r => r.ok).length} creados · {importResults.filter(r => !r.ok).length} con error
                  </p>
                  <button onClick={() => setShowImport(false)} className="btn-brand px-5 py-2 text-sm rounded-xl">Cerrar</button>
                </div>
              </>
            )}
          </div>
        </ModalBackdrop>
      )}
    </div>
  )
}
