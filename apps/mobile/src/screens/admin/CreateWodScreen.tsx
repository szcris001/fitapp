import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert
} from 'react-native'
import api from '../../lib/api'
import { BottomSheet } from '../../components/BottomSheet'

interface Movement {
  movementName: string
  sets: string
  reps: string
  weightRxM: string
  weightRxF: string
  notes: string
}

interface Block {
  title: string
  timecap: string
  movements: Movement[]
}

const emptyMovement = (): Movement => ({
  movementName: '', sets: '', reps: '', weightRxM: '', weightRxF: '', notes: ''
})

const emptyBlock = (): Block => ({ title: '', timecap: '', movements: [emptyMovement()] })

export default function CreateWodScreen({ route, navigation }: any) {
  const { wodId } = route.params || {}
  const isEdit = !!wodId
  const [classTypes, setClassTypes] = useState<any[]>([])
  const [selectedClassTypeId, setSelectedClassTypeId] = useState('')
  const [form, setForm] = useState({ title: '', date: '' })
  const [blocks, setBlocks] = useState<Block[]>([emptyBlock()])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showTypePicker, setShowTypePicker] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const [ctRes] = await Promise.all([api.get('/class-types')])
      setClassTypes(ctRes.data)

      if (isEdit) {
        const from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
        const to = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
        const wodsRes = await api.get(`/wods?from=${from}&to=${to}`)
        const wod = wodsRes.data.find((w: any) => w.id === wodId)
        if (wod) {
          setSelectedClassTypeId(wod.classTypeId)
          setForm({ title: wod.title || '', date: wod.date?.split('T')[0] || '' })
          if (wod.blocks?.length) {
            setBlocks(wod.blocks.map((b: any) => ({
              title: b.title || '',
              timecap: b.timecap?.toString() || '',
              movements: b.movements?.map((m: any) => ({
                movementName: m.movementName || '',
                sets: m.sets?.toString() || '',
                reps: m.reps?.toString() || '',
                weightRxM: m.weightRxM?.toString() || '',
                weightRxF: m.weightRxF?.toString() || '',
                notes: m.notes || '',
              })) || [emptyMovement()],
            })))
          }
        }
      }
    }
    loadData().finally(() => setLoading(false))
  }, [])

  const setMovField = (bi: number, mi: number, k: keyof Movement, v: string) => {
    setBlocks(prev => prev.map((b, bIdx) => bIdx !== bi ? b : {
      ...b,
      movements: b.movements.map((m, mIdx) => mIdx !== mi ? m : { ...m, [k]: v })
    }))
  }

  const addMovement = (bi: number) => {
    setBlocks(prev => prev.map((b, bIdx) => bIdx !== bi ? b : {
      ...b, movements: [...b.movements, emptyMovement()]
    }))
  }

  const removeMovement = (bi: number, mi: number) => {
    setBlocks(prev => prev.map((b, bIdx) => bIdx !== bi ? b : {
      ...b, movements: b.movements.filter((_, i) => i !== mi)
    }))
  }

  const setBlockField = (bi: number, k: keyof Pick<Block, 'title' | 'timecap'>, v: string) => {
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : { ...b, [k]: v }))
  }

  const handleSave = async () => {
    if (!selectedClassTypeId) return Alert.alert('Error', 'Selecciona un tipo de clase')
    if (!form.date) return Alert.alert('Error', 'Ingresa la fecha')

    const blocksPayload = blocks.map(b => ({
      title: b.title || null,
      timecap: b.timecap ? parseInt(b.timecap) : null,
      movements: b.movements
        .filter(m => m.movementName.trim())
        .map(m => ({
          movementName: m.movementName,
          sets: m.sets ? parseInt(m.sets) : null,
          reps: m.reps ? parseInt(m.reps) : null,
          weightRxM: m.weightRxM ? parseFloat(m.weightRxM) : null,
          weightRxF: m.weightRxF ? parseFloat(m.weightRxF) : null,
          notes: m.notes || null,
        })),
    }))

    if (blocksPayload.every(b => b.movements.length === 0)) {
      return Alert.alert('Error', 'Agrega al menos un movimiento')
    }

    const body = {
      classTypeId: selectedClassTypeId,
      title: form.title || null,
      date: form.date,
      blocks: blocksPayload,
    }

    setSaving(true)
    try {
      if (isEdit) {
        await api.put(`/wods/${wodId}`, body)
        Alert.alert('WOD actualizado', '', [{ text: 'OK', onPress: () => navigation.goBack() }])
      } else {
        await api.post('/wods', body)
        Alert.alert('WOD creado', '', [{ text: 'OK', onPress: () => navigation.goBack() }])
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo guardar el WOD')
    } finally { setSaving(false) }
  }

  const selectedType = classTypes.find(ct => ct.id === selectedClassTypeId)

  if (loading) return <View style={s.center}><ActivityIndicator color="#6366f1" size={36} /></View>

  return (
    <ScrollView style={s.container} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.title}>{isEdit ? 'Editar WOD' : 'Nuevo WOD'}</Text>
      </View>

      <View style={s.section}>
        <Text style={s.label}>Tipo de clase *</Text>
        <TouchableOpacity style={s.picker} onPress={() => setShowTypePicker(true)}>
          {selectedType ? (
            <View style={s.pickerRow}>
              <View style={[s.dot, { backgroundColor: selectedType.color || '#6366f1' }]} />
              <Text style={s.pickerText}>{selectedType.name}</Text>
            </View>
          ) : (
            <Text style={s.pickerPlaceholder}>Seleccionar tipo de clase...</Text>
          )}
          <Text style={s.pickerArrow}>▾</Text>
        </TouchableOpacity>

        <Text style={s.label}>Título</Text>
        <TextInput
          style={s.input} placeholder="Ej: AMRAP 20min" placeholderTextColor="#4b5563"
          value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))}
        />

        <Text style={s.label}>Fecha (AAAA-MM-DD) *</Text>
        <TextInput
          style={s.input} placeholder="2026-05-21" placeholderTextColor="#4b5563"
          value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))}
        />
      </View>

      {blocks.map((block, bi) => (
        <View key={bi} style={s.blockCard}>
          <View style={s.blockHeader}>
            <Text style={s.blockLabel}>Bloque {bi + 1}</Text>
            {blocks.length > 1 && (
              <TouchableOpacity onPress={() => setBlocks(prev => prev.filter((_, i) => i !== bi))}>
                <Text style={s.removeText}>✕ Eliminar bloque</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={s.label}>Título del bloque</Text>
          <TextInput
            style={s.input} placeholder="Ej: For time, AMRAP..." placeholderTextColor="#4b5563"
            value={block.title} onChangeText={v => setBlockField(bi, 'title', v)}
          />

          <Text style={s.label}>Timecap (minutos)</Text>
          <TextInput
            style={s.input} placeholder="20" placeholderTextColor="#4b5563" keyboardType="numeric"
            value={block.timecap} onChangeText={v => setBlockField(bi, 'timecap', v)}
          />

          <View style={s.movHeader}>
            <Text style={s.sectionTitle}>MOVIMIENTOS</Text>
            <TouchableOpacity onPress={() => addMovement(bi)} style={s.addMovBtn}>
              <Text style={s.addMovText}>+ Agregar</Text>
            </TouchableOpacity>
          </View>

          {block.movements.map((m, mi) => (
            <View key={mi} style={s.movCard}>
              <View style={s.movRowHeader}>
                <Text style={s.movNumber}>#{mi + 1}</Text>
                {block.movements.length > 1 && (
                  <TouchableOpacity onPress={() => removeMovement(bi, mi)}>
                    <Text style={s.removeText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={s.input} placeholder="Nombre del movimiento *" placeholderTextColor="#4b5563"
                value={m.movementName} onChangeText={v => setMovField(bi, mi, 'movementName', v)}
              />
              <View style={s.movRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.smallLabel}>Series</Text>
                  <TextInput
                    style={s.input} placeholder="3" placeholderTextColor="#4b5563" keyboardType="numeric"
                    value={m.sets} onChangeText={v => setMovField(bi, mi, 'sets', v)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.smallLabel}>Reps</Text>
                  <TextInput
                    style={s.input} placeholder="10" placeholderTextColor="#4b5563" keyboardType="numeric"
                    value={m.reps} onChangeText={v => setMovField(bi, mi, 'reps', v)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.smallLabel}>Rx M (kg)</Text>
                  <TextInput
                    style={s.input} placeholder="60" placeholderTextColor="#4b5563" keyboardType="numeric"
                    value={m.weightRxM} onChangeText={v => setMovField(bi, mi, 'weightRxM', v)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.smallLabel}>Rx F (kg)</Text>
                  <TextInput
                    style={s.input} placeholder="40" placeholderTextColor="#4b5563" keyboardType="numeric"
                    value={m.weightRxF} onChangeText={v => setMovField(bi, mi, 'weightRxF', v)}
                  />
                </View>
              </View>
              <TextInput
                style={s.input} placeholder="Notas (opcional)" placeholderTextColor="#4b5563"
                value={m.notes} onChangeText={v => setMovField(bi, mi, 'notes', v)}
              />
            </View>
          ))}
        </View>
      ))}

      <TouchableOpacity
        style={s.addBlockBtn}
        onPress={() => setBlocks(prev => [...prev, emptyBlock()])}
      >
        <Text style={s.addBlockText}>+ Agregar bloque</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.saveBtnText}>{isEdit ? 'Guardar cambios' : 'Crear WOD'}</Text>}
      </TouchableOpacity>

      <BottomSheet
        visible={showTypePicker}
        onClose={() => setShowTypePicker(false)}
        title="Tipo de clase"
        scrollable={true}
      >
        <View style={{ paddingHorizontal: 24 }}>
          {classTypes.map(ct => (
            <TouchableOpacity
              key={ct.id}
              style={s.sheetItem}
              onPress={() => { setSelectedClassTypeId(ct.id); setShowTypePicker(false) }}
            >
              <View style={[s.dot, { backgroundColor: ct.color || '#6366f1' }]} />
              <Text style={s.sheetItemText}>{ct.name}</Text>
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
  smallLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', marginBottom: 4 },
  input: {
    backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#1f2937'
  },
  picker: {
    backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: '#1f2937'
  },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerText: { color: '#fff', fontSize: 15 },
  pickerPlaceholder: { color: '#4b5563', fontSize: 15 },
  pickerArrow: { color: '#6b7280' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  blockCard: {
    marginHorizontal: 24, marginTop: 16, backgroundColor: '#0f172a', borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: '#1e3a5f'
  },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  blockLabel: { color: '#60a5fa', fontWeight: '800', fontSize: 14 },
  sectionTitle: { fontSize: 12, color: '#6b7280', fontWeight: '700', letterSpacing: 0.5 },
  movHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  addMovBtn: { backgroundColor: '#6366f120', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addMovText: { color: '#6366f1', fontWeight: '700', fontSize: 13 },
  movCard: {
    backgroundColor: '#111827', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1f2937', gap: 8, marginTop: 8
  },
  movRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  movNumber: { color: '#6366f1', fontWeight: '800', fontSize: 14 },
  removeText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
  movRow: { flexDirection: 'row', gap: 6 },
  addBlockBtn: {
    marginHorizontal: 24, marginTop: 16, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#6366f1', borderStyle: 'dashed'
  },
  addBlockText: { color: '#6366f1', fontWeight: '700', fontSize: 14 },
  saveBtn: { margin: 24, backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1f2937'
  },
  sheetItemText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})
