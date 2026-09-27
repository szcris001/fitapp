import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface Notification {
  id: string
  type: 'wod' | 'booking' | 'membership' | 'rm' | 'cancel'
  title: string
  body: string
  time: string
  read: boolean
  action?: string
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const typeColor: Record<string, string> = {
    wod: '#6366f1', booking: '#22c55e', membership: '#f59e0b', rm: '#a855f7', cancel: '#ef4444'
  }

  useEffect(() => { loadNotifications() }, [])

  const loadNotifications = async () => {
    try {
      const stored = await AsyncStorage.getItem('fitapp_notifications')
      if (stored) { setNotifications(JSON.parse(stored)); return }
      const mock: Notification[] = [
        { id: '1', type: 'wod', title: 'WOD publicado', body: 'El entrenamiento de mañana ya está disponible.', time: 'Hace 5 min', read: false, action: 'Ver WOD' },
        { id: '2', type: 'booking', title: 'Reserva confirmada', body: 'CrossFit · Mañana 08:00. ¡Te esperamos!', time: 'Hace 1 hora', read: false },
        { id: '3', type: 'membership', title: 'Membresía por vencer', body: 'Quedan 7 días de tu Plan Mensual.', time: 'Ayer', read: false, action: 'Renovar plan' },
        { id: '4', type: 'rm', title: 'Nuevo récord personal', body: '¡Felicitaciones! 80kg en Back Squat.', time: 'Hace 3 días', read: true },
        { id: '5', type: 'cancel', title: 'Clase cancelada', body: 'La clase del miércoles fue cancelada.', time: 'Hace 5 días', read: true },
      ]
      setNotifications(mock)
      await AsyncStorage.setItem('fitapp_notifications', JSON.stringify(mock))
    } catch {}
    finally { setRefreshing(false) }
  }

  const markAllRead = async () => {
    const updated = notifications.map(n => ({ ...n, read: true }))
    setNotifications(updated)
    await AsyncStorage.setItem('fitapp_notifications', JSON.stringify(updated))
  }

  const markRead = async (id: string) => {
    const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n)
    setNotifications(updated)
    await AsyncStorage.setItem('fitapp_notifications', JSON.stringify(updated))
  }

  const unread = notifications.filter(n => !n.read)
  const read = notifications.filter(n => n.read)

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNotifications() }} tintColor="#6366f1" />}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Notificaciones</Text>
          {unread.length > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread.length}</Text></View>}
        </View>
        {unread.length > 0 && <TouchableOpacity onPress={markAllRead}><Text style={styles.markAll}>Marcar todo leído</Text></TouchableOpacity>}
      </View>

      {unread.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Nuevas</Text>
          {unread.map(n => (
            <TouchableOpacity key={n.id} style={styles.card} onPress={() => markRead(n.id)}>
              <View style={[styles.dot, { backgroundColor: typeColor[n.type] }]} />
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{n.title}</Text>
                  <Text style={styles.cardTime}>{n.time}</Text>
                </View>
                <Text style={styles.cardBody}>{n.body}</Text>
                {n.action && (
                  <View style={[styles.actionBtn, { borderColor: typeColor[n.type] + '60' }]}>
                    <Text style={[styles.actionBtnText, { color: typeColor[n.type] }]}>{n.action} →</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {read.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Anteriores</Text>
          {read.map(n => (
            <View key={n.id} style={[styles.card, styles.cardRead]}>
              <View style={[styles.dot, { backgroundColor: '#374151' }]} />
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: '#9ca3af' }]}>{n.title}</Text>
                  <Text style={styles.cardTime}>{n.time}</Text>
                </View>
                <Text style={[styles.cardBody, { color: '#6b7280' }]}>{n.body}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff' },
  badge: { backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  markAll: { fontSize: 12, color: '#6b7280' },
  section: { paddingHorizontal: 24, marginBottom: 8 },
  sectionLabel: { fontSize: 11, color: '#4b5563', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  card: { backgroundColor: '#111827', borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: '#1f2937' },
  cardRead: { opacity: 0.55 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0 },
  cardContent: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#f9fafb', flex: 1 },
  cardTime: { fontSize: 10, color: '#4b5563' },
  cardBody: { fontSize: 12, color: '#9ca3af', lineHeight: 18 },
  actionBtn: { marginTop: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  actionBtnText: { fontSize: 11, fontWeight: '500' },
})
