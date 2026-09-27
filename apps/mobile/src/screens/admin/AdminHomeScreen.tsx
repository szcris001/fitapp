import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Image, ActivityIndicator, Animated, ImageBackground,
} from 'react-native'
import { useAuthStore } from '../../store/auth.store'
import { useTheme } from '../../theme/ThemeContext'
import { usePlatformAssets } from '../../context/PlatformAssetsContext'
import api, { API_BASE as API_URL } from '../../lib/api'

export default function AdminHomeScreen({ navigation }: any) {
  const { user } = useAuthStore()
  const { theme } = useTheme()
  const c = theme.colors
  const { mobilePlatformLogo } = usePlatformAssets()

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const [gym, setGym] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [todayClasses, setTodayClasses] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dashboardBg, setDashboardBg] = useState<string | null>(null)

  const fadeAnim = useState(new Animated.Value(0))[0]

  useEffect(() => {
    fetchData()
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start()
    // Imagen de fondo desde config de plataforma
    api.get('/platform/assets').then(res => {
      const a = res.data?.assets
      const url = a?.mobile_dashboard_bg ?? a?.dashboard_bg ?? null
      if (url) setDashboardBg(`${API_URL}${url}`)
    }).catch(() => {})
  }, [])

  const fetchData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const requests: Promise<any>[] = [
        api.get('/gyms/me'),
        api.get(`/classes?from=${today}&to=${today}`),
      ]
      if (isAdmin) {
        requests.push(api.get('/gyms/me/stats'))
        requests.push(api.get('/ai/retention-alerts'))
      }
      const results = await Promise.allSettled(requests)
      if (results[0].status === 'fulfilled') setGym(results[0].value.data)
      if (results[1].status === 'fulfilled') setTodayClasses(results[1].value.data)
      if (isAdmin) {
        if (results[2].status === 'fulfilled') setStats(results[2].value.data)
        if (results[3].status === 'fulfilled') setAlerts(results[3].value.data)
      }
    } catch { }
    finally { setLoading(false); setRefreshing(false) }
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 19) return 'Buenas tardes'
    return 'Buenas noches'
  }

  const roleLabel = user?.role === 'ADMIN' ? 'Admin'
    : user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Coach'
  const alertCount = (alerts?.atRiskMembers?.length || 0) + (alerts?.expiringMemberships?.length || 0)

  const s = makeStyles(c)

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} size={36} />
      </View>
    )
  }

  return (
    <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
      {dashboardBg && (
        <ImageBackground
          source={{ uri: dashboardBg }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        >
          <View style={s.bgOverlay} />
        </ImageBackground>
      )}
      <ScrollView
        style={s.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData() }}
            tintColor={c.primary}
          />
        }
      >
        {/* Header */}
        <View style={s.gymHeader}>
          <View style={s.gymInfo}>
            {gym?.logoUrl ? (
              <Image source={{ uri: `${API_URL}${gym.logoUrl}` }} style={s.gymLogo} />
            ) : (
              <View style={[s.gymLogoPlaceholder, { backgroundColor: c.primary + '25' }]}>
                <Text style={[s.gymLogoText, { color: c.primary }]}>{gym?.name?.[0]}</Text>
              </View>
            )}
            <Text style={s.gymName}>{gym?.name || 'FitApp'}</Text>
          </View>
          <View style={[s.roleBadge, { backgroundColor: c.primary + '18', borderColor: c.primary + '35' }]}>
            <Text style={[s.roleText, { color: c.primary }]}>{roleLabel}</Text>
          </View>
        </View>

        {/* Greeting */}
        <View style={s.greetingWrap}>
          <Text style={s.greetingText}>{greeting()}, {user?.name}</Text>
        </View>

        {/* Stats row */}
        {stats && (
          <View style={s.statsRow}>
            {[
              { num: stats.members?.total ?? 0, lbl: 'Miembros', color: c.primary },
              { num: stats.members?.active ?? 0, lbl: 'Activos', color: c.success },
              { num: stats.members?.trial ?? 0, lbl: 'Prueba', color: c.warning },
              { num: stats.members?.inactive ?? 0, lbl: 'Inactivos', color: c.error },
            ].map(({ num, lbl, color }) => (
              <View key={lbl} style={[s.statCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[s.statNum, { color }]}>{num}</Text>
                <Text style={[s.statLbl, { color: c.text3 }]}>{lbl}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Alert banner */}
        {alertCount > 0 && (
          <TouchableOpacity
            style={[s.alertBanner, { backgroundColor: c.error + '12', borderColor: c.error + '30' }]}
            onPress={() => navigation.navigate('AIAlerts')}
          >
            <Text style={s.alertIcon}>⚠</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.alertTitle, { color: c.text1 }]}>
                {alertCount} alerta{alertCount !== 1 ? 's' : ''} activa{alertCount !== 1 ? 's' : ''}
              </Text>
              <Text style={[s.alertSub, { color: c.error }]}>Ver alertas de retención IA →</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Today's classes */}
        <Text style={[s.sectionTitle, { color: c.text3 }]}>CLASES DE HOY</Text>
        {todayClasses.length === 0 ? (
          <View style={[s.emptyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[s.emptyText, { color: c.text3 }]}>No hay clases programadas para hoy</Text>
          </View>
        ) : (
          todayClasses.map(cls => {
            const booked = cls._count?.bookings || 0
            const occupancy = cls.capacity > 0 ? Math.round((booked / cls.capacity) * 100) : 0
            const isFull = booked >= cls.capacity
            const barColor = isFull ? c.error : occupancy >= 70 ? c.warning : c.success

            return (
              <TouchableOpacity
                key={cls.id}
                style={[s.classCard, { backgroundColor: c.surface, borderColor: c.border }]}
                onPress={() => navigation.navigate('AdminClasses', { screen: 'ClassDetail', params: { classId: cls.id } })}
                activeOpacity={0.8}
              >
                <View style={[s.classBar, { backgroundColor: cls.classType?.color || c.primary }]} />
                <View style={s.classContent}>
                  <View style={s.classHeader}>
                    <Text style={[s.className, { color: c.text1 }]}>{cls.classType?.name}</Text>
                    <Text style={[s.slots, { color: isFull ? c.error : c.primary }]}>{booked}/{cls.capacity}</Text>
                  </View>
                  <Text style={[s.classTime, { color: c.text3 }]}>
                    {new Date(cls.startsAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} —{' '}
                    {new Date(cls.endsAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <View style={[s.progressBar, { backgroundColor: c.surfaceHighlight }]}>
                    <View style={[s.progressFill, { width: `${occupancy}%` as any, backgroundColor: barColor }]} />
                  </View>
                </View>
              </TouchableOpacity>
            )
          })
        )}

        {/* Expiring memberships */}
        {alerts?.expiringMemberships?.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { color: c.text3 }]}>VENCIMIENTOS PRÓXIMOS</Text>
            {alerts.expiringMemberships.slice(0, 3).map((m: any) => (
              <TouchableOpacity
                key={m.userId}
                style={[s.expiringRow, { backgroundColor: c.surface, borderColor: c.warning + '30' }]}
                onPress={() => navigation.navigate('Members', { screen: 'MemberDetail', params: { memberId: m.userId } })}
              >
                <View style={[s.expiringAvatar, { backgroundColor: c.warning + '20' }]}>
                  <Text style={[s.expiringAvatarText, { color: c.warning }]}>
                    {m.userName?.[0]?.toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.expiringName, { color: c.text1 }]}>{m.userName}</Text>
                  <Text style={[s.expiringPlan, { color: c.text3 }]}>{m.planName}</Text>
                </View>
                <Text style={[s.expiringDays, { color: c.warning }]}>{m.daysLeft}d</Text>
              </TouchableOpacity>
            ))}
            {alerts.expiringMemberships.length > 3 && (
              <TouchableOpacity style={s.seeMore} onPress={() => navigation.navigate('AIAlerts')}>
                <Text style={[s.seeMoreText, { color: c.primary }]}>
                  Ver todos ({alerts.expiringMemberships.length}) →
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </Animated.View>
  )
}

function makeStyles(c: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,8,12,0.72)' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background },
    gymHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingTop: 60, paddingBottom: 8,
    },
    gymInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    gymLogo: { width: 36, height: 36, borderRadius: 8 },
    gymLogoPlaceholder: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    gymLogoText: { fontWeight: '700', fontSize: 16 },
    gymName: { color: c.text2, fontSize: 14, fontWeight: '600' },
    roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
    roleText: { fontSize: 12, fontWeight: '700' },
    greetingWrap: { paddingHorizontal: 24, paddingVertical: 16 },
    greetingText: { fontSize: 24, fontWeight: '800', color: c.text1, letterSpacing: -0.5 },
    statsRow: { flexDirection: 'row', paddingHorizontal: 24, gap: 10, marginBottom: 16 },
    statCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1 },
    statNum: { fontSize: 22, fontWeight: '800' },
    statLbl: { fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'center' },
    alertBanner: {
      marginHorizontal: 24, borderRadius: 14, padding: 14,
      flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, marginBottom: 16,
    },
    alertIcon: { fontSize: 22, color: '#EF4444' },
    alertTitle: { fontWeight: '700', fontSize: 15 },
    alertSub: { fontSize: 13, marginTop: 2 },
    sectionTitle: {
      fontSize: 11, fontWeight: '700', paddingHorizontal: 24,
      marginBottom: 10, marginTop: 8, letterSpacing: 1,
    },
    emptyCard: { marginHorizontal: 24, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1 },
    emptyText: { fontSize: 14 },
    classCard: {
      marginHorizontal: 24, borderRadius: 14, marginBottom: 10,
      flexDirection: 'row', overflow: 'hidden', borderWidth: 1,
    },
    classBar: { width: 4 },
    classContent: { flex: 1, padding: 14 },
    classHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    className: { fontSize: 16, fontWeight: '600' },
    slots: { fontWeight: '700', fontSize: 13 },
    classTime: { fontSize: 13, marginBottom: 10 },
    progressBar: { height: 4, borderRadius: 2 },
    progressFill: { height: 4, borderRadius: 2 },
    expiringRow: {
      flexDirection: 'row', alignItems: 'center', marginHorizontal: 24,
      borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, gap: 12,
    },
    expiringAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    expiringAvatarText: { fontWeight: '700', fontSize: 15 },
    expiringName: { fontSize: 14, fontWeight: '600' },
    expiringPlan: { fontSize: 12 },
    expiringDays: { fontWeight: '800', fontSize: 16 },
    seeMore: { marginHorizontal: 24, paddingVertical: 10, alignItems: 'center' },
    seeMoreText: { fontSize: 13, fontWeight: '600' },
  })
}
