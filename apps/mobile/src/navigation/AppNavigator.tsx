import React, { useEffect, useState, useRef } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, Text, ActivityIndicator, TouchableOpacity, Image, StyleSheet, Platform, Animated, PanResponder, Modal } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../store/auth.store'
import { ThemeProvider, useTheme } from '../theme/ThemeContext'
import { PlatformAssetsProvider, usePlatformAssets } from '../context/PlatformAssetsContext'
import api from '../lib/api'

// Auth
import LoginScreen from '../screens/LoginScreen'

// Member screens
import HomeScreen from '../screens/HomeScreen'
import ClassesScreen from '../screens/ClassesScreen'
import ProgressScreen from '../screens/ProgressScreen'
import ProfileScreen from '../screens/ProfileScreen'
import PlanesScreenMember from '../screens/PlanesScreen'
import MemberWodScreen from '../screens/MemberWodScreen'

// Admin screens
import AdminHomeScreen from '../screens/admin/AdminHomeScreen'
import AdminClassesScreen from '../screens/admin/AdminClassesScreen'
import ClassDetailAdminScreen from '../screens/admin/ClassDetailAdminScreen'
import AssignStudentScreen from '../screens/admin/AssignStudentScreen'
import CreateClassScreen from '../screens/admin/CreateClassScreen'
import MembersScreen from '../screens/admin/MembersScreen'
import MemberDetailScreen from '../screens/admin/MemberDetailScreen'
import CreateMemberScreen from '../screens/admin/CreateMemberScreen'
import AssignMembershipScreen from '../screens/admin/AssignMembershipScreen'
import WodManagementScreen from '../screens/admin/WodManagementScreen'
import CreateWodScreen from '../screens/admin/CreateWodScreen'
import MoreScreen from '../screens/admin/MoreScreen'
import PlansScreen from '../screens/admin/PlansScreen'
import PaymentsScreen from '../screens/admin/PaymentsScreen'
import StaffScreen from '../screens/admin/StaffScreen'
import AIAlertsScreen from '../screens/admin/AIAlertsScreen'
import CommunicationsScreen from '../screens/admin/CommunicationsScreen'
import SettingsScreen from '../screens/admin/SettingsScreen'
import ReportsScreen from '../screens/admin/ReportsScreen'
import QRScannerScreen from '../screens/admin/QRScannerScreen'
import ThemeDemoScreen from '../screens/ThemeDemoScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

const ADMIN_ROLES = ['ADMIN', 'COACH']


type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

const TAB_ICONS: Record<string, { active: IoniconsName; inactive: IoniconsName }> = {
  Home:         { active: 'home',              inactive: 'home-outline' },
  AdminHome:    { active: 'home',              inactive: 'home-outline' },
  Members:      { active: 'people',            inactive: 'people-outline' },
  AdminClasses: { active: 'calendar',          inactive: 'calendar-outline' },
  Classes:      { active: 'calendar',          inactive: 'calendar-outline' },
  Progress:     { active: 'trending-up',       inactive: 'trending-up-outline' },
  AdminWOD:     { active: 'barbell',           inactive: 'barbell-outline' },
  More:         { active: 'ellipsis-horizontal', inactive: 'ellipsis-horizontal-outline' },
  Profile:      { active: 'person',            inactive: 'person-outline' },
}

// ── Globo con nombre del gym que crece a golpes de toque ─────────────────────
// Mecánica: cada toque infla el globo un poco. Si dejas de tocar se desinfla.
// Al llegar al máximo el globo revienta. Modal full-screen = sin recorte.

const BURST_CHARS = ['✨', '⭐', '💫', '🌟', '✦', '✨', '💫', '⭐']
const QUEEN_CHARS = ['⭐', '💛', '✨', '⭐', '💛', '✨', '⭐', '💛']
const MAX_TAPS   = 12   // toques para reventar
const BALLOON_W  = 84   // ancho del globo (px)
const BALLOON_H  = 84   // alto del globo (px)
const STRING_H   = 48   // cuerda debajo del globo (px)
const TOTAL_H    = BALLOON_H + STRING_H          // 132
const PIVOT_OFF  = TOTAL_H / 2                   // 66 — de centro de contenedor a logo

