import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheet } from '../../components/BottomSheet'
import { useAuthStore } from '../../store/auth.store'
import { useTheme } from '../../theme/ThemeContext'
import api from '../../lib/api'

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador', COACH: 'Coach', SUPER_ADMIN: 'Super Admin',
}

export default function StaffProfileScreen() {
  const { user, logout } = useAuthStore()
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  const c = theme.colors

  const [gymInfo, setGymInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => {
    api.get('/gyms/me').then(r => setGymInfo(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleChangePassword = async () => {
    if (pwNew.length < 6) return Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres')
    if (pwNew !== pwConfirm) return Alert.alert('Error', 'Las contraseñas no coinciden')
    setPwSaving(true)
    try {
      await api.put('/auth/me', { currentPassword: pwCurrent, newPassword: pwNew })
      Alert.alert('✅ Listo', 'Contraseña actualizada correctamente')
      setShowPasswordModal(false)
      setPwCurrent(''); setPwNew(''); setPwConfirm('')
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo actualizar la contraseña')
    } finally { setPwSaving(false) }
  }

  const s = makeStyles(c)

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={c.primary} size={36} />
      </View>
    )
  }

  return (
    <ScrollView style={s.container}>
      {/* ─── HERO ─── */}
      <View style={[s.hero, { paddingTop: insets.top + 20 }]}>
        <View style={[s.avatar, { backgroundColor: c.primary + '30', borderColor: c.primary }]}>
          <Text style={[s.avatarText, { color: c.primary }]}>{user?.name?.[0]?.toUpperCase()}</Text>
        </View>
        <Text style={[s.heroName, { color: c.text1 }]}>{user?.name}</Text>
        <Text style={[s.heroEmail, { color: c.text3 }]}>{user?.email}</Text>
        {user?.role && (
          <View style={[s.roleBadge, { backgroundColor: c.primary + '18', borderColor: c.primary + '35' }]}>
            <Text style={[s.roleText, { color: c.primary }]}>{ROLE_LABEL[user.role] ?? user.role}</Text>
          </View>
        )}
      </View>

      {/* ─── GIMNASIO ─── */}
      {gymInfo && (
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: c.text3 }]}>GIMNASIO</Text>
          <View style={[s.settingsList, { borderColor: c.border }]}>
            <View style={s.settingRow}>
              <View style={[s.settingIcon, { backgroundColor: '#a78bfa20' }]}>
                <Ionicons name="barbell-outline" size={16} color="#a78bfa" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.settingLabel, { color: c.text1 }]}>{gymInfo.name}</Text>
                {gymInfo.address ? <Text style={[s.settingSub, { color: c.text3 }]}>{gymInfo.address}</Text> : null}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ─── MI CUENTA ─── */}
      <View style={s.section}>
        <Text style={[s.sectionLabel, { color: c.text3 }]}>MI CUENTA</Text>
        <View style={[s.settingsList, { borderColor: c.border }]}>
          <TouchableOpacity style={s.settingRow} onPress={() => setShowPasswordModal(true)} activeOpacity={0.7}>
            <View style={[s.settingIcon, { backgroundColor: '#22d3ee20' }]}>
              <Ionicons name="lock-closed-outline" size={16} color="#22d3ee" />
            </View>
            <Text style={[s.settingLabel, { color: c.text1, flex: 1 }]}>Cambiar contraseña</Text>
            <Ionicons name="chevron-forward" size={16} color={c.text3} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── CERRAR SESIÓN ─── */}
      <View style={[s.section, { marginBottom: 40 }]}>
        <TouchableOpacity
          style={[s.logoutBtn, { borderColor: c.border }]}
          onPress={() => Alert.alert('Cerrar sesión', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', style: 'destructive', onPress: logout },
          ])}
        >
          <Text style={s.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>

      {/* ─── MODAL CAMBIO DE CONTRASEÑA ─── */}
      <BottomSheet visible={showPasswordModal} onClose={() => setShowPasswordModal(false)} title="🔑 Cambiar contraseña">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ gap: 14, padding: 24 }}>
            <View>
              <Text style={s.fieldLabel}>Contraseña actual</Text>
              <TextInput
                secureTextEntry value={pwCurrent} onChangeText={setPwCurrent}
                style={s.textInput} placeholder="••••••••" placeholderTextColor="#4b5563"
              />
            </View>
            <View>
              <Text style={s.fieldLabel}>Nueva contraseña</Text>
              <TextInput
                secureTextEntry value={pwNew} onChangeText={setPwNew}
                style={s.textInput} placeholder="Mínimo 6 caracteres" placeholderTextColor="#4b5563"
              />
            </View>
            <View>
              <Text style={s.fieldLabel}>Confirmar contraseña</Text>
              <TextInput
                secureTextEntry value={pwConfirm} onChangeText={setPwConfirm}
                style={s.textInput} placeholder="••••••••" placeholderTextColor="#4b5563"
              />
            </View>
            <TouchableOpacity
              onPress={handleChangePassword}
              disabled={pwSaving}
              style={[s.saveBtn, { backgroundColor: c.primary }, pwSaving && { opacity: 0.6 }]}
            >
              {pwSaving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveBtnText}>Actualizar contraseña</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </BottomSheet>
    </ScrollView>
  )
}

function makeStyles(c: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background },

    hero: { alignItems: 'center', paddingBottom: 24, paddingHorizontal: 24 },
    avatar: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 2, marginBottom: 10 },
    avatarText: { fontSize: 30, fontWeight: '700' },
    heroName: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
    heroEmail: { fontSize: 12, marginBottom: 10 },
    roleBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
    roleText: { fontSize: 12, fontWeight: '700' },

    section: { paddingHorizontal: 16, marginBottom: 14 },
    sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },

    settingsList: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
    settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    settingIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    settingLabel: { fontSize: 14, fontWeight: '600' },
    settingSub: { fontSize: 12, marginTop: 1 },

    logoutBtn: { paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
    logoutText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },

    fieldLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    textInput: { backgroundColor: '#1f2937', borderRadius: 12, padding: 14, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#374151' },
    saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  })
}
