# SANDBOX_SETUP.md — Configuración de Pasarelas de Prueba

> Este documento lo sigue **Cristian** (no un agente). Los agentes usan las credenciales que tú configures aquí.

**Orden de cierre**: Stripe → Mercado Pago → Transferencia manual.
**Tiempo total estimado**: ~1 hora de setup manual (sin contar tests).

---

## Antes de empezar: proteger credenciales

Ejecuta esto UNA VEZ antes de crear cualquier archivo de credenciales:

```bash
cd ~/fithub

# Asegurarte de que las credenciales nunca se commiteen
echo "" >> .gitignore
echo "# Credenciales sandbox y locales" >> .gitignore
echo ".env.test.sandbox" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore
echo "apps/api/.env.test.sandbox" >> .gitignore

git add .gitignore
git commit -m "chore: ignorar archivos de credenciales en gitignore"
```

Verifica que funcionó:

```bash
echo "test" > apps/api/.env.test.sandbox
git status
# NO debe aparecer .env.test.sandbox en la lista
rm apps/api/.env.test.sandbox
```

---

## Pasarela 1: Stripe (~15 minutos)

Stripe es la más fácil. Una sola cuenta, modo test integrado, documentación excelente.

### Paso 1.1 — Crear cuenta

1. Ir a **https://dashboard.stripe.com/register**
2. Completar: email, nombre, contraseña
3. Confirmar email (revisa spam)
4. NO necesitas completar KYC/verificación de empresa para modo test
5. Al entrar al dashboard, verás arriba a la derecha un toggle **"Test mode"** — actívalo. Todo el dashboard se pone con una barra naranja arriba que dice "TEST DATA"

### Paso 1.2 — Obtener API keys

1. En el dashboard (con test mode activo), ve a **Developers → API keys**
   - URL directa: https://dashboard.stripe.com/test/apikeys
2. Copia estas 2 claves:
   - **Publishable key**: empieza con `pk_test_...` (esta es pública, se usa en frontend)
   - **Secret key**: empieza con `sk_test_...` (esta es SECRETA, solo backend)
3. Si no ves la Secret key completa, haz click en "Reveal test key"

### Paso 1.3 — Configurar Stripe CLI para webhooks locales

Los webhooks son la parte más importante (y donde salen los bugs). Stripe CLI te permite recibir webhooks en tu localhost sin exponer puertos.

```bash
# Instalar Stripe CLI en Ubuntu
# Opción A: via apt
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list
sudo apt update
sudo apt install stripe

# Opción B: descarga directa si apt falla
# Ve a https://github.com/stripe/stripe-cli/releases/latest
# Descarga stripe_X.X.X_linux_x86_64.tar.gz
# tar xzf stripe_*.tar.gz && sudo mv stripe /usr/local/bin/

# Verificar
stripe --version
```

Login y forwarding:

```bash
# Login (abre el navegador para autenticar)
stripe login

# Iniciar forwarding de webhooks a tu API local
# IMPORTANTE: deja esto corriendo en una terminal separada
stripe listen --forward-to localhost:3001/api/payments/webhook/stripe
```

Cuando ejecutes `stripe listen`, te muestra algo como:

```
Ready! Your webhook signing secret is whsec_abc123def456...
```

**Copia ese `whsec_...`** — es el webhook secret para desarrollo local.

### Paso 1.4 — Guardar credenciales

```bash
cat > apps/api/.env.test.sandbox <<'EOF'
# =============================================
# STRIPE (Test Mode)
# =============================================
STRIPE_SECRET_KEY=sk_test_PEGA_AQUI
STRIPE_PUBLISHABLE_KEY=pk_test_PEGA_AQUI
STRIPE_WEBHOOK_SECRET=whsec_PEGA_AQUI

# =============================================
# MERCADO PAGO (Test Mode) — completar después
# =============================================
# MERCADOPAGO_ACCESS_TOKEN=TEST-...
# MERCADOPAGO_PUBLIC_KEY=TEST-...

# =============================================
# FLAGS
# =============================================
FLAG_RUN_SANDBOX=true
EOF
```

### Paso 1.5 — Verificar que funciona (30 segundos)

```bash
# En otra terminal (con stripe listen corriendo en la primera)
stripe trigger payment_intent.succeeded
```

Si todo está bien, en la terminal de `stripe listen` ves:

```
  --> payment_intent.succeeded [evt_xxxxx]
  <-- [200] POST http://localhost:3001/api/payments/webhook/stripe
```

Si tu API no está corriendo, verás un error de conexión — eso está bien por ahora. Lo importante es que Stripe CLI mandó el evento.

### Paso 1.6 — Tarjetas de prueba (referencia rápida)