function SparkleGymLogo({ uri, gymName, primaryColor, logoStyle, borderColor, placeholderBg, placeholderBorder }: {
  uri: string | null
  gymName: string | null
  primaryColor: string
  logoStyle: any
  borderColor: string
  placeholderBg: string
  placeholderBorder: string
}) {
  const containerRef = useRef<View>(null)
  const centerRef    = useRef({ cx: 0, cy: 0 })
  const [overlayVisible, setOverlayVisible] = useState(false)

  const balloonScale   = useRef(new Animated.Value(0)).current
  const balloonOpacity = useRef(new Animated.Value(0)).current
  const balloonRiseY   = useRef(new Animated.Value(0)).current
  const tapCount       = useRef(0)
  const isPopping      = useRef(false)
  const currentAnim    = useRef<Animated.CompositeAnimation | null>(null)
  const deflateTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const burst = useRef(
    BURST_CHARS.map((char, i) => ({
      key: i, char,
      tx: new Animated.Value(0), ty: new Animated.Value(0),
      scale: new Animated.Value(0), opacity: new Animated.Value(0),
    }))
  )

  const queenStars = useRef(
    QUEEN_CHARS.map((char, i) => ({
      key: i, char,
      tx: new Animated.Value(0), ty: new Animated.Value(0),
      scale: new Animated.Value(0), opacity: new Animated.Value(0),
    }))
  )

  // ── Cancela el temporizador de desinflado ────────────────────────────────
  function clearDeflate() {
    if (deflateTimer.current) { clearTimeout(deflateTimer.current); deflateTimer.current = null }
  }

  // ── Estrellas doradas que explotan del globo en cada toque ───────────────
  function launchQueenStars(balCX: number, balCY: number, balRadius: number) {
    const count = 4 + Math.floor(Math.random() * 3)   // 4-6 estrellas por toque
    queenStars.current.slice(0, count).forEach(s => {
      const angle = Math.random() * Math.PI * 2
      const r     = balRadius * (0.8 + Math.random() * 0.5)
      const startX = balCX + Math.cos(angle) * r
      const startY = balCY + Math.sin(angle) * r
      const dist   = 28 + Math.random() * 30

      s.tx.stopAnimation(); s.ty.stopAnimation()
      s.scale.stopAnimation(); s.opacity.stopAnimation()
      s.tx.setValue(startX)
      s.ty.setValue(startY)
      s.scale.setValue(0.9)
      s.opacity.setValue(1)

      Animated.parallel([
        Animated.timing(s.tx,      { toValue: startX + Math.cos(angle) * dist, duration: 420, useNativeDriver: true }),
        Animated.timing(s.ty,      { toValue: startY + Math.sin(angle) * dist, duration: 420, useNativeDriver: true }),
        Animated.timing(s.opacity, { toValue: 0, duration: 420, useNativeDriver: true }),
        Animated.sequence([
          Animated.spring(s.scale, { toValue: 1.4, friction: 6, tension: 300, useNativeDriver: true }),
          Animated.timing(s.scale, { toValue: 0,   duration: 180, useNativeDriver: true }),
        ]),
      ]).start()
    })
  }

  // ── Desinflado lento si el usuario deja de tocar ─────────────────────────
  function scheduleDeflate() {
    clearDeflate()
    deflateTimer.current = setTimeout(() => {
      if (isPopping.current || tapCount.current === 0) return
      // Desinfla a 0 a una velocidad proporcional al tamaño actual
      const duration = tapCount.current * 180
      currentAnim.current?.stop()
      currentAnim.current = Animated.parallel([
        Animated.timing(balloonScale,  { toValue: 0, duration, useNativeDriver: true }),
        Animated.timing(balloonRiseY,  { toValue: 0, duration, useNativeDriver: true }),
      ])
      currentAnim.current.start(({ finished }) => {
        if (finished && !isPopping.current) {
          tapCount.current = 0
          balloonOpacity.setValue(0)
          setOverlayVisible(false)
        }
      })
    }, 1500)   // 1.5s sin tocar → empieza a desinflarse
  }

  // ── Explosión final ───────────────────────────────────────────────────────
  function pop() {
    if (isPopping.current) return
    isPopping.current = true
    clearDeflate()
    currentAnim.current?.stop()

    const { cx, cy } = centerRef.current
    // Centro visual del globo al reventar (ya ha subido con el rise)
    const curRise = -((tapCount.current / MAX_TAPS) * (cy * 0.65))
    const burstX  = cx
    const burstY  = (cy - TOTAL_H + BALLOON_H / 2) + curRise

    // Último inflado y desvanecimiento
    Animated.parallel([
      Animated.timing(balloonScale,   { toValue: 3.8, duration: 120, useNativeDriver: true }),
      Animated.timing(balloonOpacity, { toValue: 0,   duration: 200, delay: 50, useNativeDriver: true }),
    ]).start()

    // Partículas salen desde donde está el globo visualmente, no desde el logo
    burst.current.forEach((p, i) => {
      const angle = (i / BURST_CHARS.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
      const dist  = 80 + Math.random() * 60

      p.tx.stopAnimation(); p.ty.stopAnimation()
      p.scale.stopAnimation(); p.opacity.stopAnimation()
      p.tx.setValue(burstX); p.ty.setValue(burstY)
      p.scale.setValue(0); p.opacity.setValue(1)

      Animated.parallel([
        Animated.timing(p.tx,      { toValue: burstX + Math.cos(angle) * dist, duration: 600, useNativeDriver: true }),
        Animated.timing(p.ty,      { toValue: burstY + Math.sin(angle) * dist, duration: 600, useNativeDriver: true }),
        Animated.timing(p.opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        Animated.sequence([
          Animated.spring(p.scale, { toValue: 1.2, friction: 5, tension: 280, useNativeDriver: true }),
          Animated.timing(p.scale, { toValue: 0, duration: 230, delay: 90, useNativeDriver: true }),
        ]),
      ]).start()
    })

    setTimeout(() => {
      tapCount.current = 0
      isPopping.current = false
      balloonScale.setValue(0)
      balloonOpacity.setValue(0)
      balloonRiseY.setValue(0)
      setOverlayVisible(false)
    }, 700)
  }

  // ── Cada toque infla el globo un paso ────────────────────────────────────
  function onTap() {
    if (isPopping.current) return

    // Primer toque: medir posición y arrancar animación DENTRO del callback.
    // measureInWindow es async; si arrancáramos el spring fuera, terminaría
    // antes de que el Modal sea visible y el usuario no vería la inflación.
    if (tapCount.current === 0) {
      containerRef.current?.measureInWindow((x, y, w, h) => {
        const cx = x + w / 2
        const cy = y + h / 2
        centerRef.current = { cx, cy }
        balloonOpacity.setValue(1)
        setOverlayVisible(true)
        tapCount.current = 1
        const scaleT = 0.25 + (1 / MAX_TAPS) * 2.25
        // Rise: máx 48% de cy, nunca más arriba de 110px del borde superior
        const rawRise = -((1 / MAX_TAPS) * (cy * 0.48))
        const riseT   = Math.max(rawRise, 110 - cy)
        currentAnim.current = Animated.parallel([
          Animated.spring(balloonScale, { toValue: scaleT, friction: 2.2, tension: 190, useNativeDriver: true }),
          Animated.spring(balloonRiseY, { toValue: riseT,  friction: 8,   tension: 80,  useNativeDriver: true }),
        ])
        currentAnim.current.start()
        // Estrellas doradas — centro aproximado del globo en pantalla
        const balCY = cy - 66 - 24 * scaleT + riseT
        launchQueenStars(cx, balCY, 42 * scaleT)
        scheduleDeflate()
      })
      return   // ← no ejecutar el resto de forma sincrónica
    }

    // Toques 2…MAX_TAPS
    clearDeflate()
    currentAnim.current?.stop()
    tapCount.current++

    const { cx, cy } = centerRef.current
    const scaleTarget = 0.25 + (tapCount.current / MAX_TAPS) * 2.25
    const rawRise     = -((tapCount.current / MAX_TAPS) * (cy * 0.48))
    const riseTarget  = Math.max(rawRise, 110 - cy)
    currentAnim.current = Animated.parallel([
      Animated.spring(balloonScale, { toValue: scaleTarget, friction: 2.2, tension: 190, useNativeDriver: true }),
      Animated.spring(balloonRiseY, { toValue: riseTarget,  friction: 8,   tension: 80,  useNativeDriver: true }),
    ])
    currentAnim.current.start()
    // Estrellas doradas en cada rebote
    const balCY = cy - 66 - 24 * scaleTarget + riseTarget
    launchQueenStars(cx, balCY, 42 * scaleTarget)

    if (tapCount.current >= MAX_TAPS) {
      setTimeout(() => pop(), 320)
    } else {
      scheduleDeflate()
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => false,
      onPanResponderGrant:     () => onTap(),
      onPanResponderRelease:   () => {},
      onPanResponderTerminate: () => {},
    })
  )

  const { cx, cy } = centerRef.current

  return (
    <>
      {/* Logo — receptor de toques */}
      <View ref={containerRef} {...panResponder.current.panHandlers}>
        {uri ? (
          <Image source={{ uri }} style={[logoStyle, { borderColor }]} resizeMode="contain" />
        ) : (
          <View style={[logoStyle, { backgroundColor: placeholderBg, borderColor: placeholderBorder }]} />
        )}
      </View>

      {/* Overlay full-screen: el globo puede crecer fuera del tab bar */}
      <Modal visible={overlayVisible} transparent animationType="none" statusBarTranslucent>
        {/* box-none: el root no consume toques, solo los hijos declarados sí.
            El tap target invisible sobre el logo es el único punto activo. */}
        <View style={{ flex: 1 }} pointerEvents="box-none">

          {/* Globo + cuerda
              El contenedor se posiciona con su base justo en el logo (cy).
              El pivote de escala se ancla al logo usando pre/post translate,
              así el globo crece hacia arriba y la cuerda siempre apunta al logo. */}
          <Animated.View
            style={{
              position: 'absolute',
              left: cx - BALLOON_W / 2,
              top:  cy - TOTAL_H,
              width: BALLOON_W,
              alignItems: 'center',
              opacity: balloonOpacity,
              transform: [
                { translateY: -PIVOT_OFF },   // pivot de escala en el logo
                { scale: balloonScale },
                { translateY:  PIVOT_OFF },   // restaura
                { translateY: balloonRiseY }, // sube conforme crece
              ],
            }}
          >
            {/* Globo — wrapper con sombra (sin overflow para no recortar la sombra) */}
            <View style={{
              width: BALLOON_W,
              height: BALLOON_H,
              borderRadius: BALLOON_W / 2,
              shadowColor: '#000',
              shadowOpacity: 0.45,
              shadowRadius: 20,
              elevation: 14,
            }}>
              {/* Clip interior: recorta imagen al círculo sin borda que empuje el contenido */}
              <View style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: BALLOON_W / 2,
                overflow: 'hidden',
              }}>
                {uri ? (
                  <Image
                    source={{ uri }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ flex: 1, backgroundColor: primaryColor, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 9, textAlign: 'center', paddingHorizontal: 10, lineHeight: 14 }} numberOfLines={4} adjustsFontSizeToFit>
                      {gymName ?? ''}
                    </Text>
                  </View>
                )}
                {/* Brillo tipo globo */}
                <View pointerEvents="none" style={{
                  position: 'absolute', top: 11, left: 13,
                  width: 27, height: 15, borderRadius: 10,
                  backgroundColor: 'rgba(255,255,255,0.42)',
                  transform: [{ rotate: '-28deg' }],
                }} />
              </View>

              {/* Borda overlay encima de la imagen — no afecta el área de clip */}
              <View pointerEvents="none" style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: BALLOON_W / 2,
                borderWidth: 2.5,
                borderColor: 'rgba(255,255,255,0.30)',
              }} />
            </View>

            {/* Nudo del globo */}
            <View style={{
              width: 10, height: 7, borderRadius: 4,
              backgroundColor: uri ? 'rgba(220,220,220,0.75)' : primaryColor,
              marginTop: -1,
            }} />

            {/* Cuerda */}
            <View style={{ width: 1.5, height: STRING_H - 7, backgroundColor: 'rgba(220,220,220,0.65)' }} />
          </Animated.View>

          {/* Zona táctil invisible — exactamente sobre el logo (mismo cx, cy) */}
          <View
            style={{
              position: 'absolute',
              left: cx - 30,
              top:  cy - 30,
              width: 60,
              height: 60,
            }}
            onTouchStart={() => onTap()}
          />

          {/* Estrellas doradas en cada toque (efecto reina) */}
          {queenStars.current.map(s => (
            <Animated.View
              key={`qs-${s.key}`}
              style={{
                position: 'absolute',
                left: -8, top: -8,
                opacity: s.opacity,
                transform: [{ translateX: s.tx }, { translateY: s.ty }, { scale: s.scale }],
              }}
            >
              <Text style={{ fontSize: 12 }}>{s.char}</Text>
            </Animated.View>
          ))}

          {/* Partículas del estallido final */}
          {burst.current.map(p => (
            <Animated.View
              key={p.key}
              style={{
                position: 'absolute',
                left: -7, top: -7,
                opacity: p.opacity,
                transform: [{ translateX: p.tx }, { translateY: p.ty }, { scale: p.scale }],
              }}
            >
              <Text style={{ fontSize: 14 }}>{p.char}</Text>
            </Animated.View>
          ))}

        </View>
      </Modal>
    </>
  )
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const { theme } = useTheme()
  const c = theme.colors
  const { mobilePlatformLogo, gymLogoUrl, gymName } = usePlatformAssets()

  const tabs = state.routes.map((route: any, index: number) => {
    const { options } = descriptors[route.key]
    const label = options.tabBarLabel ?? route.name
    const focused = state.index === index
    const color = focused ? c.primary : c.text3
    const iconSet = TAB_ICONS[route.name]
    const iconName: IoniconsName = iconSet
      ? (focused ? iconSet.active : iconSet.inactive)
      : 'ellipse-outline'

    return (
      <TouchableOpacity
        key={route.key}
        style={tabStyles.tab}
        activeOpacity={0.75}
        onPress={() => navigation.navigate(route.name)}
      >
        <View style={[
          tabStyles.tabInner,
          focused && {
            backgroundColor: c.primary + '22',
            shadowColor: c.primary,
            shadowOpacity: 0.5,
            shadowRadius: 8,
            elevation: 3,
          },
        ]}>
          <Ionicons name={iconName} size={focused ? 23 : 21} color={color} />
          <Text style={[tabStyles.label, { color, fontWeight: focused ? '700' : '500' }]}>{label}</Text>
        </View>
      </TouchableOpacity>
    )
  })

  const mid = Math.floor(tabs.length / 2)
  const leftTabs = tabs.slice(0, mid)
  const rightTabs = tabs.slice(mid)

  return (
    <View style={tabStyles.wrapper}>
      {/* Shadow wrapper — necesita backgroundColor para que Android no pinte rectángulo blanco */}
      <View style={[tabStyles.shadowWrap, { shadowColor: c.primary, backgroundColor: c.tabBar }]}>
        {/* Pill flotante */}
        <View style={[tabStyles.floatingPill, { backgroundColor: c.tabBar }]}>
          {mobilePlatformLogo && (
            <View style={tabStyles.logoBar}>
              <Image source={{ uri: mobilePlatformLogo }} style={tabStyles.platformLogo} resizeMode="contain" />
            </View>
          )}
          <View style={tabStyles.tabs}>
            {/* Grupo izquierdo flex:1 → logo queda siempre en el centro exacto */}
            <View style={tabStyles.tabsGroup}>{leftTabs}</View>
            <View style={tabStyles.gymLogoWrap}>
              <SparkleGymLogo
                uri={gymLogoUrl}
                gymName={gymName}
                primaryColor={c.primary}
                logoStyle={tabStyles.gymLogo}
                borderColor={c.primary + '50'}
                placeholderBg={c.primary + '18'}
                placeholderBorder={c.primary + '40'}
              />
            </View>
            <View style={tabStyles.tabsGroup}>{rightTabs}</View>
          </View>
        </View>
      </View>
    </View>
  )
}

const tabStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 6,
  },
  shadowWrap: {
    borderRadius: 28,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 16,
  },
  floatingPill: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  logoBar: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 2,
  },
  platformLogo: {
    height: 16,
    width: 100,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tabsGroup: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  tab: {
    alignItems: 'center',
  },
  tabInner: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 20,
  },
  gymLogoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  gymLogo: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 1.5,
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.1,
  },
})

function SuperAdminBlockScreen() {
  const { logout } = useAuthStore()
  return (
    <View style={{ flex: 1, backgroundColor: '#0f0f1a', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: '#7c3aed20', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
        <Ionicons name="shield-checkmark" size={36} color="#7c3aed" />
      </View>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 10 }}>
        Acceso solo desde la web
      </Text>
      <Text style={{ color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 40 }}>
        El panel de Super Admin no está disponible en la app móvil.{'\n'}Ingresa desde{' '}
        <Text style={{ color: '#a78bfa' }}>tu navegador web</Text>.
      </Text>
      <TouchableOpacity
        onPress={logout}
        style={{ backgroundColor: '#1e1e35', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1, borderColor: '#2d2d4e' }}
      >
        <Text style={{ color: '#a78bfa', fontWeight: '700', fontSize: 15 }}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  )
}

function ThemedTabNavigator({ role }: { role: string }) {
  const { theme } = useTheme()
  const c = theme.colors

  const screenOptions = {
    headerShown: false,
    // Sin esto React Navigation pinta un rectángulo blanco detrás del customTabBar
    tabBarStyle: {
      backgroundColor: 'transparent',
      borderTopWidth: 0,
      elevation: 0,
      shadowOpacity: 0,
    },
  }
  const tabBar = (props: any) => <CustomTabBar {...props} />

  if (role === 'SUPER_ADMIN') {
    return <SuperAdminBlockScreen />
  }

  if (role === 'ADMIN' || role === 'COACH') {
    return (
      <Tab.Navigator screenOptions={screenOptions} tabBar={tabBar}>
        <Tab.Screen name="AdminHome" component={AdminHomeScreen} options={{ tabBarLabel: 'Inicio' }} />
        <Tab.Screen name="Members" component={MembersStack} options={{ tabBarLabel: 'Alumnos' }} />
        <Tab.Screen name="AdminClasses" component={AdminClassesStack} options={{ tabBarLabel: 'Clases' }} />
        <Tab.Screen name="AdminWOD" component={WodStack} options={{ tabBarLabel: 'WOD' }} />
        <Tab.Screen name="More" component={MoreStack} options={{ tabBarLabel: 'Más' }} />
      </Tab.Navigator>
    )
  }

  // MEMBER
  return (
    <Tab.Navigator screenOptions={screenOptions as any} tabBar={tabBar}>
      <Tab.Screen name="Home" component={MemberHomeStack} options={{ tabBarLabel: 'Inicio' }} />
      <Tab.Screen name="Classes" component={ClassesScreen} options={{ tabBarLabel: 'Clases' }} />
      <Tab.Screen name="Progress" component={ProgressScreen} options={{ tabBarLabel: 'Progreso' }} />
      <Tab.Screen name="Profile" component={MemberProfileStack} options={{ tabBarLabel: 'Perfil' }} />
    </Tab.Navigator>
  )
}

