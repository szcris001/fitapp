import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import api from '../lib/api'
import { useAuthStore } from '../store/auth.store'

interface ClassSlot {
  id: string
  startsAt: string
  endsAt: string
  capacity: number
  classType: { id: string; name: string; color: string }
  _count: { bookings: number }
  bookings?: { userId: string; status: string }[]
}

interface SelectedSlot {
  classId: string
  dateLabel: string
  time: string
  typeName: string
}

export default function BookingScreen() {
  const { user } = useAuthStore()
  const [classTypes, setClassTypes] = useState<any[]>([])
  const [selectedType, setSelectedType] = useState<string>('')
  const [classes, setClasses] = useState<ClassSlot[]>([])
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return d
  })

  useEffect(() => {
    api.get('/class-types').then(r => {
      setClassTypes(r.data)
      if (r.data.length > 0) setSelectedType(r.data[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedType) return
    fetchClasses()
  }, [selectedType])

  const fetchClasses = () => {
    setLoading(true)
    const from = new Date().toISOString().split('T')[0]
    const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    api.get(`/classes?from=${from}&to=${to}`).then(r => {
      setClasses(r.data.filter((c: any) => c.classType?.id === selectedType))
    }).catch(() => {}).finally(() => setLoading(false))
  }

  const getClassesForDay = (date: Date) => {
    const dayStr = date.toISOString().split('T')[0]
    return classes.filter(c => new Date(c.startsAt).toISOString().split('T')[0] === dayStr)
  }

  const getDayStatus = (date: Date) => {
    const dayClasses = getClassesForDay(date)
    if (dayClasses.length === 0) return 'none'
    const available = dayClasses.filter(c => c._count.bookings < c.capacity)
    if (available.length === 0) return 'full'
    const lastSpots = available.filter(c => c.capacity - c._count.bookings <= 3)
    if (lastSpots.length === available.length) return 'warn'
    return 'avail'
  }

  const isSelected = (classId: string) => selected.some(s => s.classId === classId)
  const alreadyBooked = (cls: any) => cls.myBookingStatus === "CONFIRMED" || cls.myBookingStatus === "ATTENDED"

  const toggleClass = (cls: ClassSlot) => {
    if (cls._count.bookings >= cls.capacity) return
    if (alreadyBooked(cls)) return
    const slot: SelectedSlot = {
      classId: cls.id,
      dateLabel: new Date(cls.startsAt).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }),
      time: new Date(cls.startsAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      typeName: cls.classType?.name,
    }
    if (isSelected(cls.id)) {
      setSelected(prev => prev.filter(s => s.classId !== cls.id))
    } else {
      setSelected(prev => [...prev, slot])
    }
  }

  const confirmBookings = async () => {
    if (selected.length === 0) return
    setBooking(true)
    let ok = 0, fail = 0
    for (const slot of selected) {
      try {
        await api.post('/bookings', { classId: slot.classId })
        ok++
      } catch { fail++ }
    }
    setBooking(false)
    setSelected([])
    setExpandedDay(null)
    fetchClasses()
    if (fail === 0) Alert.alert('✅ Listo', `${ok} clase${ok > 1 ? 's' : ''} reservada${ok > 1 ? 's' : ''} correctamente`)
    else Alert.alert('Parcial', `${ok} ok, ${fail} fallaron`)
  }

  const statusColor: Record<string, string> = { avail: '#22c55e', warn: '#f59e0b', full: '#ef4444', none: '#374151' }
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Reservar clases</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}>
        {classTypes.map(ct => (
          <TouchableOpacity key={ct.id} onPress={() => { setSelectedType(ct.id); setSelected([]) }}
            style={[styles.typeChip, selectedType === ct.id && styles.typeChipActive]}>
            <Text style={[styles.typeChipText, selectedType === ct.id && styles.typeChipTextActive]}>{ct.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#6366f1" size={36} /></View>
      ) : (
        <View style={styles.weekGrid}>
          <View style={styles.weekHeader}>
            {weekDays.map((d, i) => (
              <Text key={i} style={styles.weekHeaderLabel}>{dayNames[d.getDay()][0]}</Text>
            ))}
          </View>
          <View style={styles.weekRow}>
            {weekDays.map((day, i) => {
              const status = getDayStatus(day)
              const dayKey = day.toISOString().split('T')[0]
              const isExpanded = expandedDay === dayKey
              return (
                <TouchableOpacity key={i}
                  style={[styles.dayCell, isExpanded && styles.dayCellActive, status === 'none' && styles.dayCellNone]}
                  onPress={() => status !== 'none' && setExpandedDay(isExpanded ? null : dayKey)}
                  disabled={status === 'none'}>
                  <Text style={styles.dayName}>{dayNames[day.getDay()]}</Text>
                  <Text style={[styles.dayNum, isExpanded && styles.dayNumActive]}>{day.getDate()}</Text>
                  <Text style={styles.dayMonth}>{monthNames[day.getMonth()]}</Text>
                  {status !== 'none' && <View style={[styles.dayDot, { backgroundColor: statusColor[status] }]} />}
                </TouchableOpacity>
              )
            })}
          </View>

          {expandedDay && (() => {
            const expandedDate = new Date(expandedDay + 'T12:00:00')
            const dayClasses = getClassesForDay(expandedDate)
            const dateLabel = `${dayNames[expandedDate.getDay()]} ${expandedDate.getDate()} de ${monthNames[expandedDate.getMonth()]}`
            return (
              <View style={styles.hoursPanel}>
                <Text style={styles.hoursPanelTitle}>{dateLabel}</Text>
                <View style={styles.hoursGrid}>
                  {dayClasses.map(cls => {
                    const full = cls._count.bookings >= cls.capacity
                    const spotsLeft = cls.capacity - cls._count.bookings
                    const sel = isSelected(cls.id)
                    const booked = alreadyBooked(cls)
                    return (
                      <TouchableOpacity key={cls.id}
                        style={[styles.hourBtn,
                          sel && styles.hourBtnSelected,
                          booked && styles.hourBtnBooked,
                          full && !booked && styles.hourBtnFull]}
                        onPress={() => toggleClass(cls)}
                        disabled={full || booked}>
                        <Text style={[styles.hourTime, sel && styles.hourTimeSelected, booked && styles.hourTimeBooked]}>
                          {new Date(cls.startsAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        <Text style={[styles.hourSlots,
                          booked ? styles.slotsBooked :
                          full ? styles.slotsFull :
                          spotsLeft <= 3 ? styles.slotsWarn : styles.slotsOk]}>
                          {booked ? '✓ Reservado' : full ? 'Lleno' : `${spotsLeft} cupos`}
                        </Text>
                        {sel && <Text style={styles.hourCheck}>✓ elegido</Text>}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )
          })()}
        </View>
      )}

      <View style={styles.legend}>
        {[
          { color: '#22c55e', label: 'Disponible' },
          { color: '#f59e0b', label: 'Últimos cupos' },
          { color: '#ef4444', label: 'Lleno' },
        ].map(item => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>

      {selected.length > 0 && (
        <View style={styles.cartPanel}>
          <Text style={styles.cartTitle}>{selected.length} clase{selected.length > 1 ? 's' : ''} seleccionada{selected.length > 1 ? 's' : ''}</Text>
          {selected.map((s, i) => (
            <View key={i} style={styles.cartRow}>
              <Text style={styles.cartText}>{s.dateLabel} · {s.time}</Text>
              <Text style={styles.cartType}>{s.typeName}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.confirmBtn} onPress={confirmBookings} disabled={booking}>
            {booking ? <ActivityIndicator color="#fff" size={20} /> :
              <Text style={styles.confirmBtnText}>Confirmar {selected.length} reserva{selected.length > 1 ? 's' : ''}</Text>}
          </TouchableOpacity>
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  typeRow: { marginBottom: 20 },
  typeChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937' },
  typeChipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  typeChipText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  typeChipTextActive: { color: '#fff' },
  center: { padding: 40, alignItems: 'center' },
  weekGrid: { marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#1f2937', marginBottom: 12 },
  weekHeader: { flexDirection: 'row', marginBottom: 6 },
  weekHeaderLabel: { flex: 1, textAlign: 'center', fontSize: 9, color: '#4b5563', fontWeight: '500' },
  weekRow: { flexDirection: 'row', gap: 3 },
  dayCell: { flex: 1, backgroundColor: '#1f2937', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 2, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  dayCellActive: { backgroundColor: '#312e81', borderColor: '#6366f1' },
  dayCellNone: { backgroundColor: 'transparent' },
  dayName: { fontSize: 8, color: '#4b5563', marginBottom: 2 },
  dayNum: { fontSize: 13, fontWeight: '700', color: '#9ca3af' },
  dayNumActive: { color: '#a5b4fc' },
  dayMonth: { fontSize: 7, color: '#374151', marginTop: 1 },
  dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  hoursPanel: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1f2937' },
  hoursPanelTitle: { fontSize: 13, color: '#9ca3af', fontWeight: '500', marginBottom: 10, textTransform: 'capitalize' },
  hoursGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hourBtn: { width: '47%', backgroundColor: '#0f172a', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#1f2937' },
  hourBtnSelected: { backgroundColor: '#312e81', borderColor: '#6366f1' },
  hourBtnBooked: { backgroundColor: '#0f2a1a', borderColor: '#166534' },
  hourBtnFull: { opacity: 0.4 },
  hourTime: { fontSize: 15, fontWeight: '600', color: '#f9fafb' },
  hourTimeSelected: { color: '#a5b4fc' },
  hourTimeBooked: { color: '#4ade80' },
  hourSlots: { fontSize: 11, marginTop: 2 },
  slotsOk: { color: '#22c55e' },
  slotsWarn: { color: '#f59e0b' },
  slotsFull: { color: '#ef4444' },
  slotsBooked: { color: '#4ade80' },
  hourCheck: { fontSize: 10, color: '#a5b4fc', marginTop: 3 },
  legend: { flexDirection: 'row', gap: 16, paddingHorizontal: 24, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 10, color: '#6b7280' },
  cartPanel: { marginHorizontal: 24, backgroundColor: '#1e1b4b', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#3730a3' },
  cartTitle: { fontSize: 13, color: '#a5b4fc', fontWeight: '600', marginBottom: 10 },
  cartRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  cartText: { fontSize: 12, color: '#c7d2fe' },
  cartType: { fontSize: 12, color: '#818cf8' },
  confirmBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  confirmBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
})
