---
name: email_module_findings
description: Gotchas y patrones al testear lib/email.ts con vi.mock() de nodemailer en FitHub
type: project
---

Tests de email (src/lib/__tests__/email.test.ts): 21/21 passing.

Patrón validado para mockear módulos de terceros con vi.mock():

**Gotcha 1 — Hoisting de vi.mock() impide referenciar variables del módulo:**
El factory de vi.mock() se ejecuta ANTES de cualquier declaración del módulo (hoisting de Vitest).
Por eso, NO se puede hacer:
```ts
const mockSendMail = vi.fn()  // declarada aquí
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn().mockReturnValue({ sendMail: mockSendMail }) } }))
// ERROR: Cannot access 'mockSendMail' before initialization
```
Solución: el factory solo usa vi.fn() propios. Las referencias al sendMail se gestionan en beforeEach.

**Patrón correcto:**
```ts
vi.mock('nodemailer', () => ({
  default: { createTestAccount: vi.fn(), createTransport: vi.fn(), getTestMessageUrl: vi.fn() }
}))
import nodemailer from 'nodemailer'

let currentSendMail: ReturnType<typeof vi.fn>

beforeEach(() => {
  currentSendMail = vi.fn().mockResolvedValue({ messageId: 'test-msg-id' })
  vi.mocked(nodemailer.createTestAccount).mockClear()
  vi.mocked(nodemailer.createTestAccount).mockResolvedValue({ user: 'test@ethereal.email', pass: 'testpass' } as any)
  vi.mocked(nodemailer.createTransport).mockClear()
  vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: currentSendMail } as any)
})

afterEach(() => {
  vi.restoreAllMocks()  // restaura vi.spyOn, NO afecta vi.mock()
})
```

**Gotcha 2 — vi.restoreAllMocks() NO revierte vi.mock():**
vi.restoreAllMocks() solo revierte vi.spyOn(). Los mocks de vi.mock() persisten por proceso.
Esto es BUENO: permite limpiar spyOn de prisma sin perder el mock de nodemailer.
Pero hay que llamar mockClear() explícitamente en beforeEach para limpiar contadores.

**Gotcha 3 — sendBulkToGyms reimporta nodemailer dinámicamente:**
`const nodemailer = (await import('nodemailer')).default`
Como el módulo ya está en caché con vi.mock(), la misma instancia mockeada es retornada.
El mock de createTransport cubre este caso sin configuración adicional.

**Gotcha 4 — subject de sendExpiryReminder no incluye planName:**
El subject por defecto es "⏰ Tu membresía en {gym.name} vence en {N} día(s)".
El planName solo aparece en el BODY del email, no en el subject.
El test que verifica subject por defecto debe buscar gymName y días, no planName.

**Why:** sin estos patrones, los tests acumulan calls entre describes y los conteos de toHaveBeenCalledOnce() fallan.
**How to apply:** usar este patrón exacto en cualquier test de lib/email.ts o de módulos que usen nodemailer.
