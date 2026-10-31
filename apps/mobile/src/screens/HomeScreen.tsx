import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Image, Animated, ImageBackground,
  ActivityIndicator, Alert, Easing,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { DisciplineIcon } from '../components/DisciplineIcon'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { useAuthStore } from '../store/auth.store'
import { useTheme } from '../theme/ThemeContext'
import api, { API_BASE as API_URL, mediaUrl } from '../lib/api'
import { daysUntilLocal } from '../lib/membership-days'
import { BottomSheet } from '../components/BottomSheet'
import { alertButtons } from '../lib/alert'
import { getGymTimezone, setGymTimezone, gymDayStr } from '../lib/gym-timezone'

export default function HomeScreen() {
  const navigation = useNavigation<any>()
  const { user } = useAuthStore()
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()

  const [membership, setMembership] = useState<any>(null)
  const [rms, setRms] = useState<any[]>([])

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [dashboardBg, setDashboardBg] = useState<string | null>(null)
  const [todayClasses, setTodayClasses] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [todayWods, setTodayWods] = useState<any[]>([])
  const [selectedWodIdx, setSelectedWodIdx] = useState(0)
  const [myTodayResults, setMyTodayResults] = useState<any[]>([])
  const [classModal, setClassModal] = useState<any>(null)
  const [classDetails, setClassDetails] = useState<any>(null)
  const [loadingModal, setLoadingModal] = useState(false)

  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set())

  // Fade-in animation
  const fadeAnim = useState(new Animated.Value(0))[0]
  const tickerAnim = useRef(new Animated.Value(0)).current
  const tickerLoop = useRef<any>(null)

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start()
  }, [])

  // Sin esto, "Mi próxima clase" quedaba con los datos de la última vez que se montó
  // la pantalla: reservar desde Clases y volver a Inicio (misma tab, no se desmonta)
  // seguía mostrando "No tienes clases reservadas" (QA producción 2026-10-13).
  useFocusEffect(useCallback(() => { fetchData() }, []))

  useEffect(() => {
    tickerLoop.current?.stop()
    if (rms.length === 0) return
    const ITEM_W = 164
    tickerAnim.setValue(0)
    tickerLoop.current = Animated.loop(
      Animated.timing(tickerAnim, {
        toValue: -(rms.length * ITEM_W),
        duration: rms.length * 4000,
        useNativeDriver: true,
        easing: Easing.linear,
      })
    )
    tickerLoop.current.start()
    return () => tickerLoop.current?.stop()
  }, [rms])

  const fetchData = async () => {
    try {
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const [userRes, bookingsRes, wodRes, rmsRes] = await Promise.all([
        api.get('/users/me'),
        api.get('/bookings/me'),
        api.get(`/wods?from=${today}&to=${today}`),
        api.get('/rms/me').catch(() => ({ data: [] })),
      ])
      const mems: any[] = userRes.data.memberships || []
      const activeMem = mems.find((m: any) => m.status === 'ACTIVE' || m.status === 'TRIAL')
        || mems.find((m: any) => m.endsAt && new Date(m.endsAt) > now)
        || mems[0] || null
      setMembership(activeMem)
      if (userRes.data.avatarUrl) setAvatarUrl(mediaUrl(userRes.data.avatarUrl))

      // Próximas clases: todas las del mismo día que la primera confirmada
      const upcoming: any[] = (bookingsRes.data || [])
        .filter((b: any) =>
          ['CONFIRMED', 'PENDING_CONFIRM', 'WAITLIST'].includes(b.status) &&
          new Date(b.startsAt).getTime() > now.getTime()
        )
        .sort((a: any, b: any) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      if (upcoming.length > 0) {
        const firstDay = new Date(upcoming[0].startsAt).toDateString()
        const dayClasses = upcoming.filter(b => new Date(b.startsAt).toDateString() === firstDay)
        setTodayClasses(dayClasses)
      } else {
        setTodayClasses([])
      }

      setRms((rmsRes.data || []).filter((rm: any) => rm.currentRm > 0))

      // WODs de hoy por tipo de clase
      const wods: any[] = wodRes.data || []
      setTodayWods(wods)
      setSelectedWodIdx(0)

      // Mi resultado de hoy (si ya lo registré), con la hora de la clase a la que
      // asistí ese día del mismo tipo — el booking puede ser pasado (ya se hizo la clase)
      if (wods.length > 0) {
        const todayBookings: any[] = (bookingsRes.data || []).filter((b: any) =>
          b.status !== 'CANCELLED' && new Date(b.startsAt).toDateString() === now.toDateString()
        )
        const resultsRes = await Promise.all(
          wods.map((w: any) => api.get(`/wods/${w.id}/results/me`).catch(() => ({ data: null })))
        )
        const mine = wods
          .map((w: any, i: number) => {
            const result = resultsRes[i]?.data?.result
            if (!result) return null
            const classMatch = todayBookings.find((b: any) => b.classType?.id === w.classTypeId)
            return { wod: w, result, classStartsAt: classMatch?.startsAt ?? null }
          })
          .filter(Boolean)
        setMyTodayResults(mine)
      } else {
        setMyTodayResults([])
      }

      api.get('/platform/assets').then(res => {
        const a = res.data?.assets
        const url = a?.mobile_dashboard_bg ?? a?.dashboard_bg ?? null
        if (url) setDashboardBg(`${API_URL}${url}`)
      }).catch(() => {})

      api.get('/gyms/me').then(r => setGymTimezone(r.data.timezone)).catch(() => {})
    } catch { }
    finally { setRefreshing(false) }
  }

  const openClassModal = async (cls: any) => {
    setClassModal(cls)
    setClassDetails(null)
    setLoadingModal(true)
    try {
      // cls.id es el booking ID — el classId es cls.classId
      const res = await api.get(`/classes/${cls.classId}`)
      setClassDetails(res.data)
    } catch { }
    finally { setLoadingModal(false) }
  }

  const closeClassModal = () => { setClassModal(null); setClassDetails(null) }

  const handleCancel = (classId: string) => {
    alertButtons('Cancelar reserva', '¿Estás seguro de cancelar?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/bookings/${classId}`)
          } catch (err: any) {
            alertButtons('Error', err?.response?.data?.error || 'No se pudo cancelar')
          } finally {
            closeClassModal()
            fetchData()
          }
        },
      },
    ])
  }

  const handleConfirm = async (bookingId: string, classId: string) => {
    setConfirmingIds(prev => new Set([...prev, classId]))
    try {
      await api.post(`/bookings/${bookingId}/confirm`)
      Alert.alert('✅ Confirmado', '¡Tu lugar está asegurado!')
      closeClassModal()
      fetchData()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'No se pudo confirmar')
    } finally {
      setConfirmingIds(prev => { const s = new Set(prev); s.delete(classId); return s })
    }
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 19) return 'Buenas tardes'
    return 'Buenas noches'
  }

  const daysLeft = membership?.endsAt ? daysUntilLocal(membership.endsAt) : null
  const urgency = daysLeft === null ? 0 : daysLeft <= 3 ? 1 : daysLeft <= 7 ? 0.6 : daysLeft <= 14 ? 0.3 : 0
  const counterColor = daysLeft === null || daysLeft > 14
    ? c.success
    : `rgb(${Math.round(34 + urgency * 221)}, ${Math.round(197 - urgency * 163)}, ${Math.round(94 - urgency * 94)})`
  const planAccent = daysLeft !== null && daysLeft <= 7 ? counterColor : c.primary
  const memberAlert = daysLeft !== null && daysLeft <= 7
    ? (daysLeft <= 3 ? '⚠️ Vence muy pronto' : '¡Renueva pronto!')
    : null

  const s = makeStyles(c, dashboardBg)

  return (
    <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
      {/* Imagen de fondo pantalla completa */}
      {dashboardBg && (
        <ImageBackground
          source={{ uri: dashboardBg }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        </ImageBackground>
      )}
      <ScrollView
        style={[s.container]}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData() }}
            tintColor={c.primary}
          />
        }
      >
        {/* Header — avatar + membresía integrada */}
        <View style={[s.heroSection, { paddingTop: insets.top + 8 }]}>
          <View style={[s.heroBg, { borderColor: s.glassBorder.borderColor, borderWidth: 1 }]}>
            <View style={s.heroOverlay}>
              <View style={[s.heroContent, { alignItems: 'flex-start' }]}>
                <View style={[s.avatarFrame, { borderColor: c.primary }]}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={s.avatarImg} />
                  ) : (
                    <View style={[s.avatarImgPlaceholder, { backgroundColor: c.primary + '40' }]}>
                      <Text style={[s.avatarInitial, { color: '#fff' }]}>
                        {user?.name?.[0]?.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, paddingTop: 2 }}>
                  <Text style={s.greeting}>{greeting()}</Text>
                  <Text style={s.name}>{user?.name?.split(' ')[0]}</Text>
                  {membership && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <View style={[s.planPill, { backgroundColor: c.primary + '35' }]}>
                        <Text style={[s.planPillText, { color: dashboardBg ? '#fff' : c.text1 }]}>{membership.plan?.name}</Text>
                      </View>
                      {daysLeft !== null && (
                        <Text style={[s.planPillText, { color: counterColor, fontWeight: '700' }]}>
                          {memberAlert ?? `${daysLeft} días`}
                        </Text>
                      )}
                      {membership.endsAt && (
                        <Text style={[s.planExpiry, { color: dashboardBg ? 'rgba(255,255,255,0.55)' : c.text3 }]}>
                          hasta {new Date(membership.endsAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── PRÓXIMAS CLASES ── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: dashboardBg ? '#fff' : c.text1 }]}>
            {todayClasses.length > 1 ? 'Mis próximas clases' : 'Mi próxima clase'}
          </Text>
          {todayClasses.length > 0 ? todayClasses.map((cl: any) => {
            const clDate = new Date(cl.startsAt)
            const isToday = gymDayStr(clDate) === gymDayStr(new Date())
            const dayLabel = isToday
              ? 'HOY'
              : clDate.toLocaleDateString('es-CL', { weekday: 'short', timeZone: getGymTimezone() }).toUpperCase()
            return (
              <TouchableOpacity key={cl.id} onPress={() => openClassModal(cl)} activeOpacity={0.82}>
              <View style={[s.classRowShadow, { shadowColor: c.primary }]}>
              <View style={[s.classRow, s.glassBg, { borderColor: s.glassBorder.borderColor }]}>
                <View style={[s.classDateBox, { backgroundColor: c.primary + '35' }]}>
                  <Text style={[s.classDay, { color: c.text1 }]}>{dayLabel}</Text>
                  <Text style={[s.classDot, { color: c.text1 }]}>·</Text>
                  <Text style={[s.classHour, { color: c.text1 }]}>
                    {clDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: getGymTimezone() })}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <DisciplineIcon
                      discipline={cl.classType?.discipline}
                      size={13}
                      color={cl.classType?.color || (dashboardBg ? 'rgba(255,255,255,0.7)' : c.primary)}
                    />
                    <Text style={[s.className, { color: dashboardBg ? '#fff' : c.text1 }]} numberOfLines={1}>
                      {cl.classType?.name || 'Clase'}
                    </Text>
                  </View>
                  <Text style={[s.classCoach, { color: dashboardBg ? 'rgba(255,255,255,0.6)' : c.text3 }]} numberOfLines={1}>
                    {cl.coach?.name || 'Coach'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {(() => {
                    const isPast = new Date(cl.startsAt) < new Date()
                    if (user?.role === 'MEMBER' && !isPast) {
                      // Cada fila acá SIEMPRE es una reserva propia (todayClasses sale
                      // de /bookings/me) — el estado real decide el badge; tocar la
                      // fila (TouchableOpacity exterior) abre el modal siempre, donde
                      // viven las acciones (confirmar o cancelar). Antes esto solo
                      // decía "Reservado ✓" sin importar si estaba pendiente de
                      // confirmar o en lista de espera (feedback Cristian, 2026-10-16).
                      const badge = cl.status === 'PENDING_CONFIRM'
                        ? { label: '⏱ Confirmar', bg: '#f59e0b20', fg: '#f59e0b' }
                        : cl.status === 'WAITLIST'
                        ? { label: '⏳ En lista', bg: c.text3 + '20', fg: c.text3 }
                        : { label: 'Confirmado', bg: c.success + '20', fg: c.success }
                      return (
                        <>
                          <View style={{
                            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
                            backgroundColor: badge.bg, maxWidth: 108,
                          }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: badge.fg }} numberOfLines={1}>
                              {badge.label}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={c.text3} />
                        </>
                      )
                    }
                    return (
                      <>
                        <View style={[s.confirmedBadge, { backgroundColor: c.success + '25' }]}>
                          <Text style={[s.confirmedText, { color: c.success }]}>✓</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={c.text3} />
                      </>
                    )
                  })()}
                </View>
              </View>
              </View>
              </TouchableOpacity>
            )
          }) : (
            <View style={[s.emptyBox, s.glassBg, { borderColor: s.glassBorder.borderColor }]}>
              <Text style={[s.emptyText, { color: dashboardBg ? 'rgba(255,255,255,0.5)' : c.text3 }]}>
                No tienes clases reservadas próximamente
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Classes')} style={[s.reserveBtn, { backgroundColor: c.primary }]}>
                <Text style={s.reserveBtnText}>Reservar clase →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── MI RESULTADO DE HOY ── */}
        {myTodayResults.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: dashboardBg ? '#fff' : c.text1 }]}>Mi resultado de hoy</Text>
            {myTodayResults.map(({ wod, result, classStartsAt }: any) => {
              const accent = wod.classType?.color || c.primary
              const classTime = classStartsAt
                ? new Date(classStartsAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: getGymTimezone() })
                : null
              return (
                <TouchableOpacity
                  key={wod.id}
                  activeOpacity={0.82}
                  onPress={() => navigation.navigate('MemberWod', {
                    wodId: wod.id,
                    wodTitle: wod.title || 'Entrenamiento del día',
                    wodDate: wod.date,
                    scoreType: wod.scoreType,
                  })}
                  style={[s.myResultCard, s.glassBg, { borderColor: accent + '40' }]}
                >
                  <View style={[s.boardAccent, { backgroundColor: accent }]} />
                  <View style={{ flex: 1, padding: 16 }}>
                    <Text style={[s.myResultTitle, { color: dashboardBg ? '#fff' : c.text1 }]}>
                      {wod.title || wod.classType?.name || 'Entrenamiento'}
                      {classTime ? ` · clase ${classTime}` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <Text style={[s.myResultScore, { color: accent }]}>{result.scoreFormatted}</Text>
                      {result.rank != null && (
                        <View style={[s.myResultRankBadge, { backgroundColor: accent + '20' }]}>
                          <Text style={[s.myResultRankText, { color: accent }]}>
                            #{result.rank} de {result.totalInCategory} {result.rx ? 'RX' : 'Scaled'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {/* ── PIZARRA DEL BOX ── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: dashboardBg ? '#fff' : c.text1 }]}>Pizarra del box</Text>

          {todayWods.length === 0 ? (
            <View style={[s.emptyBox, s.glassBg, { borderColor: s.glassBorder.borderColor }]}>
              <Text style={[s.emptyText, { color: dashboardBg ? 'rgba(255,255,255,0.5)' : c.text3 }]}>Sin WOD publicado hoy</Text>
            </View>
          ) : (() => {
            const wod = todayWods[selectedWodIdx] || todayWods[0]
            const accent = wod?.classType?.color || c.primary
            return (
              <>
                {/* Tabs de tipo de clase */}
                {todayWods.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                    {todayWods.map((w: any, i: number) => {
                      const tabAccent = w.classType?.color || c.primary
                      const selected = i === selectedWodIdx
                      return (
                        <TouchableOpacity
                          key={w.id}
                          onPress={() => setSelectedWodIdx(i)}
                          style={[
                            s.wodTab,
                            selected
                              ? { backgroundColor: tabAccent }
                              : { backgroundColor: tabAccent + '20', borderColor: tabAccent + '60', borderWidth: 1 },
                          ]}
                        >
                          <Text style={[s.wodTabText, { color: selected ? '#fff' : tabAccent }]}>
                            {w.classType?.name || 'WOD'}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                )}

                {/* WOD seleccionado */}
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => navigation.navigate('MemberWod', {
                    wodId: wod.id,
                    wodTitle: wod.title || 'Entrenamiento del día',
                    wodDate: wod.date,
                    scoreType: wod.scoreType,
                  })}
                >
                <View style={[s.boardCardShadow, { shadowColor: accent }]}>
                <View style={[s.boardCard, s.glassBg, { borderColor: accent + '40' }]}>
                  <View style={[s.boardAccent, { backgroundColor: accent }]} />
                  <View style={{ flex: 1, padding: 16 }}>
                    {todayWods.length === 1 && (
                      <View style={[s.wodBadge, { backgroundColor: accent, alignSelf: 'flex-start', marginBottom: 8 }]}>
                        <Text style={s.wodBadgeText}>{wod.classType?.name?.toUpperCase() || 'WOD'}</Text>
                      </View>
                    )}
                    <Text style={[s.boardTitle, { color: dashboardBg ? '#fff' : c.text1 }]}>{wod.title || 'Entrenamiento del día'}</Text>
                    {(wod.blocks || []).map((block: any, bi: number) => (
                      <View key={bi} style={{ marginTop: 12 }}>
                        {block.title && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Text style={[s.blockTitle, { color: accent }]}>{block.title}</Text>
                            {block.timecap && (
                              <Text style={[s.blockTimecap, { color: dashboardBg ? 'rgba(255,255,255,0.5)' : c.text3 }]}>· {block.timecap}</Text>
                            )}
                          </View>
                        )}
                        {(block.movements || []).map((m: any, mi: number) => (
                          <View key={mi} style={s.movementRow}>
                            <Text style={[s.movementName, { color: dashboardBg ? 'rgba(255,255,255,0.85)' : c.text2 }]}>
                              {m.reps ? `${m.reps} ` : ''}{m.movementName}
                            </Text>
                            <View style={s.movementRight}>
                              {m.sets && m.reps && (
                                <Text style={[s.movementSets, { color: dashboardBg ? 'rgba(255,255,255,0.5)' : c.text3 }]}>{m.sets}×{m.reps}</Text>
                              )}
                              {(m.weightRxM || m.weightRxF) && (
                                <View style={[s.kgPill, { backgroundColor: accent + '30' }]}>
                                  <Text style={[s.kgText, { color: accent }]}>
                                    {m.weightRxM ? `${m.weightRxM}kg` : ''}{m.weightRxM && m.weightRxF ? '/' : ''}{m.weightRxF ? `${m.weightRxF}kg` : ''}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    ))}
                    {/* Hint de navegación */}
                    <Text style={[s.wodLeaderboardHint, { color: accent }]}>
                      Ver pizarra →
                    </Text>
                  </View>
                </View>
                </View>
                </TouchableOpacity>
              </>
            )
          })()}
        </View>

        {/* ── BANDA DE MARCAS PERSONALES ── */}
        {rms.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: dashboardBg ? '#fff' : c.text1 }]}>Mis marcas</Text>
            <View style={[s.rmTickerWrapper, { borderColor: s.glassBorder.borderColor }]}>
              <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: tickerAnim }] }}>
                {[...rms, ...rms].map((rm: any, i: number) => (
                  <View key={i} style={[s.rmTickerItem, { borderColor: c.primary + '25' }]}>
                    <Text style={[s.rmTickerName, { color: dashboardBg ? 'rgba(255,255,255,0.55)' : c.text3 }]} numberOfLines={1}>
                      {rm.movementName}
                    </Text>
                    <Text style={[s.rmTickerWeight, { color: c.primary }]}>
                      {Math.round(rm.currentRm * 2.20462)} lb
                    </Text>
                    <Text style={[s.rmTickerKg, { color: dashboardBg ? 'rgba(255,255,255,0.35)' : c.text3 }]}>
                      {rm.currentRm} kg
                    </Text>
                  </View>
                ))}
              </Animated.View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Modal detalle de clase ── */}
      <BottomSheet
        visible={!!classModal}
        onClose={closeClassModal}
        title={classModal?.classType?.name || 'Clase'}
        scrollable={true}
      >
        <View style={{ paddingHorizontal: 24 }}>
          {/* Subtítulo fecha/hora */}
          <Text style={[s.modalSub, { color: c.text3, marginBottom: 8 }]}>
            {classModal && new Date(classModal.startsAt).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: getGymTimezone() })}
            {' · '}
            {classModal && new Date(classModal.startsAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: getGymTimezone() })}
            {' — '}
            {classModal && new Date(classModal.endsAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: getGymTimezone() })}
          </Text>

          {/* Coach */}
          {classModal?.coach?.name && (
            <View style={[s.modalInfoRow, { borderColor: c.border }]}>
              <Ionicons name="person-outline" size={16} color={c.primary} />
              <Text style={[s.modalInfoText, { color: c.text2 }]}>{classModal.coach.name}</Text>
            </View>
          )}

          {/* Inscritos */}
          <Text style={[s.modalSection, { color: c.text1 }]}>
            Inscritos {classDetails?.bookings ? `(${classDetails.bookings.length})` : ''}
          </Text>

          {loadingModal ? (
            <ActivityIndicator color={c.primary} style={{ marginTop: 20 }} />
          ) : classDetails?.bookings?.length > 0 ? (
            <>
              {classDetails.bookings
                .filter((b: any) => ['CONFIRMED', 'ATTENDED', 'PENDING_CONFIRM'].includes(b.status))
                .map((b: any, i: number) => (
                <View key={b.id || i} style={[s.attendeeRow, { borderColor: c.border }]}>
                  <View style={[s.attendeeAvatar, { backgroundColor: c.primary + '28' }]}>
                    <Text style={{ color: c.primary, fontWeight: '800', fontSize: 13 }}>
                      {b.user?.name?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <Text style={[s.attendeeName, { color: c.text2 }]}>{b.user?.name ?? '—'}</Text>
                  {b.status === 'ATTENDED' && (
                    <View style={[s.attendeeBadge, { backgroundColor: c.success + '20' }]}>
                      <Text style={{ color: c.success, fontSize: 10, fontWeight: '700' }}>Asistió</Text>
                    </View>
                  )}
                </View>
              ))}
            </>
          ) : (
            <Text style={[s.modalEmpty, { color: c.text3 }]}>
              {loadingModal ? '' : 'No hay datos de inscritos disponibles'}
            </Text>
          )}
        </View>

        {/* Confirmar / cancelar — classModal es directamente la reserva (viene de
            todayClasses, que sale de /bookings/me), así que su .status manda. */}
        {classModal && (
          <View style={{ marginHorizontal: 24, marginTop: 20, gap: 10 }}>
            {classModal.status === 'PENDING_CONFIRM' && (
              <TouchableOpacity
                onPress={() => handleConfirm(classModal.id, classModal.classId)}
                disabled={confirmingIds.has(classModal.classId)}
                style={{ paddingVertical: 13, borderRadius: 12, backgroundColor: '#f59e0b', alignItems: 'center' }}
              >
                {confirmingIds.has(classModal.classId)
                  ? <ActivityIndicator color="#fff" size={18} />
                  : <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>⏱ Confirmar mi lugar</Text>
                }
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => handleCancel(classModal.classId)}
              style={{ paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#ef444455', alignItems: 'center' }}
            >
              <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>
                {classModal.status === 'WAITLIST' ? '⏳ Salir de la lista de espera' : 'Cancelar reserva'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </BottomSheet>
    </Animated.View>
  )
}

function makeStyles(c: ReturnType<typeof useTheme>['theme']['colors'], dashboardBg: string | null) {
  const glass = dashboardBg ? 'rgba(255,255,255,0.08)' : c.surface
  const glassBorder = dashboardBg ? 'rgba(255,255,255,0.12)' : c.border

  return StyleSheet.create({
    glassBg: { backgroundColor: glass },
    glassBorder: { borderColor: glassBorder },
    container: { flex: 1, backgroundColor: dashboardBg ? 'transparent' : c.background },

    // Hero section
    heroSection: { paddingHorizontal: 20, paddingBottom: 12 },
    notifBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
    heroBg: {
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: glass,
    },
    heroOverlay: {
      padding: 20,
    },
    heroContent: {
      flexDirection: 'row', gap: 16,
    },
    avatarFrame: {
      width: 72, height: 88,
      borderRadius: 18,
      borderWidth: 2.5,
      overflow: 'hidden',
      flexShrink: 0,
    },
    avatarImg: { width: '100%', height: '100%' },
    avatarImgPlaceholder: {
      width: '100%', height: '100%',
      justifyContent: 'center', alignItems: 'center',
    },
    avatarInitial: { fontSize: 28, fontWeight: '800' },
    greeting: { fontSize: 12, color: dashboardBg ? 'rgba(255,255,255,0.7)' : c.text3, marginBottom: 2 },
    name: { fontSize: 22, fontWeight: '800', color: dashboardBg ? '#fff' : c.text1, letterSpacing: -0.4 },
    // Pills de plan + días integradas en el hero
    planPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    planPillText: { fontSize: 11, fontWeight: '700' },
    planExpiry: { fontSize: 11 },
    // Secciones
    section: { paddingHorizontal: 20, marginBottom: 20, gap: 8 },
    sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },

    // Shadow wrapper para classRow
    classRowShadow: {
      borderRadius: 14,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.14,
      shadowRadius: 8,
      elevation: 4,
    },
    // Mis clases — filas
    classRow: {
      flexDirection: 'row', alignItems: 'center', borderRadius: 14,
      borderWidth: 1, overflow: 'hidden', gap: 12, paddingRight: 14,
    },
    classDateBox: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      paddingHorizontal: 12, paddingVertical: 16,
      justifyContent: 'center',
    },
    classDay: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    classDot: { fontSize: 11, fontWeight: '400', opacity: 0.6 },
    classHour: { fontSize: 11, fontWeight: '700' },
    className: { fontSize: 14, fontWeight: '700' },
    classCoach: { fontSize: 12, marginTop: 2 },
    confirmedBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    confirmedText: { fontSize: 13, fontWeight: '800' },

    // Modal detalle clase
    modalSub: { fontSize: 13, marginTop: 3 },
    modalInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 16 },
    modalInfoText: { fontSize: 14 },
    modalSection: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 12 },
    modalEmpty: { fontSize: 13, textAlign: 'center', marginTop: 12 },
    attendeeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
    attendeeAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    attendeeName: { flex: 1, fontSize: 14 },
    attendeeBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },

    // Empty state
    emptyBox: { borderRadius: 14, borderWidth: 1, padding: 20, alignItems: 'center', gap: 12 },
    emptyText: { fontSize: 13, textAlign: 'center' },
    reserveBtn: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 20 },
    reserveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    // Pizarra del box
    wodBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    wodBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
    wodTab: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
    wodTabText: { fontSize: 12, fontWeight: '700' },
    wodLeaderboardHint: { fontSize: 12, fontWeight: '700', marginTop: 12, textAlign: 'right' },
    boardCardShadow: {
      borderRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 14,
      elevation: 6,
    },
    boardCard: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    boardAccent: { width: 6 },

    // Mi resultado de hoy
    myResultCard: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 10 },
    myResultTitle: { fontSize: 14, fontWeight: '700' },
    myResultScore: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    myResultRankBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    myResultRankText: { fontSize: 12, fontWeight: '700' },
    boardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4, letterSpacing: -0.3 },
    boardDesc: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
    blockTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    blockTimecap: { fontSize: 12 },
    movementRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    movementName: { fontSize: 14, fontWeight: '500', flex: 1 },
    movementRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    movementSets: { fontSize: 13, fontWeight: '600' },
    kgPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    kgText: { fontWeight: '800', fontSize: 13 },

    // Banda de marcas personales
    rmTickerWrapper: {
      overflow: 'hidden',
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: glass,
      paddingVertical: 10,
    },
    rmTickerItem: {
      width: 164,
      alignItems: 'center',
      paddingHorizontal: 12,
      borderRightWidth: StyleSheet.hairlineWidth,
    },
    rmTickerName: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 2 },
    rmTickerWeight: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
    rmTickerKg: { fontSize: 11, marginTop: 1 },
  })
}
