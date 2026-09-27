import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert
} from 'react-native'
import api from '../../lib/api'

const PAYMENT_METHODS = [
  { id: 'cash', label: '💵 Efectivo' },
  { id: 'transfer', label: '🏦 Transferencia' },
  { id: 'card', label: '💳 Tarjeta' },
  { id: 'other', label: '🔄 Otro' },
]

export default function AssignMembershipScreen({ route, navigation }: any) {
  const { memberId, memberName } = route.params
  const [plans, setPlans] = useState<any[]>([])
  const [selectedPlan, setSelectedPlan] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<string>('cash')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/plans').then(r => setPlans(r.data)).finally(() => setLoading(false))
  }, [])

  const handleAssign = async () => {
    if (!selectedPlan) return Alert.alert('Error', 'Selecciona un plan')
    setSaving(true)
    try {
      await api.post('/payments/manual', {
        userId: memberId,
        planId: selectedPlan,
        paymentMethod,
        paymentNotes: notes || undefined,
      })
      Alert.alert('✅ Plan asignado', `Membresía de ${memberName} actualizada`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ])
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo asignar el plan')
    } finally { setSaving(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#6366f1" size={36} /></View>

  return (
    <ScrollView style={s.container} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.title}>Asignar plan</Text>
        <Text style={s.subtitle}>{memberName}</Text>
      </View>

      <Text style={s.sectionLabel}>PLAN</Text>
      {plans.map(plan => {
        const price = (plan.priceCents / 100).toLocaleString('es-CL')
        return (
          <TouchableOpacity
            key={plan.id}
            style={[s.planCard, selectedPlan === plan.id && s.planCardActive]}
            onPress={() => setSelectedPlan(plan.id)}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.planName}>{plan.name}</Text>
              <Text style={s.planDetail}>{plan.durationDays} días{plan.maxClasses ? ` · ${plan.maxClasses} clases` : ''}</Text>
            </View>
            <Text style={s.planPrice}>{plan.currency} {price}</Text>
          </TouchableOpacity>
        )
      })}

      <Text style={s.sectionLabel}>MÉTODO DE PAGO</Text>
      <View style={s.methodGrid}>
        {PAYMENT_METHODS.map(m => (
          <TouchableOpacity
            key={m.id}
            style={[s.methodBtn, paymentMethod === m.id && s.methodBtnActive]}
            onPress={() => setPaymentMethod(m.id)}
          >
            <Text style={[s.methodText, paymentMethod === m.id && s.methodTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.sectionLabel}>NOTAS (opcional)</Text>
      <View style={s.inputWrap}>
        <TextInput
          style={s.input}
          placeholder="Observaciones del pago..."
          placeholderTextColor="#4b5563"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />
      </View>

      <TouchableOpacity style={s.saveBtn} onPress={handleAssign} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Confirmar pago y asignar</Text>}
      </TouchableOpacity>
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
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  sectionLabel: { fontSize: 12, color: '#6b7280', fontWeight: '700', paddingHorizontal: 24, marginTop: 20, marginBottom: 10, letterSpacing: 0.5 },
  planCard: { marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#1f2937' },
  planCardActive: { borderColor: '#6366f1', backgroundColor: '#6366f110' },
  planName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  planDetail: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  planPrice: { color: '#6366f1', fontWeight: '800', fontSize: 16 },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, gap: 8 },
  methodBtn: { backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#1f2937' },
  methodBtnActive: { borderColor: '#6366f1', backgroundColor: '#6366f110' },
  methodText: { color: '#6b7280', fontWeight: '600', fontSize: 14 },
  methodTextActive: { color: '#6366f1' },
  inputWrap: { paddingHorizontal: 24 },
  input: { backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#1f2937', textAlignVertical: 'top' },
  saveBtn: { margin: 24, backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
