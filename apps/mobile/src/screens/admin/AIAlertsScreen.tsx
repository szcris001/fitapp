import React, { useState, useCallback } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../lib/api'

export default function AIAlertsScreen({ navigation }: any) {
  const [alerts, setAlerts] = useState<any>(null)
  const [insights, setInsights] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAlerts = async () => {
    try {
      const { data } = await api.get('/ai/retention-alerts')
      setAlerts(data)
    } catch { }
    finally { setLoading(false); setRefreshing(false) }
  }

  useFocusEffect(useCallback(() => { fetchAlerts() }, []))

  const loadInsights = async () => {
    setLoadingInsights(true)
    try {
      const { data } = await api.get('/ai/insights')
      setInsights(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
    } catch { }
    finally { setLoadingInsights(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#6366f1" size={36} /></View>

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAlerts() }} tintColor="#6366f1" />}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.title}>Alertas IA</Text>
      </View>

      {alerts?.expiringMemberships?.length > 0 && (
        <>
          <Text style={s.sectionTitle}>VENCIMIENTOS PRÓXIMOS</Text>
          {alerts.expiringMemberships.map((m: any) => (
            <View key={m.userId} style={[s.alertCard, s.alertAmber]}>
              <View style={s.alertIcon}><Text>⏰</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.alertName}>{m.userName}</Text>
                <Text style={s.alertMsg}>Vence en {m.daysLeft} día{m.daysLeft !== 1 ? 's' : ''} — {m.planName}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {alerts?.atRiskMembers?.length > 0 && (
        <>
          <Text style={s.sectionTitle}>EN RIESGO DE ABANDONO</Text>
          {alerts.atRiskMembers.map((m: any) => (
            <View key={m.userId} style={[s.alertCard, s.alertRed]}>
              <View style={s.alertIcon}><Text>🚨</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.alertName}>{m.userName}</Text>
                <Text style={s.alertMsg}>{m.alertMessage || `Sin actividad reciente`}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {(!alerts?.expiringMemberships?.length && !alerts?.atRiskMembers?.length) && (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>✅</Text>
          <Text style={s.emptyText}>No hay alertas activas</Text>
          <Text style={s.emptySubtext}>Todo parece estar bien en el gym</Text>
        </View>
      )}

      <View style={s.insightsSection}>
        <Text style={s.sectionTitle}>INSIGHTS IA</Text>
        {!insights ? (
          <TouchableOpacity style={s.loadInsightsBtn} onPress={loadInsights} disabled={loadingInsights}>
            {loadingInsights
              ? <ActivityIndicator color="#6366f1" size={20} />
              : <Text style={s.loadInsightsBtnText}>🤖 Generar insights con IA</Text>
            }
          </TouchableOpacity>
        ) : (
          <View style={s.insightsCard}>
            <Text style={s.insightsText}>{insights}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 },
  back: { color: '#6366f1', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  sectionTitle: { fontSize: 12, color: '#6b7280', fontWeight: '700', paddingHorizontal: 24, marginTop: 8, marginBottom: 10, letterSpacing: 0.5 },
  alertCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 24, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, gap: 12 },
  alertAmber: { backgroundColor: '#f59e0b10', borderColor: '#f59e0b30' },
  alertRed: { backgroundColor: '#ef444410', borderColor: '#ef444430' },
  alertIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1f2937', justifyContent: 'center', alignItems: 'center' },
  alertName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  alertMsg: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySubtext: { color: '#6b7280', fontSize: 14, marginTop: 6 },
  insightsSection: { marginBottom: 32 },
  loadInsightsBtn: { marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#6366f130' },
  loadInsightsBtnText: { color: '#6366f1', fontWeight: '700', fontSize: 15 },
  insightsCard: { marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#1f2937' },
  insightsText: { color: '#d1d5db', fontSize: 14, lineHeight: 22 },
})
