import React from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native'
import { useAuthStore } from '../../store/auth.store'

const ADMIN_ITEMS = [
  { icon: '💰', label: 'Planes', route: 'Plans', color: '#22c55e' },
  { icon: '💵', label: 'Pagos', route: 'Payments', color: '#f59e0b' },
  { icon: '👥', label: 'Personal', route: 'Staff', color: '#6366f1' },
  { icon: '📊', label: 'Reportes', route: 'Reports', color: '#8b5cf6' },
  { icon: '🤖', label: 'Alertas IA', route: 'AIAlerts', color: '#ec4899' },
  { icon: '📣', label: 'Comunicación', route: 'Communications', color: '#06b6d4' },
  { icon: '⚙️', label: 'Configuración', route: 'Settings', color: '#6b7280' },
  { icon: '🎨', label: 'Temas', route: 'ThemeDemo', color: '#8b5cf6' },
  { icon: '👤', label: 'Mi perfil', route: 'Profile', color: '#9ca3af' },
]

const COACH_ITEMS = [
  { icon: '👤', label: 'Mi perfil', route: 'Profile', color: '#9ca3af' },
]

export default function MoreScreen({ navigation }: any) {
  const { user, logout } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const items = isAdmin ? ADMIN_ITEMS : COACH_ITEMS

  return (
    <ScrollView style={s.container}>
      <Text style={s.title}>Más</Text>

      <View style={s.grid}>
        {items.map(item => (
          <TouchableOpacity
            key={item.route}
            style={s.card}
            onPress={() => navigation.navigate(item.route)}
            activeOpacity={0.8}
          >
            <View style={[s.iconWrap, { backgroundColor: item.color + '20' }]}>
              <Text style={s.icon}>{item.icon}</Text>
            </View>
            <Text style={s.cardLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.userInfo}>
        <View style={s.userAvatar}>
          <Text style={s.userAvatarText}>{user?.name?.[0]?.toUpperCase()}</Text>
        </View>
        <View>
          <Text style={s.userName}>{user?.name}</Text>
          <Text style={s.userEmail}>{user?.email}</Text>
          <Text style={s.userRole}>{user?.role}</Text>
        </View>
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={logout}>
        <Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, gap: 12 },
  card: { width: '47%', backgroundColor: '#111827', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#1f2937', alignItems: 'flex-start', gap: 10 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  icon: { fontSize: 22 },
  cardLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 24, marginTop: 28, backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1f2937' },
  userAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#6366f120', justifyContent: 'center', alignItems: 'center' },
  userAvatarText: { color: '#6366f1', fontWeight: '800', fontSize: 20 },
  userName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  userEmail: { color: '#6b7280', fontSize: 13 },
  userRole: { color: '#6366f1', fontSize: 12, fontWeight: '600', marginTop: 2 },
  logoutBtn: { margin: 24, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#ef444440' },
  logoutText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
})
