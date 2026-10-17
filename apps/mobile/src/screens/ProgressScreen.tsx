import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, SectionList,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../theme/ThemeContext'
import api from '../lib/api'
import { BottomSheet } from '../components/BottomSheet'
import { useAuthStore } from '../store/auth.store'

// ── Orden de categorías del catálogo (global + custom del gym, GET /movements) ──
const CAT_ORDER = [
  'Fundacionales', 'Levantamiento olímpico', 'Powerlifting / Fuerza',
  'Dumbbell', 'Kettlebell', 'Gimnasia', 'Cardio / Metabólico', 'Personalizado',
]

type GymMovement = { name: string; category: string }

function formatSemesterLabel(periodStartIso: string): string {
  const d = new Date(periodStartIso)
  const year = d.getUTCFullYear()
  return d.getUTCMonth() === 0 ? `Ene-Jun ${year}` : `Jul-Dic ${year}`
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function ProgressScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const { user } = useAuthStore()

  const [activeTab, setActiveTab] = useState<'marcas' | 'gimnasia' | 'resultados'>('marcas')
  const [loading, setLoading] = useState(true)

  // Marcas personales
  const [rms, setRms] = useState<any[]>([])
  const [gymMovements, setGymMovements] = useState<GymMovement[]>([])

  // Gimnasia
  const [skills, setSkills] = useState<any[]>([])
  const [achievedMap, setAchievedMap] = useState<Record<string, string[]>>({})

  // Resultados de WOD (pizarra del día)
  const [wodResults, setWodResults] = useState<any[]>([])

  // Insignias de constancia semestral
  const [badges, setBadges] = useState<any[]>([])

  // Modal agregar RM — dos pasos: 'pick' (elegir movimiento) → 'weight' (ingresar peso)
  const [showAddRM, setShowAddRM] = useState(false)
  const [rmStep, setRmStep] = useState<'pick' | 'weight'>('pick')
  const [rmSelected, setRmSelected] = useState('')
  const [rmSearch, setRmSearch] = useState('')
  const [rmWeight, setRmWeight] = useState('')
  const [rmUnit, setRmUnit] = useState<'kg' | 'lb'>('kg')
  const [rmNotes, setRmNotes] = useState('')
  const [savingRM, setSavingRM] = useState(false)

  // Modal marcar hito
  const [savingMilestone, setSavingMilestone] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [rmsRes, skillsRes, progressRes, movementsRes, wodResultsRes, badgesRes] = await Promise.all([
        api.get('/rms/me'),
        api.get('/skills'),
        api.get('/gymnastic-progress/me'),
        api.get('/movements'),
        api.get('/wod-results/me'),
        api.get('/consistency-badges/me'),
      ])

      setRms(rmsRes.data || [])
      setSkills(skillsRes.data || [])
      setWodResults(wodResultsRes.data || [])
      setBadges(badgesRes.data || [])

      const achieved: Record<string, string[]> = {}
      for (const p of (progressRes.data || [])) {
        if (!achieved[p.skillName]) achieved[p.skillName] = []
        for (const h of (p.history || [])) {
          if (!achieved[p.skillName].includes(h.milestone)) {
            achieved[p.skillName].push(h.milestone)
          }
        }
      }
      setAchievedMap(achieved)

      setGymMovements(
        (movementsRes.data || []).map((m: any) => ({ name: m.nombre, category: m.categoria }))
      )
    } catch {
      Alert.alert('Error', 'No se pudo cargar el progreso')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Listado de movimientos para el picker ───────────────────────────────────
  // Secciones agrupadas por categoría
  const allSections = useMemo(() => {
    const catMap: Record<string, string[]> = {}
    for (const m of gymMovements) {
      const cat = m.category
      if (!catMap[cat]) catMap[cat] = []
      if (!catMap[cat].includes(m.name)) catMap[cat].push(m.name)
    }
    return Object.entries(catMap)
      .sort(([a], [b]) => {
        const ia = CAT_ORDER.indexOf(a) === -1 ? 99 : CAT_ORDER.indexOf(a)
        const ib = CAT_ORDER.indexOf(b) === -1 ? 99 : CAT_ORDER.indexOf(b)
        return ia - ib
      })
      .map(([title, data]) => ({ title, data }))
  }, [gymMovements])

  const filteredSections = useMemo(() => {
    const q = rmSearch.trim().toLowerCase()
    if (!q) return allSections
    return allSections
      .map(s => ({ ...s, data: s.data.filter(n => n.toLowerCase().includes(q)) }))
      .filter(s => s.data.length > 0)
  }, [allSections, rmSearch])

  // ── Acciones modal ──────────────────────────────────────────────────────────
  const openAddRM = () => {
    setRmStep('pick')
    setRmSelected('')
    setRmSearch('')
    setRmWeight('')
    setRmUnit('kg')
    setRmNotes('')
    setShowAddRM(true)
  }

  const closeModal = () => {
    setShowAddRM(false)
  }

  const selectMovement = (name: string) => {
    setRmSelected(name)
    setRmSearch('')
    setRmStep('weight')
  }

  const handleSaveRM = async () => {
    if (!rmSelected || !rmWeight.trim()) {
      Alert.alert('Completa los campos', 'El peso es requerido')
      return
    }
    const val = parseFloat(rmWeight)
    if (isNaN(val) || val <= 0) { Alert.alert('Peso inválido', 'Ingresa un número mayor a 0'); return }
    const kg = rmUnit === 'lb' ? Math.round(val * 0.453592 * 10) / 10 : val
    setSavingRM(true)
    try {
      await api.post('/rms/me', {
        movementName: rmSelected,
        weightKg: kg,
        notes: rmNotes.trim() || undefined,
      })
      closeModal()
      fetchAll()
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo guardar')
    } finally { setSavingRM(false) }
  }

  // ── Marcar hito de gimnasia ─────────────────────────────────────────────────
  const handleMarkMilestone = async (skillName: string, milestoneName: string) => {
    if (achievedMap[skillName]?.includes(milestoneName)) return
    setSavingMilestone(`${skillName}::${milestoneName}`)
    try {
      await api.post('/gymnastic-progress/me', { skillName, milestone: milestoneName })
      setAchievedMap(prev => ({
        ...prev,
        [skillName]: [...(prev[skillName] || []), milestoneName],
      }))
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo guardar')
    } finally { setSavingMilestone(null) }
  }

  // ── Agrupar RMs existentes por categoría ───────────────────────────────────
  const rmByCategory = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const rm of rms) {
      const gymMov = gymMovements.find(m => m.name.toLowerCase() === rm.movementName.toLowerCase())
      const cat = gymMov?.category ?? 'Personalizado'
      if (!map[cat]) map[cat] = []
      map[cat].push(rm)
    }
    return Object.entries(map).sort(([a], [b]) => {
      const ia = CAT_ORDER.indexOf(a) === -1 ? 99 : CAT_ORDER.indexOf(a)
      const ib = CAT_ORDER.indexOf(b) === -1 ? 99 : CAT_ORDER.indexOf(b)
      return ia - ib
    })
  }, [rms, gymMovements])

  const s = makeStyles(c)

  if (loading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <ActivityIndicator color={c.primary} size={36} style={{ marginTop: 60 }} />
      </View>
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Mi Progreso</Text>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {(['marcas', 'gimnasia', 'resultados'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tabPill, activeTab === tab && { backgroundColor: c.primary }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabPillText, { color: activeTab === tab ? '#fff' : c.text3 }]}>
              {tab === 'marcas' ? 'Marcas personales' : tab === 'gimnasia' ? 'Gimnasia' : 'Resultados'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── TAB: MARCAS ── */}
      {activeTab === 'marcas' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {rms.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>🏋️</Text>
              <Text style={[s.emptyTitle, { color: c.text1 }]}>Sin marcas registradas</Text>
              <Text style={[s.emptySub, { color: c.text3 }]}>Registrá tu primer PR para ver tu evolución</Text>
              <TouchableOpacity style={[s.ctaBtn, { backgroundColor: c.primary }]} onPress={openAddRM}>
                <Text style={s.ctaBtnText}>+ Registrar primera marca</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {rmByCategory.map(([cat, items]) => (
                <View key={cat} style={{ marginBottom: 24 }}>
                  <Text style={[s.catHeader, { color: c.text3 }]}>{cat.toUpperCase()}</Text>
                  <View style={[s.catCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                    {items.map((rm, i) => (
                      <View
                        key={rm.movementName}
                        style={[
                          s.rmRow,
                          { borderTopColor: c.border },
                          i > 0 && { borderTopWidth: StyleSheet.hairlineWidth },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[s.rmName, { color: c.text1 }]}>{rm.movementName}</Text>
                          {rm.history?.[0]?.recordedAt && (
                            <Text style={[s.rmDate, { color: c.text3 }]}>
                              {new Date(rm.history[0].recordedAt).toLocaleDateString('es-CL', {
                                day: 'numeric', month: 'short', year: 'numeric',
                              })}
                            </Text>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <Text style={[s.rmWeight, { color: c.primary }]}>{Math.round(rm.currentRm * 2.20462)} lb</Text>
                          <Text style={[s.rmWeightLb, { color: c.text3 }]}>{rm.currentRm} kg</Text>
                          {rm.improvement > 0 && (
                            <View style={[s.improveBadge, { backgroundColor: c.success + '20' }]}>
                              <Text style={[s.improveText, { color: c.success }]}>+{rm.improvement} kg ↑</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
              <TouchableOpacity style={[s.addRMBtn, { borderColor: c.primary + '60' }]} onPress={openAddRM}>
                <Ionicons name="add-circle-outline" size={18} color={c.primary} />
                <Text style={[s.addRMText, { color: c.primary }]}>Registrar nueva marca</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}

      {/* ── TAB: GIMNASIA ── */}
      {activeTab === 'gimnasia' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {badges.map(b => (
            <View key={b.id} style={[s.skillCard, { backgroundColor: c.surface, borderColor: c.success }]}>
              <View style={s.skillHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.skillName, { color: c.text1 }]}>
                    🏅 Constancia semestral — {formatSemesterLabel(b.periodStart)}
                  </Text>
                  <Text style={[s.skillDesc, { color: c.text3 }]}>
                    Cargaste el 100% de tus resultados de WOD ({b.loggedCount}/{b.eligibleCount} clases)
                  </Text>
                </View>
                <View style={[s.skillBadge, { backgroundColor: c.success + '25' }]}>
                  <Text style={[s.skillBadgeText, { color: c.success }]}>✓</Text>
                </View>
              </View>
            </View>
          ))}

          {skills.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={[s.emptyTitle, { color: c.text1 }]}>Sin habilidades configuradas</Text>
              <Text style={[s.emptySub, { color: c.text3 }]}>El administrador del gym debe configurar las habilidades</Text>
            </View>
          ) : skills.map(skill => {
            const achieved = achievedMap[skill.name] || []
            const milestones: any[] = skill.milestones || []
            const doneCount = milestones.filter(m => achieved.includes(m.name)).length
            const nextMilestone = milestones.find(m => !achieved.includes(m.name))
            const pct = milestones.length > 0 ? doneCount / milestones.length : 0

            return (
              <View key={skill.id} style={[s.skillCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={s.skillHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.skillName, { color: c.text1 }]}>{skill.name}</Text>
                    {skill.description && (
                      <Text style={[s.skillDesc, { color: c.text3 }]}>{skill.description}</Text>
                    )}
                  </View>
                  <View style={[s.skillBadge, { backgroundColor: pct === 1 ? c.success + '25' : c.primary + '20' }]}>
                    <Text style={[s.skillBadgeText, { color: pct === 1 ? c.success : c.primary }]}>
                      {doneCount}/{milestones.length}
                    </Text>
                  </View>
                </View>
                <View style={[s.progTrack, { backgroundColor: c.border }]}>
                  <View style={[s.progFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: pct === 1 ? c.success : c.primary }]} />
                </View>
                <View style={s.milestoneList}>
                  {milestones.map((m: any, i: number) => {
                    const done = achieved.includes(m.name)
                    const isSaving = savingMilestone === `${skill.name}::${m.name}`
                    return (
                      <TouchableOpacity
                        key={m.id || i}
                        style={s.milestoneRow}
                        onPress={() => !done && handleMarkMilestone(skill.name, m.name)}
                        activeOpacity={done ? 1 : 0.7}
                        disabled={done || !!savingMilestone}
                      >
                        <View style={[
                          s.milestoneDot,
                          { backgroundColor: done ? c.primary : 'transparent', borderColor: done ? c.primary : c.border },
                        ]}>
                          {isSaving
                            ? <ActivityIndicator size={10} color="#fff" />
                            : done && <Ionicons name="checkmark" size={11} color="#fff" />
                          }
                        </View>
                        <Text style={[s.milestoneName, { color: done ? c.text1 : c.text3, fontWeight: done ? '600' : '400' }]}>
                          {m.name}
                        </Text>
                        {!done && !savingMilestone && (
                          <Text style={[s.milestoneAction, { color: c.primary }]}>Marcar</Text>
                        )}
                      </TouchableOpacity>
                    )
                  })}
                </View>
                {nextMilestone && (
                  <View style={[s.nextMilestone, { backgroundColor: c.primary + '12', borderColor: c.primary + '30' }]}>
                    <Ionicons name="flag-outline" size={13} color={c.primary} />
                    <Text style={[s.nextMilestoneText, { color: c.primary }]}>Siguiente: {nextMilestone.name}</Text>
                  </View>
                )}
              </View>
            )
          })}
        </ScrollView>
      )}

      {/* ── TAB: RESULTADOS (pizarra de WODs) ── */}
      {activeTab === 'resultados' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {wodResults.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>🏆</Text>
              <Text style={[s.emptyTitle, { color: c.text1 }]}>Sin resultados registrados</Text>
              <Text style={[s.emptySub, { color: c.text3 }]}>
                Tus resultados del WOD del día van a aparecer aquí, con tu puesto entre los demás alumnos
              </Text>
            </View>
          ) : (
            <View style={[s.catCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              {wodResults.map((r, i) => {
                const canOpen = user?.role === 'MEMBER'
                const content = (
                  <View
                    style={[
                      s.rmRow,
                      { borderTopColor: c.border },
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rmName, { color: c.text1 }]}>{r.wodTitle || r.classTypeName}</Text>
                      <Text style={[s.rmDate, { color: c.text3 }]}>
                        {r.classTypeName} · {new Date(r.wodDate).toLocaleDateString('es-CL', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={[s.rmWeight, { color: c.primary, fontSize: 18 }]}>{r.scoreFormatted}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {r.rank != null && (
                          <View style={[s.improveBadge, { backgroundColor: r.rank === 1 ? c.success + '20' : c.primary + '15' }]}>
                            <Text style={[s.improveText, { color: r.rank === 1 ? c.success : c.primary }]}>
                              #{r.rank} de {r.totalInCategory} {r.rx ? 'RX' : 'Scaled'}
                            </Text>
                          </View>
                        )}
                        {canOpen && <Ionicons name="chevron-forward" size={14} color={c.text3} />}
                      </View>
                    </View>
                  </View>
                )
                return canOpen ? (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('Home', {
                      screen: 'MemberWod',
                      params: { wodId: r.wodId, wodTitle: r.wodTitle, wodDate: r.wodDate },
                    })}
                  >
                    {content}
                  </TouchableOpacity>
                ) : (
                  <View key={r.id}>{content}</View>
                )
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── BottomSheet paso 1: Elegir movimiento ── */}
      <BottomSheet
        visible={showAddRM && rmStep === 'pick'}
        onClose={closeModal}
        title="Elegir movimiento"
        scrollable={true}
        maxHeight="82%"
      >
        <View style={{ paddingHorizontal: 20 }}>
          {/* Buscador */}
          <View style={[s.searchWrap, { backgroundColor: c.background, borderColor: c.border }]}>
            <Ionicons name="search-outline" size={16} color={c.text3} />
            <TextInput
              style={[s.searchInput, { color: c.text1 }]}
              placeholder="Buscar movimiento..."
              placeholderTextColor={c.text3}
              value={rmSearch}
              onChangeText={setRmSearch}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Lista agrupada */}
          {filteredSections.length === 0 ? (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Text style={{ color: c.text3, fontSize: 14 }}>
                {gymMovements.length === 0
                  ? 'El gym no tiene movimientos configurados'
                  : 'Sin resultados para esa búsqueda'}
              </Text>
            </View>
          ) : (
            <SectionList
              sections={filteredSections}
              keyExtractor={(item) => item}
              renderSectionHeader={({ section: { title } }) => (
                <View style={[s.sectionHeader, { backgroundColor: c.surface }]}>
                  <Text style={[s.sectionHeaderText, { color: c.text3 }]}>{title.toUpperCase()}</Text>
                </View>
              )}
              renderItem={({ item, index, section }) => {
                const isLast = index === section.data.length - 1
                return (
                  <TouchableOpacity
                    style={[
                      s.movRow,
                      { borderBottomColor: c.border },
                      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth },
                    ]}
                    onPress={() => selectMovement(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.movName, { color: c.text1 }]}>{item}</Text>
                    <Ionicons name="chevron-forward" size={16} color={c.text3} />
                  </TouchableOpacity>
                )
              }}
              ItemSeparatorComponent={() => null}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              scrollEnabled={false}
            />
          )}
        </View>
      </BottomSheet>

      {/* ── BottomSheet paso 2: Ingresar peso ── */}
      <BottomSheet
        visible={showAddRM && rmStep === 'weight'}
        onClose={closeModal}
        title={rmSelected}
      >
        <View style={{ paddingHorizontal: 24 }}>
          {/* Volver a elegir movimiento */}
          <TouchableOpacity
            onPress={() => { setRmStep('pick'); setRmWeight(''); setRmNotes('') }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={18} color={c.primary} />
            <Text style={[s.backText, { color: c.primary }]}>Cambiar movimiento</Text>
          </TouchableOpacity>

          {/* Peso + toggle unidad */}
          <View style={s.weightLabelRow}>
            <Text style={[s.inputLabel, { color: c.text2, marginTop: 0, marginBottom: 0 }]}>Peso</Text>
            <View style={[s.unitToggle, { backgroundColor: c.background, borderColor: c.border }]}>
              {(['kg', 'lb'] as const).map(unit => (
                <TouchableOpacity
                  key={unit}
                  onPress={() => setRmUnit(unit)}
                  style={[s.unitBtn, rmUnit === unit && { backgroundColor: c.primary }]}
                >
                  <Text style={[s.unitBtnText, { color: rmUnit === unit ? '#fff' : c.text3 }]}>{unit}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TextInput
            style={[s.input, { backgroundColor: c.background, color: c.text1, borderColor: c.border }]}
            placeholder={rmUnit === 'kg' ? 'ej: 85.5' : 'ej: 185'}
            placeholderTextColor={c.text3}
            value={rmWeight}
            onChangeText={setRmWeight}
            keyboardType="decimal-pad"
            autoFocus
          />
          {/* Conversión en tiempo real */}
          {rmWeight !== '' && !isNaN(parseFloat(rmWeight)) && parseFloat(rmWeight) > 0 && (
            <Text style={[s.conversion, { color: c.text3 }]}>
              {rmUnit === 'kg'
                ? `= ${Math.round(parseFloat(rmWeight) * 2.20462)} lb`
                : `= ${Math.round(parseFloat(rmWeight) * 0.453592 * 10) / 10} kg`}
            </Text>
          )}

          {/* Notas */}
          <Text style={[s.inputLabel, { color: c.text2 }]}>Notas (opcional)</Text>
          <TextInput
            style={[s.input, { backgroundColor: c.background, color: c.text1, borderColor: c.border }]}
            placeholder="ej: con cinturón, pausa..."
            placeholderTextColor={c.text3}
            value={rmNotes}
            onChangeText={setRmNotes}
          />

          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: c.primary, opacity: savingRM ? 0.6 : 1 }]}
            onPress={handleSaveRM}
            disabled={savingRM}
          >
            {savingRM
              ? <ActivityIndicator color="#fff" size={18} />
              : <Text style={s.saveBtnText}>Guardar marca</Text>
            }
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
function makeStyles(c: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },
    title: { fontSize: 28, fontWeight: '800', color: c.text1, letterSpacing: -0.5 },

    tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
    tabPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: c.surface },
    tabPillText: { fontSize: 13, fontWeight: '600' },

    // Empty state
    emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
    emptyIcon: { fontSize: 48, marginBottom: 4 },
    emptyTitle: { fontSize: 16, fontWeight: '700' },
    emptySub: { fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
    ctaBtn: { marginTop: 8, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
    ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    // Marcas
    catHeader: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
    catCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    rmRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
    rmName: { fontSize: 14, fontWeight: '600' },
    rmDate: { fontSize: 11, marginTop: 2 },
    rmWeight: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
    rmWeightLb: { fontSize: 11, fontWeight: '500' },
    improveBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
    improveText: { fontSize: 11, fontWeight: '700' },
    addRMBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, borderRadius: 14, borderWidth: 1, paddingVertical: 13, marginTop: 4,
    },
    addRMText: { fontSize: 14, fontWeight: '600' },

    // Skills
    skillCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
    skillHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
    skillName: { fontSize: 15, fontWeight: '700' },
    skillDesc: { fontSize: 12, marginTop: 2 },
    skillBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    skillBadgeText: { fontSize: 12, fontWeight: '700' },
    progTrack: { height: 4, borderRadius: 2, marginBottom: 14 },
    progFill: { height: 4, borderRadius: 2 },
    milestoneList: { gap: 2 },
    milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    milestoneDot: {
      width: 22, height: 22, borderRadius: 11,
      borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    },
    milestoneName: { flex: 1, fontSize: 13 },
    milestoneAction: { fontSize: 11, fontWeight: '700' },
    nextMilestone: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginTop: 12, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7,
    },
    nextMilestoneText: { fontSize: 12, fontWeight: '600', flex: 1 },

    // Modal compartido
    backText: { fontSize: 14, fontWeight: '600' },

    // Buscador
    searchWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 12, paddingVertical: 9,
      marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 14, padding: 0 },

    // Secciones del SectionList
    sectionHeader: { paddingVertical: 8, paddingTop: 14 },
    sectionHeaderText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
    movRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 14,
    },
    movName: { flex: 1, fontSize: 14 },

    inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 14 },
    input: {
      borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 11,
      fontSize: 15,
    },
    weightLabelRow: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', marginTop: 14, marginBottom: 6,
    },
    unitToggle: {
      flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden',
    },
    unitBtn: { paddingHorizontal: 14, paddingVertical: 6 },
    unitBtnText: { fontSize: 13, fontWeight: '700' },
    conversion: { fontSize: 12, textAlign: 'right', marginTop: 6, marginBottom: 2 },
    saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
    saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  })
}
