import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert, TextInput
} from 'react-native'
import api from '../../lib/api'

export default function AssignStudentScreen({ route, navigation }: any) {
  const { classId, className } = route.params
  const [users, setUsers] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)

  useEffect(() => { fetchUsers() }, [])

  useEffect(() => {
    if (search.trim() === '') {
      setFiltered(users)
    } else {
      const q = search.toLowerCase()
      setFiltered(users.filter(u =>
        u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
      ))
    }
  }, [search, users])

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/users')
      setUsers(data)
      setFiltered(data)
    } catch {
      Alert.alert('Error', 'No se pudo cargar la lista de alumnos')
    } finally {
      setLoading(false)
    }
  }

  const handleAssign = async (userId: string, userName: string) => {
    Alert.alert(
      'Asignar alumno',
      `¿Inscribir a ${userName} en ${className}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Inscribir',
          onPress: async () => {
            setAssigning(userId)
            try {
              await api.post('/bookings/assign', { classId, userId })
              Alert.alert('✅ Listo', `${userName} fue inscrito en la clase`, [
                { text: 'OK', onPress: () => navigation.goBack() }
              ])
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.error || 'No se pudo inscribir al alumno')
            } finally {
              setAssigning(null)
            }
          }
        }
      ]
    )
  }

  const getMembershipStatus = (user: any) => {
    const memberships = user.memberships || []
    const active = memberships.find((m: any) => m.status === 'ACTIVE' || m.status === 'TRIAL')
    return active ? active.status : null
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#6366f1" size={36} /></View>
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Agregar alumno</Text>
        <Text style={styles.subtitle}>{className}</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre o email..."
          placeholderTextColor="#4b5563"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No se encontraron alumnos</Text>
          </View>
        ) : (
          filtered.map(user => {
            const memberStatus = getMembershipStatus(user)
            return (
              <View key={user.id} style={styles.userRow}>
                <View style={styles.userInfo}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{user.name?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                  </View>
                  {memberStatus && (
                    <View style={[
                      styles.memBadge,
                      memberStatus === 'TRIAL' ? styles.memBadgeTrial : styles.memBadgeActive
                    ]}>
                      <Text style={[
                        styles.memBadgeText,
                        memberStatus === 'TRIAL' ? styles.memBadgeTextTrial : styles.memBadgeTextActive
                      ]}>
                        {memberStatus === 'TRIAL' ? 'Prueba' : 'Activo'}
                      </Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.assignBtn}
                  onPress={() => handleAssign(user.id, user.name)}
                  disabled={assigning === user.id}
                >
                  {assigning === user.id
                    ? <ActivityIndicator color="#fff" size={16} />
                    : <Text style={styles.assignBtnText}>Inscribir</Text>
                  }
                </TouchableOpacity>
              </View>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 },
  backBtn: { alignSelf: 'flex-start', marginBottom: 12 },
  backText: { color: '#6366f1', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  searchContainer: { paddingHorizontal: 24, marginBottom: 12 },
  searchInput: { backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#1f2937' },
  list: { flex: 1, paddingHorizontal: 24 },
  empty: { backgroundColor: '#111827', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  emptyText: { color: '#4b5563', fontSize: 14 },
  userRow: { backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#1f2937', gap: 10 },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366f120', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#6366f1', fontWeight: '700', fontSize: 15 },
  userName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  userEmail: { color: '#6b7280', fontSize: 12 },
  memBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  memBadgeActive: { backgroundColor: '#22c55e20' },
  memBadgeTrial: { backgroundColor: '#f59e0b20' },
  memBadgeText: { fontSize: 11, fontWeight: '700' },
  memBadgeTextActive: { color: '#22c55e' },
  memBadgeTextTrial: { color: '#f59e0b' },
  assignBtn: { backgroundColor: '#6366f1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  assignBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
})
