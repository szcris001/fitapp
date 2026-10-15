import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import api from '../../lib/api'
import { BottomSheet } from '../../components/BottomSheet'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Entry {
  id: string
  userId: string
  rank: number
  score: number
  scoreText: string | null
  scoreFormatted: string
  rx: boolean
  category: 'rx' | 'scaled'
  notes: string | null
  user: { id: string; name: string; avatarUrl?: string | null }
}

interface Member {
  id: string
  name: string
  email: string
}

function rankEmoji(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}`
}

// ─── Form (agregar / editar) ───────────────────────────────────────────────────

function ResultForm({
  scoreType, initial, onChange,
}: {
  scoreType: string
  initial?: { score: number; scoreText: string | null; rx: boolean; notes: string | null } | null
  onChange: (v: { rx: boolean; getScore: () => { score: number; scoreText?: string } | null; notes: string }) => void
}) {
  const [rx, setRx] = useState(initial?.rx ?? true)
  const [scoreValue, setScoreValue] = useState(
    initial && scoreType !== 'TIME' && scoreType !== 'CUSTOM' ? String(initial.score) : ''
  )
  const [mins, setMins] = useState(
    initial && scoreType === 'TIME' ? String(Math.floor(initial.score / 60)) : ''
  )
  const [secs, setSecs] = useState(
    initial && scoreType === 'TIME' ? String(initial.score % 60) : ''
  )
  const [scoreText, setScoreText] = useState(initial?.scoreText ?? '')
  const [customValue, setCustomValue] = useState(
    initial && scoreType === 'CUSTOM' && initial.score > 0 ? String(initial.score) : ''
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const getScore = (): { score: number; scoreText?: string } | null => {
    if (scoreType === 'TIME') {
      const m = parseInt(mins, 10)
      const s = parseInt(secs, 10)
      if (isNaN(m) || isNaN(s) || m < 0 || s < 0 || s > 59 || m * 60 + s === 0) return null
      return { score: m * 60 + s }
    }
    if (scoreType === 'CUSTOM') {
      return { score: parseFloat(customValue) || 0, scoreText: scoreText.trim() || undefined }
    }
    const n = parseFloat(scoreValue)
    if (isNaN(n) || n <= 0) return null
    return { score: n }
  }

  // Reporta el estado actual al padre tras cada render, nunca sincrónicamente
  // dentro del propio handler de setState: setMins/setSecs/etc. son asíncronos,
  // así que un report() llamado justo después del setState capturaría el valor
  // ANTERIOR (bug confirmado: tipear "45" en segundos guardaba "4").
  useEffect(() => {
    onChange({ rx, getScore, notes })
  })

  const placeholders: Record<string, string> = { REPS: 'ej: 150', ROUNDS: 'ej: 5', WEIGHT: 'ej: 100' }
  const labels: Record<string, string> = { REPS: 'Repeticiones', ROUNDS: 'Rondas', WEIGHT: 'Peso (kg)' }

  return (
    <View style={{ gap: 14 }}>
      <View>
        <Text style={f.label}>Categoría</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            style={[f.toggleBtn, { borderColor: '#6366f1' }, rx && { backgroundColor: '#6366f1' }]}
            onPress={() => setRx(true)}
          >
            <Text style={[f.toggleText, { color: rx ? '#fff' : '#6366f1' }]}>RX</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[f.toggleBtn, { borderColor: '#f59e0b' }, !rx && { backgroundColor: '#f59e0b' }]}
            onPress={() => setRx(false)}
          >
            <Text style={[f.toggleText, { color: !rx ? '#fff' : '#f59e0b' }]}>Scaled</Text>
          </TouchableOpacity>
        </View>
      </View>

      {scoreType === 'TIME' ? (
        <View>
          <Text style={f.label}>Tiempo</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TextInput
              style={[f.input, { flex: 1 }]} placeholder="00" placeholderTextColor="#4b5563"
              keyboardType="number-pad" maxLength={3} value={mins}
              onChangeText={setMins}
            />
            <Text style={{ color: '#6b7280', fontSize: 18 }}>:</Text>
            <TextInput
              style={[f.input, { flex: 1 }]} placeholder="00" placeholderTextColor="#4b5563"
              keyboardType="number-pad" maxLength={2} value={secs}
              onChangeText={setSecs}
            />
          </View>
        </View>
      ) : scoreType === 'CUSTOM' ? (
        <>
          <View>
            <Text style={f.label}>Descripción del resultado</Text>
            <TextInput
              style={f.input} placeholder="ej: 5 rondas + 10 burpees" placeholderTextColor="#4b5563"
              value={scoreText} onChangeText={setScoreText}
            />
          </View>
          <View>
            <Text style={f.label}>Valor numérico (opcional, para ordenar)</Text>
            <TextInput
              style={f.input} placeholder="ej: 5" placeholderTextColor="#4b5563" keyboardType="decimal-pad"
              value={customValue} onChangeText={setCustomValue}
            />
          </View>
        </>
      ) : (
        <View>
          <Text style={f.label}>{labels[scoreType] ?? 'Score'}</Text>
          <TextInput
            style={f.input} placeholder={placeholders[scoreType] ?? 'ej: 10'} placeholderTextColor="#4b5563"
            keyboardType="decimal-pad" value={scoreValue}
            onChangeText={setScoreValue}
          />
        </View>
      )}

      <View>
        <Text style={f.label}>Notas (opcional)</Text>
        <TextInput
          style={f.input} placeholder="ej: con rodilleras..." placeholderTextColor="#4b5563"
          value={notes} onChangeText={setNotes}
        />
      </View>
    </View>
  )
}

const f = StyleSheet.create({
  label: { fontSize: 13, color: '#9ca3af', fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#1f2937',
  },
  toggleBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  toggleText: { fontWeight: '700', fontSize: 14 },
})

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function WodResultsScreen({ route }: any) {
  const { wodId, wodTitle, classTypeName, wodDate } = route.params || {}

  const [scoreType, setScoreType] = useState('REPS')
  const [entries, setEntries] = useState<Entry[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Agregar/editar
  const [sheetVisible, setSheetVisible] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [pickedMember, setPickedMember] = useState<Member | null>(null)
  const [search, setSearch] = useState('')
  const formRef = React.useRef<{ rx: boolean; getScore: () => { score: number; scoreText?: string } | null; notes: string }>({
    rx: true, getScore: () => null, notes: '',
  })

  const fetchData = useCallback(async () => {
    try {
      const [lbRes, usersRes] = await Promise.all([
        api.get(`/wods/${wodId}/leaderboard`),
        api.get('/users?role=MEMBER'),
      ])
      setScoreType(lbRes.data.scoreType || 'REPS')
      setEntries(lbRes.data.entries || [])
      const list = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.users ?? usersRes.data?.data ?? []
      setMembers(list)
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los resultados')
    } finally {
      setLoading(false)
    }
  }, [wodId])

  useFocusEffect(useCallback(() => { fetchData() }, [fetchData]))

  const registeredIds = new Set(entries.map(e => e.userId))
  const filteredMembers = members
    .filter(m => !registeredIds.has(m.id))
    .filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()))

  const openAdd = () => {
    setEditingEntry(null)
    setPickedMember(null)
    setSearch('')
    setSheetVisible(true)
  }

  const openEdit = (entry: Entry) => {
    setEditingEntry(entry)
    setPickedMember({ id: entry.user.id, name: entry.user.name, email: '' })
    setSheetVisible(true)
  }

  const closeSheet = () => { setSheetVisible(false); setEditingEntry(null); setPickedMember(null) }

  const handleSave = async () => {
    const parsed = formRef.current.getScore()
    if (!parsed) {
      Alert.alert('Score inválido', 'Revisá el valor ingresado.')
      return
    }
    if (!pickedMember) {
      Alert.alert('Falta el alumno', 'Elegí a quién le corresponde este resultado.')
      return
    }
    setSaving(true)
    try {
      const body = {
        score: parsed.score,
        scoreText: parsed.scoreText,
        rx: formRef.current.rx,
        notes: formRef.current.notes.trim() || undefined,
      }
      if (editingEntry) {
        await api.put(`/wods/${wodId}/results/${pickedMember.id}`, body)
      } else {
        await api.post(`/wods/${wodId}/results`, { ...body, userId: pickedMember.id })
      }
      closeSheet()
      fetchData()
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo guardar el resultado')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (entry: Entry) => {
    Alert.alert('Eliminar resultado', `¿Quitar el resultado de ${entry.user.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/wods/${wodId}/results/${entry.userId}`)
            fetchData()
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.error || 'No se pudo eliminar')
          }
        },
      },
    ])
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#6366f1" size={36} /></View>

  const rxEntries = entries.filter(e => e.rx)
  const scaledEntries = entries.filter(e => !e.rx)

  const renderSection = (title: string, color: string, list: Entry[]) => {
    if (list.length === 0) return null
    return (
      <View style={{ marginBottom: 16 }}>
        <View style={s.sectionHeaderRow}>
          <View style={[s.sectionBadge, { backgroundColor: color + '20', borderColor: color + '50' }]}>
            <Text style={[s.sectionBadgeText, { color }]}>{title}</Text>
          </View>
          <Text style={s.sectionCount}>{list.length} atleta{list.length !== 1 ? 's' : ''}</Text>
        </View>
        {list.map(entry => (
          <View key={entry.id} style={s.row}>
            <Text style={s.rank}>{rankEmoji(entry.rank)}</Text>
            <Text style={s.rowName} numberOfLines={1}>{entry.user.name}</Text>
            <Text style={[s.rowScore, { color }]}>{entry.scoreFormatted}</Text>
            <TouchableOpacity onPress={() => openEdit(entry)} style={s.iconBtn}>
              <Ionicons name="pencil" size={16} color="#9ca3af" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(entry)} style={s.iconBtn}>
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>{wodTitle || 'Resultados'}</Text>
        <Text style={s.subtitle}>
          {[classTypeName, wodDate && new Date(wodDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })]
            .filter(Boolean).join(' · ')}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        {entries.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyText}>Todavía no hay resultados cargados</Text>
          </View>
        ) : (
          <>
            {renderSection('RX', '#6366f1', rxEntries)}
            {renderSection('SCALED', '#f59e0b', scaledEntries)}
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={s.fab} onPress={openAdd}>
        <Ionicons name="add" size={26} color="#fff" />
        <Text style={s.fabText}>Cargar resultado</Text>
      </TouchableOpacity>

      <BottomSheet
        visible={sheetVisible}
        onClose={closeSheet}
        title={editingEntry ? `Editar: ${editingEntry.user.name}` : 'Cargar resultado'}
        scrollable
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ paddingHorizontal: 24, gap: 14 }}>
            {!editingEntry && (
              <View>
                <Text style={f.label}>Alumno</Text>
                {pickedMember ? (
                  <View style={s.pickedRow}>
                    <Text style={s.pickedName}>{pickedMember.name}</Text>
                    <TouchableOpacity onPress={() => setPickedMember(null)}>
                      <Text style={s.pickedChange}>Cambiar</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={f.input} placeholder="Buscar alumno..." placeholderTextColor="#4b5563"
                      value={search} onChangeText={setSearch}
                    />
                    <ScrollView style={{ maxHeight: 220, marginTop: 8 }} keyboardShouldPersistTaps="handled">
                      {filteredMembers.map(m => (
                        <TouchableOpacity key={m.id} style={s.memberRow} onPress={() => setPickedMember(m)}>
                          <Text style={s.memberName}>{m.name}</Text>
                          <Text style={s.memberEmail}>{m.email}</Text>
                        </TouchableOpacity>
                      ))}
                      {filteredMembers.length === 0 && (
                        <Text style={{ color: '#6b7280', paddingVertical: 12 }}>Sin resultados</Text>
                      )}
                    </ScrollView>
                  </>
                )}
              </View>
            )}

            {(pickedMember || editingEntry) && (
              <ResultForm
                scoreType={scoreType}
                initial={editingEntry ? {
                  score: editingEntry.score, scoreText: editingEntry.scoreText,
                  rx: editingEntry.rx, notes: editingEntry.notes,
                } : null}
                onChange={v => { formRef.current = v }}
              />
            )}

            <TouchableOpacity
              style={[s.saveBtn, (!pickedMember || saving) && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={!pickedMember || saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveBtnText}>{editingEntry ? 'Guardar cambios' : 'Cargar resultado'}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </BottomSheet>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2, textTransform: 'capitalize' },
  empty: { marginTop: 40, alignItems: 'center' },
  emptyText: { color: '#4b5563', fontSize: 14 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  sectionBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  sectionCount: { color: '#6b7280', fontSize: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#1f2937',
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 6,
  },
  rank: { width: 24, fontSize: 14, textAlign: 'center' },
  rowName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  rowScore: { fontSize: 15, fontWeight: '800' },
  iconBtn: { padding: 4 },
  fab: {
    position: 'absolute', bottom: 24, left: 20, right: 20,
    backgroundColor: '#6366f1', borderRadius: 16, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 8,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  pickedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#1f2937',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  pickedName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  pickedChange: { color: '#6366f1', fontSize: 13, fontWeight: '700' },
  memberRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1f2937' },
  memberName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  memberEmail: { color: '#6b7280', fontSize: 12 },
  saveBtn: { backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 20 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
