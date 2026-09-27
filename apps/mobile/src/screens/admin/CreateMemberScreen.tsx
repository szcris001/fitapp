import React, { useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert
} from 'react-native'
import api from '../../lib/api'

export default function CreateMemberScreen({ navigation }: any) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '', gender: '', birthDate: '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      return Alert.alert('Error', 'Nombre, email y contraseña son obligatorios')
    }
    setSaving(true)
    try {
      await api.post('/users', {
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        gender: form.gender || undefined,
        birthDate: form.birthDate || undefined,
        role: 'MEMBER',
      })
      Alert.alert('✅ Alumno creado', '', [{ text: 'OK', onPress: () => navigation.goBack() }])
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo crear el alumno')
    } finally { setSaving(false) }
  }

  return (
    <ScrollView style={s.container} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.title}>Nuevo alumno</Text>
      </View>

      <View style={s.section}>
        <Text style={s.label}>Nombre *</Text>
        <TextInput style={s.input} placeholder="Juan Pérez" placeholderTextColor="#4b5563" value={form.name} onChangeText={v => set('name', v)} />

        <Text style={s.label}>Email *</Text>
        <TextInput style={s.input} placeholder="juan@email.com" placeholderTextColor="#4b5563" value={form.email} onChangeText={v => set('email', v)} autoCapitalize="none" keyboardType="email-address" />

        <Text style={s.label}>Contraseña *</Text>
        <TextInput style={s.input} placeholder="••••••••" placeholderTextColor="#4b5563" value={form.password} onChangeText={v => set('password', v)} secureTextEntry />

        <Text style={s.label}>Teléfono</Text>
        <TextInput style={s.input} placeholder="+56 9 1234 5678" placeholderTextColor="#4b5563" value={form.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" />

        <Text style={s.label}>Género</Text>
        <View style={s.genderRow}>
          {['M', 'F'].map(g => (
            <TouchableOpacity
              key={g}
              style={[s.genderBtn, form.gender === g && s.genderBtnActive]}
              onPress={() => set('gender', form.gender === g ? '' : g)}
            >
              <Text style={[s.genderText, form.gender === g && s.genderTextActive]}>
                {g === 'M' ? 'Masculino' : 'Femenino'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Fecha de nacimiento</Text>
        <TextInput style={s.input} placeholder="1990-01-15" placeholderTextColor="#4b5563" value={form.birthDate} onChangeText={v => set('birthDate', v)} />
      </View>

      <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Crear alumno</Text>}
      </TouchableOpacity>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 },
  back: { alignSelf: 'flex-start', marginBottom: 12 },
  backText: { color: '#6366f1', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  section: { paddingHorizontal: 24, gap: 6 },
  label: { fontSize: 13, color: '#9ca3af', fontWeight: '600', marginTop: 12 },
  input: { backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#1f2937' },
  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: { flex: 1, backgroundColor: '#111827', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  genderBtnActive: { backgroundColor: '#6366f120', borderColor: '#6366f1' },
  genderText: { color: '#6b7280', fontWeight: '600' },
  genderTextActive: { color: '#6366f1' },
  saveBtn: { margin: 24, backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
