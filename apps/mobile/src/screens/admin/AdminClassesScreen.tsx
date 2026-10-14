import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { localDateStr } from '../../lib/date'
import { DisciplineIcon } from '../../components/DisciplineIcon'

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function buildWeekDays(numDays = 14): Date[] {
  return Array.from({ length: numDays }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    d.setHours(0, 0, 0, 0)
    return d
  })
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

export default function AdminClassesScreen({ navigation }: any) {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const calendarRef = useRef<ScrollView>(null)

  const [days] = useState(buildWeekDays(14))
  const [selectedDay, setSelectedDay] = useState(days[0])
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchClasses = async () => {
    try {
      const from = localDateStr(days[0])
      const to = localDateStr(days[days.length - 1])
      const { data } = await api.get(`/classes?from=${from}&to=${to}`)
      setClasses(data)
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las clases')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(useCallback(() => { fetchClasses() }, []))

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#6366f1" size={36} /></View>
  }

  const classTypes: { id: string; name: string; color: string; discipline?: string }[] = []
  const seenTypes = new Set<string>()
  for (const cl of classes) {
    const ct = cl.classType
    if (ct && !seenTypes.has(ct.id)) {
      seenTypes.add(ct.id)
      classTypes.push({ id: ct.id, name: ct.name, color: ct.color || '#6366f1', discipline: ct.discipline })
    }
  }

  const allDayClasses = classes
    .filter(cl => isSameDay(new Date(cl.startsAt), selectedDay))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

  const dayClasses = selectedTypeId
    ? allDayClasses.filter(cl => cl.classType?.id === selectedTypeId)
    : allDayClasses

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Clases</Text>
        {isAdmin && (
          <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('CreateClass')}>
            <Text style={styles.newBtnText}>+ Nueva</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Calendar strip ── */}
      <ScrollView
        ref={calendarRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.calStrip}
      >
        {days.map((day, i) => {
          const isSelected = isSameDay(day, selectedDay)
          const isToday = isSameDay(day, new Date())
          const dayClsCount = classes.filter(cl => isSameDay(new Date(cl.startsAt), day)).length
          return (
            <TouchableOpacity
              key={i}
              onPress={() => setSelectedDay(day)}
              activeOpacity={0.75}
              style={[
                styles.dayPill,
                isSelected ? styles.dayPillSelected : isToday ? styles.dayPillToday : null,
              ]}
            >
              <Text style={[styles.dayName, isSelected ? styles.dayTextSelected : isToday ? styles.dayTextToday : styles.dayTextDefault]}>
                {isToday ? 'HOY' : DAY_SHORT[day.getDay()]}
              </Text>
              <Text style={[styles.dayNum, isSelected ? styles.dayTextSelected : isToday ? styles.dayTextToday : styles.dayNumDefault]}>
                {day.getDate()}
              </Text>
              {dayClsCount > 0 && (
                <View style={[styles.clsCount, isSelected && styles.clsCountSelected]}>
                  <Text style={[styles.clsCountText, isSelected && styles.dayTextSelected]}>{dayClsCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* ── Filtros por tipo de clase ── */}
      {classTypes.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
          <TouchableOpacity
            onPress={() => setSelectedTypeId(null)}
            style={[styles.filterChip, selectedTypeId === null && styles.filterChipActive]}
            activeOpacity={0.75}
          >
            <Ionicons name="grid-outline" size={14} color={selectedTypeId === null ? '#fff' : '#9ca3af'} />
            <Text style={[styles.filterChipText, { color: selectedTypeId === null ? '#fff' : '#d1d5db' }]}>Todas</Text>
          </TouchableOpacity>
          {classTypes.map(ct => {
            const active = selectedTypeId === ct.id
            return (
              <TouchableOpacity
                key={ct.id}
                onPress={() => setSelectedTypeId(active ? null : ct.id)}
                style={[styles.filterChip, { borderColor: active ? ct.color : ct.color + '50' }, active && { backgroundColor: ct.color }]}
                activeOpacity={0.75}
              >
                <DisciplineIcon discipline={ct.discipline} size={13} color={active ? '#fff' : ct.color} />
                <Text style={[styles.filterChipText, { color: active ? '#fff' : ct.color }]}>{ct.name}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchClasses() }} tintColor="#6366f1" />}
      >
        {dayClasses.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Sin clases este día</Text>
          </View>
        ) : (
          <View style={styles.dayGroup}>
            {dayClasses.map(cls => {
              const booked = cls._count?.bookings || 0
              const occupancy = cls.capacity > 0 ? Math.round((booked / cls.capacity) * 100) : 0
              const isFull = booked >= cls.capacity
              return (
                <TouchableOpacity
                  key={cls.id}
                  style={styles.classCard}
                  onPress={() => navigation.navigate('ClassDetail', { classId: cls.id })}
                  activeOpacity={0.8}
                >
                  <View style={[styles.classBar, { backgroundColor: cls.classType?.color || '#6366f1' }]} />
                  <View style={styles.classContent}>
                    <View style={styles.classHeader}>
                      <Text style={styles.className}>{cls.classType?.name}</Text>
                      <View style={styles.slotsBadge}>
                        <Text style={[styles.slotsText, isFull && styles.slotsFull]}>
                          {booked}/{cls.capacity}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.classTime}>
                      {formatTime(cls.startsAt)} — {formatTime(cls.endsAt)}
                    </Text>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, {
                        width: `${occupancy}%` as any,
                        backgroundColor: isFull ? '#ef4444' : occupancy >= 70 ? '#f59e0b' : '#22c55e'
                      }]} />
                    </View>
                    <View style={styles.cardFooter}>
                      <Text style={styles.viewDetail}>Ver detalle y asistencia →</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030712' },
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff' },
  newBtn: { backgroundColor: '#6366f1', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Calendar strip
  calStrip: { paddingHorizontal: 20, paddingBottom: 14, gap: 7 },
  dayPill: {
    width: 56, borderRadius: 18, borderWidth: 1.5, borderColor: '#1f2937',
    paddingVertical: 10, alignItems: 'center', gap: 3,
    backgroundColor: '#111827', flexShrink: 0,
  },
  dayPillSelected: { backgroundColor: '#6366f1', borderColor: 'transparent' },
  dayPillToday: { borderColor: '#6366f1' },
  dayName: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  dayNum: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  dayTextSelected: { color: '#fff' },
  dayTextToday: { color: '#6366f1' },
  dayTextDefault: { color: '#9ca3af' },
  dayNumDefault: { color: '#fff' },
  clsCount: { minWidth: 22, height: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6366f122' },
  clsCountSelected: { backgroundColor: 'rgba(255,255,255,0.25)' },
  clsCountText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.2, color: '#6366f1' },

  // Filters
  filterStrip: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 24,
    borderWidth: 1, borderColor: '#1f2937', backgroundColor: '#111827',
  },
  filterChipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  filterChipText: { fontSize: 13, fontWeight: '700' },

  empty: { marginHorizontal: 24, marginTop: 8, backgroundColor: '#111827', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  emptyText: { color: '#4b5563', fontSize: 14 },
  dayGroup: { paddingHorizontal: 24, paddingTop: 8 },
  classCard: { backgroundColor: '#111827', borderRadius: 16, marginBottom: 12, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: '#1f2937' },
  classBar: { width: 4 },
  classContent: { flex: 1, padding: 16 },
  classHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  className: { fontSize: 17, fontWeight: '600', color: '#fff' },
  slotsBadge: { backgroundColor: '#1f2937', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  slotsText: { fontSize: 13, color: '#6366f1', fontWeight: '700' },
  slotsFull: { color: '#ef4444' },
  classTime: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  progressBar: { height: 4, backgroundColor: '#1f2937', borderRadius: 2, marginBottom: 10 },
  progressFill: { height: 4, borderRadius: 2 },
  cardFooter: { alignItems: 'flex-end' },
  viewDetail: { fontSize: 12, color: '#6366f1', fontWeight: '600' },
})
