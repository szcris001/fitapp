import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
  Pressable, FlatList, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../theme/ThemeContext'
import { BottomSheet } from '../components/BottomSheet'
import api from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BenchmarkMovement {
  nombre: string
  repsEsquema?: string
  cargaRxKgHombre?: number
  cargaRxKgMujer?: number
  alturaRxCmHombre?: number
  alturaRxCmMujer?: number
  cargaScaled?: string
}

interface Benchmark {
  id: string
  nombre: string
  categoria: string
  formato: string
  año?: number
  tiempoEstMin?: number
  duracionMins?: number
  descripcion?: string
  notas?: string
  movimientos: BenchmarkMovement[]
}

interface BenchmarkResult {
  id: string
  scoreType: string
  scoreValue: number
  scoreNotes?: string
  isRx: boolean
  recordedAt: string
}

type ScoreType = 'TIME' | 'REPS' | 'ROUNDS' | 'WEIGHT'

type Category = 'GIRL' | 'HERO' | 'OPEN' | 'GAMES' | 'CUSTOM' | ''

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: { key: Category; label: string; emoji: string }[] = [
  { key: '', label: 'Todos', emoji: '🔍' },
  { key: 'GIRL', label: 'Girls', emoji: '🎀' },
  { key: 'HERO', label: 'Heroes', emoji: '🦸' },
  { key: 'OPEN', label: 'Open', emoji: '🏅' },
  { key: 'GAMES', label: 'Games', emoji: '🏆' },
  { key: 'CUSTOM', label: 'Custom', emoji: '⚙️' },
]

const CAT_COLOR: Record<string, string> = {
  GIRL: '#ec4899',
  HERO: '#f59e0b',
  OPEN: '#14b8a6',
  GAMES: '#8b5cf6',
  CUSTOM: '#6366f1',
}

const CAT_EMOJI: Record<string, string> = {
  GIRL: '🎀', HERO: '🦸', OPEN: '🏅', GAMES: '🏆', CUSTOM: '⚙️',
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function calcPersonalLoad(rxKg: number, rmKg: number | undefined, pct: number): string | null {
  if (!rmKg) return null
  const load = Math.round(rmKg * pct) / 10 * 10  // round to nearest 5kg
  return `~${load}kg (${pct * 100}% RM)`
}

// Match a benchmark movement name to the closest RM key (case-insensitive contains)
function findRm(rms: Record<string, number>, movementName: string): number | undefined {
  const lower = movementName.toLowerCase()
  for (const [key, val] of Object.entries(rms)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return val
    }
  }
  return undefined
}

// ─── Benchmark Detail Modal ───────────────────────────────────────────────────

const SCORE_TYPES: { key: ScoreType; label: string; placeholder: string }[] = [
  { key: 'TIME',   label: 'For Time',  placeholder: 'mm:ss' },
  { key: 'REPS',   label: 'Reps',      placeholder: 'ej: 150' },
  { key: 'ROUNDS', label: 'AMRAP',     placeholder: 'ej: 10' },
  { key: 'WEIGHT', label: 'Peso (kg)', placeholder: 'ej: 80' },
]

