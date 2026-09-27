import React, { useState, useCallback } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../lib/api'

const METHOD_LABEL: Record<string, string> = {
  cash: '💵 Efectivo', transfer: '🏦 Transferencia', card: '💳 Tarjeta',
  stripe: '💳 Stripe', other: '🔄 Otro',
}

export default function PaymentsScreen({ navigation }: any) {
  const [revenue, setRevenue] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    try {
      const [revRes, histRes] = await Promise.all([
        api.get('/payments/revenue'),
        api.get('/payments/history'),
      ])
      setRevenue(revRes.data)
      setHistory(histRes.data)
    } catch { }
    finally { setLoading(false); setRefreshing(false) }
  }

  useFocusEffect(useCallback(() => { fetchData() }, []))

  const fmt = (cents: number, currency = 'CLP') =>
    `${currency} ${(cents / 100).toLocaleString('es-CL')}`

  if (loading) return <View style={s.center}><ActivityIndicator color="#6366f1" size={36} /></View>

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor="#6366f1" />}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.title}>Pagos</Text>
      </View>

      {revenue && (
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{fmt(revenue.today?.total || 0)}</Text>
            <Text style={s.statLbl}>Hoy</Text>
            <Text style={s.statCount}>{revenue.today?.count || 0} pagos</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{fmt(revenue.month?.total || 0)}</Text>
            <Text style={s.statLbl}>Este mes</Text>
            <Text style={s.statCount}>{revenue.month?.count || 0} pagos</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{fmt(revenue.allTime?.total || 0)}</Text>
            <Text style={s.statLbl}>Total</Text>
            <Text style={s.statCount}>{revenue.allTime?.count || 0} pagos</Text>
          </View>
        </View>
      )}

      <Text style={s.sectionTitle}>HISTORIAL</Text>
      {history.length === 0 ? (
        <View style={s.empty}><Text style={s.emptyText}>Sin pagos registrados</Text></View>
      ) : (
        history.map((p: any) => (
          <View key={p.id} style={s.payRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.payName}>{p.user?.name}</Text>
              <Text style={s.payPlan}>{p.plan?.name}</Text>
              <Text style={s.payMethod}>{METHOD_LABEL[p.paymentMethod] || p.paymentMethod}</Text>
            </View>
            <View style={s.payRight}>
              <Text style={s.payAmount}>{fmt(p.amountCents, p.currency)}</Text>
              <Text style={s.payDate}>{new Date(p.createdAt).toLocaleDateString('es-CL')}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 },
  back: { color: '#6366f1', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 24, gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#111827', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#1f2937', alignItems: 'center' },
  statNum: { fontSize: 13, fontWeight: '800', color: '#6366f1', textAlign: 'center' },
  statLbl: { fontSize: 11, color: '#9ca3af', fontWeight: '600', marginTop: 2 },
  statCount: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  sectionTitle: { fontSize: 12, color: '#6b7280', fontWeight: '700', paddingHorizontal: 24, marginBottom: 10, letterSpacing: 0.5 },
  empty: { marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  emptyText: { color: '#4b5563', fontSize: 14 },
  payRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#1f2937' },
  payName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  payPlan: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  payMethod: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  payRight: { alignItems: 'flex-end' },
  payAmount: { color: '#22c55e', fontSize: 14, fontWeight: '800' },
  payDate: { color: '#6b7280', fontSize: 12, marginTop: 4 },
})
