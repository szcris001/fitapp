---
name: bugs_e2e_classes_wods_2026-09-29
description: Bugs abiertos de CLS/WOD hallados por la suite E2E (2026-09-29): zona horaria en recurrentes/edición/listClasses, leaderboard web roto, disciplinas rechazadas, picker de movimientos recortado, sin desmarcar asistencia
metadata:
  type: project
---

Encontrados por apps/web/e2e/modules/{classes,wods}.spec.ts (tests en rojo con `// BUG:` hasta el fix):

- Patrón raíz de zona horaria: todo lo que usa el día **UTC** falla con clases de 21:00+ en Chile (UTC-3 → 00:xx UTC del día siguiente). Casos: createClass RECURRING elige días con getUTCDay (CLS-02b), ClassDetail.handleSaveEdit toma baseDate con toISOString (CLS-07, mueve la clase al día siguiente), listClasses interpreta from/to como días UTC (WOD-06: el listado de Pizarra abre la clase de ayer 21:00). Para cazarlos siempre probar con una clase a las 21:30 local.
- WOD-04 (S2): el modal de leaderboard envía `{score:'4:10', isRx}` pero POST /wods/:id/results espera `{score:number, rx:boolean}` sin Zod → "Datos inválidos enviados a la base de datos"; Scaled se ignoraría.
- CLS-08 (S3): la web ofrece disciplinas (Fuerza, Gimnasia…) que createClassTypeSchema rechaza, y la página crashea renderizando el objeto de error de Zod.
- CLS-09 (S3): la lista del MovementPicker queda recortada por `overflow-hidden` del bloque (1280×720) → no se puede elegir movimiento; el picker solo asigna al hacer clic en una opción. Alternativa: «Entrada rápida».
- CLS-04 (S3): la web no permite desmarcar asistencia (la API sí, `{attended:false}`).

**Why:** los bugs de TZ no se ven con clases de mañana/tarde; el seed de 21:00 y clases propias a las 21:30 los destapan.
**How to apply:** al revisar fixes de backend-dev/web-dev, correr `-g "CLS-|WOD-"`; si pasan sin tocar tests, cerrar. Relacionado: [[testing_e2e_parallel_env_gotchas]] (los 429 generan falsos rojos).