| Número | Resultado |
|---|---|
| `4242 4242 4242 4242` | Aprueba siempre |
| `4000 0000 0000 0002` | Rechaza siempre (generic_decline) |
| `4000 0000 0000 9995` | Fondos insuficientes |
| `4000 0000 0000 0069` | Tarjeta expirada |
| `4000 0000 0000 3220` | Requiere 3D Secure |
| `4000 0027 6000 3184` | Requiere autenticación (siempre) |

CVV: cualquier 3 dígitos. Fecha: cualquier fecha futura. ZIP: cualquiera.

Lista completa: https://docs.stripe.com/testing#cards

### Stripe: ✅ LISTO

A partir de acá, cuando invoques al `payments-specialist`, él tiene todo lo necesario para ejecutar los 10 puntos del checklist contra sandbox.

---

## Pasarela 2: Mercado Pago (~30 minutos)

Mercado Pago es más complejo porque necesitas **2 cuentas de prueba**: una vendedor y una comprador. Las creas desde el dashboard de tu cuenta real.

### Paso 2.1 — Crear cuenta real de desarrollador

1. Ir a **https://www.mercadopago.com** (elige tu país: Chile, Argentina, México, Colombia, etc.)
2. Crear cuenta con tu email (o usar tu cuenta existente si ya tienes)
3. Ir a **https://www.mercadopago.com/developers/panel**
4. Si es la primera vez, te pide crear una "aplicación de prueba"

### Paso 2.2 — Crear aplicación de integración

1. En el panel de desarrolladores: **Mis integraciones → Crear aplicación**
   - URL directa: https://www.mercadopago.com/developers/panel/app
2. Datos:
   - Nombre: `FitHub Dev`
   - Modelo de integración: **Checkout Pro** (si solo quieres botón de pago) o **Checkout API** (si quieres formulario custom). Para MVP: **Checkout Pro**.
   - Marca "Solo estoy probando" si te lo pregunta
3. Una vez creada, ve a **Credenciales de prueba**:
   - **Public Key**: `TEST-xxxx...`
   - **Access Token**: `TEST-xxxx...`

### Paso 2.3 — Crear cuentas de prueba (vendedor + comprador)

Esto es lo que hace diferente a Mercado Pago. Necesitas usuarios ficticios.

1. En el panel de desarrolladores, ve a **Cuentas de prueba**
   - URL: https://www.mercadopago.com/developers/panel/test-accounts
2. Click **"Crear cuenta de prueba"**
3. Crear 2 cuentas:
   - **Vendedor**: elige "Vendedor" como rol. Te da un email tipo `test_user_XXXXXXXX@testuser.com` y una contraseña
   - **Comprador**: elige "Comprador" como rol. Mismo formato

4. **Anota ambos emails y contraseñas** — los necesitas para login de prueba

### Paso 2.4 — Obtener credenciales del vendedor de prueba

1. Abre una **ventana de incógnito** en el navegador
2. Ve a https://www.mercadopago.com/developers/panel
3. Login con el email/contraseña del **vendedor de prueba**
4. Crea una nueva aplicación (igual que paso 2.2)
5. Ve a Credenciales → obtén el **Access Token** del vendedor de prueba
   - Este es el que usa tu backend para crear pagos de prueba

### Paso 2.5 — Configurar webhook

1. En la aplicación del vendedor de prueba, ve a **Webhooks**
2. Configurar:
   - URL: tu URL pública (ngrok o similar) + `/api/payments/webhook/mercadopago`
   - Eventos: `payment`, `plan`, `subscription`, `invoice`
3. Para desarrollo local, usa ngrok:

```bash
# Si no tienes ngrok instalado
# Ir a https://ngrok.com/download y seguir instrucciones para Linux
ngrok http 3001
# Te da una URL como https://abc123.ngrok-free.app
# Usa esa URL + /api/payments/webhook/mercadopago como webhook URL
```

### Paso 2.6 — Guardar credenciales

Agrega al `.env.test.sandbox` que ya creaste:

```bash
cat >> apps/api/.env.test.sandbox <<'EOF'

# =============================================
# MERCADO PAGO (Test Mode)
# =============================================
MERCADOPAGO_ACCESS_TOKEN=TEST-PEGA_ACCESS_TOKEN_DEL_VENDEDOR_DE_PRUEBA
MERCADOPAGO_PUBLIC_KEY=TEST-PEGA_PUBLIC_KEY_DEL_VENDEDOR_DE_PRUEBA

# Cuentas de prueba (para referencia, no las usa el código)
# MERCADOPAGO_TEST_SELLER_EMAIL=test_user_XXX@testuser.com
# MERCADOPAGO_TEST_BUYER_EMAIL=test_user_YYY@testuser.com
EOF
```

