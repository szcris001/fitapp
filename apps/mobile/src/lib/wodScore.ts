// Parseo/validación de un resultado de WOD, compartido entre ResultForm (coach)
// y LogResultModal (alumno) — mismo scoreType, misma regla de qué es válido,
// evita que las dos pantallas diverjan silenciosamente (ya pasó: una exigía
// score > 0 y la otra >= 0, la web y el backend solo exigen >= 0).
export type ScoreParseResult =
  | { score: number; scoreText: string | null }
  | { error: 'invalid_time' | 'zero_time' | 'invalid_number' }

export function parseScoreInput(
  scoreType: string,
  input: { mins?: string; secs?: string; value?: string; text?: string },
): ScoreParseResult {
  if (scoreType === 'TIME') {
    const m = parseInt(input.mins ?? '', 10)
    const s = parseInt(input.secs ?? '', 10)
    if (isNaN(m) || isNaN(s) || m < 0 || s < 0 || s > 59) return { error: 'invalid_time' }
    const total = m * 60 + s
    if (total === 0) return { error: 'zero_time' }
    return { score: total, scoreText: null }
  }
  if (scoreType === 'CUSTOM') {
    const text = input.text ?? ''
    // "Valor numérico (opcional, para ordenar)" es un campo separado del texto
    // libre — antes se ignoraba por completo y el score real salía de parsear el
    // número inicial del TEXTO (ej. "7 rondas..." → 7, o 0 si no arrancaba con un
    // número), descartando en silencio lo que el coach/alumno tipeaba acá
    // (hallazgo QA mobile, 2026-10-30).
    const n = parseFloat(input.value ?? '')
    const score = !isNaN(n) ? n : (parseFloat(text) || 0)
    return { score, scoreText: text.trim() || null }
  }
  // REPS / ROUNDS / WEIGHT — acepta 0 (igual que la web y el backend, `score.min(0)`)
  const n = parseFloat(input.value ?? '')
  if (isNaN(n) || n < 0) return { error: 'invalid_number' }
  return { score: n, scoreText: null }
}
