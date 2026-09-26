---
name: Patrones arquitectónicos invariantes FitHub
description: Decisiones de arquitectura que no se negocian. Referencia para no reinventar en cada diseño.
type: project
---

# Patrones invariantes FitHub

## Patrón: tabla dedicada para tokens de larga vida

El proyecto usa tablas dedicadas para tokens (no campos en User). Ya existe `PasswordResetToken`. El diseño de refresh token sigue el mismo patrón con `RefreshToken`.
Invariante: token en claro nunca se persiste — solo el SHA-256.

## Patrón: multi-tenancy por gymId en JWT

Toda query de negocio filtra por `gymId` del JWT, no del body. Nunca confiar en `gymId` del request body para filtrar datos.

## Patrón: módulo self-contained

Cada dominio en `apps/api/src/modules/<dominio>/` tiene: `{dominio}.routes.ts`, `{dominio}.service.ts`, `{dominio}.schema.ts`. La lógica vive en service, la ruta es delgada.

## Patrón: idempotencia en operaciones destructivas

Logout, webhooks, jobs — todos deben ser idempotentes. Devolver el mismo resultado si se llaman múltiples veces con la misma intención.

## Patrón: validación Zod en bordes

Todo endpoint valida body/params/query con Zod antes de llamar al service. Los schemas Zod se exportan desde `{dominio}.schema.ts` para que web/mobile los consuman.