### Paso 2.7 — Tarjetas de prueba Mercado Pago

Mercado Pago tiene sus propias tarjetas de prueba, **distintas a las de Stripe**:

**Para Chile (CL)**:
| Número | Resultado |
|---|---|
| `5416 7526 0258 2580` (Mastercard) | Aprueba |
| `4168 8188 4444 7115` (Visa) | Aprueba |
| `4544 6108 2855 9786` (Visa) | Rechaza (cc_rejected_other_reason) |

**Para Argentina (AR)**:
| Número | Resultado |
|---|---|
| `5031 7557 3453 0604` (Mastercard) | Aprueba |
| `4509 9535 6623 3704` (Visa) | Aprueba |

**Para México (MX)**:
| Número | Resultado |
|---|---|
| `5474 9254 3267 0366` (Mastercard) | Aprueba |
| `4075 5957 1648 3764` (Visa) | Aprueba |

Las tarjetas varían según el país del gym. El payments-specialist tiene que usar las del país correspondiente.

Documentación completa: https://www.mercadopago.com.xx/developers/es/docs/your-integrations/test/cards (reemplaza `xx` por tu país: `cl`, `ar`, `mx`, `co`).

### Mercado Pago: ✅ LISTO

---

## Pasarela 3: Transferencia manual (~10 minutos)

Esta no es una "pasarela" técnica. Es el flujo más simple:

1. El alumno ve los datos bancarios del gym (cuenta corriente, RUT, nombre)
2. El alumno hace transferencia desde su banco
3. El alumno sube una foto/screenshot del comprobante a la app
4. El admin del gym revisa el comprobante y aprueba/rechaza manualmente

No necesitas cuenta sandbox ni API externa. Solo necesitas:

### Paso 3.1 — Datos bancarios de prueba

Crea datos ficticios para el gym demo:

```bash
cat >> apps/api/.env.test.sandbox <<'EOF'

# =============================================
# TRANSFERENCIA MANUAL (datos del gym demo)
# =============================================
DEMO_GYM_BANK_NAME=Banco de Chile
DEMO_GYM_ACCOUNT_TYPE=Cuenta Corriente
DEMO_GYM_ACCOUNT_NUMBER=00-123-45678-90
DEMO_GYM_ACCOUNT_HOLDER=FitHub SpA
DEMO_GYM_RUT=76.123.456-7
DEMO_GYM_EMAIL=pagos@fithub-demo.cl
EOF
```

En la práctica, estos datos los configura cada gym en su panel admin (sección 3.4.3 modalidad A del requirements). Para testing, usas los de arriba.

### Paso 3.2 — Qué testear

El flujo de transferencia manual tiene estas partes:

- **Backend**: endpoint `POST /v1/payments/transfer-receipt` que recibe la imagen del comprobante (multipart/form-data), la guarda en storage (S3 o local), y crea un Payment con status `PENDING_REVIEW`.
- **Web admin**: pantalla donde el admin ve los comprobantes pendientes, los abre, y aprueba o rechaza con un click.
- **Mobile**: pantalla donde el alumno sube la foto y ve el estado.

Los tests:
- Subida de imagen válida (jpg, png) → Payment creado con status PENDING_REVIEW
- Subida de archivo inválido (pdf gigante, txt, exe) → rechazado con error claro
- Admin aprueba → Payment pasa a APPROVED, plan del alumno se activa
- Admin rechaza con motivo → Payment pasa a REJECTED, alumno ve el motivo
- Multi-tenancy: admin de gym A no puede ver comprobantes de gym B

### Transferencia manual: ✅ LISTO

---

## Plantilla .env.test.sandbox.example

Este archivo SÍ se commitea al repo (no tiene credenciales reales, solo la estructura):

