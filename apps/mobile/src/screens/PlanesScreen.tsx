import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal,
  ActivityIndicator, Linking, Alert, RefreshControl, TextInput,
} from 'react-native'
import { WebView } from 'react-native-webview'
import * as ImagePicker from 'expo-image-picker'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../store/auth.store'
import api, { API_BASE } from '../lib/api'
import { toMajorUnits } from '../lib/money'
import { BottomSheet } from '../components/BottomSheet'

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta',
  stripe: 'Pago online', mercadopago: 'Mercado Pago', flow: 'Flow', khipu: 'Khipu', other: 'Otro',
}
const METHOD_ICON: Record<string, string> = {
  cash: '💵', transfer: '🏦', card: '💳', stripe: '🔒',
  mercadopago: '🟦', flow: '🌊', khipu: '🟣', other: '📋',
}

const GATEWAY_LABEL: Record<string, string> = {
  stripe: 'Tarjeta / Stripe',
  mercadopago: 'Mercado Pago',
  flow: 'Flow',
  khipu: 'Khipu',
  payu: 'PayU',
  kushki: 'Kushki',
  openpay: 'OpenPay',
  mach: 'MACH Business',
  fintocPayments: 'Fintoc Pay',
}
const GATEWAY_ICON: Record<string, string> = {
  stripe: '💳', mercadopago: '🟦', flow: '🌊', khipu: '🟣',
  payu: '🏧', kushki: '🟠', openpay: '🟢', mach: '🔵',
  fintocPayments: '🏦',
}
const GATEWAY_CHECKOUT_PATH: Record<string, string> = {
  stripe: '/payments/checkout-self',
  mercadopago: '/payments/checkout/mercadopago',
  flow: '/payments/checkout/flow',
  khipu: '/payments/checkout/khipu',
  payu: '/payments/checkout/payu',
  kushki: '/payments/checkout/kushki',
  openpay: '/payments/checkout/openpay',
  mach: '/payments/checkout/mach',
  fintocPayments: '/payments/checkout/fintoc-pay',
}
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#22c55e', TRIAL: '#f59e0b', INACTIVE: '#6b7280', EXPIRED: '#ef4444',
}
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo', TRIAL: 'Prueba', INACTIVE: 'Inactivo', EXPIRED: 'Vencido',
}

type PayMethod = string

interface PayModalProps {
  plan: any
  onClose: () => void
  onPaid: () => void
}

