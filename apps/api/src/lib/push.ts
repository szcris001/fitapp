import { Expo, ExpoPushMessage } from 'expo-server-sdk'

const expo = new Expo()

export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  if (!Expo.isExpoPushToken(pushToken)) return

  const message: ExpoPushMessage = { to: pushToken, title, body, sound: 'default', data }
  try {
    const chunks = expo.chunkPushNotifications([message])
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk)
    }
  } catch {
    // No hacer fallar la operación principal si el push falla
  }
}

export async function sendPushToMany(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const valid = tokens.filter(t => Expo.isExpoPushToken(t))
  if (!valid.length) return

  const messages: ExpoPushMessage[] = valid.map(to => ({ to, title, body, sound: 'default', data }))
  try {
    const chunks = expo.chunkPushNotifications(messages)
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk)
    }
  } catch {
    // No hacer fallar la operación principal
  }
}
