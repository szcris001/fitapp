import React, { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, RefreshControl
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useAuthStore } from '../../store/auth.store'
import api from '../../lib/api'

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#22c55e', TRIAL: '#f59e0b', EXPIRED: '#ef4444', INACTIVE: '#6b7280',
}
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo', TRIAL: 'Prueba', EXPIRED: 'Vencido', INACTIVE: 'Inactivo',
}

export default function MembersScreen({ navigation }: any) {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'ACTIVE' | 'TRIAL' | 'EXPIRED'>('all')

  const fetchMembers = async () => {
    try {
      const { data } = await api.get('/users')
      setMembers(data)
    } catch { }
    finally { setLoading(false); setRefreshing(false) }
  }

  useFocusEffect(useCallback(() => { fetchMembers() }, []))

  const getMembershipStatus = (m: any) => {
    const ms = m.memberships?.[0]
    if (!ms) return 'INACTIVE'
    if (ms.status === 'TRIAL') return 'TRIAL'
    if (ms.status === 'ACTIVE') {
      const endsAt = new Date(ms.endsAt)
      return endsAt > new Date() ? 'ACTIVE' : 'EXPIRED'
    }
    return 'INACTIVE'
  }

  const filtered = members.filter(m => {
    const status = getMembershipStatus(m)
    const matchStatus = filter === 'all' || status === filter
    const q = search.toLowerCase()
    const matchSearch = !q || m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  if (loading) return <View style={s.center}><ActivityIndicator color="#6366f1" size={36} /></View>

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Alumnos</Text>
        {isAdmin && (
          <TouchableOpacity style={s.newBtn} onPress={() => navigation.navigate('CreateMember')}>
            <Text style={s.newBtnText}>+ Nuevo</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.searchWrap}>
        <TextInput
          style={s.search}
          placeholder="Buscar nombre o email..."
          placeholderTextColor="#4b5563"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      <View style={s.filters}>
        {(['all', 'ACTIVE', 'TRIAL', 'EXPIRED'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterBtn, filter === f && s.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f === 'all' ? 'Todos' : STATUS_LABEL[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchMembers() }} tintColor="#6366f1" />}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyText}>No se encontraron alumnos</Text></View>
        ) : (
          filtered.map(m => {
            const status = getMembershipStatus(m)
            const ms = m.memberships?.[0]
            const daysLeft = ms?.endsAt ? Math.ceil((new Date(ms.endsAt).getTime() - Date.now()) / 86400000) : null
            return (
              <TouchableOpacity
                key={m.id}
                style={s.card}
                onPress={() => navigation.navigate('MemberDetail', { memberId: m.id })}
                activeOpacity={0.8}
              >
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{m.name?.[0]?.toUpperCase()}</Text>
                </View>
                <View style={s.info}>
                  <Text style={s.name}>{m.name}</Text>
                  <Text style={s.email}>{m.email}</Text>
                  {ms?.plan && <Text style={s.plan}>{ms.plan.name}</Text>}
                </View>
                <View style={s.right}>
                  <View style={[s.badge, { backgroundColor: STATUS_COLOR[status] + '20' }]}>
                    <Text style={[s.badgeText, { color: STATUS_COLOR[status] }]}>{STATUS_LABEL[status]}</Text>
                  </View>
                  {daysLeft !== null && daysLeft > 0 && daysLeft <= 7 && (
                    <Text style={s.expiring}>{daysLeft}d</Text>
                  )}
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff' },
  newBtn: { backgroundColor: '#6366f1', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  searchWrap: { paddingHorizontal: 24, marginBottom: 12 },
  search: { backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#1f2937' },
  filters: { flexDirection: 'row', paddingHorizontal: 24, gap: 8, marginBottom: 12 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937' },
  filterBtnActive: { backgroundColor: '#6366f120', borderColor: '#6366f1' },
  filterText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  filterTextActive: { color: '#6366f1' },
  list: { flex: 1, paddingHorizontal: 24 },
  empty: { backgroundColor: '#111827', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  emptyText: { color: '#4b5563', fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#1f2937', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366f120', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#6366f1', fontWeight: '700', fontSize: 16 },
  info: { flex: 1 },
  name: { color: '#fff', fontSize: 15, fontWeight: '600' },
  email: { color: '#6b7280', fontSize: 12 },
  plan: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  expiring: { fontSize: 11, color: '#f59e0b', fontWeight: '700' },
})