function fmtResult(r: BenchmarkResult) {
  if (r.scoreType === 'TIME') {
    const s = Math.round(r.scoreValue)
    return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`
  }
  if (r.scoreType === 'ROUNDS') return `${r.scoreValue} rds${r.scoreNotes ? ` +${r.scoreNotes}` : ''}`
  if (r.scoreType === 'WEIGHT') return `${r.scoreValue} kg`
  return `${r.scoreValue}${r.scoreNotes ? ` (${r.scoreNotes})` : ''}`
}

function BenchmarkModal({
  visible, benchmark, rms, onClose,
}: {
  visible: boolean; benchmark: Benchmark | null
  rms: Record<string, number>; onClose: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors

  const last = useRef(benchmark)
  if (benchmark) last.current = benchmark
  const bm = last.current
  if (!bm) return null

  const catColor = CAT_COLOR[bm.categoria] ?? '#6366f1'

  const [myResults, setMyResults]   = useState<BenchmarkResult[]>([])
  const [showForm, setShowForm]     = useState(false)
  const [scoreType, setScoreType]   = useState<ScoreType>('TIME')
  const [timeMins, setTimeMins]     = useState('')
  const [timeSecs, setTimeSecs]     = useState('')
  const [scoreRaw, setScoreRaw]     = useState('')
  const [scoreNotes, setScoreNotes] = useState('')
  const [isRx, setIsRx]             = useState(true)
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    if (visible && bm) {
      api.get(`/benchmarks/${bm.id}/my-result`).then(r => setMyResults(r.data)).catch(() => {})
      setShowForm(false); setTimeMins(''); setTimeSecs(''); setScoreRaw(''); setScoreNotes(''); setIsRx(true)
    }
  }, [visible, bm?.id])

  const handleSave = async () => {
    let scoreValue = 0
    if (scoreType === 'TIME') {
      const mm = parseInt(timeMins || '0', 10)
      const ss = parseInt(timeSecs || '0', 10)
      if (isNaN(mm) || isNaN(ss) || (mm === 0 && ss === 0)) { Alert.alert('Error', 'Ingresa un tiempo válido'); return }
      scoreValue = mm * 60 + ss
    } else {
      scoreValue = parseFloat(scoreRaw)
      if (isNaN(scoreValue) || scoreValue <= 0) { Alert.alert('Error', 'Ingresa un valor válido'); return }
    }
    setSaving(true)
    try {
      await api.post(`/benchmarks/${bm.id}/result`, { scoreType, scoreValue, scoreNotes: scoreNotes || undefined, isRx })
      const r = await api.get(`/benchmarks/${bm.id}/my-result`)
      setMyResults(r.data)
      setShowForm(false); setTimeMins(''); setTimeSecs(''); setScoreRaw(''); setScoreNotes('')
      Alert.alert('✅ Resultado guardado')
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  const bestResult = myResults.length > 0
    ? [...myResults].sort((a, b) => a.scoreType === 'TIME' ? a.scoreValue - b.scoreValue : b.scoreValue - a.scoreValue)[0]
    : null

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`${CAT_EMOJI[bm.categoria] ?? '⚙️'}  ${bm.nombre}`} scrollable>
      <View style={{ paddingHorizontal: 24, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[styles.catBadge, { backgroundColor: catColor + '20' }]}>
          <Text style={[styles.catBadgeText, { color: catColor }]}>{bm.categoria}</Text>
        </View>
        <Text style={[styles.modalSubtitle, { color: c.text3 }]}>
          {bm.formato}
          {bm.duracionMins ? ` · ${bm.duracionMins} min` : ''}
          {bm.tiempoEstMin ? ` · ~${bm.tiempoEstMin} min` : ''}
          {bm.año ? ` · ${bm.año}` : ''}
        </Text>
      </View>

      <View style={styles.modalBody}>
        {bm.descripcion ? (
          <View style={[styles.descBox, { backgroundColor: c.surface }]}>
            <Text style={[styles.descText, { color: c.text2 }]}>{bm.descripcion}</Text>
          </View>
        ) : null}

        <Text style={[styles.sectionLabel, { color: c.text3 }]}>MOVIMIENTOS</Text>
        {bm.movimientos.map((m, i) => {
          const rmH = findRm(rms, m.nombre)
          const pctH = m.cargaRxKgHombre && rmH ? m.cargaRxKgHombre / rmH : null
          const personalLoad = pctH ? `~${Math.round(rmH! * pctH / 5) * 5}kg (${Math.round(pctH * 100)}% RM)` : null
          return (
            <View key={i} style={[styles.movRow, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={[styles.movIdx, { backgroundColor: catColor + '20' }]}>
                <Text style={[styles.movIdxText, { color: catColor }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.movName, { color: c.text1 }]}>{m.nombre}</Text>
                {m.repsEsquema ? <Text style={[styles.movDetail, { color: c.text3 }]}>{m.repsEsquema}</Text> : null}
                <View style={styles.movLoads}>
                  {m.cargaRxKgHombre ? <Text style={[styles.loadChip, { backgroundColor: '#3b82f620', color: '#60a5fa' }]}>♂ RX {m.cargaRxKgHombre}kg</Text> : null}
                  {m.cargaRxKgMujer  ? <Text style={[styles.loadChip, { backgroundColor: '#ec489920', color: '#f472b6' }]}>♀ RX {m.cargaRxKgMujer}kg</Text>  : null}
                  {m.alturaRxCmHombre ? <Text style={[styles.loadChip, { backgroundColor: '#f59e0b20', color: '#fbbf24' }]}>{m.alturaRxCmHombre}cm</Text> : null}
                  {personalLoad ? <Text style={[styles.loadChip, { backgroundColor: c.primary + '20', color: c.primary }]}>🎯 {personalLoad}</Text> : null}
                </View>
                {m.cargaScaled ? <Text style={[styles.scaledText, { color: c.text3 }]}>Scaled: {m.cargaScaled}</Text> : null}
              </View>
            </View>
          )
        })}

        {bm.notas ? <Text style={[styles.notasText, { color: c.text3 }]}>{bm.notas}</Text> : null}

        {/* Mi mejor marca */}
        {bestResult && (
          <>
            <Text style={[styles.sectionLabel, { color: c.text3 }]}>MI MEJOR MARCA</Text>
            <View style={[styles.bestResult, { backgroundColor: catColor + '12', borderColor: catColor + '30' }]}>
              <Text style={{ fontSize: 28, fontWeight: '800', color: catColor, letterSpacing: -0.5 }}>
                {fmtResult(bestResult)}
              </Text>
              <Text style={{ fontSize: 12, color: c.text3, marginTop: 4 }}>
                {myResults.length} resultado{myResults.length !== 1 ? 's' : ''}{bestResult.isRx ? ' · Rx' : ' · Scaled'}
              </Text>
            </View>
          </>
        )}

        {/* Botón registrar */}
        <TouchableOpacity
          style={[styles.registerBtn, { backgroundColor: showForm ? c.surface : catColor, borderColor: showForm ? c.border : catColor }]}
          onPress={() => setShowForm(v => !v)}
        >
          <Ionicons name={showForm ? 'close' : 'add-circle-outline'} size={18} color={showForm ? c.text3 : '#fff'} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: showForm ? c.text3 : '#fff', marginLeft: 6 }}>
            {showForm ? 'Cancelar' : 'Registrar mi resultado'}
          </Text>
        </TouchableOpacity>

        {/* Formulario */}
        {showForm && (
          <View style={[styles.resultForm, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.text3, marginBottom: 8 }]}>TIPO DE RESULTADO</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {SCORE_TYPES.map(st => (
                <TouchableOpacity key={st.key} onPress={() => setScoreType(st.key)}
                  style={[styles.scoreTypeChip, { backgroundColor: scoreType === st.key ? catColor : c.bg, borderColor: scoreType === st.key ? catColor : c.border }]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: scoreType === st.key ? '#fff' : c.text3 }}>{st.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {scoreType === 'TIME' ? (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: c.text3 }]}>Minutos</Text>
                  <TextInput style={[styles.input, { backgroundColor: c.bg, borderColor: c.border, color: c.text1 }]}
                    value={timeMins} onChangeText={setTimeMins} keyboardType="numeric" placeholder="0" placeholderTextColor={c.text4} maxLength={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: c.text3 }]}>Segundos</Text>
                  <TextInput style={[styles.input, { backgroundColor: c.bg, borderColor: c.border, color: c.text1 }]}
                    value={timeSecs} onChangeText={setTimeSecs} keyboardType="numeric" placeholder="00" placeholderTextColor={c.text4} maxLength={2} />
                </View>
              </View>
            ) : (
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.inputLabel, { color: c.text3 }]}>{SCORE_TYPES.find(s => s.key === scoreType)?.label}</Text>
                <TextInput style={[styles.input, { backgroundColor: c.bg, borderColor: c.border, color: c.text1 }]}
                  value={scoreRaw} onChangeText={setScoreRaw} keyboardType="numeric"
                  placeholder={SCORE_TYPES.find(s => s.key === scoreType)?.placeholder} placeholderTextColor={c.text4} />
              </View>
            )}

            <Text style={[styles.inputLabel, { color: c.text3 }]}>Notas (opcional)</Text>
            <TextInput style={[styles.input, { backgroundColor: c.bg, borderColor: c.border, color: c.text1, marginBottom: 16 }]}
              value={scoreNotes} onChangeText={setScoreNotes} placeholder="DNF, detalles..." placeholderTextColor={c.text4} />

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              {[true, false].map(rx => (
                <TouchableOpacity key={String(rx)} onPress={() => setIsRx(rx)}
                  style={[styles.scoreTypeChip, { flex: 1, backgroundColor: isRx === rx ? (rx ? '#22c55e' : '#f59e0b') : c.bg, borderColor: isRx === rx ? (rx ? '#22c55e' : '#f59e0b') : c.border }]}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: isRx === rx ? '#fff' : c.text3, textAlign: 'center' }}>
                    {rx ? 'Rx' : 'Scaled'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: catColor, opacity: saving ? 0.6 : 1 }]}
              onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Guardar resultado</Text>}
            </TouchableOpacity>
          </View>
        )}

        {Object.keys(rms).length === 0 ? (
          <View style={[styles.rmHint, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={c.text3} />
            <Text style={[styles.rmHintText, { color: c.text3 }]}>
              Registra tus RMs para ver cargas personalizadas en cada movimiento.
            </Text>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BenchmarksScreen() {
  const { theme } = useTheme()
  const c = theme.colors

  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([])
  const [rms, setRms] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category>('')
  const [selected, setSelected] = useState<Benchmark | null>(null)

  // Debounced fetch
  useEffect(() => {
    const t = setTimeout(() => fetchBenchmarks(), 300)
    return () => clearTimeout(t)
  }, [search, category])

  useEffect(() => { fetchRms() }, [])

  const fetchBenchmarks = async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set('nombre', search)
      if (category) params.set('categoria', category)
      const { data } = await api.get(`/benchmarks?${params}`)
      setBenchmarks(data)
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }

  const fetchRms = async () => {
    try {
      const { data } = await api.get('/rms/me')
      // data is an object: { movementName: [{ weightKg, ... }] }
      const map: Record<string, number> = {}
      for (const [name, records] of Object.entries(data as Record<string, any[]>)) {
        if (records.length > 0) map[name] = records[0].weightKg
      }
      setRms(map)
    } catch {}
  }

  const onRefresh = () => {
    setRefreshing(true)
    fetchBenchmarks()
    fetchRms()
  }

  const renderItem = useCallback(({ item: b }: { item: Benchmark }) => {
    const catColor = CAT_COLOR[b.categoria] ?? '#6366f1'
    const emoji = CAT_EMOJI[b.categoria] ?? '⚙️'
    // Check if user has at least one RM matching a movement
    const hasPersonal = b.movimientos.some(m => findRm(rms, m.nombre) !== undefined)

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
        activeOpacity={0.75}
        onPress={() => setSelected(b)}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.cardEmoji}>{emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardName, { color: c.text1 }]}>{b.nombre}</Text>
            {b.año ? <Text style={[styles.cardYear, { color: c.text3 }]}>{b.año}</Text> : null}
            {hasPersonal ? (
              <View style={[styles.personalDot, { backgroundColor: c.primary }]} />
            ) : null}
          </View>
          <View style={styles.cardMeta}>
            <View style={[styles.catPill, { backgroundColor: catColor + '18' }]}>
              <Text style={[styles.catPillText, { color: catColor }]}>{b.categoria}</Text>
            </View>
            <Text style={[styles.cardFormat, { color: c.text3 }]}>{b.formato}</Text>
            {b.tiempoEstMin ? (
              <Text style={[styles.cardFormat, { color: c.text3 }]}>· ~{b.tiempoEstMin} min</Text>
            ) : null}
          </View>
          {b.movimientos.length > 0 ? (
            <Text style={[styles.cardMovs, { color: c.text3 }]} numberOfLines={1}>
              {b.movimientos.map(m => m.nombre).join(' · ')}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.text3} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    )
  }, [rms, c])

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Text style={[styles.title, { color: c.text1 }]}>Benchmarks</Text>
        {Object.keys(rms).length > 0 ? (
          <View style={[styles.rmsBadge, { backgroundColor: c.primary + '20' }]}>
            <Ionicons name="barbell-outline" size={12} color={c.primary} />
            <Text style={[styles.rmsBadgeText, { color: c.primary }]}>
              {Object.keys(rms).length} RMs cargados
            </Text>
          </View>
        ) : null}
      </View>

      {/* Search */}
      <View style={[styles.searchRow, { backgroundColor: c.background }]}>
        <View style={[styles.searchBox, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="search-outline" size={16} color={c.text3} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar benchmark..."
            placeholderTextColor={c.text3}
            style={[styles.searchInput, { color: c.text1 }]}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={c.text3} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {CATEGORIES.map(cat => {
          const active = category === cat.key
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => setCategory(cat.key)}
              style={[
                styles.filterPill,
                active
                  ? { backgroundColor: c.primary }
                  : { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 },
              ]}
            >
              <Text style={styles.filterEmoji}>{cat.emoji}</Text>
              <Text style={[styles.filterLabel, { color: active ? '#fff' : c.text2 }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} size={32} />
        </View>
      ) : (
        <FlatList
          data={benchmarks}
          keyExtractor={b => b.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🏆</Text>
              <Text style={[styles.emptyText, { color: c.text3 }]}>Sin resultados</Text>
              <Text style={[styles.emptySubtext, { color: c.text3 }]}>
                Intenta con otro nombre o categoría
              </Text>
            </View>
          }
        />
      )}

      <BenchmarkModal
        visible={!!selected}
        benchmark={selected}
        rms={rms}
        onClose={() => setSelected(null)}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  rmsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  rmsBadgeText: { fontSize: 11, fontWeight: '600' },

  searchRow: { paddingHorizontal: 16, paddingVertical: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14 },

  filterScroll: { flexGrow: 0 },
  filterContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
  },
  filterEmoji: { fontSize: 14 },
  filterLabel: { fontSize: 13, fontWeight: '600' },

  list: { paddingHorizontal: 16, paddingVertical: 8, gap: 10, paddingBottom: 32 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  cardLeft: { alignItems: 'center', justifyContent: 'center', width: 36 },
  cardEmoji: { fontSize: 24 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cardName: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  cardYear: { fontSize: 12 },
  personalDot: { width: 7, height: 7, borderRadius: 4 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  catPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  catPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  cardFormat: { fontSize: 12 },
  cardMovs: { fontSize: 11 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 13 },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  catEmoji: { fontSize: 22 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  catBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  modalSubtitle: { fontSize: 13, marginTop: 4 },
  closeBtn: { padding: 4 },
  modalBody: { padding: 20, gap: 16 },

  descBox: { padding: 14, borderRadius: 12 },
  descText: { fontSize: 14, lineHeight: 20 },

  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },

  movRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  movIdx: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  movIdxText: { fontSize: 13, fontWeight: '700' },
  movName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  movDetail: { fontSize: 12, marginBottom: 4 },
  movLoads: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  loadChip: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scaledText: { fontSize: 11, fontStyle: 'italic' },

  notasText: { fontSize: 12, fontStyle: 'italic', textAlign: 'center' },

  rmHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rmHintText: { flex: 1, fontSize: 13, lineHeight: 18 },

  // Resultado
  bestResult: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  registerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 14, marginBottom: 12, borderWidth: 1 },
  resultForm: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  scoreTypeChip: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  inputLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
})
