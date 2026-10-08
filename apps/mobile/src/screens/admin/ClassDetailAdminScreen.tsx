import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert, RefreshControl
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../lib/api'

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmado',
  ATTENDED: 'Asistió',
  WAITLIST: 'En espera',
  CANCELLED: 'Cancelado',
  PENDING_CONFIRM: 'Por confirmar',
}

const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: '#6366f1',
  ATTENDED: '#22c55e',
  WAITLIST: '#f59e0b',
  CANCELLED: '#ef4444',
  PENDING_CONFIRM: '#f97316',
}

export default function ClassDetailAdminScreen({ route, navigation }: any) {
  const { classId } = route.params
  const [cls, setCls] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [marking, setMarking] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [attendanceMode, setAttendanceMode] = useState<string>('manual')

  const fetchClass = async () => {
    try {
      const [clsRes, gymRes] = await Promise.all([
        api.get(`/classes/${classId}`),
        api.get('/gyms/me').catch(() => ({ data: { attendanceMode: 'manual' } })),
      ])
      setCls(clsRes.data)
      setAttendanceMode(gymRes.data.attendanceMode || 'manual')
    } catch {
      Alert.alert('Error', 'No se pudo cargar la clase')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(useCallback(() => { fetchClass() }, [classId]))

  const markAttendance = async (bookingId: string) => {
    setMarking(bookingId)
    try {
      await api.patch(`/bookings/${bookingId}/attend`)
      await fetchClass()
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo marcar asistencia')
    } finally {
      setMarking(null) }
  }

  const removeStudent = (bookingId: string, studentName: string) => {
    Alert.alert('Quitar alumno', `¿Quitar a ${studentName} de esta clase?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar', style: 'destructive',
        onPress: async () => {
          setRemoving(bookingId)
          try {
            await api.delete(`/bookings/${bookingId}/admin`)
            await fetchClass()
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.error || 'No se pudo quitar al alumno')
          } finally {
            setRemoving(null)
          }
        }
      }
    ])
  }

  const handleDelete = () => {
    Alert.alert('Eliminar clase', '¿Estás seguro? Se cancelarán todas las reservas.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/classes/${classId}`)
            navigation.goBack()
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.error || 'No se pudo eliminar')
          }
        }
      }
    ])
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#6366f1" size={36} /></View>
  }

  if (!cls) {
    return <View style={styles.center}><Text style={styles.errorText}>Clase no encontrada</Text></View>
  }

  const startsAt = new Date(cls.startsAt)
  const endsAt = new Date(cls.endsAt)
  const confirmedBookings = cls.bookings?.filter((b: any) => ['CONFIRMED', 'ATTENDED', 'PENDING_CONFIRM'].includes(b.status)) || []
  const waitlistBookings = cls.bookings?.filter((b: any) => b.status === 'WAITLIST') || []
  const attendedCount = cls.bookings?.filter((b: any) => b.status === 'ATTENDED').length || 0

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchClass() }} tintColor="#6366f1" />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.classInfo}>
        <View style={[styles.typeDot, { backgroundColor: cls.classType?.color || '#6366f1' }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.classTitle}>{cls.classType?.name}</Text>
          <Text style={styles.classDate}>
            {startsAt.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text style={styles.classTime}>
            {startsAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} —{' '}
            {endsAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {cls.coach && <Text style={styles.coach}>Coach: {cls.coach.name}</Text>}
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{confirmedBookings.length}</Text>
          <Text style={styles.statLbl}>Inscritos</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#22c55e' }]}>{attendedCount}</Text>
          <Text style={styles.statLbl}>Asistieron</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{cls.capacity}</Text>
          <Text style={styles.statLbl}>Capacidad</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#f59e0b' }]}>{waitlistBookings.length}</Text>
          <Text style={styles.statLbl}>En espera</Text>
        </View>
      </View>

      {/* Indicador del modo de asistencia */}
      {attendanceMode !== 'manual' && (
        <View style={{ marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#1e1b4b', borderRadius: 10, borderWidth: 1, borderColor: '#4338ca' }}>
          <Text style={{ color: '#a5b4fc', fontSize: 12, fontWeight: '600' }}>
            ⚡ Asistencia automática — se marcará al finalizar la clase
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 4 }}>
        <TouchableOpacity
          style={[styles.assignBtn, { flex: 1 }]}
          onPress={() => navigation.navigate('AssignStudent', { classId: cls.id, className: cls.classType?.name })}
        >
          <Text style={styles.assignBtnText}>+ Agregar alumno</Text>
        </TouchableOpacity>

      </View>

      {confirmedBookings.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Inscritos</Text>
          {confirmedBookings.map((booking: any) => (
            <View key={booking.id} style={styles.studentRow}>
              <View style={styles.studentInfo}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{booking.user?.name?.[0]?.toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.studentName}>{booking.user?.name}</Text>
                  <Text style={styles.studentEmail}>{booking.user?.email}</Text>
                </View>
              </View>
              <View style={styles.studentRight}>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[booking.status] + '20' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[booking.status] }]}>
                    {STATUS_LABEL[booking.status]}
                  </Text>
                </View>
                {/* Botón de asistencia manual solo en modo 'manual' */}
                {attendanceMode === 'manual' && booking.status === 'CONFIRMED' && (
                  <TouchableOpacity
                    style={styles.attendBtn}
                    onPress={() => markAttendance(booking.id)}
                    disabled={marking === booking.id}
                  >
                    {marking === booking.id
                      ? <ActivityIndicator color="#fff" size={14} />
                      : <Text style={styles.attendBtnText}>✓ Asistió</Text>
                    }
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeStudent(booking.id, booking.user?.name || 'este alumno')}
                  disabled={removing === booking.id}
                >
                  {removing === booking.id
                    ? <ActivityIndicator color="#ef4444" size={14} />
                    : <Text style={styles.removeBtnText}>✕</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      {waitlistBookings.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Lista de espera</Text>
          {waitlistBookings.map((booking: any) => (
            <View key={booking.id} style={styles.studentRow}>
              <View style={styles.studentInfo}>
                <View style={[styles.avatar, { backgroundColor: '#1f2937' }]}>
                  <Text style={styles.avatarText}>{booking.user?.name?.[0]?.toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.studentName}>{booking.user?.name}</Text>
                  <Text style={styles.studentEmail}>{booking.user?.email}</Text>
                </View>
              </View>
              <View style={styles.studentRight}>
                <View style={[styles.statusBadge, { backgroundColor: '#f59e0b20' }]}>
                  <Text style={[styles.statusText, { color: '#f59e0b' }]}>En espera</Text>
                </View>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeStudent(booking.id, booking.user?.name || 'este alumno')}
                  disabled={removing === booking.id}
                >
                  {removing === booking.id
                    ? <ActivityIndicator color="#ef4444" size={14} />
                    : <Text style={styles.removeBtnText}>✕</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      {confirmedBookings.length === 0 && waitlistBookings.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No hay alumnos inscritos</Text>
        </View>
      )}

      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
        <Text style={styles.deleteBtnText}>Eliminar clase</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  errorText: { color: '#6b7280', fontSize: 16 },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  backBtn: { alignSelf: 'flex-start' },
  backText: { color: '#6366f1', fontSize: 16, fontWeight: '600' },
  classInfo: { flexDirection: 'row', paddingHorizontal: 24, paddingVertical: 16, gap: 14, alignItems: 'flex-start' },
  typeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  classTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4 },
  classDate: { fontSize: 14, color: '#9ca3af', fontWeight: '500', textTransform: 'capitalize', marginBottom: 2 },
  classTime: { fontSize: 14, color: '#6b7280', marginBottom: 4 },
  coach: { fontSize: 13, color: '#6b7280' },
  statsRow: { flexDirection: 'row', marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1f2937', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#6366f1' },
  statLbl: { fontSize: 11, color: '#6b7280', fontWeight: '600', marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: '#1f2937' },
  assignBtn: { marginHorizontal: 24, backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 24 },
  assignBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionTitle: { fontSize: 13, color: '#6b7280', fontWeight: '700', paddingHorizontal: 24, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  studentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#1f2937' },
  studentInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366f120', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#6366f1', fontWeight: '700', fontSize: 15 },
  studentName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  studentEmail: { color: '#6b7280', fontSize: 12 },
  studentRight: { alignItems: 'flex-end', gap: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },
  attendBtn: { backgroundColor: '#22c55e', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  attendBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  removeBtn: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: '#ef444440', justifyContent: 'center', alignItems: 'center' },
  removeBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
  emptyCard: { marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937', marginBottom: 16 },
  emptyText: { color: '#4b5563', fontSize: 14 },
  deleteBtn: { marginHorizontal: 24, marginTop: 8, marginBottom: 40, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#ef444440' },
  deleteBtnText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
})
