import React, { useEffect, useRef } from 'react'
import { StatusBar } from 'react-native'
import * as Notifications from 'expo-notifications'
import { NavigationContainerRef } from '@react-navigation/native'
import AppNavigator from './src/navigation/AppNavigator'

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
      navigationRef.current?.navigate('Classes')
      break
    default:
      break
  }
}

export default function App() {
  const notifListener = useRef<Notifications.EventSubscription | null>(null)
  const responseListener = useRef<Notifications.EventSubscription | null>(null)

  useEffect(() => {
    // Notificación recibida con app en primer plano (solo log, el banner ya aparece)
    notifListener.current = Notifications.addNotificationReceivedListener(_n => {})

    // Usuario toca la notificación (app en segundo plano o cerrada)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, any>
      navigateOnTap(data)
    })

    return () => {
      notifListener.current?.remove?.()
      responseListener.current?.remove?.()
    }
  }, [])

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#030712" />
      <AppNavigator />
    </>
  )
}
