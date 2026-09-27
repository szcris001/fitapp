import React, { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../lib/api'

export default function PlansScreen({ navigation }: any) {
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', priceCents: '', currency: 'CLP', durationDays: '30', maxClasses: '' })
  const [saving, setSaving] = useState(false)

  const fetchPlans = async () => {
    try {
      const { data } = await api.get('/plans')
      setPlans(data)
    } catch { }
    finally { setLoading(false); setRefreshing(false) }
  }

  useFocusEffect(useCallback(() => { fetchPlans() }, []))

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const openCreate = () => {
    setEditId(null)
    setForm({ name: '', description: '', priceCents: '', currency: 'CLP', durationDays: '30', maxClasses: '' })
    setShowForm(true)
  }

  const openEdit = (plan: any) => {
    setEditId(plan.id)
    setForm({
      name: plan.name, description: plan.description || '', priceCents: plan.priceCents.toString(),
      currency: plan.currency || 'CLP', durationDays: plan.durationDays.toString(), maxClasses: plan.maxClasses?.toString() || '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return Alert.alert('Error', 'El nombre es obligatorio')
    const body = {
      name: form.name, description: form.description || undefined,
      priceCents: parseInt(form.priceCents) || 0, currency: form.currency,
      durationDays: parseInt(form.durationDays) || 30,
      maxClasses: form.maxClasses ? parseInt(form.maxClasses) : undefined,
    }
    setSaving(true)
    try {
      if (editId) {
        await api.put(`/plans/${editId}`, body)
      } else {
        await api.post('/plans', body)
      }
      setShowForm(false)
      fetchPlans()
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  const handleDelete = (plan: any) => {
    Alert.alert('Desactivar plan', `¿Desactivar "${plan.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desactivar', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/plans/${plan.id}`)
            fetchPlans()
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.error || 'No se pudo desactivar')
          }
        }
      }
    ])
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#6366f1" size={36} /></View>

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.back}>← Volver</Text>
          </TouchableOpacity>
          <Text style={s.title}>Planes</Text>
        </View>
        <TouchableOpacity style={s.newBtn} onPress={openCreate}>
          <Text style={s.newBtnText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>{editId ? 'Editar plan' : 'Nuevo plan'}</Text>
          <Text style={s.label}>Nombre *</Text>
          <TextInput style={s.input} placeholder="Plan mensual" placeholderTextColor="#4b5563" value={form.name} onChangeText={v => set('name', v)} />
          <Text style={s.label}>Descripción</Text>
          <TextInput style={s.input} placeholder="Descripción opcional" placeholderTextColor="#4b5563" value={form.description} onChangeText={v => set('description', v)} />
          <View style={s.rowForm}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Precio (centavos)</Text>
              <TextInput style={s.input} placeholder="50000" placeholderTextColor="#4b5563" value={form.priceCents} onChangeText={v => set('priceCents', v)} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Moneda</Text>
              <TextInput style={s.input} placeholder="CLP" placeholderTextColor="#4b5563" value={form.currency} onChangeText={v => set('currency', v)} autoCapitalize="characters" />
            </View>
          </View>
          <View style={s.rowForm}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Duración (días)</Text>
              <TextInput style={s.input} placeholder="30" placeholderTextColor="#4b5563" value={form.durationDays} onChangeText={v => set('durationDays', v)} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Máx. clases</Text>
              <TextInput style={s.input} placeholder="Sin límite" placeholderTextColor="#4b5563" value={form.maxClasses} onChangeText={v => set('maxClasses', v)} keyboardType="numeric" />
            </View>
          </View>
          <View style={s.formActions}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowForm(false)}>
              <Text style={s.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size={16} /> : <Text style={s.saveText}>Guardar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        style={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPlans() }} tintColor="#6366f1" />}
      >
        {plans.map(plan => {
          const price = (plan.priceCents / 100).toLocaleString('es-CL')
          return (
            <View key={plan.id} style={s.planCard}>
              <View style={s.planHeader}>
                <Text style={s.planName}>{plan.name}</Text>
                <Text style={s.planPrice}>{plan.currency} {price}</Text>
              </View>
              {plan.description && <Text style={s.planDesc}>{plan.description}</Text>}
              <Text style={s.planMeta}>
                {plan.durationDays} días{plan.maxClasses ? ` · ${plan.maxClasses} clases máx.` : ''}
              </Text>
              <View style={s.planActions}>
                <TouchableOpacity style={s.editBtn} onPress={() => openEdit(plan)}>
                  <Text style={s.editText}>✏️ Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(plan)}>
                  <Text style={s.deleteText}>🗑 Desactivar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        })}
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
  formTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  label: { fontSize: 12, color: '#9ca3af', fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: '#1f2937', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#374151' },
  rowForm: { flexDirection: 'row', gap: 10 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, backgroundColor: '#1f2937', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#9ca3af', fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: '#6366f1', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
  list: { flex: 1, paddingHorizontal: 24 },
  planCard: { backgroundColor: '#111827', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#1f2937' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  planName: { color: '#fff', fontSize: 17, fontWeight: '700' },
  planPrice: { color: '#6366f1', fontSize: 16, fontWeight: '800' },
  planDesc: { color: '#9ca3af', fontSize: 13, marginBottom: 4 },
  planMeta: { color: '#6b7280', fontSize: 13 },
  planActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editBtn: { flex: 1, backgroundColor: '#1f2937', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  editText: { color: '#9ca3af', fontWeight: '600', fontSize: 13 },
  deleteBtn: { flex: 1, backgroundColor: '#1f293730', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ef444430' },
  deleteText: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
})
