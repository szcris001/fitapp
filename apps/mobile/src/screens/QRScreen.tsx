import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../store/auth.store'

export default function QRScreen() {
  const { user } = useAuthStore()
  const insets = useSafeAreaInsets()

  if (!user) return null

  const qrValue = JSON.stringify({ userId: user.userId, type: 'attendance' })

  return (
    <View style={[s.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <Text style={s.title}>Mi QR de asistencia</Text>
      <Text style={s.sub}>Muestra este código al coach cuando llegues a clase</Text>

      <View style={s.card}>
        <QRCode
          value={qrValue}
          size={220}
          color="#000"
          backgroundColor="#fff"
        />
      </View>

      <View style={s.infoBox}>
        <Text style={s.infoName}>{user.name}</Text>
        <Text style={s.infoSub}>Escanea con la app del coach para registrar tu asistencia</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  sub: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#6366f1',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
    marginBottom: 32,
  },
  infoBox: {
    alignItems: 'center',
  },
  infoName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  infoSub: {
    fontSize: 12,
    color: '#4b5563',
    textAlign: 'center',
  },
})
