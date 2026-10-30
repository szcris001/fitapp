import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import { getGymTimezone } from '../lib/gym-timezone'
import { useTheme } from '../theme/ThemeContext'
import { useAuthStore } from '../store/auth.store'
import { BottomSheet } from '../components/BottomSheet'
import api from '../lib/api'
import { parseScoreInput } from '../lib/wodScore'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number
  category: 'rx' | 'scaled'
  userId: string
  user: { id?: string; name: string; avatarUrl?: string }
  score: number
  scoreFormatted: string
  rx: boolean
  notes?: string | null
  createdAt?: string
}

interface LeaderboardData {
  wodId: string
  scoreType: string
  total: number
  entries: LeaderboardEntry[]
}

interface MovementResultEntry {
  movementId: string
  movementName: string
  value: string
}

interface MyResult {
  score: number
  scoreText?: string
  rx: boolean
  scoreFormatted: string
  notes?: string
  movementResults?: MovementResultEntry[] | null
}

interface WodMovementLite {
  id: string
  movementName: string
  repScheme?: string | null
}

interface WodBlockLite {
  type: string
  movements: WodMovementLite[]
}

// Movimientos "relevantes" para el desglose: los del bloque de tipo WOD (el
// trabajo puntuado). Si el WOD no tiene ningún bloque WOD (dato legacy, todo
// quedó en OTHER por default antes de que existiera el tipo de bloque), se
// usan los OTHER como fallback. WARMUP/SKILL_STRENGTH/COOLDOWN nunca cuentan
// — no son parte del resultado que el alumno registra.
function relevantMovements(blocks: WodBlockLite[] | undefined): WodMovementLite[] {
  if (!blocks || blocks.length === 0) return []
  const wodBlocks = blocks.filter(b => b.type === 'WOD')
  const source = wodBlocks.length > 0 ? wodBlocks : blocks.filter(b => b.type === 'OTHER')
  return source.flatMap(b => b.movements)
}

// ─── Score type metadata ────────────────────────────────────────────────────────

