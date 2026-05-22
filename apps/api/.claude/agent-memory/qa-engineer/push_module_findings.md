---
name: push_module_findings
description: Gotchas y patrones al testear lib/push.ts con vi.mock() de expo-server-sdk en FitHub
type: project
---

Tests de push notifications (src/lib/__tests__/push.test.ts): 13/13 passing.

**Gotcha clave — expo instancia Expo en top-level del módulo:**
`push.ts` hace `const expo = new Expo()` fuera de cualquier función. Esto significa que
el constructor de `Expo` se llama en el momento de importar el módulo. El mock debe
estar listo ANTES de que el módulo sea importado. Vitest garantiza esto porque vi.mock()
se eleva, pero las variables declaradas con `const` en el scope del módulo NO están
disponibles en el factory (temporal dead zone). Solución: usar `vi.hoisted()`.

**Patrón correcto con vi.hoisted():**
```ts
const { mockSendPushNotificationsAsync, mockChunkPushNotifications, mockIsExpoPushToken } =
  vi.hoisted(() => ({
    mockSendPushNotificationsAsync: vi.fn().mockResolvedValue([]),
    mockChunkPushNotifications: vi.fn().mockImplementation((msgs) => [msgs]),
    mockIsExpoPushToken: vi.fn(),
  }))

vi.mock('expo-server-sdk', () => ({
  Expo: class MockExpo {
    static isExpoPushToken = mockIsExpoPushToken
    chunkPushNotifications = mockChunkPushNotifications
    sendPushNotificationsAsync = mockSendPushNotificationsAsync
  },
  ExpoPushMessage: {},
}))
```

**Por qué vi.hoisted() y no simplemente const antes del vi.mock():**
- `vi.mock()` se eleva al TOP del archivo por Vitest antes de ejecutar ninguna
  declaración del módulo.
- Las variables `const`/`let` del módulo existen pero son uninitialized en ese momento
  (temporal dead zone), por lo que referenciarlas en el factory causa ReferenceError.
- `vi.hoisted()` es la forma canónica de Vitest para crear valores que se elevan junto
  con vi.mock(). Se ejecuta antes de la inicialización del módulo.

**Estructura del mock de Expo:**
- `Expo.isExpoPushToken` es un método estático. Se expone como propiedad estática de la
  clase mock.
- `chunkPushNotifications` y `sendPushNotificationsAsync` son métodos de instancia.
  Se exponen como propiedades (funciones) de la clase mock — el constructor devuelve
  `this` con esas propiedades, que son los mocks del scope de vi.hoisted().

**Comportamiento swallow-silencioso:**
Ambas funciones envuelven el loop de envío en try/catch sin hacer nada con el error.
Los tests deben verificar que `await sendPushNotification(...)` resuelve con undefined
incluso cuando `sendPushNotificationsAsync` lanza. Usar `.resolves.toBeUndefined()`.

**Caso de múltiples chunks:**
`chunkPushNotifications` por defecto devuelve `[msgs]` (un solo chunk). Para testear
múltiples chunks, hacer `mockChunkPushNotifications.mockReturnValueOnce([chunk1, chunk2])`.
El test verifica que `sendPushNotificationsAsync` fue llamado dos veces, una por chunk,
con `toHaveBeenNthCalledWith(1, chunk1)` y `toHaveBeenNthCalledWith(2, chunk2)`.

**Diferencia con el patrón de email (nodemailer):**
- Email usaba la instancia dentro de funciones → el mock de `createTransport` en
  beforeEach era suficiente.
- Push instancia Expo en el top-level → vi.hoisted() es obligatorio para que el
  constructor mockeado esté listo antes de la importación del módulo.

**Why:** sin vi.hoisted(), el factory de vi.mock() lanza ReferenceError al intentar
leer los mocks antes de que estén inicializados.
**How to apply:** cualquier módulo que instancie un cliente de terceros en el top-level
(fuera de funciones) requiere vi.hoisted() para sus variables de mock.