```bash
cat > apps/api/.env.test.sandbox.example <<'EOF'
# =============================================
# SANDBOX CREDENTIALS TEMPLATE
# =============================================
# Copia este archivo a .env.test.sandbox y completa con tus credenciales reales.
# NUNCA commitees .env.test.sandbox — está en .gitignore.
#
# Guía completa: docs/SANDBOX_SETUP.md

# --- STRIPE (Test Mode) ---
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# --- MERCADO PAGO (Test Mode) ---
MERCADOPAGO_ACCESS_TOKEN=TEST-...
MERCADOPAGO_PUBLIC_KEY=TEST-...

# --- KHIPU (cuando llegues a Ola 2) ---
# KHIPU_RECEIVER_ID=...
# KHIPU_SECRET=...

# --- FLOW (cuando llegues a Ola 2) ---
# FLOW_API_KEY=...
# FLOW_SECRET_KEY=...

# --- FINTOC (cuando llegues a conciliación) ---
# FINTOC_API_KEY=...
# FINTOC_WEBHOOK_SECRET=...

# --- TRANSFERENCIA MANUAL (gym demo) ---
DEMO_GYM_BANK_NAME=Banco de Chile
DEMO_GYM_ACCOUNT_TYPE=Cuenta Corriente
DEMO_GYM_ACCOUNT_NUMBER=00-123-45678-90
DEMO_GYM_ACCOUNT_HOLDER=FitHub SpA
DEMO_GYM_RUT=76.123.456-7
DEMO_GYM_EMAIL=pagos@fithub-demo.cl

# --- FLAGS ---
FLAG_RUN_SANDBOX=true
EOF

# Commitear la plantilla (esta sí, no tiene secretos)
cd ~/fithub
git add apps/api/.env.test.sandbox.example
git commit -m "chore: agregar plantilla de credenciales sandbox"
```

---

## Checklist de verificación final

Antes de invocar al `payments-specialist`, verifica todo:

```bash
cd ~/fithub

# 1. .gitignore protege las credenciales
echo "CHECK 1: gitignore"
grep -q ".env.test.sandbox" .gitignore && echo "✅ OK" || echo "❌ FALTA"

# 2. Credenciales de Stripe están configuradas
echo "CHECK 2: Stripe keys"
grep -q "sk_test_" apps/api/.env.test.sandbox 2>/dev/null && echo "✅ OK" || echo "❌ FALTA"

# 3. Stripe CLI instalado
echo "CHECK 3: Stripe CLI"
stripe --version 2>/dev/null && echo "✅ OK" || echo "❌ FALTA"

# 4. Plantilla commiteada
echo "CHECK 4: Template"
git ls-files apps/api/.env.test.sandbox.example | grep -q "." && echo "✅ OK" || echo "❌ FALTA"

# 5. Credenciales NO commiteadas (lo más importante)
echo "CHECK 5: Secrets safe"
git ls-files apps/api/.env.test.sandbox | grep -q "." && echo "❌ PELIGRO: CREDENCIALES COMMITEADAS" || echo "✅ OK: credenciales seguras"
```

Si todo sale ✅, estás listo para la invocación:

```
> payments-specialist: Stripe sandbox está configurado.
Credenciales en apps/api/.env.test.sandbox.
stripe listen corriendo en otra terminal.
Ejecuta punto 1 del checklist: pago aprobado con 4242...4242.
Crea apps/api/src/modules/payments/__tests__/stripe.sandbox.test.ts.
Reporta resultado.
```

---

## Cuándo hacer cada cosa (timeline)

| Cuándo | Acción | Tiempo |
|---|---|---|
| Semana 2 del plan | Crear cuenta Stripe + configurar CLI | 15 min |
| Semana 2 | Invocar payments-specialist para checklist Stripe | 3-5 invocaciones en 2-3 días |
| Semana 3 | Crear cuentas Mercado Pago (vendedor + comprador de prueba) | 30 min |
| Semana 3 | Invocar payments-specialist para checklist MP | 3-5 invocaciones en 2-3 días |
| Semana 4 | Cerrar flujo de transferencia manual | 1-2 invocaciones |
| Post-launch | Crear cuentas de Ola 2 (Khipu, Flow, etc.) según demanda | cuando haga falta |

---

## Errores comunes que vas a querer evitar

1. **Mezclar keys de test con keys de live**. Stripe tiene prefijos distintos: `sk_test_` vs `sk_live_`. Si ves `sk_live_` en tu `.env.test.sandbox`, algo está muy mal. Para.

2. **Olvidar correr `stripe listen`**. Sin el CLI corriendo, los webhooks no llegan a tu localhost y los tests de webhook fallan con timeout. Siempre verifica que está activo en otra terminal.

3. **Usar las tarjetas de Stripe en Mercado Pago** (o viceversa). Cada pasarela tiene sus propias tarjetas de prueba. No son intercambiables.

4. **Commitear credenciales por accidente**. Si pasa: `git reset HEAD~1` inmediatamente. Si ya pusheaste: rota TODAS las keys (ve al dashboard de cada pasarela y genera nuevas). Las viejas quedan en el historial de git para siempre.

5. **No cerrar ngrok cuando terminas**. ngrok expone tu localhost al internet. Cuando termines de testear, `Ctrl+C` y verifica que no queda corriendo en background.

6. **Intentar testear webhooks de Mercado Pago sin ngrok o tunnel**. A diferencia de Stripe, MP no tiene un CLI local de forwarding. Necesitas ngrok o un servicio equivalente sí o sí para recibir webhooks en desarrollo.
