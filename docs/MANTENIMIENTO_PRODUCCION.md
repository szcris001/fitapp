# Mantenimiento de producción (Tribu-Box)

Lista viva de lo que hay que revisar de forma recurrente. Cada fila dice qué, cada cuánto, quién y dónde mirar.
Última actualización: 2026-11-24. Los ítems marcados **(pendiente)** aún no están hechos.

## Cada 6 meses

| Qué | Cómo | Dónde |
|---|---|---|
| **Lista de instituciones de Chile** (bancos, cooperativas y emisores de prepago, para las cuentas de transferencia) | Comparar con las 3 tablas "Vigentes" de la CMF y actualizar `CHILE_BANKS` (y `CHILE_BANKS_REVIEWED_AT`). Vigilar fusiones, bajas y cambios de nombre. Banco Security quedó fuera a propósito (fusión con BICE autorizada oct-2025). | `apps/api/src/lib/chile-banks.ts` · fuentes: [bancos](https://www.cmfchile.cl/portal/principal/623/w4-article-47003.html), [cooperativas](https://www.cmfchile.cl/institucional/mercados/consulta.php?mercado=B&entidad=BCCOO&Estado=VI), [emisores de prepago](https://www.cmfchile.cl/institucional/mercados/consulta.php?mercado=B&Estado=VI&entidad=TPEEM) |
| Rotar secretos de la plataforma | `JWT_SECRET`, contraseñas de `fitapp_app` y superadmin. Ojo: rotar `JWT_SECRET` desloguea a todos. | Variables de `api` en Railway |
| Rotar credenciales de terceros **(pendiente desde el incidente de Railway, oct-2026)** | Stripe, Anthropic, Resend, Fintoc, Flow, Mercado Pago, desde el panel de cada proveedor. | Panel de cada proveedor + Variables en Railway |

## Cada mes

| Qué | Cómo | Dónde |
|---|---|---|
| Vulnerabilidades de dependencias | `pnpm audit --audit-level=high`; el job "Security Audit" del CI ya lo corre en cada PR. Revisar también cuando salga un aviso de Next.js. | CI de GitHub |
| Suscripciones por vencer y pagos sin conciliar | Revisar Suscripciones en superadmin: transferencias PENDING (expiran a los 7 días), pagos Flow sin confirmar, gyms vencidos. | Panel superadmin |
| Uso y costos de Railway | Plan Hobby: revisar uso, límites y que staging no se mezcle con producción. | Railway |

## Antes de cada deploy a producción

- Pasar el agente `security` (obligatorio, ver CLAUDE.md).
- Si hay migración con índice único o cambio de datos: correr antes el pre-check en **producción** y confirmar el selector de ambiente (production vs staging).
- Tras el merge: registrar el PR en `STATE.md`.

## Una sola vez / con fecha

- Retirar el alias `/superadmin/gym-payments/flow/confirm` — **~2026-12-06**.
- Guardar `SECRETS_ENCRYPTION_KEY` también en el gestor de contraseñas (si se pierde, hay que volver a cargar las credenciales de pasarelas).
- Pasar Flow de sandbox a producción cuando la cuenta esté lista, y probar idempotencia del callback con una cuenta real.
- Agregar "Cobro a gyms (Flow/transferencia/Stripe env)" a `QUALITY.md` (`qa-engineer`).
- Build EAS de mobile cuando terminen de ajustar la app (no antes).

## Backups **(pendiente, se define aparte)**

Por definir: frecuencia, dónde se guardan, quién los restaura y cada cuánto se prueba una restauración. Un backup que nunca se restauró no cuenta como backup.
