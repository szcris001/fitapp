import React, { useState, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, Vibration } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import api from '../../lib/api'

export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [lastResult, setLastResult] = useState<{ name: string; ok: boolean } | null>(null)
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { classId } = route.params as { classId: string }
  const processingRef = useRef(false)

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (processingRef.current) return
    processingRef.current = true

    let userId: string | null = null
    try {
      const parsed = JSON.parse(data)
      if (parsed.type === 'attendance' && parsed.userId) {
        userId = parsed.userId
      }
    } catch {
      processingRef.current = false
      return
    }

    if (!userId) { processingRef.current = false; return }

    Vibration.vibrate(80)
    setScanned(true)

    try {
      const { data: res } = await api.post(`/classes/${classId}/attendance/qr`, { userId })
      const name = res.name || 'Alumno'
      if (res.alreadyAttended) {
        setLastResult({ name, ok: true })
        Alert.alert('Ya registrado', `${name} ya tiene asistencia marcada.`, [
          { text: 'Escanear otro', onPress: () => { setScanned(false); processingRef.current = false } },
        ])
      } else {
        setLastResult({ name, ok: true })
        // Auto-reset tras 2s para escanear siguiente
        setTimeout(() => { setScanned(false); processingRef.current = false }, 2000)
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'No se pudo registrar asistencia'
      setLastResult({ name: msg, ok: false })
      Alert.alert('Error', msg, [
        { text: 'Reintentar', onPress: () => { setScanned(false); processingRef.current = false } },
      ])
    }
  }

  if (!permission) return <View style={s.container} />

  if (!permission.granted) {
    return (
      <View style={[s.container, s.center]}>
        <Text style={s.permText}>Se requiere acceso a la cámara para escanear QR</Text>
        <TouchableOpacity onPress={requestPermission} style={s.permBtn}>
          <Text style={s.permBtnText}>Conceder permiso</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={s.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Escanear QR</Text>
      </View>

      {/* Viewfinder */}
      <View style={s.viewfinder}>
        <View style={[s.corner, s.cornerTL]} />
        <View style={[s.corner, s.cornerTR]} />
        <View style={[s.corner, s.cornerBL]} />
        <View style={[s.corner, s.cornerBR]} />
      </View>

      {/* Result toast */}
      {lastResult && (
        <View style={[s.resultToast, { backgroundColor: lastResult.ok ? '#14532d' : '#450a0a' }]}>
          <Text style={[s.resultText, { color: lastResult.ok ? '#4ade80' : '#f87171' }]}>
            {lastResult.ok ? `✅ ${lastResult.name}` : `❌ ${lastResult.name}`}
          </Text>
        </View>
      )}

      {/* Bottom hint */}
      <View style={[s.hint, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={s.hintText}>Apunta al QR del alumno</Text>
      </View>
    </View>
  )
}

const CORNER = 24
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  permText: { color: '#fff', textAlign: 'center', marginBottom: 20, fontSize: 15 },
  permBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backBtn: { padding: 4 },
  backText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  viewfinder: {
    position: 'absolute',
    top: '50%', left: '50%',
    width: 220, height: 220,
    marginTop: -110, marginLeft: -110,
  },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#6366f1', borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  resultToast: {
    position: 'absolute', bottom: 120, left: 24, right: 24,
    borderRadius: 14, padding: 16, alignItems: 'center',
  },
  resultText: { fontSize: 16, fontWeight: '700' },
  hint: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)',
    paddingTop: 16,
  },
  hintText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
})
