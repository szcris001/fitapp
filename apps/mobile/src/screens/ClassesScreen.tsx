import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Animated,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeContext'
import api from '../lib/api'
import { BottomSheet } from '../components/BottomSheet'
import { DisciplineIcon } from '../components/DisciplineIcon'
import { ClassCard, MyBooking, isClassSelectable } from '../components/ClassCard'
import { WeekDayStrip, isSameDay } from '../components/WeekDayStrip'

function buildWeekDays(numDays = 14): Date[] {
  return Array.from({ length: numDays }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    d.setHours(0, 0, 0, 0)
    return d
  })
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleTimeString('es-CL', opts)
}

// Una sola pantalla — mismo patrón que usan Wodify/ClassPass: franja de días
// arriba, filtro y lista abajo, todo se actualiza en el mismo lugar al tocar un
// día (sin navegar a otra pantalla). classTypes se arma con TODAS las clases de
// la semana, no solo las del día seleccionado, así el filtro nunca cambia de alto
// ni de contenido al cambiar de día (salto visual reportado 2026-10-15/16).
//
// "Repetir esta clase": se decidió en la hoja de detalle de la clase, no con un
// modo de selección aparte en la lista — marcar algo "en automático" sin ver qué
// días exactamente se estaban sumando generaba desconfianza (feedback Cristian,
// 2026-10-16). Ahora, al abrir una clase sin reservar, si hay próximas
// ocurrencias del mismo tipo+horario dentro de la ventana de reserva del gym, se
// listan con fecha para elegir cuáles sumar antes de confirmar.
export default function ClassesScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()

  const [days] = useState(buildWeekDays(14))
  const [selectedDay, setSelectedDay] = useState(days[0])
  const [classes, setClasses] = useState<any[]>([])
  const [myBookingMap, setMyBookingMap] = useState<Map<string, MyBooking>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [bookingWindowDays, setBookingWindowDays] = useState<number>(1)
  const [bookingCutoffMins, setBookingCutoffMins] = useState<number>(60)
  const [cancelCutoffMins, setCancelCutoffMins] = useState<number>(30)

  const [sheetClass, setSheetClass] = useState<any>(null)
  const [sheetDetails, setSheetDetails] = useState<any>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [repeatSelected, setRepeatSelected] = useState<Set<string>>(new Set())

  const fadeAnim = useRef(new Animated.Value(1)).current

  const openSheet = async (cls: any) => {
    setSheetClass(cls)
    setSheetDetails(null)
    setRepeatSelected(new Set())
    setLoadingDetails(true)
    try {
      const res = await api.get(`/classes/${cls.id}`)
      setSheetDetails(res.data)
    } catch {}
    finally { setLoadingDetails(false) }
  }

  const closeSheet = () => { setSheetClass(null); setSheetDetails(null); setRepeatSelected(new Set()) }

  useEffect(() => {
    fetchAll()
    api.get('/gyms/me').then(r => {
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
      const map = new Map<string, MyBooking>()
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

  // Reserva la clase del detalle y, si se marcó alguna repetición, también esas —
  // una por una (no es una operación atómica: si alguna falla, las demás igual se
  // procesan). El resumen final es por día y con la razón real de cada falla (ej.
  // "No tienes una membresía activa" en vez de un conteo genérico) — antes solo
  // decía "N no se pudo reservar" sin decir cuáles ni por qué (feedback Cristian,
  // 2026-10-16).
  const handleBook = async (classId: string, extraIds: string[] = []) => {
    setBookingId(classId)
    const ids = [classId, ...extraIds]
    type Outcome = { date: string; status: 'confirmed' | 'pending' | 'waitlisted' | 'failed'; reason?: string }
    const results: Outcome[] = []
    for (const id of ids) {
      const cl = classes.find(c => c.id === id)
      const date = cl
        ? new Date(cl.startsAt).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
        : ''
      try {
        const { data } = await api.post('/bookings', { classId: id })
        if (data.status === 'WAITLIST') results.push({ date, status: 'waitlisted' })
        else if (data.status === 'PENDING_CONFIRM') results.push({ date, status: 'pending' })
        else results.push({ date, status: 'confirmed' })
      } catch (err: any) {
        results.push({ date, status: 'failed', reason: err.response?.data?.error || 'Error desconocido' })
      }
    }
    setBookingId(null)
    closeSheet()
    fetchAll()

    if (results.length === 1) {
      const r = results[0]
      if (r.status === 'failed') Alert.alert('Error', r.reason || 'No se pudo reservar')
      else if (r.status === 'waitlisted') Alert.alert('⏳ En lista de espera', 'La clase está llena. Te avisamos si se libera un lugar.')
      else if (r.status === 'pending') Alert.alert('⏱ Confirma tu lugar', 'Como falta bastante para la clase, tenés que confirmar tu asistencia más cerca del horario o el cupo se libera.')
      else Alert.alert('✅ Reservado', 'Tu lugar está confirmado')
      return
    }

    const ICON: Record<Outcome['status'], string> = { confirmed: '✅', pending: '⏱', waitlisted: '⏳', failed: '❌' }
    const LABEL: Record<Outcome['status'], string> = {
      confirmed: 'Confirmada', pending: 'Pendiente de confirmar', waitlisted: 'En lista de espera', failed: 'No se pudo',
    }
    const lines = results.map(r => `${ICON[r.status]} ${r.date}: ${LABEL[r.status]}${r.reason ? ` — ${r.reason}` : ''}`)
    Alert.alert('Reservas procesadas', lines.join('\n'))
  }

  const handleConfirm = async (bookingId: string, classId: string) => {
    setConfirmingId(classId)
    try {
      await api.post(`/bookings/${bookingId}/confirm`)
      Alert.alert('✅ Confirmado', '¡Tu lugar está asegurado!')
      closeSheet()
      fetchAll()
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo confirmar')
    } finally {
      setConfirmingId(null)
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
            closeSheet()
            fetchAll()
          }
        },
      },
    ])
  }

  const allDayClasses = classes
    .filter(cl => isSameDay(new Date(cl.startsAt), selectedDay))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

  // A propósito con TODAS las clases de la semana, no solo las del día
  // seleccionado — así la franja de filtros nunca cambia de alto ni de contenido
  // al cambiar de día (el salto visual que se quería arreglar).
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

  const classCounts = new Map<string, number>()
  for (const cl of classes) {
    const key = new Date(cl.startsAt).toDateString()
    classCounts.set(key, (classCounts.get(key) ?? 0) + 1)
  }

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
        <Text style={s.headerTitle}>Clases</Text>
        <Text style={s.headerSub}>
          {selectedDay.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }).replace(' de ', ' · ')}
        </Text>
      </View>

      {/* ── Calendar strip ── */}
      <WeekDayStrip
        days={days}
        selectedDay={selectedDay}
        onSelect={selectDay}
        countForDay={day => classCounts.get(day.toDateString()) ?? 0}
        color={c.primary}
        border={c.border}
        text1={c.text1}
        text3={c.text3}
      />

      {/* ── Filtros por tipo de clase (de toda la semana, no solo hoy) ── */}
      {classTypes.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={s.filterStrip}
        >
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
        style={[s.mainList, { opacity: fadeAnim }]}
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
          dayClasses.map(cls => (
            <ClassCard
              key={cls.id}
              cls={cls}
              myBooking={myBookingMap.get(cls.id)}
              c={c}
              bookingWindowDays={bookingWindowDays}
              bookingCutoffMins={bookingCutoffMins}
              cancelCutoffMins={cancelCutoffMins}
              onOpenSheet={openSheet}
            />
          ))
        )}
        <View style={{ height: 32 }} />
      </Animated.ScrollView>

      {/* ── BottomSheet detalle de clase ── */}
      {(() => {
        if (!sheetClass) return null
        const cls = sheetClass
        const myBooking = myBookingMap.get(cls.id)
        const booked = !!myBooking && ['CONFIRMED', 'ATTENDED'].includes(myBooking.status)
        const isPendingConfirm = myBooking?.status === 'PENDING_CONFIRM'
        const isWaitlisted = myBooking?.status === 'WAITLIST'
        const now = new Date()
        const clsStart = new Date(cls.startsAt)
        const isFull = (cls._count?.bookings ?? 0) >= (cls.capacity ?? 0)
        const cancelCutoffTime = new Date(clsStart.getTime() - cancelCutoffMins * 60 * 1000)
        const withinCancelCutoff = clsStart > now && now > cancelCutoffTime
        const accentColor = cls.classType?.color || c.primary
        const attendees = (sheetDetails?.bookings || []).filter((b: any) =>
          ['CONFIRMED', 'ATTENDED', 'PENDING_CONFIRM'].includes(b.status)
        )

        // Próximas ocurrencias del mismo tipo+horario, dentro de la ventana de
        // reserva del gym — solo tiene sentido ofrecerlo si todavía no reservó ni
        // está en lista de espera para esta clase puntual.
        const hh = clsStart.getHours(), mm = clsStart.getMinutes()
        const repeatCandidatesRaw = (!booked && !isPendingConfirm && !isWaitlisted)
          ? classes
              .filter(cl =>
                cl.id !== cls.id &&
                // No otro día: mismo tipo+horario pero MISMO día que la clase base
                // (gym con dos instancias del mismo horario ese día, caso raro pero
                // real) — ofrecerlo como "repetir" terminaba intentando reservar el
                // mismo tipo dos veces el mismo día, algo que el backend bloquea
                // (regla de variedad pareja) pero sin que acá quedara claro por qué
                // fallaba (feedback Cristian, 2026-10-16).
                !isSameDay(new Date(cl.startsAt), clsStart) &&
                cl.classType?.id === cls.classType?.id &&
                new Date(cl.startsAt).getHours() === hh &&
                new Date(cl.startsAt).getMinutes() === mm &&
                isClassSelectable(cl, myBookingMap.get(cl.id), bookingWindowDays, bookingCutoffMins)
              )
              .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
          : []
        // Por si el gym tiene dos instancias del mismo tipo+horario el mismo día
        // (entre sí, no con la base): un solo candidato por día — de nuevo, la
        // misma regla de "no dos del mismo tipo el mismo día".
        const seenCandidateDays = new Set<string>()
        const repeatCandidates = repeatCandidatesRaw.filter(cl => {
          const key = new Date(cl.startsAt).toDateString()
          if (seenCandidateDays.has(key)) return false
          seenCandidateDays.add(key)
          return true
        })

        const toggleRepeat = (id: string) => setRepeatSelected(prev => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })

        const totalToBook = 1 + repeatSelected.size

        return (
          <BottomSheet
            visible={!!sheetClass}
            onClose={closeSheet}
            title={cls.classType?.name || 'Clase'}
            scrollable
          >
            <View style={{ paddingHorizontal: 24 }}>
              <Text style={{ color: c.text3, fontSize: 13, marginBottom: 12 }}>
                {clsStart.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                {' · '}
                {fmt(cls.startsAt, { hour: '2-digit', minute: '2-digit' })}
                {' — '}
                {fmt(cls.endsAt, { hour: '2-digit', minute: '2-digit' })}
              </Text>

              {cls.coach?.name && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, marginBottom: 16 }}>
                  <Ionicons name="person-outline" size={16} color={accentColor} />
                  <Text style={{ color: c.text2, fontSize: 14 }}>{cls.coach.name}</Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Ionicons name="people-outline" size={16} color={accentColor} />
                <Text style={{ color: c.text2, fontSize: 14 }}>
                  {cls._count?.bookings ?? 0} / {cls.capacity ?? 0} inscritos
                </Text>
              </View>

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

              {/* Repetir esta clase los próximos días (solo antes de reservar) */}
              {repeatCandidates.length > 0 && (
                <View style={{ marginTop: 20 }}>
                  <Text style={{ color: c.text1, fontSize: 13, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 10 }}>
                    Repetir esta clase
                  </Text>
                  <Text style={{ color: c.text3, fontSize: 12, marginBottom: 10 }}>
                    Mismo tipo y horario, dentro de lo que tu gym permite reservar por adelantado.
                  </Text>
                  {repeatCandidates.map(cand => {
                    const checked = repeatSelected.has(cand.id)
                    return (
                      <TouchableOpacity
                        key={cand.id}
                        onPress={() => toggleRepeat(cand.id)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6,
                          borderRadius: 12, borderWidth: 1,
                          borderColor: checked ? accentColor : c.border,
                          backgroundColor: checked ? accentColor + '18' : 'transparent',
                        }}
                      >
                        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={18} color={checked ? accentColor : c.text3} />
                        <Text style={{ color: checked ? accentColor : c.text2, fontSize: 14, fontWeight: checked ? '700' : '500', textTransform: 'capitalize' }}>
                          {new Date(cand.startsAt).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}

              <View style={{ marginTop: 24, gap: 10 }}>
                {isPendingConfirm ? (
                  <>
                    <TouchableOpacity
                      onPress={() => handleConfirm(myBooking!.bookingId, cls.id)}
                      disabled={confirmingId === cls.id}
                      style={{ borderRadius: 14, overflow: 'hidden' }}
                    >
                      <LinearGradient
                        colors={['#f59e0b', '#f59e0bAA']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={{ paddingVertical: 16, alignItems: 'center' }}
                      >
                        {confirmingId === cls.id
                          ? <ActivityIndicator color="#fff" size={18} />
                          : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>⏱ Confirmar mi lugar</Text>
                        }
                      </LinearGradient>
                    </TouchableOpacity>
                    {withinCancelCutoff ? (
                      <View style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: c.border, alignItems: 'center' }}>
                        <Text style={{ color: c.text3, fontSize: 14, fontWeight: '700' }}>No se puede cancelar · plazo vencido</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleCancel(cls.id)}
                        style={{ paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#ef444455', alignItems: 'center' }}
                      >
                        <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>Cancelar reserva</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : booked ? (
                  withinCancelCutoff ? (
                    <View style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: c.border, alignItems: 'center' }}>
                      <Text style={{ color: c.text3, fontSize: 14, fontWeight: '700' }}>Plazo de cancelación vencido</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleCancel(cls.id)}
                      style={{ paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#ef444455', alignItems: 'center' }}
                    >
                      <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>Cancelar reserva</Text>
                    </TouchableOpacity>
                  )
                ) : isWaitlisted ? (
                  <TouchableOpacity
                    onPress={() => handleCancel(cls.id)}
                    style={{ paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: c.text3 + '60', alignItems: 'center' }}
                  >
                    <Text style={{ color: c.text3, fontSize: 14, fontWeight: '600' }}>⏳ Salir de la lista de espera</Text>
                  </TouchableOpacity>
                ) : isFull ? (
                  <TouchableOpacity
                    onPress={() => handleBook(cls.id)}
                    disabled={bookingId === cls.id}
                    style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: c.border, alignItems: 'center' }}
                  >
                    {bookingId === cls.id
                      ? <ActivityIndicator color={c.text1} size={18} />
                      : <Text style={{ color: c.text1, fontSize: 14, fontWeight: '700' }}>Unirme a lista de espera</Text>
                    }
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleBook(cls.id, Array.from(repeatSelected))}
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
                        : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                            {totalToBook > 1 ? `Reservar ${totalToBook} clases` : 'Reservar lugar'}
                          </Text>
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

function makeStyles(c: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background },

    header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
    headerTitle: { fontSize: 28, fontWeight: '800', color: c.text1, letterSpacing: -0.5 },
    headerSub: { fontSize: 12, color: c.text3, marginTop: 1, textTransform: 'capitalize' },

    // flexGrow/flexShrink: 0 — mismo motivo que WeekDayStrip: sin esto, con
    // pocos resultados filtrados el espacio libre se lo repartían este
    // ScrollView y el de días en vez de dejarlo vacío bajo la lista.
    filterScroll: { flexGrow: 0, flexShrink: 0 },
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

    // flex: 1 explícito — así esta es la única que reclama el espacio vertical
    // libre (y scrollea internamente si hace falta); sin esto el espacio se lo
    // llevaban los ScrollViews de arriba cuando la lista era corta.
    mainList: { flex: 1 },
    list: { paddingHorizontal: 20, paddingTop: 8 },
    emptyWrap: { alignItems: 'center', paddingTop: 60 },
    emptyEmoji: { fontSize: 44, marginBottom: 12 },
    emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
    emptySub: { fontSize: 13 },
  })
}
