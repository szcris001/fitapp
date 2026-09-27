import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, Alert,
  Animated, ImageBackground, Dimensions, Image,
  KeyboardAvoidingView, Keyboard, ScrollView,
} from 'react-native'
import { SvgUri } from 'react-native-svg'
import { WebView } from 'react-native-webview'
import { useAuthStore } from '../store/auth.store'
import { API_BASE } from '../lib/api'

const { width } = Dimensions.get('window')

const HERO_IMAGES_DEFAULT = [
  'https://images.unsplash.com/photo-1574680178050-55c6a6a96e0a?auto=format&fit=crop&w=1400&q=85',
  'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=1400&q=85',
  'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1400&q=85',
]

function Field({
  label, placeholder, value, onChangeText,
  secureTextEntry, keyboardType, autoCapitalize,
}: {
  label: string
  placeholder: string
  value: string
  onChangeText: (v: string) => void
  secureTextEntry?: boolean
  keyboardType?: any
  autoCapitalize?: any
}) {
  const [focused, setFocused] = useState(false)
  const borderAnim = useRef(new Animated.Value(0)).current

  const onFocus = () => {
    setFocused(true)
    Animated.timing(borderAnim, { toValue: 1, duration: 180, useNativeDriver: false }).start()
  }
  const onBlur = () => {
    setFocused(false)
    Animated.timing(borderAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start()
  }

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.10)', 'rgba(99,102,241,0.85)'],
  })

  return (
    <Animated.View style={[s.fieldWrap, { borderColor }]}>
      <View style={s.fieldInner}>
        <Text style={[s.fieldLabel, focused && s.fieldLabelFocused]}>{label}</Text>
        <TextInput
          style={s.fieldInput}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={autoCapitalize ?? 'none'}
          autoCorrect={false}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </View>
    </Animated.View>
  )
}

