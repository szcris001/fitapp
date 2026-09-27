import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BottomSheet } from '../components/BottomSheet'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { useAuthStore } from '../store/auth.store'
import api, { API_BASE as API_URL } from '../lib/api'
import { useTheme } from '../theme/ThemeContext'

interface RmRecord {
  movement: string
  currentRm: number
  updatedAt: string
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#22c55e', TRIAL: '#f59e0b', INACTIVE: '#6b7280', EXPIRED: '#ef4444',
}
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo', TRIAL: 'Prueba', INACTIVE: 'Inactivo', EXPIRED: 'Vencido',
}
const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta',
  stripe: 'Online', mercadopago: 'Mercado Pago', flow: 'Flow',
  khipu: 'Khipu', other: 'Otro',
}

export default function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuthStore()
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  const c = theme.colors

  const [profile, setProfile] = useState<any>(null)
  const [attendanceStats, setAttendanceStats] = useState({ total: 0, thisMonth: 0, rate: 0 })
  const [gymInfo, setGymInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [attendanceMode, setAttendanceMode] = useState<string>('manual')
  const [pendingBookings, setPendingBookings] = useState<any[]>([])
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [activeMembership, setActiveMembership] = useState<any>(null)
  const [togglingAutoRenew, setTogglingAutoRenew] = useState(false)
  const [topRms, setTopRms] = useState<RmRecord[]>([])
  const [allMemberships, setAllMemberships] = useState<any[]>([])
  const [showPayments, setShowPayments] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      api.get('/gyms/me').then(r => {
        setAttendanceMode(r.data.attendanceMode || 'manual')
        setGymInfo(r.data)
      }).catch(() => {})

      api.get('/rms/me').then(r => {
        const rms: RmRecord[] = Array.isArray(r.data) ? r.data : []
        const sorted = [...rms].sort((a, b) => b.currentRm - a.currentRm)
        setTopRms(sorted.slice(0, 3))
      }).catch(() => {})

      const [userRes, bookingsRes] = await Promise.all([
        api.get('/users/me'),
        api.get('/bookings/me'),
      ])
      setProfile(userRes.data)

      const meBookings: any[] = bookingsRes.data || []
      setPendingBookings(meBookings.filter((b: any) => b.status === 'PENDING_CONFIRM'))

      const membershipsRes = await api.get('/payments/my-memberships').catch(() => ({ data: [] }))
      const list: any[] = membershipsRes.data || []
      const active = list.find((m: any) => m.status === 'ACTIVE' || m.status === 'TRIAL')
      setActiveMembership(active || null)
      setAllMemberships(list)

      const attended = meBookings.filter((b: any) => b.status === 'ATTENDED')
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)
      const thisMonth = attended.filter((b: any) => new Date(b.class?.startsAt) >= startOfMonth)
      const rate = meBookings.length > 0 ? Math.round((attended.length / meBookings.length) * 100) : 0
      setAttendanceStats({ total: attended.length, thisMonth: thisMonth.length, rate })
    } catch (e) { console.log(e) }
    finally { setLoading(false) }
  }

  const handleToggleAutoRenew = async (enabled: boolean) => {
    if (!activeMembership) return
    if (enabled) {
      Alert.alert(
        'Activar auto-renovación',
        'Se cobrará automáticamente tu tarjeta guardada antes del vencimiento.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Activar', onPress: async () => {
              setTogglingAutoRenew(true)
              try {
                await api.put(`/payments/my-memberships/${activeMembership.id}/auto-renew`, { enabled: true })
                setActiveMembership((m: any) => ({ ...m, autoRenew: true }))
              } catch (err: any) {
                Alert.alert('Error', err.response?.data?.error || 'No se pudo activar')
              } finally { setTogglingAutoRenew(false) }
            },
          },
        ]
      )
    } else {
      setTogglingAutoRenew(true)
      try {
        await api.put(`/payments/my-memberships/${activeMembership.id}/auto-renew`, { enabled: false })
        setActiveMembership((m: any) => ({ ...m, autoRenew: false }))
      } catch (err: any) {
        Alert.alert('Error', err.response?.data?.error || 'No se pudo desactivar')
      } finally { setTogglingAutoRenew(false) }
    }
  }

  const handleConfirmBooking = async (bookingId: string) => {
    setConfirmingId(bookingId)
    try {
      await api.post(`/bookings/${bookingId}/confirm`)
      Alert.alert('✅ Confirmado', '¡Tu lugar está asegurado!')
      fetchData()
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo confirmar')
    } finally { setConfirmingId(null) }
  }

  const handleChangePassword = async () => {
    if (pwNew.length < 6) return Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres')
    if (pwNew !== pwConfirm) return Alert.alert('Error', 'Las contraseñas no coinciden')
    setPwSaving(true)
    try {
      await api.put('/auth/me', { currentPassword: pwCurrent, newPassword: pwNew })
      Alert.alert('✅ Listo', 'Contraseña actualizada correctamente')
      setShowPasswordModal(false)
      setPwCurrent(''); setPwNew(''); setPwConfirm('')
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo actualizar la contraseña')
    } finally { setPwSaving(false) }
  }

  const handleDeleteAccount = async () => {
    setDeletingAccount(true)
    try {
      await api.delete('/users/me')
      setShowDeleteModal(false)
      await logout()
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo eliminar la cuenta. Inténtalo de nuevo.')
    } finally { setDeletingAccount(false) }
  }

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería'); return }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
    })
    if (result.canceled) return
    setUploadingPhoto(true)
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
      const token = await AsyncStorage.getItem('fitapp_token')
      const formData = new FormData()
      formData.append('file', { uri: result.assets[0].uri, type: 'image/jpeg', name: 'avatar.jpg' } as any)
      await fetch(`${API_URL}/api/users/me/avatar`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      })
      fetchData()
    } catch { Alert.alert('Error', 'No se pudo subir la foto') }
    finally { setUploadingPhoto(false) }
  }

  if (loading) return (
    <View style={[styles.center, { backgroundColor: c.background }]}>
      <ActivityIndicator color={c.primary} size={36} />
    </View>
  )

  const memberSinceDate = profile?.createdAt ? new Date(profile.createdAt) : null
  const memberDays = memberSinceDate
    ? Math.floor((Date.now() - memberSinceDate.getTime()) / 86400000)
    : null

  const membershipStatus: string = activeMembership?.status ?? 'INACTIVE'
  const membershipIsActive = membershipStatus === 'ACTIVE' || membershipStatus === 'TRIAL'
  const planName: string | null = activeMembership?.plan?.name ?? null
  const endsAt: string | null = activeMembership?.endsAt ?? null
  const membershipColor = STATUS_COLOR[membershipStatus] ?? '#6b7280'

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]}>

      {/* ─── HERO ─── */}
      <View style={[styles.hero, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={pickPhoto} style={styles.avatarWrap}>
          {profile?.avatarUrl
            ? <Image source={{ uri: `${API_URL}${profile.avatarUrl}` }} style={[styles.avatarImg, { borderColor: c.primary }]} />
            : (
              <View style={[styles.avatar, { backgroundColor: c.primary + '30', borderColor: c.primary }]}>
                <Text style={[styles.avatarText, { color: c.primary }]}>{user?.name?.[0]?.toUpperCase()}</Text>
              </View>
            )
          }
          <View style={[styles.avatarEdit, { backgroundColor: c.primary, borderColor: c.background }]}>
            {uploadingPhoto
              ? <ActivityIndicator color="#fff" size={10} />
              : <Text style={styles.avatarEditText}>+</Text>
            }
          </View>
        </TouchableOpacity>
        <Text style={[styles.heroName, { color: c.text1 }]}>{user?.name}</Text>
        <Text style={[styles.heroEmail, { color: c.text3 }]}>{user?.email}</Text>
        {memberDays !== null && (
          <Text style={[styles.heroDays, { color: c.text3 }]}>
            🏋️ {memberDays === 0 ? 'Miembro desde hoy' : `${memberDays} días entrenando`}
          </Text>
        )}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: c.text1 }]}>{attendanceStats.total}</Text>
            <Text style={[styles.statLabel, { color: c.text3 }]}>Clases</Text>
          </View>
          <View style={[styles.statDiv, { backgroundColor: c.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: c.text1 }]}>{attendanceStats.thisMonth}</Text>
            <Text style={[styles.statLabel, { color: c.text3 }]}>Este mes</Text>
          </View>
          <View style={[styles.statDiv, { backgroundColor: c.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: c.text1 }]}>{attendanceStats.rate}%</Text>
            <Text style={[styles.statLabel, { color: c.text3 }]}>Asistencia</Text>
          </View>
        </View>
      </View>

      {/* ─── CONFIRMACIONES PENDIENTES ─── */}
      {pendingBookings.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: '#f97316' }]}>⏱ CONFIRMACIÓN PENDIENTE</Text>
          {pendingBookings.map(b => {
            const deadline = b.confirmDeadline ? new Date(b.confirmDeadline) : null
            const minsLeft = deadline ? Math.max(0, Math.round((deadline.getTime() - Date.now()) / 60000)) : null
            return (
              <View key={b.id} style={styles.pendingCard}>
                <Text style={styles.pendingTitle}>{b.classType?.name || 'Clase'}</Text>
                <Text style={styles.pendingSub}>
                  {new Date(b.startsAt).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {' · '}
                  {new Date(b.startsAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  {minsLeft !== null && `  —  quedan ${minsLeft} min`}
                </Text>
                <TouchableOpacity
                  style={styles.pendingBtn}
                  onPress={() => handleConfirmBooking(b.id)}
                  disabled={confirmingId === b.id}
                >
                  {confirmingId === b.id
                    ? <ActivityIndicator color="#fff" size={16} />
                    : <Text style={styles.pendingBtnText}>Confirmar mi lugar</Text>
                  }
                </TouchableOpacity>
              </View>
            )
          })}
        </View>
      )}

      {/* ─── MEMBRESÍA Y PAGOS ─── */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: c.text3 }]}>MEMBRESÍA Y PAGOS</Text>
        <View style={[styles.card, { borderColor: membershipIsActive ? '#22c55e30' : c.border }]}>

          {/* Estado actual */}
          <View style={styles.membershipHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.membershipName, { color: membershipColor }]}>
                {planName ?? (membershipIsActive ? 'Activa' : 'Sin membresía activa')}
              </Text>
              {membershipStatus === 'TRIAL' && (
                <Text style={styles.trialBadge}>Periodo de prueba</Text>
              )}
              {endsAt && (
                <Text style={[styles.membershipExpiry, { color: c.text3 }]}>
                  Vence {new Date(endsAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              )}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: membershipColor + '20' }]}>
              <Text style={[styles.statusBadgeText, { color: membershipColor }]}>
                {STATUS_LABEL[membershipStatus] ?? membershipStatus}
              </Text>
            </View>
          </View>

          {/* Auto-renovación (solo si tiene Stripe) */}
          {activeMembership?.stripePaymentMethodId && (
            <>
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <View style={styles.autoRenewRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.autoRenewTitle, { color: c.text2 }]}>
                    {activeMembership.autoRenew ? '🔄 Auto-renovación activa' : '⏸ Sin auto-renovación'}
                  </Text>
                  {activeMembership.autoRenew && activeMembership.nextAutoRenewAt && (
                    <Text style={[styles.autoRenewSub, { color: c.text3 }]}>
                      Próximo cobro: {new Date(activeMembership.nextAutoRenewAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}
                    </Text>
                  )}
                  {activeMembership.autoRenewFailures > 0 && (
                    <Text style={styles.autoRenewWarn}>
                      ⚠️ {activeMembership.autoRenewFailures} intento(s) fallido(s)
                    </Text>
                  )}
                </View>
                {togglingAutoRenew ? (
                  <ActivityIndicator color={c.primary} size="small" />
                ) : (
                  <TouchableOpacity
                    onPress={() => handleToggleAutoRenew(!activeMembership.autoRenew)}
                    style={[styles.toggle, activeMembership.autoRenew ? { backgroundColor: c.primary } : { backgroundColor: '#374151' }]}
                  >
                    <View style={[styles.toggleThumb, activeMembership.autoRenew ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]} />
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Historial de pagos — colapsable */}
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <TouchableOpacity
            style={styles.accordionRow}
            onPress={() => setShowPayments(v => !v)}
            activeOpacity={0.7}
          >
            <Text style={[styles.accordionLabel, { color: c.text2 }]}>
              Historial de pagos
              {allMemberships.length > 0
                ? <Text style={{ color: c.text3 }}> ({allMemberships.length})</Text>
                : null
              }
            </Text>
            <Ionicons name={showPayments ? 'chevron-up' : 'chevron-down'} size={16} color={c.text3} />
          </TouchableOpacity>

          {showPayments && (
            <View style={{ marginTop: 8 }}>
              {allMemberships.length === 0 ? (
                <Text style={[styles.emptyText, { color: c.text3 }]}>Sin historial de pagos</Text>
              ) : (
                allMemberships.map((m: any, idx: number) => {
                  const sc = STATUS_COLOR[m.status] ?? '#6b7280'
                  return (
                    <View
                      key={m.id ?? `mem-${idx}`}
                      style={[
                        styles.paymentRow,
                        idx > 0 && { borderTopWidth: 1, borderTopColor: c.border },
                      ]}
                    >
                      <View style={[styles.paymentDot, { backgroundColor: sc }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.paymentPlan, { color: c.text1 }]} numberOfLines={1}>
                          {m.plan?.name ?? 'Plan'}
                        </Text>
                        <Text style={[styles.paymentMeta, { color: c.text3 }]}>
                          {m.startsAt
                            ? new Date(m.startsAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                          {m.endsAt
                            ? ` → ${new Date(m.endsAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`
                            : ''}
                          {m.paymentMethod ? `  ·  ${METHOD_LABEL[m.paymentMethod] ?? m.paymentMethod}` : ''}
                          {m.priceCents ? `  ·  $${(m.priceCents / 100).toLocaleString('es-CL')}` : ''}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: sc + '20' }]}>
                        <Text style={[styles.statusBadgeText, { color: sc }]}>
                          {STATUS_LABEL[m.status] ?? m.status}
                        </Text>
                      </View>
                    </View>
                  )
                })
              )}
            </View>
          )}

          {/* CTA */}
          <View style={[styles.divider, { backgroundColor: c.border, marginBottom: 12 }]} />
          <TouchableOpacity
            onPress={() => navigation.navigate('Planes')}
            style={[
              styles.plansBtn,
              membershipIsActive
                ? { backgroundColor: c.primary + '15', borderWidth: 1, borderColor: c.primary + '30' }
                : { backgroundColor: c.primary },
            ]}
          >
            <Text style={[styles.plansBtnText, { color: membershipIsActive ? c.primary : '#fff' }]}>
              {membershipIsActive ? 'Ver planes →' : '💳 Ver planes disponibles'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── MIS RÉCORDS ─── */}
      {topRms.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: c.text3 }]}>MIS RÉCORDS</Text>
            <TouchableOpacity
              onPress={() => navigation?.getParent()?.navigate('Progress')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.seeAllText, { color: c.primary }]}>Ver todos</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.rmRow}>
            {topRms.map(rm => (
              <View key={rm.movement} style={[styles.rmCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.rmName, { color: c.text3 }]} numberOfLines={1}>{rm.movement}</Text>
                <Text style={[styles.rmValue, { color: c.primary }]}>{Math.round(rm.currentRm * 2.20462)} lb</Text>
                <Text style={[styles.rmKg, { color: c.text3 }]}>{rm.currentRm} kg</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ─── MI CUENTA ─── */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: c.text3 }]}>MI CUENTA</Text>
        <View style={[styles.settingsList, { borderColor: c.border }]}>

          {/* Datos personales */}
          <View style={[styles.settingRow, { borderBottomWidth: 1, borderBottomColor: c.border }]}>
            <View style={[styles.settingIcon, { backgroundColor: c.primary + '20' }]}>
              <Ionicons name="person-outline" size={16} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: c.text1 }]}>{profile?.name || user?.name}</Text>
              <Text style={[styles.settingSub, { color: c.text3 }]}>{profile?.email || user?.email}</Text>
            </View>
          </View>

          {/* Gimnasio */}
          {gymInfo && (
            <View style={[styles.settingRow, { borderBottomWidth: 1, borderBottomColor: c.border }]}>
              <View style={[styles.settingIcon, { backgroundColor: '#a78bfa20' }]}>
                <Ionicons name="barbell-outline" size={16} color="#a78bfa" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: c.text1 }]}>{gymInfo.name}</Text>
                {gymInfo.address
                  ? <Text style={[styles.settingSub, { color: c.text3 }]}>{gymInfo.address}</Text>
                  : null
                }
              </View>
            </View>
          )}

          {/* Cambiar contraseña */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setShowPasswordModal(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: '#22d3ee20' }]}>
              <Ionicons name="lock-closed-outline" size={16} color="#22d3ee" />
            </View>
            <Text style={[styles.settingLabel, { color: c.text1, flex: 1 }]}>Cambiar contraseña</Text>
            <Ionicons name="chevron-forward" size={16} color={c.text3} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── LEGAL ─── */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: c.text3 }]}>Legal</Text>
        <View style={[styles.settingsList, { borderColor: c.border }]}>
          <TouchableOpacity
            style={[styles.settingRow, { borderBottomWidth: 1, borderBottomColor: c.border }]}
            onPress={() => Alert.alert(
              'Política de Privacidad',
              'Puedes consultar nuestra Política de Privacidad en:\nhttps://fitapp.tudominio.com/privacy\n\nRecopilamos nombre, email, datos de membresía y registros de entrenamiento para operar el servicio.',
              [{ text: 'Entendido' }]
            )}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: '#6366f120' }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#6366f1" />
            </View>
            <Text style={[styles.settingLabel, { color: c.text1, flex: 1 }]}>Política de Privacidad</Text>
            <Ionicons name="chevron-forward" size={16} color={c.text3} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => Alert.alert(
              'Términos de Servicio',
              'Puedes consultar los Términos de Servicio en:\nhttps://fitapp.tudominio.com/terms',
              [{ text: 'Entendido' }]
            )}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: '#6366f120' }]}>
              <Ionicons name="document-text-outline" size={16} color="#6366f1" />
            </View>
            <Text style={[styles.settingLabel, { color: c.text1, flex: 1 }]}>Términos de Servicio</Text>
            <Ionicons name="chevron-forward" size={16} color={c.text3} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── CERRAR SESIÓN ─── */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: c.border }]}
          onPress={() => Alert.alert('Cerrar sesión', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', style: 'destructive', onPress: logout },
          ])}
        >
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>

      {/* ─── ELIMINAR CUENTA ─── */}
      <View style={[styles.section, { marginBottom: 32 }]}>
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: '#ef444440' }]}
          onPress={() => setShowDeleteModal(true)}
        >
          <Text style={[styles.logoutText, { color: '#ef4444', opacity: 0.7, fontSize: 13 }]}>
            Eliminar mi cuenta
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── MODAL ELIMINAR CUENTA ─── */}
      <BottomSheet visible={showDeleteModal} onClose={() => !deletingAccount && setShowDeleteModal(false)} title="⚠️ Eliminar cuenta">
        <View style={{ gap: 16, padding: 24 }}>
          <Text style={{ color: '#f87171', fontSize: 14, lineHeight: 22 }}>
            Esta acción eliminará permanentemente tu cuenta, membresías, reservas, récords personales y todos tus datos. No se puede deshacer.
          </Text>
          <Text style={{ color: '#9ca3af', fontSize: 13 }}>
            ¿Estás seguro de que quieres continuar?
          </Text>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: deletingAccount ? '#374151' : '#ef4444' }]}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Sí, eliminar mi cuenta</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.logoutBtn, { borderColor: '#374151' }]}
            onPress={() => setShowDeleteModal(false)}
            disabled={deletingAccount}
          >
            <Text style={{ color: '#9ca3af', fontWeight: '600', fontSize: 14 }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ─── MODAL CAMBIO DE CONTRASEÑA ─── */}
      <BottomSheet visible={showPasswordModal} onClose={() => setShowPasswordModal(false)} title="🔑 Cambiar contraseña">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ gap: 14, padding: 24 }}>
            <View>
              <Text style={styles.fieldLabel}>Contraseña actual</Text>
              <TextInput
                secureTextEntry value={pwCurrent} onChangeText={setPwCurrent}
                style={styles.textInput} placeholder="••••••••" placeholderTextColor="#4b5563"
              />
            </View>
            <View>
              <Text style={styles.fieldLabel}>Nueva contraseña</Text>
              <TextInput
                secureTextEntry value={pwNew} onChangeText={setPwNew}
                style={styles.textInput} placeholder="Mínimo 6 caracteres" placeholderTextColor="#4b5563"
              />
            </View>
            <View>
              <Text style={styles.fieldLabel}>Confirmar contraseña</Text>
              <TextInput
                secureTextEntry value={pwConfirm} onChangeText={setPwConfirm}
                style={styles.textInput} placeholder="••••••••" placeholderTextColor="#4b5563"
              />
            </View>
            <TouchableOpacity
              onPress={handleChangePassword}
              disabled={pwSaving}
              style={[styles.saveBtn, pwSaving && { opacity: 0.6 }]}
            >
              <Text style={styles.saveBtnText}>{pwSaving ? 'Guardando...' : 'Actualizar contraseña'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </BottomSheet>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Hero
  hero: { alignItems: 'center', paddingBottom: 24, paddingHorizontal: 24 },
  avatarWrap: { position: 'relative', marginBottom: 10 },
  avatar: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  avatarImg: { width: 80, height: 80, borderRadius: 40, borderWidth: 2 },
  avatarText: { fontSize: 30, fontWeight: '700' },
  avatarEdit: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  avatarEditText: { fontSize: 14, color: '#fff', fontWeight: '700', lineHeight: 18 },
  heroName: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  heroEmail: { fontSize: 12, marginBottom: 8 },
  heroDays: { fontSize: 12, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 24, alignItems: 'center' },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 2 },
  statDiv: { width: 1, height: 28 },

  // Sections
  section: { paddingHorizontal: 16, marginBottom: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  seeAllText: { fontSize: 12, fontWeight: '600' },

  // Card base
  card: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, borderWidth: 1 },
  divider: { height: 1, marginVertical: 12 },

  // Pending bookings
  pendingCard: { backgroundColor: '#1c1209', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#f9730640' },
  pendingTitle: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 2 },
  pendingSub: { color: '#9ca3af', fontSize: 12, marginBottom: 8 },
  pendingBtn: { backgroundColor: '#f97316', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  pendingBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Membership
  membershipHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  membershipName: { fontSize: 20, fontWeight: '800' },
  trialBadge: { fontSize: 12, color: '#f59e0b', fontWeight: '600', marginTop: 2 },
  membershipExpiry: { fontSize: 12, marginTop: 4 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  // Auto-renew
  autoRenewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  autoRenewTitle: { fontSize: 13, fontWeight: '600' },
  autoRenewSub: { fontSize: 11, marginTop: 2 },
  autoRenewWarn: { color: '#f59e0b', fontSize: 11, marginTop: 2 },
  toggle: { width: 44, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },

  // Payment history accordion
  accordionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accordionLabel: { fontSize: 13, fontWeight: '600' },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  paymentDot: { width: 8, height: 8, borderRadius: 4 },
  paymentPlan: { fontWeight: '600', fontSize: 13 },
  paymentMeta: { fontSize: 11, marginTop: 1 },

  // Plans CTA
  plansBtn: { borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  plansBtnText: { fontWeight: '700', fontSize: 13 },

  // Records
  rmRow: { flexDirection: 'row', gap: 8 },
  rmCard: { flex: 1, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  rmName: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  rmValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  rmKg: { fontSize: 11 },

  // Settings list
  settingsList: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  settingIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 14, fontWeight: '600' },
  settingSub: { fontSize: 12, marginTop: 1 },

  // Logout
  logoutBtn: { paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  logoutText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },

  // Password form
  fieldLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  textInput: { backgroundColor: '#1f2937', borderRadius: 12, padding: 14, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#374151' },
  saveBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
})
