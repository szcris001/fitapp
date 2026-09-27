import React, { useEffect, useRef, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableWithoutFeedback,
  Animated,
  Platform,
  Dimensions,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useTheme } from '../theme/ThemeContext'

interface Props {
  visible: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  scrollable?: boolean
  maxHeight?: number | string
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

          {/* Title */}
          {title ? (
            <Text style={[s.title, { color: c.text1, borderBottomColor: c.border }]}>
              {title}
            </Text>
          ) : null}

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
    ...StyleSheet.absoluteFillObject,
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