export default function LoginScreen() {
  const [gymSlug, setGymSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login, isLoading } = useAuthStore()

  // Fondos
  const [heroImages, setHeroImages] = useState<string[]>(HERO_IMAGES_DEFAULT)
  const [current, setCurrent] = useState(() => Math.floor(Math.random() * HERO_IMAGES_DEFAULT.length))
  const [nextImg, setNextImg] = useState<number | null>(null)
  const topOpacity = useRef(new Animated.Value(1)).current
  const [platformLogoUri, setPlatformLogoUri] = useState<string | null>(null)
  const [animatedLogoUri, setAnimatedLogoUri] = useState<string | null>(null)
  const [logoError, setLogoError] = useState(false)

  // Animaciones logo — opacity arranca en 1 para que siempre se vea
  const logoScale   = useRef(new Animated.Value(0.8)).current
  const logoOpacity = useRef(new Animated.Value(1)).current

  // Sección logo: colapsa cuando el teclado está abierto
  // Dos valores separados: opacity usa native driver, height no puede usarlo
  const logoFade   = useRef(new Animated.Value(1)).current   // opacity  — native driver
  const logoCollapse = useRef(new Animated.Value(96)).current // height px — non-native

  // Entrada card
  const cardOpacity   = useRef(new Animated.Value(0)).current
  const cardTranslate = useRef(new Animated.Value(20)).current

  useEffect(() => {
    // Assets de la plataforma
    fetch(`${API_BASE}/api/platform/assets`)
      .then(r => r.json())
      .then(data => {
        console.log('[LoginScreen] platform assets:', JSON.stringify(data.assets))
        // Preferir imágenes móviles; fallback a las web si no hay móvil configurado
        const pick = (mobileKey: string, webKey: string) =>
          data.assets?.[mobileKey] ?? data.assets?.[webKey] ?? null
        const custom = [
          pick('mobile_login_bg_1', 'login_bg_1'),
          pick('mobile_login_bg_2', 'login_bg_2'),
          pick('mobile_login_bg_3', 'login_bg_3'),
        ].filter(Boolean).map(p => `${API_BASE}${p}`) as string[]
        if (custom.length > 0) setHeroImages(custom)
        // Logo estático: preferir mobile_platform_logo, fallback a platform_logo
        const staticLogo = data.assets?.mobile_platform_logo ?? data.assets?.platform_logo
        if (staticLogo) setPlatformLogoUri(`${API_BASE}${staticLogo}`)
        if (data.assets?.mobile_logo_animated) {
          setAnimatedLogoUri(`${API_BASE}${data.assets.mobile_logo_animated}`)
        }
      })
      .catch(err => console.log('[LoginScreen] assets fetch error:', err?.message))

    // Pop de escala del logo
    Animated.spring(logoScale, {
      toValue: 1,
      tension: 140,
      friction: 8,
      useNativeDriver: true,
    }).start()

    // Card entra desde abajo
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(cardTranslate, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
      ]).start()
    }, 200)

    // Teclado: colapsa logo al abrir, lo restaura al cerrar
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      Animated.parallel([
        Animated.timing(logoFade, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(logoCollapse, { toValue: 0, duration: 200, useNativeDriver: false }),
      ]).start()
    })
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      Animated.parallel([
        Animated.timing(logoFade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(logoCollapse, { toValue: 96, duration: 220, useNativeDriver: false }),
      ]).start()
    })
    return () => { showSub.remove(); hideSub.remove() }
  }, [])

  // Crossfade de fondo cada 6 s
  useEffect(() => {
    const interval = setInterval(() => {
      const nextIdx = (current + 1) % heroImages.length
      setNextImg(nextIdx)
      Animated.timing(topOpacity, { toValue: 0, duration: 900, useNativeDriver: true }).start(() => {
        setCurrent(nextIdx)
        setNextImg(null)
        topOpacity.setValue(1)
      })
    }, 6000)
    return () => clearInterval(interval)
  }, [current, heroImages])

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Campos requeridos', 'Completa email y contraseña')
      return
    }
    try {
      await login(gymSlug, email, password)
    } catch (err: any) {
      Alert.alert('Acceso denegado', err.response?.data?.error || 'Credenciales incorrectas')
    }
  }

  const showFallbackLogo = !platformLogoUri || logoError
  const logoWidth = width * 0.72

  return (
    <View style={s.root}>
      {/* Fondos crossfade */}
      {nextImg !== null && (
        <ImageBackground source={{ uri: heroImages[nextImg] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: topOpacity }]}>
        <ImageBackground source={{ uri: heroImages[current] }} style={{ flex: 1 }} resizeMode="cover" />
      </Animated.View>

      {/* Oscurecimiento */}
      <View style={s.overlay} />
      <View style={s.overlayBottom} />

      {/* KeyboardAvoidingView sube el contenido cuando aparece el teclado */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Card formulario */}
          <Animated.View style={[s.card, { opacity: cardOpacity, transform: [{ translateY: cardTranslate }] }]}>

            {/* Logo dentro del card — colapsa cuando el teclado está abierto */}
            {/* Outer: height non-native. Inner: opacity native. Nunca mezclar en el mismo View. */}
            <Animated.View style={{ height: logoCollapse, overflow: 'hidden' }}>
              <Animated.View style={[s.logoSection, { opacity: logoFade }]}>
                <Animated.View style={{ transform: [{ scale: logoScale }], alignItems: 'center' }}>
                  {animatedLogoUri ? (
                    // Logo animado HTML via WebView — mismo mecanismo que en web
                    <WebView
                      source={{ uri: animatedLogoUri }}
                      style={{ width: logoWidth, height: logoWidth * 0.3256, backgroundColor: 'transparent' }}
                      scrollEnabled={false}
                      showsHorizontalScrollIndicator={false}
                      showsVerticalScrollIndicator={false}
                      setBuiltInZoomControls={false}
                      androidLayerType="hardware"
                      backgroundColor="transparent"
                      originWhitelist={['*']}
                    />
                  ) : !showFallbackLogo ? (
                    platformLogoUri!.endsWith('.svg') ? (
                      <SvgUri
                        uri={platformLogoUri!}
                        width={width * 0.52}
                        height={64}
                        onError={() => setLogoError(true)}
                      />
                    ) : (
                      <Image
                        source={{ uri: platformLogoUri! }}
                        style={s.logoImg}
                        resizeMode="contain"
                        onError={() => setLogoError(true)}
                      />
                    )
                  ) : (
                    <View style={s.logoText}>
                      <Text style={s.logoSymbol}>⚡</Text>
                      <Text style={s.logoName}>FITAPP</Text>
                    </View>
                  )}
                </Animated.View>
              </Animated.View>
            </Animated.View>
            <Field
              label="Gimnasio"
              placeholder="mi-gimnasio  (opcional)"
              value={gymSlug}
              onChangeText={setGymSlug}
            />
            <Field
              label="Email"
              placeholder="admin@tubox.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <Field
              label="Contraseña"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={[s.btn, isLoading && s.btnLoading]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Iniciar sesión →</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={s.forgotBtn}>
              <Text style={s.forgotText}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>
          </Animated.View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,8,0.50)',
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '60%',
    backgroundColor: 'rgba(8,8,8,0.65)',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 40 : 24,
    paddingBottom: 16,
  },

  // Logo (dentro del card)
  logoSection: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 4,
  },
  logoImg: {
    width: width * 0.52,
    height: 64,
    maxWidth: 220,
  },
  logoText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoSymbol: {
    fontSize: 30,
  },
  logoName: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 3,
  },

  // Card
  card: {
    backgroundColor: 'transparent',
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },

  // Campo
  fieldWrap: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  fieldInner: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.8,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  fieldLabelFocused: {
    color: 'rgba(99,102,241,0.95)',
  },
  fieldInput: {
    fontSize: 15,
    color: '#F2F2F2',
    padding: 0,
    margin: 0,
  },

  // Botón
  btn: {
    backgroundColor: '#6366F1',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  btnLoading: {
    opacity: 0.6,
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  forgotBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.30)',
  },
})
