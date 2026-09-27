/**
 * push.test.ts
 *
 * Tests unitarios para apps/api/src/lib/push.ts.
 *
 * Funciones cubiertas:
 *   - sendPushNotification  (7 tests)
 *   - sendPushToMany        (6 tests)
 *   Total: 13 tests
 *
 * Estrategia de mocking:
 *   - expo-server-sdk se mockea completamente con vi.mock().
 *   - Las variables de mock se declaran con vi.hoisted() para evitar el
 *     problema de temporal dead zone con vi.mock() hoisting.
 *   - En beforeEach se llama mockClear() en los tres mocks para que cada
 *     test parta de contadores limpios.
 *
 * Gotcha — hoisting de vi.mock() con variables externas:
 *   El factory de vi.mock() se ejecuta ANTES que cualquier const/let del
 *   módulo. Si se referencian variables externas directamente se obtiene
 *   ReferenceError (temporal dead zone). Solución: vi.hoisted() eleva
 *   la inicialización junto con el factory, garantizando que las variables
 *   estén disponibles cuando vi.mock() las necesita.
 *
 * Gotcha — instancia de Expo a nivel de módulo:
 *   push.ts hace `const expo = new Expo()` en el top-level. Por eso
 *   mockear el constructor con una clase MockExpo que devuelve los métodos
 *   mockeados como propiedades de instancia es suficiente — la instancia
 *   singleton del módulo usará los mocks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mocks elevados (vi.hoisted garantiza disponibilidad en el factory) ────────

const {
  mockSendPushNotificationsAsync,
  mockChunkPushNotifications,
  mockIsExpoPushToken,
} = vi.hoisted(() => ({
  mockSendPushNotificationsAsync: vi.fn().mockResolvedValue([]),
  mockChunkPushNotifications: vi.fn().mockImplementation((msgs: unknown[]) => [msgs]),
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

import { sendPushNotification, sendPushToMany } from '../push'

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockSendPushNotificationsAsync.mockClear()
  mockChunkPushNotifications.mockClear()
  mockIsExpoPushToken.mockClear()
  // Por defecto: token válido
  mockIsExpoPushToken.mockReturnValue(true)
  // Por defecto: un solo chunk con todos los mensajes
  mockChunkPushNotifications.mockImplementation((msgs: unknown[]) => [msgs])
  // Por defecto: envío exitoso
  mockSendPushNotificationsAsync.mockResolvedValue([])
})

// ═══════════════════════════════════════════════════════════════════════════════
// sendPushNotification
// ═══════════════════════════════════════════════════════════════════════════════

describe('sendPushNotification', () => {
  it('token inválido → retorna sin llamar sendPushNotificationsAsync', async () => {
    mockIsExpoPushToken.mockReturnValue(false)

    await sendPushNotification('invalid-token', 'Título', 'Cuerpo')

    expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled()
  })

  it('token válido → llama chunkPushNotifications con mensaje correcto', async () => {
    await sendPushNotification('ExponentPushToken[valid]', 'Título Test', 'Cuerpo Test')

    expect(mockChunkPushNotifications).toHaveBeenCalledOnce()
    const [messages] = mockChunkPushNotifications.mock.calls[0]
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      to: 'ExponentPushToken[valid]',
      title: 'Título Test',
      body: 'Cuerpo Test',
      sound: 'default',
    })
  })

  it('token válido → llama sendPushNotificationsAsync con el chunk', async () => {
    const fakeChunk = [{ to: 'ExponentPushToken[valid]', title: 'T', body: 'B', sound: 'default' }]
    mockChunkPushNotifications.mockReturnValueOnce([fakeChunk])

    await sendPushNotification('ExponentPushToken[valid]', 'T', 'B')

    expect(mockSendPushNotificationsAsync).toHaveBeenCalledOnce()
    expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith(fakeChunk)
  })

  it('data opcional incluido → el mensaje contiene el campo data', async () => {
    const data = { routeName: 'ClassDetail', classId: 'abc-123' }

    await sendPushNotification('ExponentPushToken[valid]', 'Título', 'Cuerpo', data)

    const [messages] = mockChunkPushNotifications.mock.calls[0]
    expect(messages[0].data).toEqual(data)
  })

  it('data undefined → el mensaje tiene data: undefined y no lanza', async () => {
    await expect(
      sendPushNotification('ExponentPushToken[valid]', 'Título', 'Cuerpo', undefined),
    ).resolves.not.toThrow()

    const [messages] = mockChunkPushNotifications.mock.calls[0]
    expect(messages[0].data).toBeUndefined()
  })

  it('sendPushNotificationsAsync lanza → la función NO propaga el error (swallow silencioso)', async () => {
    mockSendPushNotificationsAsync.mockRejectedValueOnce(new Error('Expo service unavailable'))

    await expect(
      sendPushNotification('ExponentPushToken[valid]', 'Título', 'Cuerpo'),
    ).resolves.toBeUndefined()
  })

  it('token válido → la función retorna sin error en cualquier caso', async () => {
    await expect(
      sendPushNotification('ExponentPushToken[valid]', 'Título', 'Cuerpo'),
    ).resolves.toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// sendPushToMany
// ═══════════════════════════════════════════════════════════════════════════════

describe('sendPushToMany', () => {
  it('array vacío → retorna sin llamar sendPushNotificationsAsync', async () => {
    await sendPushToMany([], 'Título', 'Cuerpo')

    expect(mockIsExpoPushToken).not.toHaveBeenCalled()
    expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled()
  })

  it('todos los tokens inválidos → filtra a 0 válidos → retorna sin llamar sendPushNotificationsAsync', async () => {
    mockIsExpoPushToken.mockReturnValue(false)

    await sendPushToMany(
      ['invalid-1', 'invalid-2', 'invalid-3'],
      'Título',
      'Cuerpo',
    )

    expect(mockIsExpoPushToken).toHaveBeenCalledTimes(3)
    expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled()
  })

  it('tokens mixtos (2 válidos, 1 inválido) → chunkPushNotifications recibe solo 2 mensajes', async () => {
    mockIsExpoPushToken.mockImplementation((t: string) => t.startsWith('ExponentPushToken'))

    await sendPushToMany(
      ['ExponentPushToken[t1]', 'invalid-token', 'ExponentPushToken[t2]'],
      'Título',
      'Cuerpo',
    )

    const [messages] = mockChunkPushNotifications.mock.calls[0]
    expect(messages).toHaveLength(2)
    expect(messages[0].to).toBe('ExponentPushToken[t1]')
    expect(messages[1].to).toBe('ExponentPushToken[t2]')
  })

  it('3 tokens válidos → sendPushNotificationsAsync llamado una vez (un solo chunk)', async () => {
    const tokens = [
      'ExponentPushToken[a]',
      'ExponentPushToken[b]',
      'ExponentPushToken[c]',
    ]
    // chunkPushNotifications devuelve un solo chunk por defecto (implementación en beforeEach)

    await sendPushToMany(tokens, 'Título', 'Cuerpo')

    expect(mockSendPushNotificationsAsync).toHaveBeenCalledOnce()
  })

  it('sendPushNotificationsAsync lanza → la función NO propaga el error (swallow silencioso)', async () => {
    mockSendPushNotificationsAsync.mockRejectedValueOnce(new Error('Expo service unavailable'))

    await expect(
      sendPushToMany(['ExponentPushToken[valid]'], 'Título', 'Cuerpo'),
    ).resolves.toBeUndefined()
  })

  it('múltiples chunks → sendPushNotificationsAsync llamado una vez por chunk', async () => {
    const tokens = ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'ExponentPushToken[c]']
    const chunk1 = [{ to: tokens[0] }]
    const chunk2 = [{ to: tokens[1] }, { to: tokens[2] }]

    // Forzar 2 chunks
    mockChunkPushNotifications.mockReturnValueOnce([chunk1, chunk2])

    await sendPushToMany(tokens, 'Título', 'Cuerpo')

    expect(mockSendPushNotificationsAsync).toHaveBeenCalledTimes(2)
    expect(mockSendPushNotificationsAsync).toHaveBeenNthCalledWith(1, chunk1)
    expect(mockSendPushNotificationsAsync).toHaveBeenNthCalledWith(2, chunk2)
  })
})