// ── Stacks ────────────────────────────────────────────────────────────────────

function MemberHomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="MemberWod" component={MemberWodScreen} />
    </Stack.Navigator>
  )
}

function MemberProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="Planes" component={PlanesScreenMember} />
    </Stack.Navigator>
  )
}

function AdminClassesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminClassesList" component={AdminClassesScreen} />
      <Stack.Screen name="ClassDetail" component={ClassDetailAdminScreen} />
      <Stack.Screen name="AssignStudent" component={AssignStudentScreen} />
      <Stack.Screen name="CreateClass" component={CreateClassScreen} />
      <Stack.Screen name="QRScanner" component={QRScannerScreen} />
    </Stack.Navigator>
  )
}

function MembersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MembersList" component={MembersScreen} />
      <Stack.Screen name="MemberDetail" component={MemberDetailScreen} />
      <Stack.Screen name="CreateMember" component={CreateMemberScreen} />
      <Stack.Screen name="AssignMembership" component={AssignMembershipScreen} />
    </Stack.Navigator>
  )
}

function WodStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WodList" component={WodManagementScreen} />
      <Stack.Screen name="CreateWod" component={CreateWodScreen} />
    </Stack.Navigator>
  )
}

function MoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MoreMenu" component={MoreScreen} />
      <Stack.Screen name="Plans" component={PlansScreen} />
      <Stack.Screen name="Payments" component={PaymentsScreen} />
      <Stack.Screen name="Staff" component={StaffScreen} />
      <Stack.Screen name="AIAlerts" component={AIAlertsScreen} />
      <Stack.Screen name="Communications" component={CommunicationsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="ThemeDemo" component={ThemeDemoScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  )
}

// ── App root with theme bootstrap ─────────────────────────────────────────────

function AppContent() {
  const { user, loadFromStorage } = useAuthStore()
  const { theme, setSportTheme } = useTheme()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFromStorage().finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user) return
    api.get('/gyms/me')
      .then(({ data }) => {
        if (data.sportTheme) setSportTheme(data.sportTheme)
      })
      .catch(() => {})
  }, [user])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} size={36} />
      </View>
    )
  }

  const c = theme.colors
  // DefaultTheme tiene card:'#fff' → pinta el bloque blanco detrás del tab bar
  const navTheme = {
    dark: true,
    colors: {
      primary: c.primary,
      background: c.background,
      card: c.background,
      text: c.text1,
      border: 'transparent',
      notification: c.primary,
    },
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <Stack.Screen name="Main">
            {() => <ThemedTabNavigator role={user.role} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export default function AppNavigator() {
  return (
    <ThemeProvider>
      <PlatformAssetsProvider>
        <AppContent />
      </PlatformAssetsProvider>
    </ThemeProvider>
  )
}
