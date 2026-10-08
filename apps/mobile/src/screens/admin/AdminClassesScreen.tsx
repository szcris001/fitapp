import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'

export default function AdminClassesScreen({ navigation }: any) {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchClasses = async () => {
    try {
      const from = new Date().toISOString().split('T')[0]
      const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
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

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

  const groupByDay = (list: any[]) => {
    const groups: Record<string, any[]> = {}
    for (const cls of list) {
      // Clave en fecha LOCAL (no UTC) para que coincida con formatDate() —
      // de lo contrario una clase de madrugada UTC cae en el grupo de otra
      // clase cuyo día local es distinto, y el encabezado muestra el día
      // equivocado.
      const d = new Date(cls.startsAt)
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!groups[day]) groups[day] = []
      groups[day].push(cls)
    }
    return groups
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#6366f1" size={36} /></View>
  }

  const grouped = groupByDay(classes)

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchClasses() }} tintColor="#6366f1" />}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Clases</Text>
        {isAdmin && (
          <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('CreateClass')}>
            <Text style={styles.newBtnText}>+ Nueva</Text>
          </TouchableOpacity>
        )}
      </View>
      {Object.keys(grouped).length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No hay clases esta semana</Text>
        </View>
      ) : (
        Object.entries(grouped).map(([day, dayClasses]) => (
          <View key={day} style={styles.dayGroup}>
            <Text style={styles.dayLabel}>{formatDate(dayClasses[0].startsAt)}</Text>
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
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff' },
  newBtn: { backgroundColor: '#6366f1', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  emptyText: { color: '#4b5563', fontSize: 14 },
  dayGroup: { paddingHorizontal: 24, marginBottom: 24 },
  dayLabel: { fontSize: 13, color: '#6b7280', fontWeight: '600', textTransform: 'capitalize', marginBottom: 12, letterSpacing: 0.5 },
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
