import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, RefreshControl, ActivityIndicator } from 'react-native'
import api from '../lib/api'
import { useAuthStore } from '../store/auth.store'

export default function MyBookingsScreen() {
  const { user } = useAuthStore()
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming')
  const [cancelling, setCancelling] = useState<string | null>(null)

  useEffect(() => { fetchBookings() }, [])

  const fetchBookings = async () => {
    try {
      const { data } = await api.get('/my-bookings')
      setBookings(data)
    } catch (e) { console.log(e) }
    finally { setLoading(false); setRefreshing(false) }
  }

  const cancelBooking = async (classId: string, bookingId: string) => {
    Alert.alert('Cancelar reserva', '¿Estás seguro?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar', style: 'destructive',
        onPress: async () => {
          setCancelling(bookingId)
          try {
            await api.delete(`/bookings/${classId}`)
            fetchBookings()
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.error || 'No se pudo cancelar')
          } finally { setCancelling(null) }
        }
      }
    ])
  }

  const now = new Date()
  const upcoming = bookings.filter(b => new Date(b.class.startsAt) >= now)
  const history = bookings.filter(b => new Date(b.class.startsAt) < now)
  const display = tab === 'upcoming' ? upcoming : history

  const daysUntil = (date: string) => {
    const days = Math.ceil((new Date(date).getTime() - now.getTime()) / 86400000)
    if (days === 0) return 'Hoy'
    if (days === 1) return 'Mañana'
    return `${days} días`
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

  const canCancel = (startsAt: string) => {
    const cutoff = new Date(new Date(startsAt).getTime() - 30 * 60 * 1000)
    return now < cutoff
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#6366f1" size={36} /></View>
  }

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBookings() }} tintColor="#6366f1" />}>
      <Text style={styles.title}>Mis reservas</Text>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'upcoming' && styles.tabActive]} onPress={() => setTab('upcoming')}>
          <Text style={[styles.tabText, tab === 'upcoming' && styles.tabTextActive]}>Próximas ({upcoming.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'history' && styles.tabActive]} onPress={() => setTab('history')}>
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>Historial ({history.length})</Text>
        </TouchableOpacity>
      </View>

      {display.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>{tab === 'upcoming' ? '📅' : '📋'}</Text>
          <Text style={styles.emptyText}>{tab === 'upcoming' ? 'Sin reservas próximas' : 'Sin historial aún'}</Text>
          <Text style={styles.emptySub}>{tab === 'upcoming' ? 'Reserva clases desde la pestaña Reservar' : ''}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {display.map(booking => {
            const cls = booking.class
            const isUpcoming = new Date(cls.startsAt) >= now
            const isWaitlist = booking.status === 'WAITLIST'
            const attended = booking.status === 'ATTENDED'
            const ablToCancel = isUpcoming && canCancel(cls.startsAt)

            return (
              <View key={booking.id} style={[styles.card, isUpcoming && !isWaitlist && styles.cardUpcoming, isWaitlist && styles.cardWaitlist]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardLeft}>
                    <View style={styles.cardTypeRow}>
                      <View style={[styles.typeDot, { backgroundColor: cls.classType?.color || '#6366f1' }]} />
                      <Text style={styles.cardType}>{cls.classType?.name}</Text>
                    </View>
                    <Text style={styles.cardDate}>{formatDate(cls.startsAt)}</Text>
                    <Text style={styles.cardTime}>{formatTime(cls.startsAt)} — {formatTime(cls.endsAt)}</Text>
                  </View>
                  <View style={styles.cardRight}>
                    {isWaitlist ? (
                      <View style={styles.waitlistBadge}>
                        <Text style={styles.waitlistText}>Lista espera</Text>
                      </View>
                    ) : isUpcoming ? (
                      <View style={styles.daysLeft}>
                        <Text style={styles.daysLeftText}>{daysUntil(cls.startsAt)}</Text>
                      </View>
                    ) : attended ? (
                      <View style={styles.attendedBadge}>
                        <Text style={styles.attendedText}>Asistí ✓</Text>
                      </View>
                    ) : (
                      <View style={styles.absentBadge}>
                        <Text style={styles.absentText}>No asistí</Text>
                      </View>
                    )}
                  </View>
                </View>

                {cls.bookings?.length > 0 && (
                  <View style={styles.companionsRow}>
                    {cls.bookings.slice(0, 6).map((b: any, i: number) => (
                      <View key={i} style={[styles.avatar, b.id === booking.id && styles.avatarMe]}>
                        <Text style={styles.avatarText}>{b.user?.name?.[0] || '?'}</Text>
                      </View>
                    ))}
                    {cls.bookings.length > 6 && (
                      <View style={styles.avatarMore}>
                        <Text style={styles.avatarMoreText}>+{cls.bookings.length - 6}</Text>
                      </View>
                    )}
                    <Text style={styles.companionsCount}>{cls.bookings.length} van</Text>
                  </View>
                )}

                {isUpcoming && (
                  <TouchableOpacity
                    style={[styles.cancelBtn, !ablToCancel && styles.cancelBtnDisabled]}
                    onPress={() => ablToCancel && cancelBooking(cls.id, booking.id)}
                    disabled={!ablToCancel || cancelling === booking.id}>
                    {cancelling === booking.id
                      ? <ActivityIndicator size={14} color="#6b7280" />
                      : <Text style={[styles.cancelBtnText, !ablToCancel && styles.cancelBtnTextDisabled]}>
                          {ablToCancel ? 'Cancelar reserva' : 'No se puede cancelar (menos de 30 min)'}
                        </Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            )
          })}
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  tabs: { flexDirection: 'row', paddingHorizontal: 24, gap: 8, marginBottom: 16 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937' },
  tabActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  tabText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  tabTextActive: { color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#4b5563', fontWeight: '600' },
  emptySub: { fontSize: 12, color: '#374151', marginTop: 6, textAlign: 'center' },
  list: { paddingHorizontal: 24, gap: 12 },
  card: { backgroundColor: '#111827', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#1f2937' },
  cardUpcoming: { borderColor: '#312e81', backgroundColor: '#0a0a18' },
  cardWaitlist: { borderColor: '#78350f', backgroundColor: '#0a0800' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardLeft: { flex: 1 },
  cardTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  cardType: { fontSize: 14, fontWeight: '600', color: '#fff' },
  cardDate: { fontSize: 12, color: '#6b7280', textTransform: 'capitalize', marginBottom: 2 },
  cardTime: { fontSize: 12, color: '#4b5563' },
  cardRight: { marginLeft: 8 },
  daysLeft: { backgroundColor: '#1e1b4b', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  daysLeftText: { fontSize: 12, color: '#a5b4fc', fontWeight: '600' },
  waitlistBadge: { backgroundColor: '#451a03', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  waitlistText: { fontSize: 11, color: '#fbbf24', fontWeight: '600' },
  attendedBadge: { backgroundColor: '#14532d', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  attendedText: { fontSize: 11, color: '#4ade80' },
  absentBadge: { backgroundColor: '#1f2937', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  absentText: { fontSize: 11, color: '#4b5563' },
  companionsRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#1e1b4b', borderWidth: 1.5, borderColor: '#030712', justifyContent: 'center', alignItems: 'center', marginRight: -5 },
  avatarMe: { backgroundColor: '#312e81', borderColor: '#6366f1' },
  avatarText: { fontSize: 9, fontWeight: '600', color: '#a5b4fc' },
  avatarMore: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#1f2937', borderWidth: 1.5, borderColor: '#030712', justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  avatarMoreText: { fontSize: 8, color: '#6b7280' },
  companionsCount: { fontSize: 11, color: '#4b5563', marginLeft: 8 },
  cancelBtn: { borderWidth: 1, borderColor: '#374151', borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  cancelBtnDisabled: { borderColor: '#1f2937' },
  cancelBtnText: { fontSize: 13, color: '#6b7280' },
  cancelBtnTextDisabled: { color: '#374151', fontSize: 11 },
})
