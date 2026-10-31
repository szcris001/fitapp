import { Alert, Platform } from 'react-native'

type AlertButton = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }

// Alert.alert con botones no hace nada en Expo web (react-native-web no implementa
// diálogos nativos) — el callback de confirmación nunca se dispara, así que cualquier
// acción con botones (cancelar reserva, cerrar sesión, eliminar, etc.) queda rota en
// silencio ahí (hallazgo QA mobile-web, 2026-10-30). En web usamos window.confirm/alert
// como reemplazo; en iOS/Android sigue siendo el Alert nativo de siempre.
export function alertButtons(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons)
    return
  }
  const list = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' } as AlertButton]
  const cancelBtn = list.find(b => b.style === 'cancel')
  const confirmBtn = list.find(b => b !== cancelBtn) ?? list[0]
  const text = message ? `${title}\n\n${message}` : title

  if (list.length > 1 && cancelBtn) {
    if (window.confirm(text)) confirmBtn?.onPress?.()
    else cancelBtn.onPress?.()
  } else {
    window.alert(text)
    confirmBtn?.onPress?.()
  }
}
