import React, { useState, useCallback } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../lib/api'

export default function ReportsScreen({ navigation }: any) {
  const [revenue, setRevenue] = useState<any>(null)
  const [attendance, setAttendance] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    try {
      const [revRes, attRes] = await Promise.all([
        api.get('/payments/revenue'),
        api.get('/classes/attendance'),
      ])
      setRevenue(revRes.data)
      setAttendance(attRes.data)
    } catch { }
    finally { setLoading(false); setRefreshing(false) }
  }

  useFocusEffect(useCallback(() => { fetchData() }, []))

  const fmt = (cents: number, currency = 'CLP') =>
    `${currency} ${(cents / 100).toLocaleString('es-CL')}`

  const maxOccupancy = Math.max(...attendance.map(a => a.avgOccupancy), 1)

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
        <Text style={s.title}>Reportes</Text>
      </View>

      {revenue && (
        <>
          <Text style={s.sectionTitle}>INGRESOS</Text>
          <View style={s.revenueRow}>
            <View style={s.revCard}>
              <Text style={s.revNum}>{fmt(revenue.today?.total || 0)}</Text>
              <Text style={s.revLbl}>Hoy</Text>
              <Text style={s.revCount}>{revenue.today?.count || 0} pagos</Text>
            </View>
            <View style={s.revCard}>
              <Text style={s.revNum}>{fmt(revenue.month?.total || 0)}</Text>
              <Text style={s.revLbl}>Este mes</Text>
              <Text style={s.revCount}>{revenue.month?.count || 0} pagos</Text>
            </View>
            <View style={s.revCard}>
              <Text style={s.revNum}>{fmt(revenue.allTime?.total || 0)}</Text>
              <Text style={s.revLbl}>Total</Text>
              <Text style={s.revCount}>{revenue.allTime?.count || 0} pagos</Text>
            </View>
          </View>
        </>
      )}

      {attendance.length > 0 && (
        <>
          <Text style={s.sectionTitle}>ASISTENCIA POR HORARIO</Text>
          {attendance.map(a => {
            const pct = maxOccupancy > 0 ? (a.avgOccupancy / maxOccupancy) * 100 : 0
            return (
              <View key={a.hour} style={s.attRow}>
                <Text style={s.attHour}>{a.hour}</Text>
                <View style={s.attBarContainer}>
                  <View style={[s.attBar, { width: `${pct}%` as any }]} />
                </View>
                <Text style={s.attCount}>{a.avgOccupancy} avg</Text>
                <Text style={s.attTotal}>{a.total} clases</Text>
              </View>
            )
          })}
        </>
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
  sectionTitle: { fontSize: 12, color: '#6b7280', fontWeight: '700', paddingHorizontal: 24, marginTop: 8, marginBottom: 12, letterSpacing: 0.5 },
  revenueRow: { flexDirection: 'row', paddingHorizontal: 24, gap: 10, marginBottom: 8 },
  revCard: { flex: 1, backgroundColor: '#111827', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#1f2937', alignItems: 'center' },
  revNum: { fontSize: 12, fontWeight: '800', color: '#6366f1', textAlign: 'center' },
  revLbl: { fontSize: 11, color: '#9ca3af', fontWeight: '600', marginTop: 2 },
  revCount: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  attRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginBottom: 10, gap: 10 },
  attHour: { color: '#9ca3af', fontSize: 13, fontWeight: '700', width: 44 },
  attBarContainer: { flex: 1, height: 8, backgroundColor: '#1f2937', borderRadius: 4, overflow: 'hidden' },
  attBar: { height: 8, backgroundColor: '#6366f1', borderRadius: 4 },
  attCount: { color: '#6366f1', fontSize: 13, fontWeight: '700', width: 44, textAlign: 'right' },
  attTotal: { color: '#4b5563', fontSize: 12, width: 52, textAlign: 'right' },
})
