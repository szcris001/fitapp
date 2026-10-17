// Metadata de presentación (color/orden) para las categorías del catálogo oficial
// de movimientos. El catálogo en sí (nombres) vive en la base de datos, sembrado
// por apps/api/prisma/seed.ts y servido vía GET /movements.
export const CF_CATEGORIES = [
  { name: 'Fundacionales',          color: '#3b82f6', bg: '#eff6ff' },
  { name: 'Levantamiento olímpico', color: '#8b5cf6', bg: '#f5f3ff' },
  { name: 'Powerlifting / Fuerza',  color: '#f97316', bg: '#fff7ed' },
  { name: 'Dumbbell',               color: '#10b981', bg: '#f0fdf4' },
  { name: 'Kettlebell',             color: '#14b8a6', bg: '#f0fdfa' },
  { name: 'Gimnasia',               color: '#ec4899', bg: '#fdf2f8' },
  { name: 'Cardio / Metabólico',    color: '#ef4444', bg: '#fef2f2' },
]

export const MOV_CATEGORIES = [
  ...CF_CATEGORIES.map(c => c.name),
  'Personalizado',
]