function PayModal({ plan, onClose, onPaid }: PayModalProps) {
  const [gateways, setGateways] = useState<string[]>([])
  const [bankAccount, setBankAccount] = useState<Record<string, string>>({})
  const [loadingGateways, setLoadingGateways] = useState(true)
  const [method, setMethod] = useState<PayMethod>('transfer')
  const [loading, setLoading] = useState(false)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [receiptUri, setReceiptUri] = useState<string | null>(null)
  const [transferSent, setTransferSent] = useState(false)
  const [autoRenew, setAutoRenew] = useState(false)
  const [autoRenewConsent, setAutoRenewConsent] = useState(false)

  // Fintoc Pay — flujo en-app con WebView
  const [fintocWebViewUrl, setFintocWebViewUrl] = useState<string | null>(null)
  const [fintocPaymentIntentId, setFintocPaymentIntentId] = useState<string | null>(null)
  const [pollingStatus, setPollingStatus] = useState<'idle' | 'polling' | 'success' | 'failed'>('idle')

  const price = toMajorUnits(plan.priceCents, plan.currency ?? 'CLP').toLocaleString('es-CL')
  const showAutoRenew = method === 'stripe' && plan.autoRenewEnabled

  // ── Fintoc Pay: polling de estado mientras el WebView está abierto ────────
  useEffect(() => {
    if (!fintocPaymentIntentId || pollingStatus !== 'polling') return

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/payments/fintoc-pay/status/${fintocPaymentIntentId}`)
        if (res.data.status === 'SUCCEEDED') {
          clearInterval(interval)
          clearTimeout(timeout)
          setFintocWebViewUrl(null)
          setPollingStatus('success')
          onPaid()
          Alert.alert('¡Pago exitoso!', 'Tu membresía ha sido activada.')
        } else if (res.data.status === 'FAILED') {
          clearInterval(interval)
          clearTimeout(timeout)
          setFintocWebViewUrl(null)
          setPollingStatus('failed')
          Alert.alert('Pago fallido', 'El pago no pudo completarse. Intenta nuevamente.')
        }
      } catch {
        // silenciar errores de red durante polling
      }
    }, 3000)

    const timeout = setTimeout(() => {
      clearInterval(interval)
      setFintocWebViewUrl(null)
      setPollingStatus('idle')
      Alert.alert('Pago en proceso', 'Tu pago está siendo verificado. Te notificaremos cuando se confirme.')
    }, 5 * 60 * 1000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [fintocPaymentIntentId, pollingStatus])

  const handleFintocPay = async (planId: string) => {
    try {
      setLoading(true)
      const res = await api.post('/payments/checkout/fintoc-pay', { planId })
      setFintocPaymentIntentId(res.data.paymentIntentId)
      setFintocWebViewUrl(res.data.widgetUrl)
      setPollingStatus('polling')
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message ?? 'No se pudo iniciar el pago')
    } finally {
      setLoading(false)
    }
  }

  const closeFintocWebView = () => {
    setFintocWebViewUrl(null)
    setFintocPaymentIntentId(null)
    setPollingStatus('idle')
  }

  // ── Fin Fintoc Pay ────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      api.get('/payments/gateways'),
      api.get('/gyms/me'),
    ]).then(([gwRes, gymRes]) => {
      const gwList: string[] = gwRes.data.gateways || []
      setGateways(gwList)
      if (gwList.length > 0) setMethod(gwList[0])
      else setMethod('transfer')
      setBankAccount(gymRes.data.bankAccount || {})
    })
      .catch(() => { setMethod('transfer') })
      .finally(() => setLoadingGateways(false))
  }, [])

  const handleOnlineCheckout = async (gateway: string) => {
    if (showAutoRenew && autoRenew && !autoRenewConsent) {
      Alert.alert('Consentimiento requerido', 'Por favor acepta los términos de auto-renovación para continuar.')
      return
    }
    setLoading(true)
    setCheckoutUrl(null)
    try {
      const path = GATEWAY_CHECKOUT_PATH[gateway]
      const body: any = { planId: plan.id }
      if (gateway === 'stripe') body.autoRenew = autoRenew && autoRenewConsent
      const { data } = await api.post(path, body)
      const url = data.url
      if (url) {
        setCheckoutUrl(url)
        await Linking.openURL(url)
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo generar el link de pago')
    } finally { setLoading(false) }
  }

  const pickReceipt = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería'); return }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    })
    if (!result.canceled && result.assets[0]) {
      setReceiptUri(result.assets[0].uri)
    }
  }

  const handleUploadReceipt = async () => {
    if (!receiptUri) { Alert.alert('Comprobante', 'Selecciona una imagen del comprobante primero'); return }
    setLoading(true)
    try {
      const formData = new FormData()
      const filename = receiptUri.split('/').pop() || 'receipt.jpg'
      formData.append('file', { uri: receiptUri, name: filename, type: 'image/jpeg' } as any)
      await api.post(`/payments/transfer/receipt?planId=${plan.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setTransferSent(true)
      Alert.alert(
        '✅ Comprobante enviado',
        'El administrador revisará tu comprobante y activará tu membresía.',
        [{ text: 'Entendido', onPress: () => { onPaid(); onClose() } }],
      )
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo enviar el comprobante')
    } finally { setLoading(false) }
  }

  const allMethods: string[] = [...gateways, 'transfer']

  return (
    <>
    <BottomSheet visible={true} onClose={onClose} title="Contratar plan" scrollable={true}>
      <View style={{ paddingHorizontal: 24 }}>
          {/* Plan summary */}
          <View style={styles.planSummary}>
            <Text style={styles.planSummaryName}>{plan.name}</Text>
            <View style={styles.planSummaryRow}>
              <Text style={styles.planSummaryLabel}>📅 {plan.durationDays} días</Text>
              <Text style={styles.planSummaryPrice}>{price} {plan.currency}</Text>
            </View>
          </View>

          {loadingGateways ? (
            <ActivityIndicator color="#6366f1" size={24} style={{ marginVertical: 20 }} />
          ) : (
            <>
              {/* Method selector */}
              <Text style={styles.methodLabel}>Selecciona cómo pagar</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}
                contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                {allMethods.map(m => (
                  <TouchableOpacity key={m}
                    style={[styles.methodBtn, method === m && styles.methodBtnActive]}
                    onPress={() => { setMethod(m); setCheckoutUrl(null) }}>
                    <Text style={styles.methodBtnIcon}>
                      {m === 'transfer' ? '🏦' : GATEWAY_ICON[m] || '💳'}
                    </Text>
                    <Text style={[styles.methodBtnText, method === m && styles.methodBtnTextActive]}>
                      {m === 'transfer' ? 'Transferencia' : GATEWAY_LABEL[m] || m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Auto-renewal toggle — Stripe only */}
              {showAutoRenew && (
                <View style={styles.autoRenewBox}>
                  <TouchableOpacity
                    style={styles.autoRenewRow}
                    onPress={() => { setAutoRenew(!autoRenew); if (autoRenew) setAutoRenewConsent(false) }}>
                    <View style={[styles.toggle, autoRenew && styles.toggleActive]}>
                      <View style={[styles.toggleKnob, autoRenew && styles.toggleKnobActive]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.autoRenewTitle}>🔄 Auto-renovación</Text>
                      <Text style={styles.autoRenewSub}>
                        Se cobrará automáticamente {plan.autoRenewDaysBefore ?? 3} días antes de vencer
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {autoRenew && (
                    <TouchableOpacity style={styles.consentRow} onPress={() => setAutoRenewConsent(!autoRenewConsent)}>
                      <View style={[styles.checkbox, autoRenewConsent && styles.checkboxChecked]}>
                        {autoRenewConsent && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <Text style={styles.consentText}>
                        Acepto que se guarde mi tarjeta para cobros automáticos futuros. Puedo cancelar en cualquier momento desde mi perfil.
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Info box */}
              {method === 'fintocPayments' ? (
                <View style={styles.methodInfo}>
                  <Text style={styles.infoTitle}>🏦 Fintoc Pay — Pago bancario directo</Text>
                  <Text style={styles.infoText}>
                    Se abrirá el widget de Fintoc dentro de la app. Inicia sesión en tu banco y autoriza el pago de forma segura.
                  </Text>
                </View>
              ) : method === 'transfer' ? (
                <View style={styles.methodInfo}>
                  <Text style={styles.infoTitle}>🏦 Datos para transferencia</Text>
                  {/* Monto */}
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>Monto</Text>
                    <Text style={[styles.bankValue, { color: '#fff', fontWeight: '800' }]}>{price} {plan.currency}</Text>
                  </View>
                  {/* Datos bancarios del gimnasio */}
                  {bankAccount.ownerName && <View style={styles.bankRow}><Text style={styles.bankLabel}>Nombre</Text><Text style={styles.bankValue}>{bankAccount.ownerName}</Text></View>}
                  {bankAccount.rut && <View style={styles.bankRow}><Text style={styles.bankLabel}>RUT</Text><Text style={styles.bankValue}>{bankAccount.rut}</Text></View>}
                  {bankAccount.bank && <View style={styles.bankRow}><Text style={styles.bankLabel}>Banco</Text><Text style={styles.bankValue}>{bankAccount.bank}</Text></View>}
                  {bankAccount.accountType && <View style={styles.bankRow}><Text style={styles.bankLabel}>Tipo</Text><Text style={styles.bankValue}>{bankAccount.accountType}</Text></View>}
                  {bankAccount.accountNumber && <View style={styles.bankRow}><Text style={styles.bankLabel}>N° cuenta</Text><Text style={styles.bankValue}>{bankAccount.accountNumber}</Text></View>}
                  {bankAccount.email && <View style={styles.bankRow}><Text style={styles.bankLabel}>Email</Text><Text style={styles.bankValue}>{bankAccount.email}</Text></View>}
                  {!bankAccount.ownerName && <Text style={styles.infoText}>Consulta los datos de transferencia con el staff.</Text>}

                  {/* Upload comprobante */}
                  <View style={[styles.bankRow, { marginTop: 12, flexDirection: 'column', gap: 8 }]}>
                    <TouchableOpacity onPress={pickReceipt} style={styles.uploadBtn}>
                      <Text style={styles.uploadBtnText}>
                        {receiptUri ? '✅ Comprobante seleccionado' : '📎 Adjuntar comprobante'}
                      </Text>
                    </TouchableOpacity>
                    {receiptUri && !transferSent && (
                      <Text style={[styles.infoText, { color: '#86efac' }]}>Imagen lista. Presiona "Enviar comprobante" para continuar.</Text>
                    )}
                  </View>
                </View>
              ) : (
                <View style={styles.methodInfo}>
                  {checkoutUrl ? (
                    <>
                      <Text style={styles.infoSuccess}>✅ Link generado</Text>
                      <Text style={styles.infoText}>Se abrió la página de pago en tu navegador.</Text>
                      <TouchableOpacity onPress={() => Linking.openURL(checkoutUrl)}>
                        <Text style={styles.infoLink}>Volver a abrir →</Text>
                      </TouchableOpacity>
                      <Text style={[styles.infoText, { marginTop: 8 }]}>
                        Después de pagar, tu membresía se activará automáticamente.
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.infoText}>
                      Se abrirá la página segura de{' '}
                      <Text style={{ color: '#fff', fontWeight: '600' }}>{GATEWAY_LABEL[method] || method}</Text>{' '}
                      para completar tu pago.
                    </Text>
                  )}
                </View>
              )}

              {/* Action */}
              <TouchableOpacity
                style={[styles.payActionBtn, loading && { opacity: 0.6 }]}
                onPress={
                  method === 'transfer'
                    ? handleUploadReceipt
                    : method === 'fintocPayments'
                      ? () => handleFintocPay(plan.id)
                      : () => handleOnlineCheckout(method)
                }
                disabled={loading || (method === 'transfer' && !receiptUri)}>
                {loading
                  ? <ActivityIndicator color="#fff" size={18} />
                  : <Text style={styles.payActionText}>
                      {method === 'transfer'
                        ? (receiptUri ? 'Enviar comprobante →' : 'Selecciona un comprobante')
                        : method === 'fintocPayments'
                          ? 'Pagar con Fintoc Pay'
                          : checkoutUrl
                            ? 'Volver a abrir pago'
                            : `Pagar con ${GATEWAY_LABEL[method] || method}`}
                    </Text>
                }
              </TouchableOpacity>
            </>
          )}
      </View>
    </BottomSheet>

    {/* Fintoc Pay — WebView modal en-app */}
    <Modal visible={!!fintocWebViewUrl} animationType="slide" onRequestClose={closeFintocWebView}>
      <View style={styles.fintocModalContainer}>
        {/* Header */}
        <View style={styles.fintocHeader}>
          <Text style={styles.fintocHeaderTitle}>
            Pago con Fintoc{pollingStatus === 'polling' ? ' · Verificando...' : ''}
          </Text>
          <TouchableOpacity onPress={closeFintocWebView} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.fintocHeaderClose}>×</Text>
          </TouchableOpacity>
        </View>
        {/* WebView */}
        {fintocWebViewUrl ? (
          <WebView
            source={{ uri: fintocWebViewUrl }}
            style={{ flex: 1 }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.fintocLoading}>
                <ActivityIndicator size="large" color="#6366F1" />
              </View>
            )}
          />
        ) : null}
      </View>
    </Modal>
  </>
  )
}

export default function PlanesScreen({ navigation }: { navigation?: any }) {
  const { user } = useAuthStore()
  const insets = useSafeAreaInsets()
  const [plans, setPlans] = useState<any[]>([])
  const [memberships, setMemberships] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    try {
      const [plansRes, membRes] = await Promise.all([
        api.get('/plans'),
        api.get('/payments/my-memberships'),
      ])
      setPlans(plansRes.data)
      setMemberships(membRes.data)
    } catch (e) {
      console.log('PlanesScreen error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchData()
  }, [])

  const activeMembership = memberships.find(m => m.status === 'ACTIVE' || m.status === 'TRIAL')
  const daysLeft = activeMembership
    ? Math.ceil((new Date(activeMembership.endsAt).getTime() - Date.now()) / 86_400_000)
    : null

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366f1" size={36} />
      </View>
    )
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerRow}>
            {navigation?.canGoBack?.() !== false && (
              <TouchableOpacity
                onPress={() => navigation?.goBack()}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.backBtn}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
            )}
            <View>
              <Text style={styles.headerTitle}>Mi Plan</Text>
              <Text style={styles.headerSub}>Membresía y pagos</Text>
            </View>
          </View>
        </View>

        {/* Active membership card */}
        <View style={styles.section}>
          {activeMembership ? (
            <View style={styles.activeCard}>
              <View style={styles.activeCardTop}>
                <View>
                  <Text style={styles.activeLabel}>Plan activo</Text>
                  <Text style={styles.activePlan}>{activeMembership.plan?.name}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[activeMembership.status] + '25' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[activeMembership.status] }]}>
                    {STATUS_LABEL[activeMembership.status]}
                  </Text>
                </View>
              </View>

              {/* Days bar */}
              <View style={styles.daysRow}>
                <Text style={styles.daysText}>
                  {daysLeft !== null && daysLeft > 0 ? `${daysLeft} días restantes` : 'Vencida'}
                </Text>
                <Text style={styles.daysDate}>
                  Vence {new Date(activeMembership.endsAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}
                </Text>
              </View>
              <View style={styles.daysBar}>
                <View style={[styles.daysFill, {
                  width: `${Math.max(0, Math.min(100, daysLeft !== null && activeMembership.plan
                    ? (daysLeft / activeMembership.plan.durationDays) * 100 : 0))}%` as any,
                  backgroundColor: daysLeft !== null && daysLeft <= 3 ? '#ef4444' : daysLeft !== null && daysLeft <= 7 ? '#f59e0b' : '#22c55e',
                }]} />
              </View>

              {activeMembership.paymentMethod && (
                <Text style={styles.paymentMethodText}>
                  {METHOD_ICON[activeMembership.paymentMethod]} Pagado con {METHOD_LABEL[activeMembership.paymentMethod] || activeMembership.paymentMethod}
                </Text>
              )}

              {/* Invoice link */}
              {activeMembership.invoicePdfUrl && (
                <TouchableOpacity onPress={() => Linking.openURL(activeMembership.invoicePdfUrl)}>
                  <Text style={styles.invoiceLink}>
                    📄 {activeMembership.invoiceType === 'factura' ? 'Factura' : 'Boleta'} N° {activeMembership.invoiceNumber} →
                  </Text>
                </TouchableOpacity>
              )}

              {/* Warning for expiring soon */}
              {daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    ⚠️ Tu membresía vence pronto. Renueva eligiendo un plan abajo.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.noMembershipCard}>
              <Text style={styles.noMembershipEmoji}>🏋️</Text>
              <Text style={styles.noMembershipTitle}>Sin membresía activa</Text>
              <Text style={styles.noMembershipSub}>Elige un plan para comenzar</Text>
            </View>
          )}
        </View>

        {/* Available plans */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Planes disponibles</Text>
          {plans.length === 0 ? (
            <Text style={styles.emptyText}>No hay planes disponibles</Text>
          ) : (
            plans.map(plan => (
              <View key={plan.id} style={[
                styles.planCard,
                activeMembership?.planId === plan.id && styles.planCardActive,
              ]}>
                <View style={styles.planTop}>
                  <View style={styles.planInfo}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    {plan.description && (
                      <Text style={styles.planDesc}>{plan.description}</Text>
                    )}
                    <View style={styles.planMeta}>
                      <Text style={styles.planMetaText}>📅 {plan.durationDays} días</Text>
                      {plan.maxClasses && (
                        <Text style={styles.planMetaText}>🏃 Máx {plan.maxClasses} clases</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.planPriceWrap}>
                    <Text style={styles.planPrice}>
                      {toMajorUnits(plan.priceCents, plan.currency ?? 'CLP').toLocaleString('es-CL')}
                    </Text>
                    <Text style={styles.planCurrency}>{plan.currency}</Text>
                  </View>
                </View>

                {activeMembership?.planId === plan.id ? (
                  <View style={styles.currentPlanBadge}>
                    <Text style={styles.currentPlanText}>✓ Plan actual</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={() => setSelectedPlan(plan)}>
                    <Text style={styles.payBtnIcon}>💳</Text>
                    <Text style={styles.payBtnText}>Contratar plan</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>

        {/* Payment history */}
        {memberships.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Historial de pagos</Text>
            <View style={styles.historyCard}>
              {memberships.map((m, i) => (
                <View key={m.id} style={[styles.historyRow, i > 0 && styles.historyRowBorder]}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyMethod}>
                      {m.paymentMethod ? METHOD_ICON[m.paymentMethod] : '📋'}
                    </Text>
                    <View>
                      <Text style={styles.historyPlan}>{m.plan?.name}</Text>
                      <Text style={styles.historyDates}>
                        {new Date(m.startsAt).toLocaleDateString('es-CL')} – {new Date(m.endsAt).toLocaleDateString('es-CL')}
                      </Text>
                      {m.invoicePdfUrl && (
                        <TouchableOpacity onPress={() => Linking.openURL(m.invoicePdfUrl)}>
                          <Text style={styles.historyInvoice}>
                            {m.invoiceType === 'factura' ? 'Factura' : 'Boleta'} N° {m.invoiceNumber} →
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyAmount}>
                      {toMajorUnits(m.pricePaid, m.currency ?? 'CLP').toLocaleString('es-CL')} {m.currency}
                    </Text>
                    <View style={[styles.historyStatus, { backgroundColor: STATUS_COLOR[m.status] + '20' }]}>
                      <Text style={[styles.historyStatusText, { color: STATUS_COLOR[m.status] }]}>
                        {STATUS_LABEL[m.status]}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Pay modal */}
      {selectedPlan && (
        <PayModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onPaid={() => { setSelectedPlan(null); fetchData() }}
        />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { marginRight: 4, padding: 2 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  section: { paddingHorizontal: 24, marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  emptyText: { fontSize: 13, color: '#4b5563' },

  // Active membership
  activeCard: { backgroundColor: '#111827', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1f2937' },
  activeCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  activeLabel: { fontSize: 11, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  activePlan: { fontSize: 20, fontWeight: '700', color: '#fff' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  daysText: { fontSize: 13, color: '#d1d5db', fontWeight: '500' },
  daysDate: { fontSize: 12, color: '#6b7280' },
  daysBar: { height: 6, backgroundColor: '#1f2937', borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  daysFill: { height: 6, borderRadius: 3 },
  paymentMethodText: { fontSize: 12, color: '#4b5563', marginBottom: 4 },
  invoiceLink: { fontSize: 12, color: '#6366f1', marginTop: 4 },
  warningBox: { marginTop: 10, backgroundColor: '#451a03', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#92400e' },
  warningText: { fontSize: 12, color: '#fbbf24' },

  // No membership
  noMembershipCard: { backgroundColor: '#111827', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937', borderStyle: 'dashed' },
  noMembershipEmoji: { fontSize: 36, marginBottom: 10 },
  noMembershipTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 4 },
  noMembershipSub: { fontSize: 13, color: '#6b7280' },

  // Plans
  planCard: { backgroundColor: '#111827', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1f2937' },
  planCardActive: { borderColor: '#6366f1', borderWidth: 1.5 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  planInfo: { flex: 1, marginRight: 12 },
  planName: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 4 },
  planDesc: { fontSize: 12, color: '#6b7280', marginBottom: 6, lineHeight: 17 },
  planMeta: { flexDirection: 'row', gap: 12 },
  planMetaText: { fontSize: 12, color: '#4b5563' },
  planPriceWrap: { alignItems: 'flex-end' },
  planPrice: { fontSize: 24, fontWeight: '800', color: '#fff' },
  planCurrency: { fontSize: 12, color: '#4b5563', marginTop: 2 },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 12 },
  payBtnIcon: { fontSize: 16 },
  payBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  currentPlanBadge: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#166534', backgroundColor: '#052e16' },
  currentPlanText: { color: '#4ade80', fontWeight: '600', fontSize: 14 },

  // History
  historyCard: { backgroundColor: '#111827', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#1f2937' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  historyRowBorder: { borderTopWidth: 1, borderTopColor: '#1f2937' },
  historyLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  historyMethod: { fontSize: 20 },
  historyPlan: { fontSize: 13, fontWeight: '500', color: '#fff' },
  historyDates: { fontSize: 11, color: '#4b5563', marginTop: 2 },
  historyInvoice: { fontSize: 11, color: '#6366f1', marginTop: 2 },
  historyRight: { alignItems: 'flex-end', gap: 4 },
  historyAmount: { fontSize: 13, fontWeight: '600', color: '#fff' },
  historyStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  historyStatusText: { fontSize: 11, fontWeight: '500' },

  // Pay Modal
  planSummary: { backgroundColor: '#1f2937', borderRadius: 14, padding: 16, marginBottom: 20 },
  planSummaryName: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 8 },
  planSummaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  planSummaryLabel: { fontSize: 13, color: '#6b7280' },
  planSummaryPrice: { fontSize: 16, fontWeight: '700', color: '#6366f1' },
  methodLabel: { fontSize: 13, color: '#9ca3af', marginBottom: 10, fontWeight: '500' },
  methodRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  methodBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#374151' },
  methodBtnActive: { borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.15)' },
  methodBtnIcon: { fontSize: 16 },
  methodBtnText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  methodBtnTextActive: { color: '#6366f1' },
  methodInfo: { backgroundColor: '#1f2937', borderRadius: 12, padding: 14, marginBottom: 16 },
  infoTitle: { fontSize: 13, fontWeight: '600', color: '#fff', marginBottom: 10 },
  infoText: { fontSize: 13, color: '#9ca3af', lineHeight: 19 },
  infoSuccess: { fontSize: 14, fontWeight: '600', color: '#4ade80', marginBottom: 4 },
  infoLink: { fontSize: 13, color: '#6366f1', marginTop: 6 },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  bankLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  bankValue: { fontSize: 13, color: '#e5e7eb', fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 12 },
  uploadBtn: {
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.5)', borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  uploadBtnText: { color: '#a5b4fc', fontWeight: '600', fontSize: 14 },
  payActionBtn: { backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  payActionText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Auto-renewal
  autoRenewBox: { backgroundColor: '#1a1f2e', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#2d3748' },
  autoRenewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  autoRenewTitle: { fontSize: 14, color: '#e5e7eb', fontWeight: '600' },
  autoRenewSub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#374151', justifyContent: 'center', padding: 2 },
  toggleActive: { backgroundColor: '#6366f1' },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleKnobActive: { alignSelf: 'flex-end' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#4b5563', alignItems: 'center', justifyContent: 'center', marginTop: 1, shrink: 0 } as any,
  checkboxChecked: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  consentText: { fontSize: 11, color: '#9ca3af', lineHeight: 16, flex: 1 },

  // Fintoc Pay WebView Modal
  fintocModalContainer: { flex: 1, backgroundColor: '#030712' },
  fintocHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
    paddingTop: 52, // safe area para notch
  },
  fintocHeaderTitle: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '600' },
  fintocHeaderClose: { color: '#6b7280', fontSize: 28, lineHeight: 28 },
  fintocLoading: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
})
