import React, { useEffect, useRef, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Animated,
  Platform,
  Dimensions,
  StyleSheet,
  ScrollView,
  type DimensionValue,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../theme/ThemeContext'

interface Props {
  visible: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  scrollable?: boolean
  maxHeight?: DimensionValue
}

const SCREEN_H = Dimensions.get('window').height

export function BottomSheet({ visible, onClose, title, children, scrollable, maxHeight = '90%' }: Props) {
  const { theme } = useTheme()
  const c = theme.colors

  const sheetAnim    = useRef(new Animated.Value(SCREEN_H)).current
  const backdropAnim = useRef(new Animated.Value(0)).current
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(sheetAnim, { toValue: 0, friction: 22, tension: 300, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(sheetAnim, { toValue: SCREEN_H, duration: 230, useNativeDriver: true }),
      ]).start(() => setMounted(false))
    }
  }, [visible])

  if (!mounted) return null

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.root}>
        {/* Backdrop */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[s.backdrop, { opacity: backdropAnim }]} />
        </TouchableWithoutFeedback>

        {/* Sheet */}
        <Animated.View
          style={[
            s.sheet,
            {
              backgroundColor: c.surface,
              borderTopColor: c.primary,
              borderLeftColor: c.border,
              borderRightColor: c.border,
              shadowColor: c.primary,
              maxHeight,
            },
            { transform: [{ translateY: sheetAnim }] },
          ]}
        >
          {/* Handle */}
          <View style={s.handleRow}>
            <View style={[s.handle, { backgroundColor: c.primary + '60' }]} />
          </View>

          {/* Título + botón cerrar — siempre visible: la franja del fondo para
              cerrar tocando afuera puede quedar mínima (o tapada por el
              teclado) y en iOS no hay botón atrás que la reemplace. */}
          <View style={[s.titleRow, title ? { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth } : null]}>
            {title ? (
              <Text style={[s.title, { color: c.text1 }]} numberOfLines={1}>
                {title}
              </Text>
            ) : <View style={{ flex: 1 }} />}
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[s.closeBtn, { backgroundColor: c.border }]}
            >
              <Ionicons name="close" size={16} color={c.text2} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {scrollable ? (
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 34 : 20 }}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={{ paddingBottom: Platform.OS === 'ios' ? 34 : 20 }}>
              {children}
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 3,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 24,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 6,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
})
