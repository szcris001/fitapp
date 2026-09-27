import React, { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../lib/api'

export default function StaffScreen({ navigation }: any) {
  const [staff, setStaff] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'COACH' })
  const [saving, setSaving] = useState(false)

  const fetchStaff = async () => {
    try {
      const { data } = await api.get('/users?role=COACH,ADMIN')
      setStaff(data)
    } catch { }
    finally { setLoading(false); setRefreshing(false) }
  }

  useFocusEffect(useCallback(() => { fetchStaff() }, []))

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      return Alert.alert('Error', 'Nombre, email y contraseña son obligatorios')
    }
    setSaving(true)
    try {
      await api.post('/users', { ...form, phone: form.phone || undefined })
      setShowForm(false)
      setForm({ name: '', email: '', password: '', phone: '', role: 'COACH' })
      fetchStaff()
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo crear el miembro')
    } finally { setSaving(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#6366f1" size={36} /></View>

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.back}>← Volver</Text>
          </TouchableOpacity>
          <Text style={s.title}>Personal</Text>
        </View>
        <TouchableOpacity style={s.newBtn} onPress={() => setShowForm(v => !v)}>
          <Text style={s.newBtnText}>{showForm ? '✕ Cancelar' : '+ Nuevo'}</Text>
        </TouchableOpacity>
      </View>

      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>Nuevo staff</Text>
          <Text style={s.label}>Nombre *</Text>
          <TextInput style={s.input} placeholder="Nombre completo" placeholderTextColor="#4b5563" value={form.name} onChangeText={v => set('name', v)} />
          <Text style={s.label}>Email *</Text>
          <TextInput style={s.input} placeholder="email@gym.com" placeholderTextColor="#4b5563" value={form.email} onChangeText={v => set('email', v)} autoCapitalize="none" keyboardType="email-address" />
          <Text style={s.label}>Contraseña *</Text>
          <TextInput style={s.input} placeholder="••••••••" placeholderTextColor="#4b5563" value={form.password} onChangeText={v => set('password', v)} secureTextEntry />
          <Text style={s.label}>Teléfono</Text>
          <TextInput style={s.input} placeholder="+56 9..." placeholderTextColor="#4b5563" value={form.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" />
          <Text style={s.label}>Rol</Text>
          <View style={s.roleRow}>
            {['COACH', 'ADMIN'].map(r => (
              <TouchableOpacity key={r} style={[s.roleBtn, form.role === r && s.roleBtnActive]} onPress={() => set('role', r)}>
                <Text style={[s.roleText, form.role === r && s.roleTextActive]}>{r === 'COACH' ? 'Coach' : 'Admin'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.saveBtn} onPress={handleCreate} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size={16} /> : <Text style={s.saveText}>Crear</Text>}
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchStaff() }} tintColor="#6366f1" />}
      >
        {staff.map(m => (
          <View key={m.id} style={s.staffCard}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{m.name?.[0]?.toUpperCase()}</Text>
            </View>
            <View style={s.info}>
              <Text style={s.staffName}>{m.name}</Text>
              <Text style={s.staffEmail}>{m.email}</Text>
            </View>
            <View style={[s.roleBadge, m.role === 'ADMIN' ? s.roleBadgeAdmin : s.roleBadgeCoach]}>
              <Text style={[s.roleBadgeText, m.role === 'ADMIN' ? s.roleBadgeTextAdmin : s.roleBadgeTextCoach]}>
                {m.role === 'ADMIN' ? 'Admin' : 'Coach'}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 },
  headerLeft: { gap: 4 },
  back: { color: '#6366f1', fontSize: 14, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  newBtn: { backgroundColor: '#6366f1', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  formCard: { marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#6366f1', marginBottom: 16 },
  formTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  label: { fontSize: 12, color: '#9ca3af', fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: '#1f2937', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#374151' },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleBtn: { flex: 1, backgroundColor: '#1f2937', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#374151' },
  roleBtnActive: { backgroundColor: '#6366f120', borderColor: '#6366f1' },
  roleText: { color: '#6b7280', fontWeight: '600' },
  roleTextActive: { color: '#6366f1' },
  saveBtn: { backgroundColor: '#6366f1', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  saveText: { color: '#fff', fontWeight: '700' },
  list: { flex: 1, paddingHorizontal: 24 },
  staffCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#1f2937', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6366f120', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#6366f1', fontWeight: '800', fontSize: 18 },
  info: { flex: 1 },
  staffName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  staffEmail: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  roleBadgeCoach: { backgroundColor: '#6366f120' },
  roleBadgeAdmin: { backgroundColor: '#a855f720' },
  roleBadgeText: { fontSize: 12, fontWeight: '700' },
  roleBadgeTextCoach: { color: '#6366f1' },
  roleBadgeTextAdmin: { color: '#a855f7' },
})
