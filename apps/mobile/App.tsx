import React, { useEffect, useRef } from 'react'
import { StatusBar } from 'expo-status-bar'
import { isRunningInExpoGo } from 'expo'
import type * as NotificationsType from 'expo-notifications'
import { NavigationContainerRef } from '@react-navigation/native'
import AppNavigator from './src/navigation/AppNavigator'

// Expo Go no soporta push notifications desde el SDK 53 — incluso solo *importar*
// expo-notifications revienta la app ahí (ExpoTopicSubscriptionModule no existe en
// su runtime nativo, y el módulo llama requireNativeModule() al cargarse). Por eso
// el import es dinámico y condicionado, no estático arriba del archivo.
const isExpoGo = isRunningInExpoGo()

if (!isExpoGo) {
  import('expo-notifications').then((Notifications) => {
    // Comportamiento cuando llega una notificación con la app en primer plano
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    })
  })
}

export const navigationRef = React.createRef<NavigationContainerRef<any>>()

function navigateOnTap(data: Record<string, any> | undefined) {
  if (!data?.type) return
  switch (data.type) {
    case 'MEMBERSHIP_EXPIRY':
      navigationRef.current?.navigate('Profile')
      break
    case 'AUTO_RENEW_SUCCESS':
    case 'AUTO_RENEW_ERROR':
    case 'AUTO_RENEW_FAILED':
      navigationRef.current?.navigate('Profile')
      break
    case 'WAITLIST_CONFIRM':
    case 'WAITLIST_PROMOTED':
    case 'PENDING_CONFIRM_EXPIRED':
    case 'PRECLASS_CONFIRM_REMINDER':
      navigationRef.current?.navigate('Classes')
      break
    default:
      break
  }
}

export default function App() {
  const notifListener = useRef<NotificationsType.EventSubscription | null>(null)
  const responseListener = useRef<NotificationsType.EventSubscription | null>(null)

  useEffect(() => {
    if (isExpoGo) return
    let cancelled = false

    import('expo-notifications').then((Notifications) => {
      if (cancelled) return
      // Notificación recibida con app en primer plano (solo log, el banner ya aparece)
      notifListener.current = Notifications.addNotificationReceivedListener(_n => {})

      // Usuario toca la notificación (app en segundo plano o cerrada)
      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data as Record<string, any>
        navigateOnTap(data)
      })
    })

    return () => {
      cancelled = true
      notifListener.current?.remove?.()
      responseListener.current?.remove?.()
    }
  }, [])

  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  )
}
