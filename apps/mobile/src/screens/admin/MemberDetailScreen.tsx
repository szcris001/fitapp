import React, { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useAuthStore } from '../../store/auth.store'
import api from '../../lib/api'

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#22c55e', TRIAL: '#f59e0b', EXPIRED: '#ef4444', INACTIVE: '#6b7280',
}
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo', TRIAL: 'En prueba', EXPIRED: 'Vencida', INACTIVE: 'Sin membresía',
  CONFIRMED: 'Confirmado', ATTENDED: 'Asistió', WAITLIST: 'En espera', CANCELLED: 'Cancelado',
}

export default function MemberDetailScreen({ route, navigation }: any) {
  const { memberId } = route.params
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const [member, setMember] = useState<any>(null)
  const [rms, setRms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [renewing, setRenewing] = useState(false)

  const fetchData = async () => {
    try {
      const [memberRes, rmsRes] = await Promise.all([
        api.get(`/users/${memberId}`),
        api.get(`/rms/user/${memberId}`),
      ])
      setMember(memberRes.data)
      setRms(rmsRes.data)
    } catch { }
    finally { setLoading(false); setRefreshing(false) }
  }

  useFocusEffect(useCallback(() => { fetchData() }, [memberId]))

  const handleRenew = async () => {
    Alert.alert('Renovar membresía', '¿Renovar con el mismo plan?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Renovar', onPress: async () => {
          setRenewing(true)
          try {
            await api.post(`/memberships/${memberId}/renew`)
            Alert.alert('✅ Membresía renovada')
            fetchData()
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.error || 'No se pudo renovar')
          } finally { setRenewing(false) }
        }
      }
    ])
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#6366f1" size={36} /></View>
  if (!member) return <View style={s.center}><Text style={s.muted}>Alumno no encontrado</Text></View>

  const activeMembership = member.memberships?.find((m: any) =>
    m.status === 'ACTIVE' || m.status === 'TRIAL'
  )
  const allMemberships = member.memberships || []
  const membershipStatus = activeMembership
    ? (new Date(activeMembership.endsAt) > new Date() ? activeMembership.status : 'EXPIRED')
    : 'INACTIVE'
  const daysLeft = activeMembership?.endsAt
    ? Math.ceil((new Date(activeMembership.endsAt).getTime() - Date.now()) / 86400000)
    : null

  const bestRms: Record<string, any> = {}
  for (const rm of rms) {
    if (!bestRms[rm.movementName] || rm.weightKg > bestRms[rm.movementName].weightKg) {
      bestRms[rm.movementName] = rm
    }
  }

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor="#6366f1" />}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>
      </View>

      <View style={s.profileCard}>
        <View style={s.avatarLg}>
          <Text style={s.avatarLgText}>{member.name?.[0]?.toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.memberName}>{member.name}</Text>
          <Text style={s.memberEmail}>{member.email}</Text>
          {member.phone && <Text style={s.memberInfo}>📱 {member.phone}</Text>}
          {member.gender && <Text style={s.memberInfo}>⚥ {member.gender === 'M' ? 'Masculino' : 'Femenino'}</Text>}
        </View>
      </View>

      {isAdmin && (
        <TouchableOpacity style={s.editBtn} onPress={() => navigation.navigate('EditMember', { memberId })}>
          <Text style={s.editBtnText}>✏️ Editar perfil</Text>
        </TouchableOpacity>
      )}

      <Text style={s.sectionTitle}>MEMBRESÍA</Text>
      <View style={s.card}>
        <View style={s.rowBetween}>
          <Text style={s.cardLabel}>Estado</Text>
          <View style={[s.badge, { backgroundColor: STATUS_COLOR[membershipStatus] + '20' }]}>
            <Text style={[s.badgeText, { color: STATUS_COLOR[membershipStatus] }]}>
              {STATUS_LABEL[membershipStatus]}
            </Text>
          </View>
        </View>
        {activeMembership && (
          <>
            <View style={s.rowBetween}>
              <Text style={s.cardLabel}>Plan</Text>
              <Text style={s.cardValue}>{activeMembership.plan?.name}</Text>
            </View>
            <View style={s.rowBetween}>
              <Text style={s.cardLabel}>Vence</Text>
              <Text style={[s.cardValue, daysLeft !== null && daysLeft <= 7 ? { color: '#f59e0b' } : {}]}>
                {new Date(activeMembership.endsAt).toLocaleDateString('es-CL')}
                {daysLeft !== null && daysLeft > 0 ? ` (${daysLeft}d)` : ''}
              </Text>
            </View>
          </>
        )}
        {isAdmin && (
          <View style={s.membershipActions}>
            {activeMembership && (
              <TouchableOpacity style={s.renewBtn} onPress={handleRenew} disabled={renewing}>
                {renewing ? <ActivityIndicator color="#fff" size={16} /> : <Text style={s.renewBtnText}>🔄 Renovar</Text>}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.assignBtn}
              onPress={() => navigation.navigate('AssignMembership', { memberId, memberName: member.name })}
            >
              <Text style={s.assignBtnText}>💳 Asignar plan</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {allMemberships.length > 0 && (
        <>
          <Text style={s.sectionTitle}>HISTORIAL DE MEMBRESÍAS</Text>
          {allMemberships.slice(0, 5).map((ms: any) => (
            <View key={ms.id} style={s.histRow}>
              <View>
                <Text style={s.histPlan}>{ms.plan?.name}</Text>
                <Text style={s.histDates}>
                  {new Date(ms.startsAt).toLocaleDateString('es-CL')} → {new Date(ms.endsAt).toLocaleDateString('es-CL')}
                </Text>
              </View>
              <View style={[s.badge, { backgroundColor: STATUS_COLOR[ms.status] + '20' }]}>
                <Text style={[s.badgeText, { color: STATUS_COLOR[ms.status] }]}>{STATUS_LABEL[ms.status] || ms.status}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {Object.keys(bestRms).length > 0 && (
        <>
          <Text style={s.sectionTitle}>RÉCORDS PERSONALES</Text>
          <View style={s.rmsGrid}>
            {Object.values(bestRms).map((rm: any) => (
              <View key={rm.id} style={s.rmCard}>
                <Text style={s.rmKg}>{rm.weightKg} kg</Text>
                <Text style={s.rmName}>{rm.movementName}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  muted: { color: '#6b7280', fontSize: 16 },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  back: { alignSelf: 'flex-start' },
  backText: { color: '#6366f1', fontSize: 16, fontWeight: '600' },
  profileCard: { flexDirection: 'row', gap: 16, alignItems: 'flex-start', paddingHorizontal: 24, paddingVertical: 16 },
  avatarLg: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#6366f120', justifyContent: 'center', alignItems: 'center' },
  avatarLgText: { color: '#6366f1', fontWeight: '800', fontSize: 24 },
  memberName: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  memberEmail: { fontSize: 14, color: '#6b7280' },
  memberInfo: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  editBtn: { marginHorizontal: 24, marginBottom: 8, backgroundColor: '#1f2937', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  editBtnText: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 12, color: '#6b7280', fontWeight: '700', paddingHorizontal: 24, marginTop: 16, marginBottom: 8, letterSpacing: 0.5 },
  card: { marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#1f2937', gap: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: '#6b7280', fontSize: 14 },
  cardValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  membershipActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  renewBtn: { flex: 1, backgroundColor: '#22c55e', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  renewBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  assignBtn: { flex: 1, backgroundColor: '#6366f1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  assignBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#1f2937' },
  histPlan: { color: '#fff', fontSize: 14, fontWeight: '600' },
  histDates: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  rmsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, gap: 8, paddingBottom: 24 },
  rmCard: { backgroundColor: '#111827', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1f2937', minWidth: '30%', alignItems: 'center' },
  rmKg: { fontSize: 20, fontWeight: '800', color: '#6366f1' },
  rmName: { fontSize: 11, color: '#6b7280', marginTop: 4, textAlign: 'center' },
})
