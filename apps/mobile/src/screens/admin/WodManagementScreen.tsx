import React, { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../lib/api'

export default function WodManagementScreen({ navigation }: any) {
  const [wods, setWods] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchWods = async () => {
    try {
      const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      const to = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
      const { data } = await api.get(`/wods?from=${from}&to=${to}`)
      setWods(data.reverse())
    } catch { }
    finally { setLoading(false); setRefreshing(false) }
  }

  useFocusEffect(useCallback(() => { fetchWods() }, []))

  if (loading) return <View style={s.center}><ActivityIndicator color="#6366f1" size={36} /></View>

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchWods() }} tintColor="#6366f1" />}
    >
      <View style={s.header}>
        <Text style={s.title}>WODs</Text>
        <TouchableOpacity style={s.newBtn} onPress={() => navigation.navigate('CreateWod', {})}>
          <Text style={s.newBtnText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      {wods.length === 0 ? (
        <View style={s.empty}><Text style={s.emptyText}>No hay WODs en este período</Text></View>
      ) : (
        wods.map(wod => (
          <TouchableOpacity
            key={wod.id}
            style={s.card}
            onPress={() => navigation.navigate('CreateWod', { wodId: wod.id })}
            activeOpacity={0.8}
          >
            <View style={[s.typeBar, { backgroundColor: wod.classType?.color || '#6366f1' }]} />
            <View style={s.cardContent}>
              <View style={s.cardHeader}>
                <Text style={s.cardType}>{wod.classType?.name}</Text>
                <Text style={s.cardDate}>
                  {new Date(wod.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
              <Text style={s.cardTitle}>{wod.title || 'Sin título'}</Text>
              <Text style={s.cardMovements}>
                {wod.blocks?.reduce((acc: number, b: any) => acc + (b.movements?.length || 0), 0) || 0} movimientos
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff' },
  newBtn: { backgroundColor: '#6366f1', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  emptyText: { color: '#4b5563', fontSize: 14 },
  card: { marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 16, marginBottom: 10, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: '#1f2937' },
  typeBar: { width: 4 },
  cardContent: { flex: 1, padding: 14 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardType: { color: '#9ca3af', fontSize: 12, fontWeight: '600' },
  cardDate: { color: '#6b7280', fontSize: 12 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardMovements: { color: '#6b7280', fontSize: 13 },
})
