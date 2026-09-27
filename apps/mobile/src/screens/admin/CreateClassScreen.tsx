import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert
} from 'react-native'
import api from '../../lib/api'
import { BottomSheet } from '../../components/BottomSheet'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function CreateClassScreen({ navigation }: any) {
  const [classTypes, setClassTypes] = useState<any[]>([])
  const [coaches, setCoaches] = useState<any[]>([])
  const [form, setForm] = useState({
    classTypeId: '', coachId: '', date: '', startTime: '', endTime: '',
    capacity: '12', frequency: 'ONCE', recurringUntil: '',
  })
  const [recurringDays, setRecurringDays] = useState<number[]>([])
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [showCoachPicker, setShowCoachPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/class-types'),
      api.get('/users?role=COACH,ADMIN'),
    ]).then(([t, c]) => {
      setClassTypes(t.data)
      setCoaches(c.data)
    }).finally(() => setLoading(false))
  }, [])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const toggleDay = (d: number) => {
    setRecurringDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  const handleSave = async () => {
    if (!form.classTypeId) return Alert.alert('Error', 'Selecciona el tipo de clase')
    if (!form.coachId) return Alert.alert('Error', 'Selecciona un coach')
    if (!form.date) return Alert.alert('Error', 'Ingresa la fecha (AAAA-MM-DD)')
    if (!form.startTime || !form.endTime) return Alert.alert('Error', 'Ingresa horario de inicio y fin (HH:MM)')

    const startsAt = `${form.date}T${form.startTime}:00`
    const endsAt = `${form.date}T${form.endTime}:00`

    const body: any = {
      classTypeId: form.classTypeId,
      coachId: form.coachId,
      startsAt,
      endsAt,
      capacity: parseInt(form.capacity) || 12,
      frequency: form.frequency,
    }

    if (form.frequency === 'RECURRING') {
      if (recurringDays.length === 0) return Alert.alert('Error', 'Selecciona al menos un día de la semana')
      body.recurringDays = recurringDays
      body.recurringUntil = form.recurringUntil || undefined
    }

    setSaving(true)
    try {
      const { data } = await api.post('/classes', body)
      const msg = data.created ? `${data.created} clases creadas` : 'Clase creada'
      Alert.alert('✅ ' + msg, '', [{ text: 'OK', onPress: () => navigation.goBack() }])
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo crear la clase')
    } finally { setSaving(false) }
  }

  const selectedType = classTypes.find(t => t.id === form.classTypeId)
  const selectedCoach = coaches.find(c => c.id === form.coachId)

  if (loading) return <View style={s.center}><ActivityIndicator color="#6366f1" size={36} /></View>

  return (
    <ScrollView style={s.container} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.title}>Nueva clase</Text>
      </View>

      <View style={s.section}>
        <Text style={s.label}>Tipo de clase *</Text>
        <TouchableOpacity style={s.picker} onPress={() => setShowTypePicker(true)}>
          {selectedType ? (
            <View style={s.pickerSelected}>
              <View style={[s.dot, { backgroundColor: selectedType.color || '#6366f1' }]} />
              <Text style={s.pickerText}>{selectedType.name}</Text>
            </View>
          ) : (
            <Text style={s.pickerPlaceholder}>Seleccionar tipo...</Text>
          )}
          <Text style={s.pickerArrow}>▾</Text>
        </TouchableOpacity>

        <Text style={s.label}>Coach *</Text>
        <TouchableOpacity style={s.picker} onPress={() => setShowCoachPicker(true)}>
          <Text style={selectedCoach ? s.pickerText : s.pickerPlaceholder}>
            {selectedCoach ? selectedCoach.name : 'Seleccionar coach...'}
          </Text>
          <Text style={s.pickerArrow}>▾</Text>
        </TouchableOpacity>

        <Text style={s.label}>Fecha (AAAA-MM-DD) *</Text>
        <TextInput style={s.input} placeholder="2026-04-01" placeholderTextColor="#4b5563" value={form.date} onChangeText={v => set('date', v)} />

        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Inicio (HH:MM) *</Text>
            <TextInput style={s.input} placeholder="07:00" placeholderTextColor="#4b5563" value={form.startTime} onChangeText={v => set('startTime', v)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Fin (HH:MM) *</Text>
            <TextInput style={s.input} placeholder="08:00" placeholderTextColor="#4b5563" value={form.endTime} onChangeText={v => set('endTime', v)} />
          </View>
        </View>

        <Text style={s.label}>Capacidad</Text>
        <TextInput style={s.input} placeholder="12" placeholderTextColor="#4b5563" value={form.capacity} onChangeText={v => set('capacity', v)} keyboardType="numeric" />

        <Text style={s.label}>Frecuencia</Text>
        <View style={s.freqRow}>
          {['ONCE', 'RECURRING'].map(f => (
            <TouchableOpacity
              key={f}
              style={[s.freqBtn, form.frequency === f && s.freqBtnActive]}
              onPress={() => set('frequency', f)}
            >
              <Text style={[s.freqText, form.frequency === f && s.freqTextActive]}>
                {f === 'ONCE' ? 'Una vez' : 'Recurrente'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {form.frequency === 'RECURRING' && (
          <>
            <Text style={s.label}>Días de la semana</Text>
            <View style={s.daysRow}>
              {DAYS.map((d, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.dayBtn, recurringDays.includes(i) && s.dayBtnActive]}
                  onPress={() => toggleDay(i)}
                >
                  <Text style={[s.dayText, recurringDays.includes(i) && s.dayTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Repetir hasta (AAAA-MM-DD)</Text>
            <TextInput style={s.input} placeholder="2026-06-30" placeholderTextColor="#4b5563" value={form.recurringUntil} onChangeText={v => set('recurringUntil', v)} />
          </>
        )}
      </View>

      <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Crear clase</Text>}
      </TouchableOpacity>

      {/* Type Picker BottomSheet */}
      <BottomSheet
        visible={showTypePicker}
        onClose={() => setShowTypePicker(false)}
        title="Tipo de clase"
        scrollable={true}
      >
        <View style={{ paddingHorizontal: 24 }}>
          {classTypes.map(t => (
            <TouchableOpacity key={t.id} style={s.sheetItem} onPress={() => { set('classTypeId', t.id); setShowTypePicker(false) }}>
              <View style={[s.dot, { backgroundColor: t.color || '#6366f1' }]} />
              <Text style={s.sheetItemText}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      {/* Coach Picker BottomSheet */}
      <BottomSheet
        visible={showCoachPicker}
        onClose={() => setShowCoachPicker(false)}
        title="Coach"
        scrollable={true}
      >
        <View style={{ paddingHorizontal: 24 }}>
          {coaches.map(c => (
            <TouchableOpacity key={c.id} style={s.sheetItem} onPress={() => { set('coachId', c.id); setShowCoachPicker(false) }}>
              <Text style={s.sheetItemText}>{c.name}</Text>
              <Text style={s.sheetItemSub}>{c.role}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  back: { alignSelf: 'flex-start', marginBottom: 12 },
  backText: { color: '#6366f1', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  section: { paddingHorizontal: 24, gap: 6 },
  label: { fontSize: 13, color: '#9ca3af', fontWeight: '600', marginTop: 12 },
  input: { backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#1f2937' },
  row: { flexDirection: 'row', gap: 12 },
  picker: { backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  pickerSelected: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerText: { color: '#fff', fontSize: 15 },
  pickerPlaceholder: { color: '#4b5563', fontSize: 15 },
  pickerArrow: { color: '#6b7280' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  freqRow: { flexDirection: 'row', gap: 10 },
  freqBtn: { flex: 1, backgroundColor: '#111827', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  freqBtnActive: { backgroundColor: '#6366f120', borderColor: '#6366f1' },
  freqText: { color: '#6b7280', fontWeight: '600' },
  freqTextActive: { color: '#6366f1' },
  daysRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dayBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  dayBtnActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  dayText: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  dayTextActive: { color: '#fff' },
  saveBtn: { margin: 24, backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  sheetItemText: { color: '#fff', fontSize: 16, flex: 1 },
  sheetItemSub: { color: '#6b7280', fontSize: 12 },
})
