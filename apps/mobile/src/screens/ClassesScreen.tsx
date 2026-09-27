import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Animated,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeContext'
import * as Location from 'expo-location'
import api from '../lib/api'
import { BottomSheet } from '../components/BottomSheet'
import { DisciplineIcon } from '../components/DisciplineIcon'

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildWeekDays(numDays = 14): Date[] {
  return Array.from({ length: numDays }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    d.setHours(0, 0, 0, 0)
    return d
  })
}

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleTimeString('es-CL', opts)
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ClassesScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const calendarRef = useRef<ScrollView>(null)

  const [days] = useState(buildWeekDays(14))
  const [selectedDay, setSelectedDay] = useState(days[0])
  const [classes, setClasses] = useState<any[]>([])
  // Map<classId, {bookingId, status, confirmDeadline?}>
  const [myBookingMap, setMyBookingMap] = useState<Map<string, { bookingId: string; status: string; confirmDeadline?: string | null }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [geoCheckinId, setGeoCheckinId] = useState<string | null>(null)
  const [attendanceMode, setAttendanceMode] = useState<string>('manual')
  const [bookingWindowDays, setBookingWindowDays] = useState<number>(1)
  const [bookingCutoffMins, setBookingCutoffMins] = useState<number>(60)
  const [cancelCutoffMins, setCancelCutoffMins] = useState<number>(30)

  const [sheetClass, setSheetClass] = useState<any>(null)
  const [sheetDetails, setSheetDetails] = useState<any>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)

  const fadeAnim = useRef(new Animated.Value(1)).current

  const openSheet = async (cls: any) => {
    setSheetClass(cls)
    setSheetDetails(null)
    setLoadingDetails(true)
    try {
      const res = await api.get(`/classes/${cls.id}`)
      setSheetDetails(res.data)
    } catch {}
    finally { setLoadingDetails(false) }
  }

  const closeSheet = () => { setSheetClass(null); setSheetDetails(null) }

  useEffect(() => {
    fetchAll()
    api.get('/gyms/me').then(r => {
      setAttendanceMode(r.data.attendanceMode || 'manual')
      setBookingWindowDays(r.data.bookingWindowDays ?? 1)
      setBookingCutoffMins(r.data.bookingCutoffMins ?? 60)
      setCancelCutoffMins(r.data.cancelCutoffMins ?? 30)
    }).catch(() => {})
  }, [])

  const fetchAll = async () => {
    try {
      const from = days[0].toISOString().split('T')[0]
      const to = days[days.length - 1].toISOString().split('T')[0]
      const [classesRes, bookingsRes] = await Promise.all([
        api.get(`/classes?from=${from}&to=${to}`),
        api.get('/bookings/me'),
      ])
      setClasses(classesRes.data || [])
      const map = new Map<string, { bookingId: string; status: string; confirmDeadline?: string | null }>()
      ;(bookingsRes.data || [])
        .filter((b: any) => ['CONFIRMED', 'WAITLIST', 'PENDING_CONFIRM', 'ATTENDED'].includes(b.status))
        .forEach((b: any) => map.set(b.classId, { bookingId: b.id, status: b.status, confirmDeadline: b.confirmDeadline }))
      setMyBookingMap(map)
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las clases')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const selectDay = (day: Date) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start()
    setSelectedDay(day)
  }

  const handleBook = async (classId: string) => {
    setBookingId(classId)
    try {
      await api.post('/bookings', { classId })
      Alert.alert('✅ Reservado', 'Tu lugar está confirmado')
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo reservar')
    } finally {
      setBookingId(null)
      fetchAll()
    }
  }

  const handleConfirm = async (bookingId: string, classId: string) => {
    setConfirmingId(classId)
    try {
      await api.post(`/bookings/${bookingId}/confirm`)
      Alert.alert('✅ Confirmado', '¡Tu lugar está asegurado!')
      fetchAll()
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo confirmar')
    } finally {
      setConfirmingId(null)
    }
  }

  const handleGeoCheckin = async (classId: string) => {
    setGeoCheckinId(classId)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu ubicación para el check-in')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      const { data } = await api.post(`/classes/${classId}/attendance/geo`, {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      })
      if (data.alreadyAttended) {
        Alert.alert('Ya registrado', 'Tu asistencia ya estaba marcada.')
      } else {
        Alert.alert('✅ Check-in exitoso', `Asistencia registrada (a ${data.distance}m del gym)`)
        fetchAll()
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo registrar el check-in')
    } finally {
      setGeoCheckinId(null)
    }
  }

  const handleCancel = async (classId: string) => {
    Alert.alert('Cancelar reserva', '¿Estás seguro de cancelar?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/bookings/${classId}`)
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.error || 'No se pudo cancelar')
          } finally {
            fetchAll()
          }
        },
      },
    ])
  }

  const allDayClasses = classes
    .filter(cl => isSameDay(new Date(cl.startsAt), selectedDay))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

  const classTypes: { id: string; name: string; color: string; discipline?: string }[] = []
  const seenTypes = new Set<string>()
  for (const cl of classes) {
    const ct = cl.classType
    if (ct && !seenTypes.has(ct.id)) {
      seenTypes.add(ct.id)
      classTypes.push({ id: ct.id, name: ct.name, color: ct.color || c.primary, discipline: ct.discipline })
    }
  }

  const dayClasses = selectedTypeId
    ? allDayClasses.filter(cl => cl.classType?.id === selectedTypeId)
    : allDayClasses

  const s = makeStyles(c)

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={c.primary} size={36} />
      </View>
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Clases</Text>
          <Text style={s.headerSub}>
            {selectedDay.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }).replace(' de ', ' · ')}
          </Text>
        </View>
      </View>

      {/* ── Calendar strip ── */}
      <ScrollView
        ref={calendarRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.calStrip}
      >
        {days.map((day, i) => {
          const isSelected = isSameDay(day, selectedDay)
          const isToday = isSameDay(day, new Date())
          const dayClsCount = classes.filter(cl => isSameDay(new Date(cl.startsAt), day)).length
          return (
            <TouchableOpacity
              key={i}
              onPress={() => selectDay(day)}
              activeOpacity={0.75}
              style={[
                s.dayPill,
                isSelected
                  ? { backgroundColor: c.primary, borderColor: 'transparent' }
                  : isToday
                  ? { borderColor: c.primary }
                  : { borderColor: c.border },
              ]}
            >
              <Text style={[s.dayName, {
                color: isSelected ? 'rgba(255,255,255,0.75)' : isToday ? c.primary : c.text3,
              }]}>
                {isToday ? 'HOY' : DAY_SHORT[day.getDay()]}
              </Text>
              <Text style={[s.dayNum, { color: isSelected ? '#fff' : isToday ? c.primary : c.text1 }]}>
                {day.getDate()}
              </Text>
              <View style={[s.clsCount, {
                backgroundColor: dayClsCount > 0
                  ? (isSelected ? 'rgba(255,255,255,0.25)' : c.primary + '22')
                  : 'transparent',
              }]}>
                {dayClsCount > 0 && (
                  <Text style={[s.clsCountText, { color: isSelected ? '#fff' : c.primary }]}>
                    {dayClsCount}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* ── Filtros por tipo de clase ── */}
      {classTypes.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterStrip}
        >
          {/* Chip "Todas" */}
          <TouchableOpacity
            onPress={() => setSelectedTypeId(null)}
            style={[s.filterChip, selectedTypeId === null && { backgroundColor: c.primary, borderColor: c.primary }]}
            activeOpacity={0.75}
          >
            <View style={[s.filterImgPlaceholder, { backgroundColor: selectedTypeId === null ? 'rgba(255,255,255,0.2)' : c.border }]}>
              <Ionicons name="grid-outline" size={14} color={selectedTypeId === null ? '#fff' : c.text3} />
            </View>
            <Text style={[s.filterChipText, { color: selectedTypeId === null ? '#fff' : c.text2 }]}>Todas</Text>
          </TouchableOpacity>

          {classTypes.map(ct => {
            const active = selectedTypeId === ct.id
            return (
              <TouchableOpacity
                key={ct.id}
                onPress={() => setSelectedTypeId(active ? null : ct.id)}
                style={[s.filterChip, active
                  ? { backgroundColor: ct.color, borderColor: ct.color }
                  : { borderColor: ct.color + '50' }
                ]}
                activeOpacity={0.75}
              >
                  <View style={[s.filterImgPlaceholder, {
                  backgroundColor: active ? 'rgba(255,255,255,0.22)' : ct.color + '22',
                  borderWidth: 1,
                  borderColor: active ? 'rgba(255,255,255,0.3)' : ct.color + '55',
                }]}>
                  <DisciplineIcon discipline={ct.discipline} size={13} color={active ? '#fff' : ct.color} />
                </View>
                <Text style={[s.filterChipText, { color: active ? '#fff' : ct.color }]}>{ct.name}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {/* ── Separator ── */}
      <View style={[s.separator, { backgroundColor: c.border }]} />

      {/* ── Classes list ── */}
      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchAll() }}
            tintColor={c.primary}
          />
        }
      >
        {dayClasses.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyEmoji}>🏋️</Text>
            <Text style={[s.emptyTitle, { color: c.text1 }]}>Sin clases este día</Text>
            <Text style={[s.emptySub, { color: c.text3 }]}>Prueba otro día de la semana</Text>
          </View>
        ) : (
          dayClasses.map(cls => {
            const myBooking = myBookingMap.get(cls.id)
            const booked = !!myBooking && ['CONFIRMED', 'ATTENDED', 'PENDING_CONFIRM'].includes(myBooking.status)
            const isPendingConfirm = myBooking?.status === 'PENDING_CONFIRM'
            const now = new Date()
            const clsStart = new Date(cls.startsAt)
            const started = clsStart <= now
            const count = cls._count?.bookings ?? cls.currentCapacity ?? 0
            const cap = cls.capacity ?? 0
            const isFull = count >= cap
            const occupancy = cap > 0 ? Math.min(Math.round((count / cap) * 100), 100) : 0
            const barColor = occupancy >= 90 ? '#ef4444' : occupancy >= 60 ? '#f59e0b' : c.success
            const accentColor = cls.classType?.color || c.primary

            // Políticas del gym
            const maxBookingDate = new Date(now.getTime() + bookingWindowDays * 24 * 60 * 60 * 1000)
            const outsideWindow = clsStart > maxBookingDate
            const cutoffTime = new Date(clsStart.getTime() - bookingCutoffMins * 60 * 1000)
            const withinCutoff = !started && now > cutoffTime
            const cancelCutoffTime = new Date(clsStart.getTime() - cancelCutoffMins * 60 * 1000)
            const withinCancelCutoff = !started && now > cancelCutoffTime
            const confirmDeadline = myBooking?.confirmDeadline ? new Date(myBooking.confirmDeadline) : null
            const confirmMinsLeft = confirmDeadline ? Math.max(0, Math.round((confirmDeadline.getTime() - now.getTime()) / 60000)) : null

            return (
              <View key={cls.id} style={[s.cardWrap, { shadowColor: accentColor, opacity: started ? 0.65 : 1 }]}>
              <View style={[s.card, { borderColor: isPendingConfirm ? '#f59e0b60' : booked ? accentColor + '60' : c.border }]}>
                {/* Accent stripe */}
                <View style={[s.stripe, { backgroundColor: isPendingConfirm ? '#f59e0b' : accentColor }]} />

                <View style={s.cardBody}>
                  {/* Top row */}
                  <View style={s.cardTop}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                        <DisciplineIcon discipline={cls.classType?.discipline} size={14} color={accentColor} />
                        <Text style={[s.cardName, { color: c.text1 }]}>{cls.classType?.name || 'Clase'}</Text>
                      </View>
                      <Text style={[s.cardTime, { color: c.text3 }]}>
                        {fmt(cls.startsAt, { hour: '2-digit', minute: '2-digit' })} — {fmt(cls.endsAt, { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      {cls.coach?.name && (
                        <Text style={[s.cardCoach, { color: c.text3 }]}>👤 {cls.coach.name}</Text>
                      )}
                    </View>
                    <View style={s.cardMeta}>
                      <Text style={[s.slotsText, { color: isFull ? '#ef4444' : c.primary }]}>
                        {count}/{cap}
                      </Text>
                      {isPendingConfirm ? (
                        <View style={[s.bookedBadge, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b50' }]}>
                          <Text style={[s.bookedText, { color: '#f59e0b' }]}>⏱ Confirmar</Text>
                        </View>
                      ) : booked ? (
                        <View style={[s.bookedBadge, { backgroundColor: c.success + '20', borderColor: c.success + '50' }]}>
                          <Text style={[s.bookedText, { color: c.success }]}>Inscrito ✓</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {/* Progress bar */}
                  <View style={[s.progBar, { backgroundColor: c.border }]}>
                    <View style={[s.progFill, { width: `${occupancy}%` as any, backgroundColor: barColor }]} />
                  </View>

                  {/* Action button */}
                  {isPendingConfirm ? (
                    <TouchableOpacity
                      style={[s.btn, { backgroundColor: '#f59e0b' }]}
                      onPress={() => handleConfirm(myBooking!.bookingId, cls.id)}
                      disabled={confirmingId === cls.id}
                    >
                      {confirmingId === cls.id
                        ? <ActivityIndicator color="#fff" size={18} />
                        : <Text style={[s.btnText, { color: '#fff' }]}>
                            ⏱ Confirmar{confirmMinsLeft !== null ? ` · ${confirmMinsLeft}m` : ''}
                          </Text>
                      }
                    </TouchableOpacity>
                  ) : started ? (
                    <View style={[s.btn, s.btnFull]}>
                      <Text style={[s.btnText, { color: c.text3 }]}>
                        {booked ? 'Clase iniciada · Inscrito ✓' : 'Clase ya iniciada'}
                      </Text>
                    </View>
                  ) : booked ? (
                    withinCancelCutoff ? (
                      <View style={[s.btn, s.btnFull]}>
                        <Text style={[s.btnText, { color: c.text3 }]}>No se puede cancelar · plazo vencido</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[s.btn, s.btnCancel, { borderColor: '#ef444460' }]}
                        onPress={() => openSheet(cls)}
                      >
                        <Text style={[s.btnText, { color: '#ef4444' }]}>Inscrito ✓  · Ver clase</Text>
                      </TouchableOpacity>
                    )
                  ) : outsideWindow ? (
                    <View style={[s.btn, s.btnFull]}>
                      <Text style={[s.btnText, { color: c.text3 }]}>
                        Reservas abren {clsStart.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  ) : withinCutoff ? (
                    <View style={[s.btn, s.btnFull]}>
                      <Text style={[s.btnText, { color: c.text3 }]}>Plazo de reserva cerrado</Text>
                    </View>
                  ) : isFull ? (
                    <View style={[s.btn, s.btnFull]}>
                      <Text style={[s.btnText, { color: c.text3 }]}>Clase llena</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => openSheet(cls)}
                      activeOpacity={0.82}
                      style={{ borderRadius: 14, overflow: 'hidden' }}
                    >
                      <LinearGradient
                        colors={[accentColor, accentColor + 'AA']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={s.btn}
                      >
                        <Text style={[s.btnText, { color: '#fff' }]}>Reservar lugar</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              </View>
            )
          })
        )}
        <View style={{ height: 32 }} />
      </Animated.ScrollView>

      {/* ── BottomSheet detalle de clase ── */}
      {(() => {
        if (!sheetClass) return null
        const cls = sheetClass
        const myBooking = myBookingMap.get(cls.id)
        const booked = !!myBooking && ['CONFIRMED', 'ATTENDED', 'PENDING_CONFIRM'].includes(myBooking.status)
        const now = new Date()
        const clsStart = new Date(cls.startsAt)
        const isFull = (cls._count?.bookings ?? 0) >= (cls.capacity ?? 0)
        const cancelCutoffTime = new Date(clsStart.getTime() - cancelCutoffMins * 60 * 1000)
        const withinCancelCutoff = clsStart > now && now > cancelCutoffTime
        const accentColor = cls.classType?.color || c.primary
        const attendees = (sheetDetails?.bookings || []).filter((b: any) =>
          ['CONFIRMED', 'ATTENDED', 'PENDING_CONFIRM'].includes(b.status)
        )
        return (
          <BottomSheet
            visible={!!sheetClass}
            onClose={closeSheet}
            title={cls.classType?.name || 'Clase'}
            scrollable
          >
            <View style={{ paddingHorizontal: 24 }}>
              {/* Fecha y hora */}
              <Text style={{ color: c.text3, fontSize: 13, marginBottom: 12 }}>
                {clsStart.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                {' · '}
                {fmt(cls.startsAt, { hour: '2-digit', minute: '2-digit' })}
                {' — '}
                {fmt(cls.endsAt, { hour: '2-digit', minute: '2-digit' })}
              </Text>

              {/* Coach */}
              {cls.coach?.name && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, marginBottom: 16 }}>
                  <Ionicons name="person-outline" size={16} color={accentColor} />
                  <Text style={{ color: c.text2, fontSize: 14 }}>{cls.coach.name}</Text>
                </View>
              )}

              {/* Capacidad */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Ionicons name="people-outline" size={16} color={accentColor} />
                <Text style={{ color: c.text2, fontSize: 14 }}>
                  {cls._count?.bookings ?? 0} / {cls.capacity ?? 0} inscritos
                </Text>
              </View>

              {/* Lista de inscritos */}
              <Text style={{ color: c.text1, fontSize: 13, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 10 }}>
                Inscritos {attendees.length > 0 ? `(${attendees.length})` : ''}
              </Text>

              {loadingDetails ? (
                <ActivityIndicator color={accentColor} style={{ marginVertical: 20 }} />
              ) : attendees.length > 0 ? (
                attendees.map((b: any, i: number) => (
                  <View key={b.id || i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: accentColor + '28', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: accentColor, fontWeight: '800', fontSize: 13 }}>
                        {b.user?.name?.[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                    <Text style={{ flex: 1, color: c.text2, fontSize: 14 }}>{b.user?.name ?? '—'}</Text>
                    {b.status === 'ATTENDED' && (
                      <View style={{ borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: c.success + '20' }}>
                        <Text style={{ color: c.success, fontSize: 10, fontWeight: '700' }}>Asistió</Text>
                      </View>
                    )}
                  </View>
                ))
              ) : (
                <Text style={{ color: c.text3, fontSize: 13, textAlign: 'center', marginBottom: 8 }}>Sin inscritos aún</Text>
              )}

              {/* Acción principal */}
              <View style={{ marginTop: 24, gap: 10 }}>
                {booked ? (
                  withinCancelCutoff ? (
                    <View style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: c.border, alignItems: 'center' }}>
                      <Text style={{ color: c.text3, fontSize: 14, fontWeight: '700' }}>Plazo de cancelación vencido</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => { closeSheet(); handleCancel(cls.id) }}
                      style={{ paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#ef444455', alignItems: 'center' }}
                    >
                      <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>Cancelar reserva</Text>
                    </TouchableOpacity>
                  )
                ) : isFull ? (
                  <View style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: c.border, alignItems: 'center' }}>
                    <Text style={{ color: c.text3, fontSize: 14, fontWeight: '700' }}>Clase llena</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => { closeSheet(); handleBook(cls.id) }}
                    disabled={bookingId === cls.id}
                    style={{ borderRadius: 14, overflow: 'hidden' }}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={[accentColor, accentColor + 'AA']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={{ paddingVertical: 16, alignItems: 'center' }}
                    >
                      {bookingId === cls.id
                        ? <ActivityIndicator color="#fff" size={18} />
                        : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Reservar lugar</Text>
                      }
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </BottomSheet>
        )
      })()}
    </View>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background },

    header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    headerTitle: { fontSize: 28, fontWeight: '800', color: c.text1, letterSpacing: -0.5 },
    headerSub: { fontSize: 12, color: c.text3, marginTop: 1, textTransform: 'capitalize' },

    // Calendar strip
    calStrip: { paddingHorizontal: 20, paddingBottom: 14, gap: 7 },
    dayPill: {
      width: 56, borderRadius: 18, borderWidth: 1.5, borderColor: c.border,
      paddingVertical: 10, alignItems: 'center', gap: 3,
      backgroundColor: c.surface, flexShrink: 0,
    },
    dayName: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    dayNum: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
    clsCount: { width: 22, height: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    clsCountText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.2 },

    // Filters
    filterStrip: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', gap: 7,
      paddingVertical: 7, paddingHorizontal: 12, borderRadius: 24,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
    },
    filterImgPlaceholder: {
      width: 26, height: 26, borderRadius: 13,
      alignItems: 'center', justifyContent: 'center',
    },
    filterChipText: { fontSize: 13, fontWeight: '700' },

    separator: { height: StyleSheet.hairlineWidth, marginHorizontal: 20, marginBottom: 8 },

    // List
    list: { paddingHorizontal: 20, paddingTop: 8 },
    emptyWrap: { alignItems: 'center', paddingTop: 60 },
    emptyEmoji: { fontSize: 44, marginBottom: 12 },
    emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
    emptySub: { fontSize: 13 },

    // Class card
    cardWrap: {
      marginBottom: 12, borderRadius: 18,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.22,
      shadowRadius: 14,
      elevation: 6,
    },
    card: {
      flexDirection: 'row', borderRadius: 18, borderWidth: 1,
      backgroundColor: c.surface, overflow: 'hidden',
    },
    stripe: { width: 6 },
    cardBody: { flex: 1, padding: 16, gap: 10 },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    cardName: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
    cardTime: { fontSize: 13, marginBottom: 2 },
    cardCoach: { fontSize: 12 },
    cardMeta: { alignItems: 'flex-end', gap: 6 },
    slotsText: { fontSize: 14, fontWeight: '700' },
    bookedBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
    bookedText: { fontSize: 10, fontWeight: '700' },

    // Progress bar
    progBar: { height: 5, borderRadius: 3 },
    progFill: { height: 5, borderRadius: 3 },

    // Buttons
    btn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
    btnFull: { backgroundColor: c.border },
    btnCancel: { backgroundColor: 'transparent', borderWidth: 1 },
    btnText: { fontSize: 14, fontWeight: '700' },
  })
}