const SCORE_TYPE_META: Record<string, { label: string; emoji: string; color: string }> = {
  TIME:   { label: 'Tiempo',  emoji: '⏱',  color: '#3b82f6' },
  REPS:   { label: 'Reps',    emoji: '🔢',  color: '#10b981' },
  WEIGHT: { label: 'Peso',    emoji: '🏋️', color: '#f59e0b' },
  ROUNDS: { label: 'Rounds',  emoji: '🔄',  color: '#8b5cf6' },
  CUSTOM: { label: 'Custom',  emoji: '✏️', color: '#6b7280' },
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function rankEmoji(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}`
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: getGymTimezone(),
    })
  } catch {
    return dateStr
  }
}

// ─── Score Type Badge ───────────────────────────────────────────────────────────

function ScoreTypeBadge({ scoreType }: { scoreType?: string }) {
  if (!scoreType) return null
  const meta = SCORE_TYPE_META[scoreType] ?? { label: scoreType, emoji: '', color: '#6b7280' }
  return (
    <View style={[badgeStyles.pill, { backgroundColor: meta.color + '25', borderColor: meta.color + '60' }]}>
      <Text style={[badgeStyles.text, { color: meta.color }]}>
        {meta.emoji} {meta.label}
      </Text>
    </View>
  )
}

const badgeStyles = StyleSheet.create({
  pill: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
})

// ─── Leaderboard category section ──────────────────────────────────────────────

function CategorySection({
  entries,
  currentUserId,
  c,
}: {
  entries: LeaderboardEntry[]
  currentUserId?: string
  c: any
}) {
  if (entries.length === 0) return null

  return (
    <View style={catStyles.wrapper}>
      {/* Entries */}
      {entries.map((entry) => {
        const isMe =
          entry.userId === currentUserId ||
          entry.user?.id === currentUserId
        return (
          <View
            key={`${entry.category}-${entry.rank}-${entry.userId}`}
            style={[
              catStyles.row,
              { borderBottomColor: c.border },
              isMe && {
                backgroundColor: c.primary + '12',
                borderLeftWidth: 3,
                borderLeftColor: c.primary,
              },
            ]}
          >
            <Text style={catStyles.rank}>{rankEmoji(entry.rank)}</Text>
            <Text
              style={[
                catStyles.name,
                { color: c.text1 },
                isMe && { color: c.primary, fontWeight: '700' },
              ]}
              numberOfLines={1}
            >
              {entry.user?.name ?? '—'}
              {isMe ? '  (yo)' : ''}
            </Text>
            <Text style={[catStyles.score, isMe && { color: c.primary }]}>
              {entry.scoreFormatted}
            </Text>
            {entry.notes ? (
              <Text style={[catStyles.notes, { color: c.text3 }]} numberOfLines={1}>
                {entry.notes}
              </Text>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const catStyles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  count: { fontSize: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  rank: { fontSize: 16, minWidth: 30, textAlign: 'center' },
  name: { flex: 1, fontSize: 14, fontWeight: '500' },
  score: { fontSize: 14, fontWeight: '700', color: '#9ca3af' },
  notes: { fontSize: 11, maxWidth: 80 },
})

// ─── Log Result Modal ───────────────────────────────────────────────────────────

interface LogResultModalProps {
  visible: boolean
  onClose: () => void
  onSaved: (result: MyResult) => void
  wodId: string
  scoreType: string
  myResult: MyResult | null
  movements: WodMovementLite[]
  c: any
  insets: { bottom: number }
}

function LogResultModal({
  visible,
  onClose,
  onSaved,
  wodId,
  scoreType,
  myResult,
  movements,
  c,
  insets,
}: LogResultModalProps) {
  // ── Form state ──────────────────────────────────────────────────────────────
  // RX/Scaled ya no se le pide al alumno (no aporta al foco de registrar el
  // resultado) — se guarda siempre como RX; el coach puede corregirlo después
  // desde el panel si hizo la versión scaled.
  const [scoreValue, setScoreValue] = useState('')
  const [mins, setMins] = useState('')
  const [secs, setSecs] = useState('')
  const [scoreText, setScoreText] = useState('')
  const [notes, setNotes] = useState('')
  const [movementValues, setMovementValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const showMovementBreakdown = movements.length > 1

  // Precargar valores cuando hay resultado existente o cuando se abre el modal
  useEffect(() => {
    if (!visible) return
    if (myResult) {
      setNotes(myResult.notes ?? '')
      if (scoreType === 'TIME') {
        const totalSecs = myResult.score
        setMins(String(Math.floor(totalSecs / 60)))
        setSecs(String(totalSecs % 60))
      } else if (scoreType === 'CUSTOM') {
        setScoreText(myResult.scoreText ?? '')
        setScoreValue(myResult.score > 0 ? String(myResult.score) : '')
      } else {
        setScoreValue(String(myResult.score))
      }
      const prevByMovement: Record<string, string> = {}
      for (const entry of myResult.movementResults ?? []) {
        prevByMovement[entry.movementId] = entry.value
      }
      setMovementValues(prevByMovement)
    } else {
      // Reset al abrir sin resultado previo
      setScoreValue('')
      setMins('')
      setSecs('')
      setScoreText('')
      setNotes('')
      setMovementValues({})
    }
  }, [visible, myResult, scoreType])

  // ── Submit ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    const input = scoreType === 'TIME' ? { mins, secs }
      : scoreType === 'CUSTOM' ? { text: scoreText, value: scoreValue }
      : { value: scoreValue }
    const parsed = parseScoreInput(scoreType, input)
    if ('error' in parsed) {
      if (parsed.error === 'zero_time') {
        Alert.alert('Tiempo inválido', 'El tiempo no puede ser cero.')
      } else if (parsed.error === 'invalid_time') {
        Alert.alert('Tiempo inválido', 'Ingresa minutos y segundos válidos (segundos: 0-59).')
      } else {
        const placeholders: Record<string, string> = {
          REPS: 'un número de repeticiones',
          ROUNDS: 'un número de rondas',
          WEIGHT: 'un peso en kg',
        }
        Alert.alert(
          'Score inválido',
          `Ingresa ${placeholders[scoreType] ?? 'un valor numérico'} válido.`,
        )
      }
      return
    }

    const body: Record<string, any> = {
      score: parsed.score,
      rx: true,
      notes: notes.trim() || null,
    }
    if (scoreType === 'CUSTOM') {
      body.scoreText = parsed.scoreText ?? null
    }
    if (showMovementBreakdown) {
      const entries = movements
        .map(m => ({ movementId: m.id, movementName: m.movementName, value: (movementValues[m.id] ?? '').trim() }))
        .filter(e => e.value.length > 0)
      if (entries.length > 0) body.movementResults = entries
    }

    setSaving(true)
    try {
      const { data } = await api.post(`/wods/${wodId}/results/me`, body)
      onSaved(data as MyResult)
      onClose()
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error ?? 'No se pudo guardar el resultado.')
    } finally {
      setSaving(false)
    }
  }

  // ── Score inputs by type ────────────────────────────────────────────────────
  const renderScoreInputs = () => {
    if (scoreType === 'TIME') {
      return (
        <View style={modalStyles.inputGroup}>
          <Text style={[modalStyles.label, { color: c.text2 }]}>Tiempo</Text>
          <View style={modalStyles.timeRow}>
            <View style={modalStyles.timeInputWrap}>
              <TextInput
                style={[modalStyles.input, { backgroundColor: c.background, borderColor: c.border, color: c.text1 }]}
                placeholder="00"
                placeholderTextColor={c.text3}
                keyboardType="number-pad"
                maxLength={3}
                value={mins}
                onChangeText={setMins}
                returnKeyType="next"
                accessibilityLabel="Minutos"
              />
              <Text style={[modalStyles.timeUnit, { color: c.text3 }]}>min</Text>
            </View>
            <Text style={[modalStyles.timeSep, { color: c.text2 }]}>:</Text>
            <View style={modalStyles.timeInputWrap}>
              <TextInput
                style={[modalStyles.input, { backgroundColor: c.background, borderColor: c.border, color: c.text1 }]}
                placeholder="00"
                placeholderTextColor={c.text3}
                keyboardType="number-pad"
                maxLength={2}
                value={secs}
                onChangeText={setSecs}
                returnKeyType="next"
                accessibilityLabel="Segundos"
              />
              <Text style={[modalStyles.timeUnit, { color: c.text3 }]}>seg</Text>
            </View>
          </View>
        </View>
      )
    }

    if (scoreType === 'CUSTOM') {
      return (
        <>
          <View style={modalStyles.inputGroup}>
            <Text style={[modalStyles.label, { color: c.text2 }]}>Descripcion del resultado</Text>
            <TextInput
              style={[
                modalStyles.input,
                { backgroundColor: c.background, borderColor: c.border, color: c.text1 },
              ]}
              placeholder="ej: 5 rondas + 10 burpees"
              placeholderTextColor={c.text3}
              value={scoreText}
              onChangeText={setScoreText}
              returnKeyType="next"
              accessibilityLabel="Descripcion del resultado"
            />
          </View>
          <View style={modalStyles.inputGroup}>
            <Text style={[modalStyles.label, { color: c.text2 }]}>Valor numerico (opcional)</Text>
            <TextInput
              style={[modalStyles.input, { backgroundColor: c.background, borderColor: c.border, color: c.text1 }]}
              placeholder="ej: 5"
              placeholderTextColor={c.text3}
              keyboardType="decimal-pad"
              value={scoreValue}
              onChangeText={setScoreValue}
              returnKeyType="next"
              accessibilityLabel="Valor numerico"
            />
          </View>
        </>
      )
    }

    // REPS / ROUNDS / WEIGHT (y cualquier tipo no reconocido)
    const placeholders: Record<string, string> = {
      REPS: 'ej: 150 reps',
      ROUNDS: 'ej: 5 rondas',
      WEIGHT: 'ej: 100 kg',
    }
    const placeholder = placeholders[scoreType] ?? 'ej: 10'
    const label: Record<string, string> = {
      REPS: 'Repeticiones',
      ROUNDS: 'Rondas',
      WEIGHT: 'Peso (kg)',
    }

    return (
      <View style={modalStyles.inputGroup}>
        <Text style={[modalStyles.label, { color: c.text2 }]}>{label[scoreType] ?? 'Score'}</Text>
        <TextInput
          style={[modalStyles.input, { backgroundColor: c.background, borderColor: c.border, color: c.text1 }]}
          placeholder={placeholder}
          placeholderTextColor={c.text3}
          keyboardType="decimal-pad"
          value={scoreValue}
          onChangeText={setScoreValue}
          returnKeyType="next"
          accessibilityLabel="Score"
        />
      </View>
    )
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Mi resultado">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[
            modalStyles.scrollContent,
            { paddingBottom: insets.bottom + 16 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Score inputs (dinámicos por scoreType) — el total que define el ranking ── */}
          {renderScoreInputs()}

          {/* ── Desglose por movimiento (solo informativo, no afecta el ranking) ── */}
          {showMovementBreakdown && (
            <View style={modalStyles.inputGroup}>
              <Text style={[modalStyles.label, { color: c.text2 }]}>Detalle por movimiento</Text>
              {movements.map((m) => (
                <View key={m.id} style={modalStyles.movementRow}>
                  <Text style={[modalStyles.movementName, { color: c.text1 }]} numberOfLines={1}>
                    {m.movementName}
                  </Text>
                  <TextInput
                    style={[
                      modalStyles.input,
                      modalStyles.movementInput,
                      { backgroundColor: c.background, borderColor: c.border, color: c.text1 },
                    ]}
                    placeholder={m.repScheme ?? 'ej: 20x5'}
                    placeholderTextColor={c.text3}
                    value={movementValues[m.id] ?? ''}
                    onChangeText={(v) => setMovementValues(prev => ({ ...prev, [m.id]: v }))}
                    returnKeyType="next"
                    accessibilityLabel={`Resultado de ${m.movementName}`}
                  />
                </View>
              ))}
            </View>
          )}

          {/* ── Notas ── */}
          <View style={modalStyles.inputGroup}>
            <Text style={[modalStyles.label, { color: c.text2 }]}>Notas (opcional)</Text>
            <TextInput
              style={[
                modalStyles.input,
                modalStyles.notesInput,
                { backgroundColor: c.background, borderColor: c.border, color: c.text1 },
              ]}
              placeholder="ej: me faltaba movilidad en sentadilla..."
              placeholderTextColor={c.text3}
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={200}
              returnKeyType="done"
              blurOnSubmit
              accessibilityLabel="Notas"
            />
            <Text style={[modalStyles.charCount, { color: c.text3 }]}>{notes.length}/200</Text>
          </View>

          {/* ── Guardar ── */}
          <TouchableOpacity
            style={[
              modalStyles.saveBtn,
              { backgroundColor: c.primary },
              saving && { opacity: 0.6 },
            ]}
            onPress={submit}
            disabled={saving}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Guardar resultado"
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={modalStyles.saveBtnText}>
                {myResult ? 'Actualizar resultado' : 'Guardar resultado'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  )
}

const modalStyles = StyleSheet.create({
  scrollContent: { padding: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    marginBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerHandle: {
    // Spacer para centrar visualmente el título con el botón X
    width: 36,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, flex: 1, textAlign: 'center' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 18, fontWeight: '600' },

  // Form
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 8, letterSpacing: 0.2, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 4 },

  // Desglose por movimiento
  movementRow: { marginBottom: 10 },
  movementName: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  movementInput: { paddingVertical: 11 },

  // Time input
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInputWrap: { flex: 1, alignItems: 'center', gap: 4 },
  timeUnit: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  timeSep: { fontSize: 24, fontWeight: '700', marginBottom: 18 },

  // Save button
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
})

// ─── Route params type ──────────────────────────────────────────────────────────

interface MemberWodRouteParams {
  wodId: string
  wodTitle?: string
  wodDate?: string
  scoreType?: string
}

// ─── Main Screen ────────────────────────────────────────────────────────────────

export default function MemberWodScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { wodId, wodTitle, wodDate, scoreType: initialScoreType } = route.params as MemberWodRouteParams
  const { theme } = useTheme()
  const c = theme.colors
  const { user } = useAuthStore()
  const insets = useSafeAreaInsets()

  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── My result state ─────────────────────────────────────────────────────────
  const [myResult, setMyResult] = useState<MyResult | null>(null)
  const [canRegister, setCanRegister] = useState(true)
  const [blockedReason, setBlockedReason] = useState<'not_booked' | 'not_started' | null>(null)
  const [logModalVisible, setLogModalVisible] = useState(false)
  const [movements, setMovements] = useState<WodMovementLite[]>([])

  const isMember = user?.role === 'MEMBER'

  // ── Fetch leaderboard + my result + detalle del WOD (bloques/movimientos) ──
  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [leaderboardRes, myResultRes, wodRes] = await Promise.allSettled([
        api.get(`/wods/${wodId}/leaderboard`),
        isMember ? api.get(`/wods/${wodId}/results/me`) : Promise.resolve(null),
        isMember ? api.get(`/wods/${wodId}`) : Promise.resolve(null),
      ])

      if (leaderboardRes.status === 'fulfilled') {
        setLeaderboard(leaderboardRes.value.data)
      } else {
        setError('No se pudo cargar la pizarra. Verifica tu conexion.')
      }

      if (myResultRes.status === 'fulfilled' && myResultRes.value !== null) {
        const data = (myResultRes.value as any)?.data
        setMyResult(data?.result ?? null)
        setCanRegister(data?.canRegister ?? true)
        setBlockedReason(data?.blockedReason ?? null)
      }
      // Si es 404 o el usuario no es MEMBER, myResult queda null (no hace nada)

      if (wodRes.status === 'fulfilled' && wodRes.value !== null) {
        setMovements(relevantMovements((wodRes.value as any)?.data?.blocks))
      }
    } catch {
      setError('No se pudo cargar la pizarra. Verifica tu conexion.')
    } finally {
      setLoading(false)
    }
  }, [wodId, isMember])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  const scoreType = leaderboard?.scoreType ?? initialScoreType ?? 'REPS'

  // Pizarra unificada: sin distinción RX/Scaled (no le aporta al alumno, el foco
  // es el resultado) — se re-ordena todo junto por score real, no por el orden
  // rx-primero-scaled-después que trae el leaderboard del backend.
  const rankedEntries = (() => {
    const all = leaderboard?.entries ?? []
    const sorted = scoreType === 'CUSTOM'
      ? [...all].sort((a, b) => new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime())
      : [...all].sort((a, b) => scoreType === 'TIME' ? a.score - b.score : b.score - a.score)
    return sorted.map((entry, i) => ({ ...entry, rank: i + 1 }))
  })()
  // ── Handle result saved ─────────────────────────────────────────────────────
  const handleResultSaved = useCallback((result: MyResult) => {
    setMyResult(result)
    // Refrescar leaderboard para que el nuevo resultado aparezca en la pizarra
    fetchLeaderboard()
  }, [fetchLeaderboard])

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.7}>
          <Text style={[s.backArrow, { color: c.primary }]}>←</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { color: c.text1 }]} numberOfLines={1}>
            {wodTitle ?? 'WOD'}
          </Text>
          {wodDate ? (
            <Text style={[s.headerDate, { color: c.text3 }]}>
              {formatDate(wodDate)}
            </Text>
          ) : null}
        </View>
        {scoreType ? (
          <ScoreTypeBadge scoreType={scoreType} />
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Body */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={c.primary} size={36} />
          <Text style={[s.loadingText, { color: c.text3 }]}>Cargando pizarra...</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={[s.errorText, { color: c.text2 }]}>{error}</Text>
          <TouchableOpacity onPress={fetchLeaderboard} style={[s.retryBtn, { backgroundColor: c.primary }]}>
            <Text style={s.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Pizarra header stats */}
          <View style={[s.statsRow, { borderBottomColor: c.border }]}>
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: c.primary }]}>{leaderboard?.total ?? 0}</Text>
              <Text style={[s.statLabel, { color: c.text3 }]}>Resultados</Text>
            </View>
          </View>

          {/* Leaderboard content */}
          {(leaderboard?.total ?? 0) === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={s.emptyIcon}>🏋️</Text>
              <Text style={[s.emptyTitle, { color: c.text2 }]}>Sin resultados aun</Text>
              <Text style={[s.emptySubtitle, { color: c.text3 }]}>
                Los resultados del WOD apareceran aqui cuando el coach los registre.
              </Text>
            </View>
          ) : (
            <View style={[s.board, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={s.boardHeader}>
                <Text style={[s.boardTitle, { color: c.text1 }]}>Pizarra del dia</Text>
              </View>

              <CategorySection
                entries={rankedEntries}
                currentUserId={user?.userId}
                c={c}
              />
            </View>
          )}

          {/* ── Boton "Registrar mi resultado" — solo para MEMBER ── */}
          {isMember && (
            <TouchableOpacity
              onPress={() => setLogModalVisible(true)}
              activeOpacity={0.85}
              disabled={!myResult && !canRegister}
              style={[
                s.logResultBtn,
                myResult
                  ? {
                      backgroundColor: 'rgba(124,58,237,0.15)',
                      borderWidth: 1,
                      borderColor: c.primary,
                    }
                  : !canRegister
                  ? {
                      backgroundColor: c.border,
                      borderWidth: 0,
                    }
                  : {
                      backgroundColor: c.primary,
                      borderWidth: 0,
                    },
              ]}
              accessibilityRole="button"
              accessibilityLabel={myResult ? 'Actualizar mi resultado' : 'Registrar mi resultado'}
            >
              <Text
                style={[
                  s.logResultBtnText,
                  { color: myResult ? c.primary : !canRegister ? c.text3 : '#fff' },
                ]}
              >
                {myResult ? `Mi resultado: ${myResult.scoreFormatted}` : 'Registrar mi resultado'}
              </Text>
              {myResult ? (
                <Text style={[s.logResultBtnSub, { color: c.text3 }]}>
                  Toca para actualizar
                </Text>
              ) : !canRegister ? (
                <Text style={[s.logResultBtnSub, { color: c.text3 }]}>
                  {blockedReason === 'not_started'
                    ? 'Todavía no empieza tu clase'
                    : 'Necesitás una reserva confirmada en una clase de este WOD'}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* ── Modal de formulario ── */}
      {isMember && (
        <LogResultModal
          visible={logModalVisible}
          onClose={() => setLogModalVisible(false)}
          onSaved={handleResultSaved}
          wodId={wodId}
          scoreType={scoreType}
          myResult={myResult}
          movements={movements}
          c={c}
          insets={{ bottom: insets.bottom }}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { fontSize: 22, fontWeight: '700' },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  headerDate: { fontSize: 12, marginTop: 2, textTransform: 'capitalize' },

  // Loading / Error
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { fontSize: 13, marginTop: 8 },
  errorIcon: { fontSize: 36 },
  errorText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24, marginTop: 8 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },

  // Board card
  board: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  boardHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  boardTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Empty
  emptyCard: {
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: { fontSize: 36, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // Log result button
  logResultBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  logResultBtnText: { fontWeight: '700', fontSize: 15 },
  logResultBtnSub: { fontSize: 12, marginTop: 4 },
})
