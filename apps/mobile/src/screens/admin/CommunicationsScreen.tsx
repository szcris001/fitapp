import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert
} from 'react-native'
import api from '../../lib/api'
import { BottomSheet } from '../../components/BottomSheet'

const TARGETS = [
  { id: 'all', label: 'Todos los miembros' },
  { id: 'active', label: 'Miembros activos' },
  { id: 'expiring', label: 'Con membresía por vencer' },
  { id: 'inactive', label: 'Miembros inactivos' },
  { id: 'individual', label: 'Individual' },
]

export default function CommunicationsScreen({ navigation }: any) {
  const [channel, setChannel] = useState<'email' | 'push'>('email')
  const [target, setTarget] = useState('all')
  const [members, setMembers] = useState<any[]>([])
  const [selectedMember, setSelectedMember] = useState<any>(null)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [showMemberPicker, setShowMemberPicker] = useState(false)

  useEffect(() => {
    if (target === 'individual') {
      api.get('/users').then(r => setMembers(r.data)).catch(() => {})
    }
  }, [target])

  const handleSend = async () => {
    if (!message.trim()) return Alert.alert('Error', 'El mensaje es obligatorio')
    if (target === 'individual' && !selectedMember) return Alert.alert('Error', 'Selecciona un miembro')

    setSending(true)
    try {
      const endpoint = channel === 'email' ? '/messages/email' : '/messages/push'
      await api.post(endpoint, {
        target,
        userId: target === 'individual' ? selectedMember?.id : undefined,
        subject: subject || undefined,
        message,
      })
      Alert.alert('✅ Enviado', 'El mensaje fue enviado correctamente')
      setMessage(''); setSubject('')
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo enviar')
    } finally { setSending(false) }
  }

  return (
    <ScrollView style={s.container} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.title}>Comunicaciones</Text>
      </View>

      <Text style={s.sectionLabel}>CANAL</Text>
      <View style={s.channelRow}>
        <TouchableOpacity
          style={[s.channelBtn, channel === 'email' && s.channelBtnActive]}
          onPress={() => setChannel('email')}
        >
          <Text style={[s.channelText, channel === 'email' && s.channelTextActive]}>📧 Email</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.channelBtn, channel === 'push' && s.channelBtnActive]}
          onPress={() => setChannel('push')}
        >
          <Text style={[s.channelText, channel === 'push' && s.channelTextActive]}>🔔 Push</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.sectionLabel}>DESTINATARIO</Text>
      {TARGETS.map(t => (
        <TouchableOpacity
          key={t.id}
          style={[s.targetRow, target === t.id && s.targetRowActive]}
          onPress={() => setTarget(t.id)}
        >
          <View style={[s.radio, target === t.id && s.radioActive]} />
          <Text style={[s.targetText, target === t.id && s.targetTextActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}

      {target === 'individual' && (
        <TouchableOpacity style={s.memberPicker} onPress={() => setShowMemberPicker(true)}>
          <Text style={selectedMember ? s.memberPickerText : s.memberPickerPlaceholder}>
            {selectedMember ? selectedMember.name : 'Seleccionar miembro...'}
          </Text>
          <Text style={s.pickerArrow}>▾</Text>
        </TouchableOpacity>
      )}

      {channel === 'email' && (
        <>
          <Text style={s.sectionLabel}>ASUNTO</Text>
          <View style={s.inputWrap}>
            <TextInput style={s.input} placeholder="Asunto del email" placeholderTextColor="#4b5563" value={subject} onChangeText={setSubject} />
          </View>
        </>
      )}

      <Text style={s.sectionLabel}>MENSAJE *</Text>
      <View style={s.inputWrap}>
        <TextInput
          style={[s.input, s.textarea]}
          placeholder="Escribe tu mensaje..."
          placeholderTextColor="#4b5563"
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity style={s.sendBtn} onPress={handleSend} disabled={sending}>
        {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.sendBtnText}>Enviar {channel === 'email' ? 'email' : 'notificación'}</Text>}
      </TouchableOpacity>

      <BottomSheet
        visible={showMemberPicker}
        onClose={() => setShowMemberPicker(false)}
        title="Seleccionar miembro"
        scrollable={true}
      >
        <View style={{ paddingHorizontal: 24 }}>
          {members.map(m => (
            <TouchableOpacity key={m.id} style={s.sheetItem} onPress={() => { setSelectedMember(m); setShowMemberPicker(false) }}>
              <Text style={s.sheetItemText}>{m.name}</Text>
              <Text style={s.sheetItemSub}>{m.email}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 },
  back: { color: '#6366f1', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  sectionLabel: { fontSize: 12, color: '#6b7280', fontWeight: '700', paddingHorizontal: 24, marginTop: 16, marginBottom: 10, letterSpacing: 0.5 },
  channelRow: { flexDirection: 'row', paddingHorizontal: 24, gap: 10 },
  channelBtn: { flex: 1, backgroundColor: '#111827', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  channelBtnActive: { borderColor: '#6366f1', backgroundColor: '#6366f110' },
  channelText: { color: '#6b7280', fontWeight: '700', fontSize: 15 },
  channelTextActive: { color: '#6366f1' },
  targetRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937', gap: 12 },
  targetRowActive: {},
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#4b5563' },
  radioActive: { borderColor: '#6366f1', backgroundColor: '#6366f1' },
  targetText: { color: '#9ca3af', fontSize: 15 },
  targetTextActive: { color: '#fff', fontWeight: '600' },
  memberPicker: { marginHorizontal: 24, marginTop: 10, backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: '#1f2937' },
  memberPickerText: { color: '#fff', fontSize: 15 },
  memberPickerPlaceholder: { color: '#4b5563', fontSize: 15 },
  pickerArrow: { color: '#6b7280' },
  inputWrap: { paddingHorizontal: 24 },
  input: { backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#1f2937' },
  textarea: { height: 120 },
  sendBtn: { margin: 24, backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sheetItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  sheetItemText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sheetItemSub: { color: '#6b7280', fontSize: 12 },
})
