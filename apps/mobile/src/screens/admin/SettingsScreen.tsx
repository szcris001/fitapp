import React, { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../lib/api'
import { useTheme } from '../../theme/ThemeContext'
import { SPORT_THEMES } from '../../theme/themes'

const ATTENDANCE_MODES = [
  { value: 'manual', label: 'Manual', icon: '✋', desc: 'Coach marca desde la app' },
  { value: 'auto',   label: 'Automático', icon: '⚡', desc: 'Se marca al finalizar clase' },
] as const

export default function SettingsScreen({ navigation }: any) {
  const [gym, setGym] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [savingWaitlist, setSavingWaitlist] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [attendanceForm, setAttendanceForm] = useState({
    attendanceMode: 'manual' as 'manual' | 'auto',
  })
  const [waitlistForm, setWaitlistForm] = useState({
    waitlistConfirmEnabled: false,
    waitlistConfirmMins: '30',
  })
  const { setSportTheme, theme } = useTheme()
  const c = theme.colors

  const fetchGym = async () => {
    try {
      const { data } = await api.get('/gyms/me')
      setGym(data)
      setForm({
        name: data.name || '',
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        bookingWindowDays: data.bookingWindowDays?.toString() || '1',
        bookingCutoffMins: data.bookingCutoffMins?.toString() || '60',
        cancelCutoffMins: data.cancelCutoffMins?.toString() || '30',
        expiryReminderDays: data.expiryReminderDays?.toString() || '7',
      })
      setAttendanceForm({
        attendanceMode: data.attendanceMode || 'manual',
        gymLat: data.gymLat != null ? String(data.gymLat) : '',
        gymLng: data.gymLng != null ? String(data.gymLng) : '',
        gymRadiusMeters: data.gymRadiusMeters?.toString() || '200',
      })
      setWaitlistForm({
        waitlistConfirmEnabled: data.waitlistConfirmEnabled ?? false,
        waitlistConfirmMins: data.waitlistConfirmMins?.toString() || '30',
      })
    } catch { }
    finally { setLoading(false); setRefreshing(false) }
  }

  useFocusEffect(useCallback(() => { fetchGym() }, []))

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/gyms/me', {
        name: form.name,
        address: form.address || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        bookingWindowDays: parseInt(form.bookingWindowDays) || 1,
        bookingCutoffMins: parseInt(form.bookingCutoffMins) || 60,
        cancelCutoffMins: parseInt(form.cancelCutoffMins) || 30,
        expiryReminderDays: parseInt(form.expiryReminderDays) || 7,
      })
      Alert.alert('✅ Configuración guardada')
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  const handleSaveAttendance = async () => {
    setSavingAttendance(true)
    try {
      await api.put('/gyms/me', {
        attendanceMode: attendanceForm.attendanceMode,
        gymLat: attendanceForm.gymLat ? Number(attendanceForm.gymLat) : null,
        gymLng: attendanceForm.gymLng ? Number(attendanceForm.gymLng) : null,
        gymRadiusMeters: parseInt(attendanceForm.gymRadiusMeters) || 200,
      })
      Alert.alert('✅ Asistencia guardada')
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo guardar')
    } finally { setSavingAttendance(false) }
  }

  const handleSaveWaitlist = async () => {
    setSavingWaitlist(true)
    try {
      await api.put('/gyms/me', {
        waitlistConfirmEnabled: waitlistForm.waitlistConfirmEnabled,
        waitlistConfirmMins: parseInt(waitlistForm.waitlistConfirmMins) || 30,
      })
      Alert.alert('✅ Lista de espera guardada')
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo guardar')
    } finally { setSavingWaitlist(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#6366f1" size={36} /></View>

  return (
    <ScrollView
      style={s.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchGym() }} tintColor="#6366f1" />}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.title}>Configuración</Text>
      </View>

      {/* Sport theme selector */}
      <Text style={s.sectionTitle}>TEMA DEPORTIVO</Text>
      <View style={[s.section, { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }]}>
        {SPORT_THEMES.map(t => {
          const active = (gym?.sportTheme || 'neutral') === t.id
          return (
            <TouchableOpacity
              key={t.id}
              style={[
                s.themeChip,
                { borderColor: active ? t.primary : '#1f2937', backgroundColor: active ? t.primary + '18' : '#111827' },
              ]}
              onPress={async () => {
                setSportTheme(t.id)
                await api.put('/gyms/me', { sportTheme: t.id }).catch(() => {})
                setGym((g: any) => ({ ...g, sportTheme: t.id }))
              }}
            >
              <Text style={{ fontSize: 18 }}>{t.emoji}</Text>
              <Text style={[s.themeChipLabel, { color: active ? t.primary : '#6b7280' }]}>{t.name}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <Text style={s.sectionTitle}>INFORMACIÓN DEL GYM</Text>
      <View style={s.section}>
        <Text style={s.label}>Nombre</Text>
        <TextInput style={s.input} value={form.name} onChangeText={v => set('name', v)} placeholder="Nombre del gym" placeholderTextColor="#4b5563" />
        <Text style={s.label}>Dirección</Text>
        <TextInput style={s.input} value={form.address} onChangeText={v => set('address', v)} placeholder="Dirección" placeholderTextColor="#4b5563" />
        <Text style={s.label}>Teléfono</Text>
        <TextInput style={s.input} value={form.phone} onChangeText={v => set('phone', v)} placeholder="+56 2 1234 5678" placeholderTextColor="#4b5563" keyboardType="phone-pad" />
        <Text style={s.label}>Email de contacto</Text>
        <TextInput style={s.input} value={form.email} onChangeText={v => set('email', v)} placeholder="gym@email.com" placeholderTextColor="#4b5563" autoCapitalize="none" keyboardType="email-address" />
      </View>

      <Text style={s.sectionTitle}>RESERVAS</Text>
      <View style={s.section}>
        <Text style={s.label}>Ventana de reserva (días antes)</Text>
        <TextInput style={s.input} value={form.bookingWindowDays} onChangeText={v => set('bookingWindowDays', v)} keyboardType="numeric" />
        <Text style={s.hint}>Cuántos días antes puede reservar un alumno. Ej: 1 = solo mañana</Text>

        <Text style={s.label}>Corte de reserva (minutos antes)</Text>
        <TextInput style={s.input} value={form.bookingCutoffMins} onChangeText={v => set('bookingCutoffMins', v)} keyboardType="numeric" />
        <Text style={s.hint}>No se puede reservar dentro de estos minutos antes de la clase</Text>

        <Text style={s.label}>Corte de cancelación (minutos antes)</Text>
        <TextInput style={s.input} value={form.cancelCutoffMins} onChangeText={v => set('cancelCutoffMins', v)} keyboardType="numeric" />
        <Text style={s.hint}>No se puede cancelar dentro de estos minutos antes de la clase</Text>
      </View>

      <Text style={s.sectionTitle}>NOTIFICACIONES</Text>
      <View style={s.section}>
        <Text style={s.label}>Recordatorio de vencimiento (días antes)</Text>
        <TextInput style={s.input} value={form.expiryReminderDays} onChangeText={v => set('expiryReminderDays', v)} keyboardType="numeric" />
        <Text style={s.hint}>Enviar recordatorio automático N días antes de que venza la membresía</Text>
      </View>

      <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Guardar cambios</Text>}
      </TouchableOpacity>

      {/* ── Asistencia ── */}
      <Text style={s.sectionTitle}>CONTROL DE ASISTENCIA</Text>
      <View style={s.section}>
        <Text style={s.hint}>Elige cómo se registra la asistencia a clases.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {ATTENDANCE_MODES.map(opt => {
            const active = attendanceForm.attendanceMode === opt.value
            return (
              <TouchableOpacity key={opt.value}
                style={[s.modeCard, { borderColor: active ? '#6366f1' : '#1f2937', backgroundColor: active ? '#6366f115' : '#111827' }]}
                onPress={() => setAttendanceForm(f => ({ ...f, attendanceMode: opt.value }))}>
                <Text style={{ fontSize: 22 }}>{opt.icon}</Text>
                <Text style={[s.modeLabel, { color: active ? '#a5b4fc' : '#6b7280' }]}>{opt.label}</Text>
                <Text style={s.modeDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

      </View>
      <TouchableOpacity style={[s.saveBtn, { marginTop: 16, backgroundColor: '#4f46e5' }]} onPress={handleSaveAttendance} disabled={savingAttendance}>
        {savingAttendance ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Guardar asistencia</Text>}
      </TouchableOpacity>

      {/* ── Lista de espera ── */}
      <Text style={s.sectionTitle}>LISTA DE ESPERA</Text>
      <View style={s.section}>
        <Text style={s.hint}>Cuando un alumno cancela, el primero en lista de espera recibe un lugar.</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {[
            { value: false, label: 'Directo', icon: '⚡', desc: 'Confirma automático' },
            { value: true,  label: 'Con confirmación', icon: '⏱', desc: 'Debe confirmar a tiempo' },
          ].map(opt => {
            const active = waitlistForm.waitlistConfirmEnabled === opt.value
            return (
              <TouchableOpacity key={String(opt.value)} style={[s.modeCard, { flex: 1, borderColor: active ? '#6366f1' : '#1f2937', backgroundColor: active ? '#6366f115' : '#111827' }]}
                onPress={() => setWaitlistForm(f => ({ ...f, waitlistConfirmEnabled: opt.value }))}>
                <Text style={{ fontSize: 22 }}>{opt.icon}</Text>
                <Text style={[s.modeLabel, { color: active ? '#a5b4fc' : '#6b7280' }]}>{opt.label}</Text>
                <Text style={s.modeDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {waitlistForm.waitlistConfirmEnabled && (
          <View style={{ marginTop: 12 }}>
            <Text style={s.label}>Minutos para confirmar</Text>
            <TextInput style={s.input} value={waitlistForm.waitlistConfirmMins} keyboardType="numeric"
              placeholder="30" placeholderTextColor="#4b5563"
              onChangeText={v => setWaitlistForm(f => ({ ...f, waitlistConfirmMins: v }))} />
            <Text style={s.hint}>Si no confirma en este tiempo el lugar pasa al siguiente.</Text>
          </View>
        )}
      </View>
      <TouchableOpacity style={[s.saveBtn, { marginTop: 16, backgroundColor: '#4f46e5' }]} onPress={handleSaveWaitlist} disabled={savingWaitlist}>
        {savingWaitlist ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Guardar lista de espera</Text>}
      </TouchableOpacity>

      <View style={{ height: 48 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  back: { color: '#6366f1', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  sectionTitle: { fontSize: 12, color: '#6b7280', fontWeight: '700', paddingHorizontal: 24, marginTop: 20, marginBottom: 8, letterSpacing: 0.5 },
  section: { paddingHorizontal: 24, gap: 4 },
  label: { fontSize: 13, color: '#9ca3af', fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#1f2937' },
  hint: { fontSize: 12, color: '#4b5563', marginTop: 4 },
  saveBtn: { margin: 24, backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  themeChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  themeChipLabel: { fontSize: 13, fontWeight: '700' },
  modeCard: { flex: 1, padding: 12, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', gap: 4 },
  modeLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  modeDesc: { fontSize: 10, color: '#4b5563', textAlign: 'center' },
})
