import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  FlatList,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeContext'
import { useAuthStore } from '../store/auth.store'
import api from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassType {
  id: string
  name: string
  color?: string
}

interface WodMovement {
  movementName: string
  reps?: number | string
  sets?: number | string
  percentage?: number
  weightRxM?: number
  weightRxF?: number
  notes?: string
}

interface WodBlock {
  title?: string
  scheme?: string
  timecap?: number | string
  notes?: string
  movements: WodMovement[]
}

interface Wod {
  id: string
  title?: string
  description?: string
  date: string
  scoreType?: string
  classTypeId?: string
  classId?: string
  classType?: ClassType
  blocks?: WodBlock[]
  movements?: WodMovement[]
}

interface LeaderboardEntry {
  rank: number
  category: 'RX' | 'SCALED'
  userId: string
  user: { id?: string; name: string; avatarUrl?: string }
  score: number
  scoreFormatted: string
  rx: boolean
  notes?: string
}

interface LeaderboardData {
  wodId: string
  scoreType: string
  total: number
  entries: LeaderboardEntry[]
}

interface MyLoad {
  movementName: string
  calculatedKg?: number
  recommendedKg?: number
  rm?: number
  percentage?: number
}

// ─── Score type metadata ──────────────────────────────────────────────────────

const SCORE_TYPE_META: Record<string, { label: string; emoji: string; color: string }> = {
  TIME:    { label: 'Tiempo',   emoji: '⏱',  color: '#3b82f6' },
  REPS:    { label: 'Reps',     emoji: '🔢',  color: '#10b981' },
  WEIGHT:  { label: 'Peso',     emoji: '🏋️', color: '#f59e0b' },
  ROUNDS:  { label: 'Rounds',   emoji: '🔄',  color: '#8b5cf6' },
  CUSTOM:  { label: 'Custom',   emoji: '✏️', color: '#6b7280' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function rankEmoji(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreTypeBadge({ scoreType, c }: { scoreType?: string; c: any }) {
  if (!scoreType) return null
  const meta = SCORE_TYPE_META[scoreType] ?? { label: scoreType, emoji: '', color: c.text3 }
  return (
    <View style={[
      badgeStyles.pill,
      { backgroundColor: meta.color + '25', borderColor: meta.color + '60' },
    ]}>
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

function MovementRow({ m, myLoad }: { m: WodMovement; myLoad?: MyLoad }) {
  const kgValue = myLoad?.calculatedKg ?? myLoad?.recommendedKg
  return (
    <View style={mvStyles.row}>
      <View style={{ flex: 1 }}>
        <Text style={mvStyles.name}>
          {m.reps ? `${m.reps} ` : ''}{m.movementName}
        </Text>
        {m.notes ? <Text style={mvStyles.notes}>{m.notes}</Text> : null}
      </View>
      <View style={mvStyles.right}>
        {m.sets && m.reps && (
          <Text style={mvStyles.sets}>{m.sets}×{m.reps}</Text>
        )}
        {kgValue ? (
          <View style={mvStyles.kgPill}>
            <Text style={mvStyles.kgText}>{kgValue} kg</Text>
          </View>
        ) : m.weightRxM ? (
          <View style={mvStyles.kgPillRx}>
            <Text style={mvStyles.kgText}>{m.weightRxM}kg Rx</Text>
          </View>
        ) : m.percentage ? (
          <Text style={mvStyles.pct}>@{m.percentage}%</Text>
        ) : null}
      </View>
    </View>
  )
}

const mvStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  name: { fontSize: 15, fontWeight: '600', color: '#e5e7eb' },
  notes: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  sets: { fontSize: 12, color: '#6b7280' },
  kgPill: {
    backgroundColor: '#312e81',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  kgPillRx: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  kgText: { color: '#a5b4fc', fontWeight: '800', fontSize: 13 },
  pct: { color: '#6366f1', fontWeight: '600', fontSize: 13 },
})

// ─── Leaderboard section ──────────────────────────────────────────────────────

function LeaderboardSection({
  data,
  wodId,
  expanded,
  onToggleExpand,
  currentUserId,
  c,
}: {
  data: LeaderboardData
  wodId: string
  expanded: boolean
  onToggleExpand: () => void
  currentUserId?: string
  c: any
}) {
  const rxEntries = data.entries.filter(e => e.category === 'RX')
  const scaledEntries = data.entries.filter(e => e.category === 'SCALED')

  const PREVIEW = 5
  const rxVisible = expanded ? rxEntries : rxEntries.slice(0, PREVIEW)
  const scaledVisible = expanded ? scaledEntries : scaledEntries.slice(0, PREVIEW)
  const hiddenCount =
    Math.max(0, rxEntries.length - PREVIEW) + Math.max(0, scaledEntries.length - PREVIEW)

  const renderEntry = (entry: LeaderboardEntry) => {
    const isMe = entry.userId === currentUserId || entry.user?.id === currentUserId
    return (
      <View
        key={`${entry.category}-${entry.rank}-${entry.userId}`}
        style={[
          lbStyles.row,
          isMe && { backgroundColor: c.primary + '12', borderLeftWidth: 3, borderLeftColor: c.primary },
        ]}
      >
        <Text style={lbStyles.rank}>{rankEmoji(entry.rank)}</Text>
        <Text style={[lbStyles.name, isMe && { color: c.primary, fontWeight: '700' }]} numberOfLines={1}>
          {entry.user?.name ?? '—'}
        </Text>
        <Text style={[lbStyles.score, isMe && { color: c.primary }]}>{entry.scoreFormatted}</Text>
      </View>
    )
  }

  if (data.total === 0) {
    return (
      <View style={lbStyles.emptyWrap}>
        <Text style={lbStyles.emptyText}>Aun no hay resultados registrados</Text>
      </View>
    )
  }

  return (
    <View>
      {rxEntries.length > 0 && (
        <View style={lbStyles.category}>
          <View style={lbStyles.catHeader}>
            <View style={[lbStyles.catBadge, { backgroundColor: c.primary + '20', borderColor: c.primary + '50' }]}>
              <Text style={[lbStyles.catText, { color: c.primary }]}>RX</Text>
            </View>
          </View>
          {rxVisible.map(renderEntry)}
        </View>
      )}

      {scaledEntries.length > 0 && (
        <View style={lbStyles.category}>
          <View style={lbStyles.catHeader}>
            <View style={[lbStyles.catBadge, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b50' }]}>
              <Text style={[lbStyles.catText, { color: '#f59e0b' }]}>SCALED</Text>
            </View>
          </View>
          {scaledVisible.map(renderEntry)}
        </View>
      )}

      {hiddenCount > 0 && !expanded && (
        <TouchableOpacity onPress={onToggleExpand} style={lbStyles.expandBtn}>
          <Text style={[lbStyles.expandText, { color: c.primary }]}>
            Ver todos (+{hiddenCount})
          </Text>
        </TouchableOpacity>
      )}
      {expanded && hiddenCount > 0 && (
        <TouchableOpacity onPress={onToggleExpand} style={lbStyles.expandBtn}>
          <Text style={[lbStyles.expandText, { color: c.text3 }]}>Mostrar menos</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const lbStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  rank: { fontSize: 16, minWidth: 28, textAlign: 'center' },
  name: { flex: 1, fontSize: 14, color: '#e5e7eb', fontWeight: '500' },
  score: { fontSize: 14, fontWeight: '700', color: '#9ca3af' },
  category: { marginBottom: 8 },
  catHeader: { paddingHorizontal: 12, paddingVertical: 8 },
  catBadge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  catText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  emptyWrap: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { color: '#4b5563', fontSize: 13 },
  expandBtn: { paddingVertical: 12, alignItems: 'center' },
  expandText: { fontSize: 13, fontWeight: '600' },
})

// ─── WOD Card ─────────────────────────────────────────────────────────────────

function WodCard({
  wod,
  myLoads,
  leaderboard,
  leaderboardLoading,
  expanded,
  onToggleExpand,
  currentUserId,
  c,
}: {
  wod: Wod
  myLoads: MyLoad[]
  leaderboard?: LeaderboardData
  leaderboardLoading: boolean
  expanded: boolean
  onToggleExpand: () => void
  currentUserId?: string
  c: any
}) {
  const accent = wod.classType?.color || c.primary

  return (
    <View style={[cardStyles.card, { borderColor: accent + '35' }]}>
      {/* Accent bar */}
      <View style={[cardStyles.accentBar, { backgroundColor: accent }]} />

      <View style={{ flex: 1, padding: 16 }}>
        {/* Header row */}
        <View style={cardStyles.headerRow}>
          <View style={{ flex: 1, gap: 6 }}>
            {wod.classType?.name && (
              <View style={[cardStyles.typeBadge, { backgroundColor: accent + '20', borderColor: accent + '50' }]}>
                <View style={[cardStyles.typeDot, { backgroundColor: accent }]} />
                <Text style={[cardStyles.typeText, { color: accent }]}>{wod.classType.name}</Text>
              </View>
            )}
            <Text style={cardStyles.title}>{wod.title || 'Entrenamiento del día'}</Text>
          </View>
          <ScoreTypeBadge scoreType={wod.scoreType} c={c} />
        </View>

        {wod.description ? (
          <Text style={cardStyles.description}>{wod.description}</Text>
        ) : null}

        {/* Blocks */}
        {(wod.blocks || []).map((block, bi) => (
          <View key={bi} style={cardStyles.block}>
            {(block.title || block.scheme) ? (
              <View style={cardStyles.blockHeader}>
                <View style={{ flex: 1 }}>
                  {block.title ? (
                    <Text style={[cardStyles.blockTitle, { color: accent }]}>
                      {block.title.toUpperCase()}
                    </Text>
                  ) : null}
                  {block.scheme ? (
                    <Text style={cardStyles.blockScheme}>{block.scheme}</Text>
                  ) : null}
                </View>
                {block.timecap ? (
                  <View style={cardStyles.timecapBadge}>
                    <Text style={cardStyles.timecapText}>⏱ {block.timecap}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {block.notes ? (
              <Text style={cardStyles.blockNotes}>{block.notes}</Text>
            ) : null}
            {(block.movements || []).map((m, mi) => {
              const load = myLoads.find(l => l.movementName === m.movementName)
              return <MovementRow key={mi} m={m} myLoad={load} />
            })}
          </View>
        ))}

        {/* Legacy movements (no blocks) */}
        {!wod.blocks && (wod.movements || []).map((m, mi) => {
          const load = myLoads.find(l => l.movementName === m.movementName)
          return <MovementRow key={mi} m={m} myLoad={load} />
        })}

        {/* ── Leaderboard ── */}
        <View style={cardStyles.lbSection}>
          <View style={cardStyles.lbHeader}>
            <Text style={cardStyles.lbTitle}>Pizarra</Text>
            {leaderboard && (
              <Text style={[cardStyles.lbCount, { color: c.text3 }]}>
                {leaderboard.total} resultado{leaderboard.total !== 1 ? 's' : ''}
              </Text>
            )}
          </View>

          {leaderboardLoading ? (
            <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} />
          ) : leaderboard ? (
            <LeaderboardSection
              data={leaderboard}
              wodId={wod.id}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              currentUserId={currentUserId}
              c={c}
            />
          ) : (
            <View style={lbStyles.emptyWrap}>
              <Text style={lbStyles.emptyText}>Sin datos de pizarra</Text>
            </View>
          )}
        </View>

        {/* My loads summary (if any not already shown inline) */}
        {myLoads.length > 0 && (
          <View style={cardStyles.myLoadsSection}>
            <Text style={[cardStyles.myLoadsTitle, { color: c.text3 }]}>Mis cargas calculadas</Text>
            {myLoads.map((load, i) => (
              <View key={i} style={cardStyles.myLoadRow}>
                <Text style={cardStyles.myLoadName} numberOfLines={1}>{load.movementName}</Text>
                {(load.calculatedKg || load.recommendedKg) ? (
                  <View style={[cardStyles.myLoadBadge, { backgroundColor: c.primary + '20' }]}>
                    <Text style={[cardStyles.myLoadKg, { color: c.primary }]}>
                      {load.calculatedKg ?? load.recommendedKg} kg
                    </Text>
                  </View>
                ) : load.percentage ? (
                  <Text style={[cardStyles.myLoadKg, { color: c.text3 }]}>@{load.percentage}%</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  accentBar: { width: 5 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  typeDot: { width: 6, height: 6, borderRadius: 3 },
  typeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  title: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  description: { fontSize: 13, color: '#9ca3af', lineHeight: 18, marginBottom: 10 },
  block: { marginTop: 14 },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  blockTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  blockScheme: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e5e7eb',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  blockNotes: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
    lineHeight: 16,
    marginBottom: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.12)',
  },
  timecapBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timecapText: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },

  // Leaderboard
  lbSection: {
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  lbHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  lbTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  lbCount: { fontSize: 12 },

  // My loads
  myLoadsSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  myLoadsTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  myLoadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  myLoadName: { fontSize: 13, color: '#d1d5db', flex: 1 },
  myLoadBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  myLoadKg: { fontSize: 13, fontWeight: '700' },
})

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WODScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const { user } = useAuthStore()
  const insets = useSafeAreaInsets()

  const [classTypes, setClassTypes] = useState<ClassType[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [wods, setWods] = useState<Wod[]>([])
  const [leaderboards, setLeaderboards] = useState<Record<string, LeaderboardData>>({})
  const [leaderboardLoading, setLeaderboardLoading] = useState<Record<string, boolean>>({})
  const [expandedLeaderboard, setExpandedLeaderboard] = useState<Set<string>>(new Set())
  const [myLoads, setMyLoads] = useState<Record<string, MyLoad[]>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // ─── Fetch helpers ─────────────────────────────────────────────────────────

  const fetchClassTypes = useCallback(async () => {
    try {
      const { data } = await api.get('/class-types')
      setClassTypes(Array.isArray(data) ? data : [])
    } catch { /* silently ignore */ }
  }, [])

  const fetchLeaderboard = useCallback(async (wodId: string) => {
    setLeaderboardLoading(prev => ({ ...prev, [wodId]: true }))
    try {
      const { data } = await api.get(`/wods/${wodId}/leaderboard`)
      setLeaderboards(prev => ({ ...prev, [wodId]: data }))
    } catch { /* silently ignore */ }
    finally {
      setLeaderboardLoading(prev => ({ ...prev, [wodId]: false }))
    }
  }, [])

  const fetchMyLoads = useCallback(async (classId: string, wodId: string) => {
    if (!classId) return
    try {
      const { data } = await api.get(`/wods/class/${classId}/my-loads`)
      setMyLoads(prev => ({ ...prev, [wodId]: Array.isArray(data) ? data : [] }))
    } catch { /* silently ignore */ }
  }, [])

  const fetchWods = useCallback(async () => {
    try {
      const today = todayISO()
      const params: Record<string, string> = { from: today, to: today }
      const { data } = await api.get('/wods', { params })
      const list: Wod[] = Array.isArray(data) ? data : []
      setWods(list)

      // Fetch leaderboard + my loads for each wod in parallel
      await Promise.all(
        list.map(wod => Promise.all([
          fetchLeaderboard(wod.id),
          wod.classId ? fetchMyLoads(wod.classId, wod.id) : Promise.resolve(),
        ]))
      )
    } catch { /* silently ignore */ }
    finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fetchLeaderboard, fetchMyLoads])

  useEffect(() => {
    fetchClassTypes()
    fetchWods()
  }, [])

  // ─── Derived state ─────────────────────────────────────────────────────────

  const filteredWods = selectedTypeId
    ? wods.filter(w => w.classTypeId === selectedTypeId || w.classType?.id === selectedTypeId)
    : wods

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchWods()
  }, [fetchWods])

  const toggleExpand = useCallback((wodId: string) => {
    setExpandedLeaderboard(prev => {
      const next = new Set(prev)
      if (next.has(wodId)) next.delete(wodId)
      else next.add(wodId)
      return next
    })
  }, [])

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[screenStyles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} size={36} />
      </View>
    )
  }

  return (
    <ScrollView
      style={[screenStyles.container, { backgroundColor: c.background }]}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={c.primary}
        />
      }
    >
      {/* ── Header ── */}
      <View style={[screenStyles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[screenStyles.pageTitle, { color: c.text1 }]}>WOD del día</Text>
        <Text style={[screenStyles.pageDate, { color: c.text3 }]}>
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
      </View>

      {/* ── Tabs de tipo de clase ── */}
      {classTypes.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={screenStyles.tabBar}
        >
          <TouchableOpacity
            style={[
              screenStyles.tab,
              !selectedTypeId && { backgroundColor: c.primary, borderColor: c.primary },
              !!selectedTypeId && { borderColor: c.border, borderWidth: 1 },
            ]}
            onPress={() => setSelectedTypeId(null)}
          >
            <Text style={[screenStyles.tabText, { color: !selectedTypeId ? '#fff' : c.text3 }]}>
              Todos
            </Text>
          </TouchableOpacity>

          {classTypes.map(ct => {
            const selected = selectedTypeId === ct.id
            const accent = ct.color || c.primary
            return (
              <TouchableOpacity
                key={ct.id}
                style={[
                  screenStyles.tab,
                  selected
                    ? { backgroundColor: accent, borderColor: accent }
                    : { backgroundColor: accent + '18', borderColor: accent + '55', borderWidth: 1 },
                ]}
                onPress={() => setSelectedTypeId(prev => prev === ct.id ? null : ct.id)}
              >
                {ct.color && (
                  <View style={[screenStyles.tabDot, { backgroundColor: selected ? '#fff' : ct.color }]} />
                )}
                <Text style={[screenStyles.tabText, { color: selected ? '#fff' : accent }]}>
                  {ct.name}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {/* ── Content ── */}
      <View style={screenStyles.content}>
        {filteredWods.length === 0 ? (
          <View style={[screenStyles.emptyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ fontSize: 32, marginBottom: 10 }}>🏋️</Text>
            <Text style={[screenStyles.emptyTitle, { color: c.text2 }]}>Sin WOD publicado</Text>
            <Text style={[screenStyles.emptySubtitle, { color: c.text3 }]}>
              {selectedTypeId
                ? 'No hay WOD para este tipo de clase hoy'
                : 'Los entrenamientos de hoy aparecerán aquí'}
            </Text>
          </View>
        ) : (
          filteredWods.map(wod => (
            <WodCard
              key={wod.id}
              wod={wod}
              myLoads={myLoads[wod.id] || []}
              leaderboard={leaderboards[wod.id]}
              leaderboardLoading={!!leaderboardLoading[wod.id]}
              expanded={expandedLeaderboard.has(wod.id)}
              onToggleExpand={() => toggleExpand(wod.id)}
              currentUserId={user?.userId}
              c={c}
            />
          ))
        )}
      </View>
    </ScrollView>
  )
}

const screenStyles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pageDate: {
    fontSize: 13,
    marginTop: 3,
    textTransform: 'capitalize',
  },

  // Class type tabs
  tabBar: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabDot: { width: 7, height: 7, borderRadius: 4 },
  tabText: { fontSize: 13, fontWeight: '700' },

  // Content
  content: { paddingHorizontal: 16 },

  // Empty state
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
})
