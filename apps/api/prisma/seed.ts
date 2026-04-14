import 'dotenv/config'
import { PrismaClient, BenchmarkCategory } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ─── Category map ─────────────────────────────────────────────────────────────
const CAT: Record<string, BenchmarkCategory> = {
  girl: 'GIRL',
  hero: 'HERO',
  open: 'OPEN',
  games: 'GAMES',
  custom: 'CUSTOM',
}

// ─── Raw data ─────────────────────────────────────────────────────────────────
const BENCHMARKS = [

  // ── THE GIRLS ──────────────────────────────────────────────────────────────

  {
    id: 'girl-001', nombre: 'Fran', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 5,
    descripcion: '21-15-9 reps de Thrusters y Pull-ups.',
    movimientos: [
      { nombre: 'Thruster', reps_esquema: '21-15-9', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido o mancuernas' },
      { nombre: 'Pull-up', reps_esquema: '21-15-9', carga_scaled: 'Band assisted o ring rows' },
    ],
  },
  {
    id: 'girl-002', nombre: 'Grace', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 5,
    descripcion: '30 Clean & Jerks for time.',
    movimientos: [
      { nombre: 'Clean & Jerk', reps_esquema: '30', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
    ],
  },
  {
    id: 'girl-003', nombre: 'Helen', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 12,
    descripcion: '3 rounds: 400m Run, 21 Kettlebell Swings, 12 Pull-ups.',
    movimientos: [
      { nombre: 'Run', reps_esquema: '400m x3', carga_scaled: '200m o remo' },
      { nombre: 'Kettlebell Swing', reps_esquema: '21 x3', carga_rx_kg_hombre: 24, carga_rx_kg_mujer: 16, carga_scaled: 'KB más liviana' },
      { nombre: 'Pull-up', reps_esquema: '12 x3', carga_scaled: 'Band assisted' },
    ],
  },
  {
    id: 'girl-004', nombre: 'Diane', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 8,
    descripcion: '21-15-9 reps de Deadlift y Handstand Push-ups.',
    movimientos: [
      { nombre: 'Deadlift', reps_esquema: '21-15-9', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
      { nombre: 'Handstand Push-up', reps_esquema: '21-15-9', carga_scaled: 'Pike push-up o con abmat' },
    ],
  },
  {
    id: 'girl-005', nombre: 'Karen', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 10,
    descripcion: '150 Wall Ball Shots for time.',
    movimientos: [
      { nombre: 'Wall Ball Shot', reps_esquema: '150', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana o altura reducida' },
    ],
  },
  {
    id: 'girl-006', nombre: 'Annie', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 10,
    descripcion: '50-40-30-20-10 reps de Double-Unders y Sit-ups.',
    movimientos: [
      { nombre: 'Double-Under', reps_esquema: '50-40-30-20-10', carga_scaled: 'Single-unders x3' },
      { nombre: 'Sit-up', reps_esquema: '50-40-30-20-10', carga_scaled: 'Abmat sit-up' },
    ],
  },
  {
    id: 'girl-007', nombre: 'Elizabeth', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 10,
    descripcion: '21-15-9 reps de Squat Cleans y Ring Dips.',
    movimientos: [
      { nombre: 'Squat Clean', reps_esquema: '21-15-9', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido o power clean' },
      { nombre: 'Ring Dip', reps_esquema: '21-15-9', carga_scaled: 'Dips en barras paralelas o asistido con banda' },
    ],
  },
  {
    id: 'girl-008', nombre: 'Cindy', categoria: 'girl',
    formato: 'AMRAP', duracion_min: 20, tiempo_estimado_min: 20,
    descripcion: 'AMRAP 20 min: 5 Pull-ups, 10 Push-ups, 15 Air Squats.',
    movimientos: [
      { nombre: 'Pull-up', reps_esquema: '5', carga_scaled: 'Band assisted o ring rows' },
      { nombre: 'Push-up', reps_esquema: '10', carga_scaled: 'Rodillas en el suelo' },
      { nombre: 'Air Squat', reps_esquema: '15', carga_scaled: 'Box squat' },
    ],
  },
  {
    id: 'girl-009', nombre: 'Mary', categoria: 'girl',
    formato: 'AMRAP', duracion_min: 20, tiempo_estimado_min: 20,
    descripcion: 'AMRAP 20 min: 5 Handstand Push-ups, 10 Pistols (alternating), 15 Pull-ups.',
    movimientos: [
      { nombre: 'Handstand Push-up', reps_esquema: '5', carga_scaled: 'Pike push-up' },
      { nombre: 'Pistol', reps_esquema: '10 (alternating)', carga_scaled: 'Box squat unilateral' },
      { nombre: 'Pull-up', reps_esquema: '15', carga_scaled: 'Band assisted' },
    ],
  },
  {
    id: 'girl-010', nombre: 'Barbara', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 30,
    descripcion: '5 rounds, 3 min rest between rounds: 20 Pull-ups, 30 Push-ups, 40 Sit-ups, 50 Air Squats.',
    movimientos: [
      { nombre: 'Pull-up', reps_esquema: '20 x5', carga_scaled: 'Band assisted' },
      { nombre: 'Push-up', reps_esquema: '30 x5', carga_scaled: 'Rodillas' },
      { nombre: 'Sit-up', reps_esquema: '40 x5' },
      { nombre: 'Air Squat', reps_esquema: '50 x5' },
    ],
  },
  {
    id: 'girl-011', nombre: 'Chelsea', categoria: 'girl',
    formato: 'EMOM', duracion_min: 30, tiempo_estimado_min: 30,
    descripcion: 'EMOM 30 min: 5 Pull-ups, 10 Push-ups, 15 Air Squats.',
    movimientos: [
      { nombre: 'Pull-up', reps_esquema: '5 cada minuto', carga_scaled: 'Band assisted' },
      { nombre: 'Push-up', reps_esquema: '10 cada minuto', carga_scaled: 'Rodillas' },
      { nombre: 'Air Squat', reps_esquema: '15 cada minuto' },
    ],
  },
  {
    id: 'girl-012', nombre: 'Isabel', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 5,
    descripcion: '30 Snatches for time.',
    movimientos: [
      { nombre: 'Snatch', reps_esquema: '30', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
    ],
  },
  {
    id: 'girl-013', nombre: 'Linda', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 25,
    descripcion: '10-9-8-7-6-5-4-3-2-1 reps de Deadlift (1.5x BW), Bench Press (BW), Clean (0.75x BW).',
    movimientos: [
      { nombre: 'Deadlift', reps_esquema: '10-9-8-7-6-5-4-3-2-1', carga_scaled: '1.5x peso corporal del atleta' },
      { nombre: 'Bench Press', reps_esquema: '10-9-8-7-6-5-4-3-2-1', carga_scaled: 'Peso corporal del atleta' },
      { nombre: 'Clean', reps_esquema: '10-9-8-7-6-5-4-3-2-1', carga_scaled: '0.75x peso corporal del atleta' },
    ],
  },
  {
    id: 'girl-014', nombre: 'Nancy', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: '5 rounds: 400m Run, 15 Overhead Squats.',
    movimientos: [
      { nombre: 'Run', reps_esquema: '400m x5', carga_scaled: '200m o remo' },
      { nombre: 'Overhead Squat', reps_esquema: '15 x5', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido o goblet squat' },
    ],
  },
  {
    id: 'girl-015', nombre: 'Amanda', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 10,
    descripcion: '9-7-5 reps de Muscle-ups y Squat Snatches.',
    movimientos: [
      { nombre: 'Muscle-up', reps_esquema: '9-7-5', carga_scaled: 'Jumping muscle-up o pull-up + dip' },
      { nombre: 'Squat Snatch', reps_esquema: '9-7-5', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido o power snatch' },
    ],
  },
  {
    id: 'girl-016', nombre: 'Angie', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 20,
    descripcion: 'For time: 100 Pull-ups, 100 Push-ups, 100 Sit-ups, 100 Air Squats.',
    movimientos: [
      { nombre: 'Pull-up', reps_esquema: '100', carga_scaled: 'Band assisted' },
      { nombre: 'Push-up', reps_esquema: '100', carga_scaled: 'Rodillas' },
      { nombre: 'Sit-up', reps_esquema: '100' },
      { nombre: 'Air Squat', reps_esquema: '100' },
    ],
  },
  {
    id: 'girl-017', nombre: 'Eva', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 40,
    descripcion: '5 rounds: 800m Run, 30 Kettlebell Swings, 30 Pull-ups.',
    movimientos: [
      { nombre: 'Run', reps_esquema: '800m x5', carga_scaled: '400m' },
      { nombre: 'Kettlebell Swing', reps_esquema: '30 x5', carga_rx_kg_hombre: 32, carga_rx_kg_mujer: 24, carga_scaled: 'KB más liviana' },
      { nombre: 'Pull-up', reps_esquema: '30 x5', carga_scaled: 'Band assisted' },
    ],
  },
  {
    id: 'girl-018', nombre: 'Kelly', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 30,
    descripcion: '5 rounds: 400m Run, 30 Box Jumps, 30 Wall Ball Shots.',
    movimientos: [
      { nombre: 'Run', reps_esquema: '400m x5', carga_scaled: '200m' },
      { nombre: 'Box Jump', reps_esquema: '30 x5', altura_rx_cm_hombre: 60, altura_rx_cm_mujer: 50, carga_scaled: 'Step-up' },
      { nombre: 'Wall Ball Shot', reps_esquema: '30 x5', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
    ],
  },
  {
    id: 'girl-019', nombre: 'Lynne', categoria: 'girl',
    formato: 'Max Reps', tiempo_estimado_min: 20,
    descripcion: '5 rounds, max reps de Bench Press (BW) y Pull-ups. Sin tiempo límite por ronda.',
    movimientos: [
      { nombre: 'Bench Press', reps_esquema: 'Max reps x5', carga_scaled: 'Peso corporal del atleta' },
      { nombre: 'Pull-up', reps_esquema: 'Max reps x5', carga_scaled: 'Band assisted' },
    ],
  },
  {
    id: 'girl-020', nombre: 'Nicole', categoria: 'girl',
    formato: 'AMRAP', duracion_min: 20, tiempo_estimado_min: 20,
    descripcion: 'AMRAP 20 min: 400m Run + max rep Pull-ups. Anotar reps de pull-ups de cada ronda.',
    movimientos: [
      { nombre: 'Run', reps_esquema: '400m cada ronda', carga_scaled: '200m' },
      { nombre: 'Pull-up', reps_esquema: 'Max reps cada ronda', carga_scaled: 'Band assisted' },
    ],
  },
  {
    id: 'girl-021', nombre: 'Jackie', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 10,
    descripcion: 'For time: 1000m Row, 50 Thrusters, 30 Pull-ups.',
    movimientos: [
      { nombre: 'Row', reps_esquema: '1000m', carga_scaled: '500m' },
      { nombre: 'Thruster', reps_esquema: '50', carga_rx_kg_hombre: 20, carga_rx_kg_mujer: 15, carga_scaled: 'Peso reducido' },
      { nombre: 'Pull-up', reps_esquema: '30', carga_scaled: 'Band assisted' },
    ],
  },
  {
    id: 'girl-022', nombre: 'Tabata Something Else', categoria: 'girl',
    formato: 'Tabata', tiempo_estimado_min: 20,
    descripcion: 'Tabata (8 rondas 20s on / 10s off) de cada movimiento en secuencia: Pull-ups, Push-ups, Sit-ups, Air Squats. Score: total de reps mínimas por ejercicio.',
    movimientos: [
      { nombre: 'Pull-up', reps_esquema: 'Tabata 8 rondas', carga_scaled: 'Band assisted' },
      { nombre: 'Push-up', reps_esquema: 'Tabata 8 rondas', carga_scaled: 'Rodillas' },
      { nombre: 'Sit-up', reps_esquema: 'Tabata 8 rondas' },
      { nombre: 'Air Squat', reps_esquema: 'Tabata 8 rondas' },
    ],
  },
  {
    id: 'girl-023', nombre: 'Kalsu', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 45,
    descripcion: '100 Thrusters for time. Al inicio de cada minuto (incluyendo el minuto 0): 5 Burpees.',
    movimientos: [
      { nombre: 'Thruster', reps_esquema: '100 total', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
      { nombre: 'Burpee', reps_esquema: '5 al inicio de cada minuto' },
    ],
  },
  {
    id: 'girl-024', nombre: 'Hotshots 19', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 35,
    descripcion: '6 rounds: 30 Air Squats, 19 Power Cleans, 7 Strict Pull-ups, 400m Run.',
    movimientos: [
      { nombre: 'Air Squat', reps_esquema: '30 x6' },
      { nombre: 'Power Clean', reps_esquema: '19 x6', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
      { nombre: 'Strict Pull-up', reps_esquema: '7 x6', carga_scaled: 'Band assisted' },
      { nombre: 'Run', reps_esquema: '400m x6', carga_scaled: '200m' },
    ],
  },
  {
    id: 'girl-025', nombre: 'Marguerita', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 20,
    descripcion: '3 rounds: 800m Run, 50 Back Extensions, 50 Sit-ups.',
    movimientos: [
      { nombre: 'Run', reps_esquema: '800m x3', carga_scaled: '400m' },
      { nombre: 'Back Extension', reps_esquema: '50 x3', carga_scaled: 'Good morning con barra vacía' },
      { nombre: 'Sit-up', reps_esquema: '50 x3' },
    ],
  },
  {
    id: 'girl-026', nombre: 'Maggie', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 25,
    descripcion: '5 rounds: 20 Muscle-ups, 40 Wall Ball Shots, 60 Double-Unders.',
    movimientos: [
      { nombre: 'Muscle-up', reps_esquema: '20 x5', carga_scaled: 'Jumping muscle-up' },
      { nombre: 'Wall Ball Shot', reps_esquema: '40 x5', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Peso reducido' },
      { nombre: 'Double-Under', reps_esquema: '60 x5', carga_scaled: 'Single-unders x3' },
    ],
  },
  {
    id: 'girl-027', nombre: 'Nasty Girls', categoria: 'girl',
    formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: '3 rounds: 50 Air Squats, 7 Muscle-ups, 10 Hang Power Cleans.',
    movimientos: [
      { nombre: 'Air Squat', reps_esquema: '50 x3' },
      { nombre: 'Muscle-up', reps_esquema: '7 x3', carga_scaled: 'Jumping muscle-up' },
      { nombre: 'Hang Power Clean', reps_esquema: '10 x3', carga_rx_kg_hombre: 70, carga_rx_kg_mujer: 47, carga_scaled: 'Peso reducido' },
    ],
  },

  // ── HEROES ─────────────────────────────────────────────────────────────────

  {
    id: 'hero-001', nombre: 'Murph', categoria: 'hero',
    formato: 'For Time', tiempo_estimado_min: 45,
    descripcion: 'For time: 1 mile Run, 100 Pull-ups, 200 Push-ups, 300 Air Squats, 1 mile Run. Partition the pull-ups, push-ups, and squats as needed. With a 20lb vest.',
    notas: 'Chaleco 9kg hombre / 6kg mujer en RX. Puede hacerse particionado (ej: 20 rondas de 5 pull-ups, 10 push-ups, 15 squats).',
    movimientos: [
      { nombre: 'Run', reps_esquema: '1 milla x2 (inicio y final)', carga_scaled: '800m' },
      { nombre: 'Pull-up', reps_esquema: '100 total', carga_scaled: 'Band assisted' },
      { nombre: 'Push-up', reps_esquema: '200 total', carga_scaled: 'Rodillas' },
      { nombre: 'Air Squat', reps_esquema: '300 total' },
    ],
  },
  {
    id: 'hero-002', nombre: 'DT', categoria: 'hero',
    formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: '5 rounds: 12 Deadlifts, 9 Hang Power Cleans, 6 Push Jerks.',
    movimientos: [
      { nombre: 'Deadlift', reps_esquema: '12 x5', carga_rx_kg_hombre: 70, carga_rx_kg_mujer: 47, carga_scaled: 'Peso reducido' },
      { nombre: 'Hang Power Clean', reps_esquema: '9 x5', carga_rx_kg_hombre: 70, carga_rx_kg_mujer: 47, carga_scaled: 'Peso reducido' },
      { nombre: 'Push Jerk', reps_esquema: '6 x5', carga_rx_kg_hombre: 70, carga_rx_kg_mujer: 47, carga_scaled: 'Peso reducido' },
    ],
  },
  {
    id: 'hero-003', nombre: 'Jason', categoria: 'hero',
    formato: 'For Time', tiempo_estimado_min: 20,
    descripcion: '100 Squats, 5 Muscle-ups, 75 Squats, 10 Muscle-ups, 50 Squats, 15 Muscle-ups, 25 Squats, 20 Muscle-ups.',
    movimientos: [
      { nombre: 'Air Squat', reps_esquema: '100-75-50-25' },
      { nombre: 'Muscle-up', reps_esquema: '5-10-15-20', carga_scaled: 'Jumping muscle-up' },
    ],
  },
  {
    id: 'hero-004', nombre: 'Nate', categoria: 'hero',
    formato: 'AMRAP', duracion_min: 20, tiempo_estimado_min: 20,
    descripcion: 'AMRAP 20 min: 2 Muscle-ups, 4 Handstand Push-ups, 8 Kettlebell Swings.',
    movimientos: [
      { nombre: 'Muscle-up', reps_esquema: '2 por ronda', carga_scaled: 'Jumping muscle-up' },
      { nombre: 'Handstand Push-up', reps_esquema: '4 por ronda', carga_scaled: 'Pike push-up' },
      { nombre: 'Kettlebell Swing', reps_esquema: '8 por ronda', carga_rx_kg_hombre: 32, carga_rx_kg_mujer: 24, carga_scaled: 'KB más liviana' },
    ],
  },
  {
    id: 'hero-005', nombre: 'Josh', categoria: 'hero',
    formato: 'For Time', tiempo_estimado_min: 20,
    descripcion: '21-15-9 reps de Overhead Squats y Pull-ups.',
    movimientos: [
      { nombre: 'Overhead Squat', reps_esquema: '21-15-9', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
      { nombre: 'Pull-up', reps_esquema: '21-15-9', carga_scaled: 'Band assisted' },
    ],
  },
  {
    id: 'hero-006', nombre: 'Daniel', categoria: 'hero',
    formato: 'For Time', tiempo_estimado_min: 25,
    descripcion: '50 Pull-ups, 400m Run, 21 Thrusters, 800m Run, 21 Thrusters, 400m Run, 50 Pull-ups.',
    movimientos: [
      { nombre: 'Pull-up', reps_esquema: '50 + 50', carga_scaled: 'Band assisted' },
      { nombre: 'Run', reps_esquema: '400m + 800m + 400m', carga_scaled: 'Mitad de distancia' },
      { nombre: 'Thruster', reps_esquema: '21 x2', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
    ],
  },
  {
    id: 'hero-007', nombre: 'Michael', categoria: 'hero',
    formato: 'For Time', tiempo_estimado_min: 30,
    descripcion: '3 rounds: 800m Run, 50 Back Extensions, 50 Sit-ups.',
    movimientos: [
      { nombre: 'Run', reps_esquema: '800m x3', carga_scaled: '400m' },
      { nombre: 'Back Extension', reps_esquema: '50 x3', carga_scaled: 'Good morning' },
      { nombre: 'Sit-up', reps_esquema: '50 x3' },
    ],
  },
  {
    id: 'hero-008', nombre: 'JT', categoria: 'hero',
    formato: 'For Time', tiempo_estimado_min: 20,
    descripcion: '21-15-9 reps de Handstand Push-ups, Ring Dips, Push-ups.',
    movimientos: [
      { nombre: 'Handstand Push-up', reps_esquema: '21-15-9', carga_scaled: 'Pike push-up' },
      { nombre: 'Ring Dip', reps_esquema: '21-15-9', carga_scaled: 'Dips en barras' },
      { nombre: 'Push-up', reps_esquema: '21-15-9', carga_scaled: 'Rodillas' },
    ],
  },
  {
    id: 'hero-009', nombre: 'Badger', categoria: 'hero',
    formato: 'For Time', tiempo_estimado_min: 40,
    descripcion: '3 rounds: 30 Squat Cleans, 30 Pull-ups, 800m Run.',
    movimientos: [
      { nombre: 'Squat Clean', reps_esquema: '30 x3', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'Pull-up', reps_esquema: '30 x3', carga_scaled: 'Band assisted' },
      { nombre: 'Run', reps_esquema: '800m x3', carga_scaled: '400m' },
    ],
  },
  {
    id: 'hero-010', nombre: 'Lumberjack 20', categoria: 'hero',
    formato: 'For Time', tiempo_estimado_min: 30,
    descripcion: '20 Deadlifts, 400m Run, 20 KB Swings, 400m Run, 20 Overhead Squats, 400m Run, 20 Burpees, 400m Run, 20 Pull-ups, 400m Run, 20 Box Jumps, 400m Run, 20 DB Squat Cleans, 400m Run.',
    movimientos: [
      { nombre: 'Deadlift', reps_esquema: '20', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
      { nombre: 'Kettlebell Swing', reps_esquema: '20', carga_rx_kg_hombre: 32, carga_rx_kg_mujer: 24, carga_scaled: 'KB más liviana' },
      { nombre: 'Overhead Squat', reps_esquema: '20', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'Burpee', reps_esquema: '20' },
      { nombre: 'Pull-up', reps_esquema: '20', carga_scaled: 'Band assisted' },
      { nombre: 'Box Jump', reps_esquema: '20', altura_rx_cm_hombre: 60, altura_rx_cm_mujer: 50, carga_scaled: 'Step-up' },
      { nombre: 'Dumbbell Squat Clean', reps_esquema: '20', carga_rx_kg_hombre: 22, carga_rx_kg_mujer: 15, carga_scaled: 'Peso reducido' },
      { nombre: 'Run', reps_esquema: '400m x7 (entre cada movimiento)', carga_scaled: '200m' },
    ],
  },

  // ── OPEN 2011 ──────────────────────────────────────────────────────────────
  { id: 'open-2011-01', nombre: 'Open 11.1', categoria: 'open', año: 2011, formato: 'AMRAP', duracion_min: 10, tiempo_estimado_min: 10,
    descripcion: 'AMRAP 10 min: 30 Double-Unders, 15 Power Snatches.',
    movimientos: [
      { nombre: 'Double-Under', reps_esquema: '30 por ronda', carga_scaled: 'Single-unders x3' },
      { nombre: 'Power Snatch', reps_esquema: '15 por ronda', carga_rx_kg_hombre: 34, carga_rx_kg_mujer: 25, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'open-2011-02', nombre: 'Open 11.2', categoria: 'open', año: 2011, formato: 'AMRAP', duracion_min: 15, tiempo_estimado_min: 15,
    descripcion: 'AMRAP 15 min: 9 Deadlifts, 12 Push-ups, 15 Box Jumps (24/20").',
    movimientos: [
      { nombre: 'Deadlift', reps_esquema: '9 por ronda', carga_rx_kg_hombre: 70, carga_rx_kg_mujer: 47, carga_scaled: 'Peso reducido' },
      { nombre: 'Push-up', reps_esquema: '12 por ronda', carga_scaled: 'Rodillas en tierra' },
      { nombre: 'Box Jump', reps_esquema: '15 por ronda', carga_scaled: 'Step-ups' },
    ],
  },
  { id: 'open-2011-03', nombre: 'Open 11.3', categoria: 'open', año: 2011, formato: 'AMRAP', duracion_min: 5, tiempo_estimado_min: 5,
    descripcion: 'AMRAP 5 min: 5 Power Cleans, 10 T2B, 15 Wall Balls.',
    movimientos: [
      { nombre: 'Power Clean', reps_esquema: '5 por ronda', carga_rx_kg_hombre: 60, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
      { nombre: 'Toes-to-Bar', reps_esquema: '10 por ronda', carga_scaled: 'Knees-to-elbows' },
      { nombre: 'Wall Ball Shot', reps_esquema: '15 por ronda', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
    ],
  },
  { id: 'open-2011-04', nombre: 'Open 11.4', categoria: 'open', año: 2011, formato: 'AMRAP', duracion_min: 10, tiempo_estimado_min: 10,
    descripcion: 'AMRAP 10 min: 60 Bar-Facing Burpees, 30 OHS, 10 Ring Muscle-ups.',
    movimientos: [
      { nombre: 'Bar-Facing Burpee', reps_esquema: '60 total' },
      { nombre: 'Overhead Squat', reps_esquema: '30 total', carga_rx_kg_hombre: 34, carga_rx_kg_mujer: 25, carga_scaled: 'Peso reducido' },
      { nombre: 'Ring Muscle-up', reps_esquema: '10 total', carga_scaled: 'CTB Pull-up x2' },
    ],
  },
  { id: 'open-2011-05', nombre: 'Open 11.5', categoria: 'open', año: 2011, formato: 'AMRAP', duracion_min: 20, tiempo_estimado_min: 20,
    descripcion: 'AMRAP 20 min: 5 Power Cleans, 10 T2B, 15 Wall Balls.',
    movimientos: [
      { nombre: 'Power Clean', reps_esquema: '5 por ronda', carga_rx_kg_hombre: 60, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
      { nombre: 'Toes-to-Bar', reps_esquema: '10 por ronda', carga_scaled: 'Knees-to-elbows' },
      { nombre: 'Wall Ball Shot', reps_esquema: '15 por ronda', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
    ],
  },
  { id: 'open-2011-06', nombre: 'Open 11.6', categoria: 'open', año: 2011, formato: 'AMRAP', duracion_min: 7, tiempo_estimado_min: 7,
    descripcion: 'AMRAP 7 min: 3 Thrusters + 3 CTB Pull-ups, luego 6-6, 9-9...',
    movimientos: [
      { nombre: 'Thruster', reps_esquema: '3-6-9-12...', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'CTB Pull-up', reps_esquema: '3-6-9-12...', carga_scaled: 'Pull-up' },
    ],
  },
  // ── OPEN 2012 ──────────────────────────────────────────────────────────────
  { id: 'open-2012-01', nombre: 'Open 12.1', categoria: 'open', año: 2012, formato: 'AMRAP', duracion_min: 7, tiempo_estimado_min: 7,
    descripcion: 'AMRAP 7 min: Burpees.',
    movimientos: [{ nombre: 'Burpee', reps_esquema: 'Max reps en 7 min' }],
  },
  { id: 'open-2012-02', nombre: 'Open 12.2', categoria: 'open', año: 2012, formato: 'AMRAP', duracion_min: 10, tiempo_estimado_min: 10,
    descripcion: 'AMRAP 10 min: Snatches en escalera de peso — 30 reps a 34/25 kg, 30 a 43/34, 30 a 52/43, max a 61/52 kg.',
    movimientos: [
      { nombre: 'Snatch', reps_esquema: '30+30+30+max (peso escalando)', carga_rx_kg_hombre: 34, carga_rx_kg_mujer: 25, carga_scaled: 'Reducir peso en cada nivel' },
    ],
  },
  { id: 'open-2012-03', nombre: 'Open 12.3', categoria: 'open', año: 2012, formato: 'AMRAP', duracion_min: 18, tiempo_estimado_min: 18,
    descripcion: 'AMRAP 18 min: 15 Box Jumps, 12 Push Press, 9 T2B.',
    movimientos: [
      { nombre: 'Box Jump', reps_esquema: '15 por ronda', carga_scaled: 'Step-ups' },
      { nombre: 'Push Press', reps_esquema: '12 por ronda', carga_rx_kg_hombre: 52, carga_rx_kg_mujer: 35, carga_scaled: 'Peso reducido' },
      { nombre: 'Toes-to-Bar', reps_esquema: '9 por ronda', carga_scaled: 'Knees-to-elbows' },
    ],
  },
  { id: 'open-2012-04', nombre: 'Open 12.4', categoria: 'open', año: 2012, formato: 'AMRAP', duracion_min: 12, tiempo_estimado_min: 12,
    descripcion: 'AMRAP 12 min: 150 Wall Balls, 90 Double-Unders, 30 Ring Muscle-ups.',
    movimientos: [
      { nombre: 'Wall Ball Shot', reps_esquema: '150 total', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
      { nombre: 'Double-Under', reps_esquema: '90 total', carga_scaled: 'Single-unders x3' },
      { nombre: 'Ring Muscle-up', reps_esquema: '30 total', carga_scaled: 'CTB Pull-ups' },
    ],
  },
  { id: 'open-2012-05', nombre: 'Open 12.5', categoria: 'open', año: 2012, formato: 'AMRAP', duracion_min: 7, tiempo_estimado_min: 7,
    descripcion: 'AMRAP 7 min: 3 Thrusters + 3 CTB, luego 6-6, 9-9... (igual a 11.6)',
    movimientos: [
      { nombre: 'Thruster', reps_esquema: '3-6-9-12...', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'CTB Pull-up', reps_esquema: '3-6-9-12...', carga_scaled: 'Pull-up' },
    ],
  },
  // ── OPEN 2013 ──────────────────────────────────────────────────────────────
  { id: 'open-2013-01', nombre: 'Open 13.1', categoria: 'open', año: 2013, formato: 'AMRAP', duracion_min: 17, tiempo_estimado_min: 17,
    descripcion: '17 min: 40 Burpees, 30 Snatches 34/25kg, 30 Burpees, 30 Snatches 52/34kg, 20 Burpees, 30 Snatches 70/43kg, 10 Burpees, max Snatches 88/61kg.',
    movimientos: [
      { nombre: 'Burpee', reps_esquema: '40+30+20+10' },
      { nombre: 'Snatch', reps_esquema: '30+30+30+max (peso escalando)', carga_rx_kg_hombre: 34, carga_rx_kg_mujer: 25, carga_scaled: 'Reducir peso en cada tramo' },
    ],
  },
  { id: 'open-2013-02', nombre: 'Open 13.2', categoria: 'open', año: 2013, formato: 'AMRAP', duracion_min: 10, tiempo_estimado_min: 10,
    descripcion: 'AMRAP 10 min: 5 Shoulder-to-Overhead, 10 Deadlifts, 15 Box Jumps.',
    movimientos: [
      { nombre: 'Shoulder-to-Overhead', reps_esquema: '5 por ronda', carga_rx_kg_hombre: 52, carga_rx_kg_mujer: 35, carga_scaled: 'Peso reducido' },
      { nombre: 'Deadlift', reps_esquema: '10 por ronda', carga_rx_kg_hombre: 52, carga_rx_kg_mujer: 35, carga_scaled: 'Peso reducido' },
      { nombre: 'Box Jump', reps_esquema: '15 por ronda', carga_scaled: 'Step-ups' },
    ],
  },
  { id: 'open-2013-03', nombre: 'Open 13.3', categoria: 'open', año: 2013, formato: 'AMRAP', duracion_min: 12, tiempo_estimado_min: 12,
    descripcion: 'AMRAP 12 min: 150 Wall Balls, 90 Double-Unders, 30 Ring Muscle-ups. (igual a 12.4)',
    movimientos: [
      { nombre: 'Wall Ball Shot', reps_esquema: '150 total', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
      { nombre: 'Double-Under', reps_esquema: '90 total', carga_scaled: 'Single-unders x3' },
      { nombre: 'Ring Muscle-up', reps_esquema: '30 total', carga_scaled: 'CTB Pull-ups' },
    ],
  },
  { id: 'open-2013-04', nombre: 'Open 13.4', categoria: 'open', año: 2013, formato: 'AMRAP', duracion_min: 7, tiempo_estimado_min: 7,
    descripcion: 'AMRAP 7 min: 3 CTB Pull-ups + 3 Power Cleans, luego 6-6, 9-9...',
    movimientos: [
      { nombre: 'CTB Pull-up', reps_esquema: '3-6-9...', carga_scaled: 'Pull-up' },
      { nombre: 'Power Clean', reps_esquema: '3-6-9...', carga_rx_kg_hombre: 60, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'open-2013-05', nombre: 'Open 13.5', categoria: 'open', año: 2013, formato: 'AMRAP', duracion_min: 4, tiempo_estimado_min: 4,
    descripcion: 'AMRAP 4 min: 15 Thrusters + 15 CTB. Si se completa la ronda, se añaden 4 min más.',
    movimientos: [
      { nombre: 'Thruster', reps_esquema: '15 por ronda', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
      { nombre: 'CTB Pull-up', reps_esquema: '15 por ronda', carga_scaled: 'Pull-up' },
    ],
  },
  // ── OPEN 2014 ──────────────────────────────────────────────────────────────
  // ── OPEN 2014 ──────────────────────────────────────────────────────────────
  { id: 'open-2014-01', nombre: 'Open 14.1', categoria: 'open', año: 2014, formato: 'AMRAP', duracion_min: 10, tiempo_estimado_min: 10,
    descripcion: 'AMRAP 10 min: 30 Double-Unders, 15 Power Snatches. (igual a 11.1)',
    movimientos: [
      { nombre: 'Double-Under', reps_esquema: '30 por ronda', carga_scaled: 'Single-unders x3' },
      { nombre: 'Power Snatch', reps_esquema: '15 por ronda', carga_rx_kg_hombre: 34, carga_rx_kg_mujer: 25, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'open-2014-02', nombre: 'Open 14.2', categoria: 'open', año: 2014, formato: 'For Time', tiempo_estimado_min: 3,
    descripcion: 'En 3 min: max rounds de 10 OHS + 10 CTB Pull-ups. Al completar una ronda, se reinicia el timer.',
    movimientos: [
      { nombre: 'Overhead Squat', reps_esquema: '10 por ronda', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'CTB Pull-up', reps_esquema: '10 por ronda', carga_scaled: 'Pull-up' },
    ],
  },
  { id: 'open-2014-03', nombre: 'Open 14.3', categoria: 'open', año: 2014, formato: 'AMRAP', duracion_min: 8, tiempo_estimado_min: 8,
    descripcion: 'AMRAP 8 min: 10 Deadlifts + 15 Box Jumps. El peso del DL sube cada ronda.',
    movimientos: [
      { nombre: 'Deadlift', reps_esquema: '10 por ronda', carga_rx_kg_hombre: 70, carga_rx_kg_mujer: 47, carga_scaled: 'Iniciar ligero, escalar' },
      { nombre: 'Box Jump', reps_esquema: '15 por ronda', carga_scaled: 'Step-ups' },
    ],
  },
  { id: 'open-2014-04', nombre: 'Open 14.4', categoria: 'open', año: 2014, formato: 'AMRAP', duracion_min: 14, tiempo_estimado_min: 14,
    descripcion: 'AMRAP 14 min: 60 Cal Row, 50 T2B, 40 Wall Balls, 30 Power Cleans (61/43kg), 20 Ring Muscle-ups.',
    movimientos: [
      { nombre: 'Row', reps_esquema: '60 cal' },
      { nombre: 'Toes-to-Bar', reps_esquema: '50', carga_scaled: 'Knees-to-elbows' },
      { nombre: 'Wall Ball Shot', reps_esquema: '40', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
      { nombre: 'Power Clean', reps_esquema: '30', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
      { nombre: 'Ring Muscle-up', reps_esquema: '20', carga_scaled: 'CTB Pull-ups x2' },
    ],
  },
  { id: 'open-2014-05', nombre: 'Open 14.5', categoria: 'open', año: 2014, formato: 'For Time', tiempo_estimado_min: 20,
    descripcion: 'For time: 21-18-15-12-9-6-3 Thrusters y Bar-Facing Burpees.',
    movimientos: [
      { nombre: 'Thruster', reps_esquema: '21-18-15-12-9-6-3', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'Bar-Facing Burpee', reps_esquema: '21-18-15-12-9-6-3' },
    ],
  },
  // ── OPEN 2015 ──────────────────────────────────────────────────────────────
  { id: 'open-2015-01', nombre: 'Open 15.1', categoria: 'open', año: 2015, formato: 'AMRAP', duracion_min: 9, tiempo_estimado_min: 9,
    descripcion: 'AMRAP 9 min: 15 T2B, 10 Deadlifts, 5 Snatches.',
    movimientos: [
      { nombre: 'Toes-to-Bar', reps_esquema: '15 por ronda', carga_scaled: 'Knees-to-elbows' },
      { nombre: 'Deadlift', reps_esquema: '10 por ronda', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
      { nombre: 'Snatch', reps_esquema: '5 por ronda', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'open-2015-02', nombre: 'Open 15.2', categoria: 'open', año: 2015, formato: 'AMRAP', duracion_min: 6, tiempo_estimado_min: 6,
    descripcion: 'Cada 3 min: 2 OHS + 2 CTB, luego 4+4, 6+6... Al completar, se reinicia el timer.',
    movimientos: [
      { nombre: 'Overhead Squat', reps_esquema: '2-4-6-8... escalando', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'CTB Pull-up', reps_esquema: '2-4-6-8... escalando', carga_scaled: 'Pull-up' },
    ],
  },
  { id: 'open-2015-03', nombre: 'Open 15.3', categoria: 'open', año: 2015, formato: 'AMRAP', duracion_min: 14, tiempo_estimado_min: 14,
    descripcion: 'AMRAP 14 min: 7 Ring Muscle-ups, 50 Wall Balls, 100 Double-Unders.',
    movimientos: [
      { nombre: 'Ring Muscle-up', reps_esquema: '7 por ronda', carga_scaled: 'CTB Pull-up + Dip' },
      { nombre: 'Wall Ball Shot', reps_esquema: '50 por ronda', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
      { nombre: 'Double-Under', reps_esquema: '100 por ronda', carga_scaled: 'Single-unders x3' },
    ],
  },
  { id: 'open-2015-04', nombre: 'Open 15.4', categoria: 'open', año: 2015, formato: 'AMRAP', duracion_min: 8, tiempo_estimado_min: 8,
    descripcion: 'AMRAP 8 min: 3 HSPU + 3 Cleans, luego 6-6, 9-9...',
    movimientos: [
      { nombre: 'Handstand Push-up', reps_esquema: '3-6-9...', carga_scaled: 'Pike push-up' },
      { nombre: 'Clean', reps_esquema: '3-6-9...', carga_rx_kg_hombre: 84, carga_rx_kg_mujer: 61, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'open-2015-05', nombre: 'Open 15.5', categoria: 'open', año: 2015, formato: 'For Time', tiempo_estimado_min: 20,
    descripcion: 'For time: 27-21-15-9 Cal Row y Thrusters.',
    movimientos: [
      { nombre: 'Row', reps_esquema: '27-21-15-9 cal' },
      { nombre: 'Thruster', reps_esquema: '27-21-15-9', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
    ],
  },
  // ── OPEN 2016 ──────────────────────────────────────────────────────────────
  { id: 'open-2016-01', nombre: 'Open 16.1', categoria: 'open', año: 2016, formato: 'AMRAP', duracion_min: 20, tiempo_estimado_min: 20,
    descripcion: 'AMRAP 20 min: 25ft HS Walk, 8 Bar-Facing Burpees, 8 CTB Pull-ups, 25ft HS Walk, 8 BFBs, 8 Bar Muscle-ups.',
    movimientos: [
      { nombre: 'Handstand Walk', reps_esquema: '25ft por ciclo', carga_scaled: 'Bear crawl o HS hold' },
      { nombre: 'Bar-Facing Burpee', reps_esquema: '8 por ciclo' },
      { nombre: 'CTB Pull-up', reps_esquema: '8 por ciclo (1er paso)', carga_scaled: 'Pull-up' },
      { nombre: 'Bar Muscle-up', reps_esquema: '8 por ciclo (2do paso)', carga_scaled: 'CTB Pull-up x2' },
    ],
  },
  { id: 'open-2016-02', nombre: 'Open 16.2', categoria: 'open', año: 2016, formato: 'AMRAP', duracion_min: 4, tiempo_estimado_min: 4,
    descripcion: 'AMRAP 4 min: 25 T2B, 50 Double-Unders, 15 Squat Cleans. Al completar, +4 min con pesos mayores.',
    movimientos: [
      { nombre: 'Toes-to-Bar', reps_esquema: '25 por ronda', carga_scaled: 'Knees-to-elbows' },
      { nombre: 'Double-Under', reps_esquema: '50 por ronda', carga_scaled: 'Single-unders x3' },
      { nombre: 'Squat Clean', reps_esquema: '15 por ronda', carga_rx_kg_hombre: 56, carga_rx_kg_mujer: 38, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'open-2016-03', nombre: 'Open 16.3', categoria: 'open', año: 2016, formato: 'AMRAP', duracion_min: 7, tiempo_estimado_min: 7,
    descripcion: 'AMRAP 7 min: 10 Power Snatches, 3 Bar Muscle-ups.',
    movimientos: [
      { nombre: 'Power Snatch', reps_esquema: '10 por ronda', carga_rx_kg_hombre: 34, carga_rx_kg_mujer: 25, carga_scaled: 'Peso reducido' },
      { nombre: 'Bar Muscle-up', reps_esquema: '3 por ronda', carga_scaled: 'CTB Pull-up x2' },
    ],
  },
  { id: 'open-2016-04', nombre: 'Open 16.4', categoria: 'open', año: 2016, formato: 'AMRAP', duracion_min: 13, tiempo_estimado_min: 13,
    descripcion: 'AMRAP 13 min: 55 DL, 55 Wall Balls, 55 Cal Row, 55 HSPU.',
    movimientos: [
      { nombre: 'Deadlift', reps_esquema: '55', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
      { nombre: 'Wall Ball Shot', reps_esquema: '55', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
      { nombre: 'Row', reps_esquema: '55 cal' },
      { nombre: 'Handstand Push-up', reps_esquema: '55', carga_scaled: 'Pike push-up' },
    ],
  },
  { id: 'open-2016-05', nombre: 'Open 16.5', categoria: 'open', año: 2016, formato: 'For Time', tiempo_estimado_min: 20,
    descripcion: 'For time: 21-18-15-12-9-6-3 Thrusters y Bar-Facing Burpees. (igual a 14.5)',
    movimientos: [
      { nombre: 'Thruster', reps_esquema: '21-18-15-12-9-6-3', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'Bar-Facing Burpee', reps_esquema: '21-18-15-12-9-6-3' },
    ],
  },
  // ── OPEN 2017 ──────────────────────────────────────────────────────────────
  { id: 'open-2017-01', nombre: 'Open 17.1', categoria: 'open', año: 2017, formato: 'For Time', tiempo_estimado_min: 20,
    descripcion: 'For time (cap 20 min): 10-20-30-40-50 DB Snatches (22/15kg), 15 Burpee Box Jump-Overs entre cada serie.',
    movimientos: [
      { nombre: 'Dumbbell Snatch', reps_esquema: '10-20-30-40-50', carga_rx_kg_hombre: 22, carga_rx_kg_mujer: 15, carga_scaled: 'Peso reducido' },
      { nombre: 'Burpee Box Jump-Over', reps_esquema: '15 entre cada serie' },
    ],
  },
  { id: 'open-2017-02', nombre: 'Open 17.2', categoria: 'open', año: 2017, formato: 'AMRAP', duracion_min: 12, tiempo_estimado_min: 12,
    descripcion: 'AMRAP 12 min: 2 rondas de (50ft DB Walking Lunge 22/15kg, 16 T2B, 8 DB Power Cleans), luego 50ft HS Walk.',
    movimientos: [
      { nombre: 'DB Walking Lunge', reps_esquema: '50ft (x2 por ciclo)', carga_rx_kg_hombre: 22, carga_rx_kg_mujer: 15, carga_scaled: 'Sin peso' },
      { nombre: 'Toes-to-Bar', reps_esquema: '16 (x2 por ciclo)', carga_scaled: 'Knees-to-elbows' },
      { nombre: 'DB Power Clean', reps_esquema: '8 (x2 por ciclo)', carga_rx_kg_hombre: 22, carga_rx_kg_mujer: 15, carga_scaled: 'Peso reducido' },
      { nombre: 'Handstand Walk', reps_esquema: '50ft por ciclo', carga_scaled: 'Bear crawl' },
    ],
  },
  { id: 'open-2017-03', nombre: 'Open 17.3', categoria: 'open', año: 2017, formato: 'AMRAP', duracion_min: 8, tiempo_estimado_min: 8,
    descripcion: 'AMRAP 8 min: 3 rondas de (6 CTB + 6 Squat Snatches 34/25kg), luego 3 Bar MU + 3 Snatches 61/43kg...',
    movimientos: [
      { nombre: 'CTB Pull-up', reps_esquema: '6 por ronda (primeras 3)', carga_scaled: 'Pull-up' },
      { nombre: 'Squat Snatch', reps_esquema: '6 por ronda escalando peso', carga_rx_kg_hombre: 34, carga_rx_kg_mujer: 25, carga_scaled: 'Peso reducido o Power Snatch' },
      { nombre: 'Bar Muscle-up', reps_esquema: '3 por ciclo avanzado', carga_scaled: 'CTB Pull-up x2' },
    ],
  },
  { id: 'open-2017-04', nombre: 'Open 17.4', categoria: 'open', año: 2017, formato: 'For Time', tiempo_estimado_min: 13,
    descripcion: 'For time (cap 13 min): 55 DL, 55 Wall Balls, 55 Cal Row, 55 HSPU. (igual a 16.4)',
    movimientos: [
      { nombre: 'Deadlift', reps_esquema: '55', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
      { nombre: 'Wall Ball Shot', reps_esquema: '55', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
      { nombre: 'Row', reps_esquema: '55 cal' },
      { nombre: 'Handstand Push-up', reps_esquema: '55', carga_scaled: 'Pike push-up' },
    ],
  },
  { id: 'open-2017-05', nombre: 'Open 17.5', categoria: 'open', año: 2017, formato: 'AMRAP', duracion_min: 40, tiempo_estimado_min: 40,
    descripcion: 'AMRAP 40 min: 10 rounds de 9 Thrusters (43/29kg) + 35 Double-Unders.',
    movimientos: [
      { nombre: 'Thruster', reps_esquema: '9 x10 rounds', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'Double-Under', reps_esquema: '35 x10 rounds', carga_scaled: 'Single-unders x3' },
    ],
  },
  // ── OPEN 2018 ──────────────────────────────────────────────────────────────
  { id: 'open-2018-01', nombre: 'Open 18.1', categoria: 'open', año: 2018, formato: 'AMRAP', duracion_min: 20, tiempo_estimado_min: 20,
    descripcion: 'AMRAP 20 min: 8 T2B, 10 DB Hang Clean & Jerk (22/15kg), 14/12 Cal Row.',
    movimientos: [
      { nombre: 'Toes-to-Bar', reps_esquema: '8 por ronda', carga_scaled: 'Knees-to-elbows' },
      { nombre: 'DB Hang Clean & Jerk', reps_esquema: '10 por ronda', carga_rx_kg_hombre: 22, carga_rx_kg_mujer: 15, carga_scaled: 'Peso reducido' },
      { nombre: 'Row', reps_esquema: '14 cal H / 12 cal M por ronda' },
    ],
  },
  { id: 'open-2018-02', nombre: 'Open 18.2', categoria: 'open', año: 2018, formato: 'AMRAP', duracion_min: 12, tiempo_estimado_min: 12,
    descripcion: 'AMRAP 12 min: 1 Squat Clean + 1 Bar MU, luego 2+2, 3+3... Después, 12 min para 1RM Squat Clean.',
    movimientos: [
      { nombre: 'Squat Clean', reps_esquema: '1-2-3-4... escalando', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
      { nombre: 'Bar Muscle-up', reps_esquema: '1-2-3-4... escalando', carga_scaled: 'CTB Pull-up x2' },
    ],
  },
  { id: 'open-2018-03', nombre: 'Open 18.3', categoria: 'open', año: 2018, formato: 'AMRAP', duracion_min: 14, tiempo_estimado_min: 14,
    descripcion: 'AMRAP 14 min: 100 DU, 20 OHS (34/25kg), 100 DU, 12 Ring MU (o 20 CTB), repetir.',
    movimientos: [
      { nombre: 'Double-Under', reps_esquema: '100 por ciclo', carga_scaled: 'Single-unders x3' },
      { nombre: 'Overhead Squat', reps_esquema: '20 por ciclo', carga_rx_kg_hombre: 34, carga_rx_kg_mujer: 25, carga_scaled: 'Peso reducido' },
      { nombre: 'Ring Muscle-up', reps_esquema: '12 por ciclo', carga_scaled: '20 CTB Pull-ups' },
    ],
  },
  { id: 'open-2018-04', nombre: 'Open 18.4', categoria: 'open', año: 2018, formato: 'For Time', tiempo_estimado_min: 9,
    descripcion: 'For time (cap 9 min): 21 DL, 21 HSPU, 15 DL, 15ft HS Walk, 9 DL, 9 Ring MU.',
    movimientos: [
      { nombre: 'Deadlift', reps_esquema: '21-15-9', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
      { nombre: 'Handstand Push-up', reps_esquema: '21', carga_scaled: 'Pike push-up' },
      { nombre: 'Handstand Walk', reps_esquema: '15ft', carga_scaled: 'HS hold' },
      { nombre: 'Ring Muscle-up', reps_esquema: '9', carga_scaled: 'CTB Pull-up x2' },
    ],
  },
  { id: 'open-2018-05', nombre: 'Open 18.5', categoria: 'open', año: 2018, formato: 'AMRAP', duracion_min: 7, tiempo_estimado_min: 7,
    descripcion: 'AMRAP 7 min: 3 Thrusters + 3 CTB, luego 6-6, 9-9... (igual a 11.6/12.5)',
    movimientos: [
      { nombre: 'Thruster', reps_esquema: '3-6-9-12...', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'CTB Pull-up', reps_esquema: '3-6-9-12...', carga_scaled: 'Pull-up' },
    ],
  },
  // ── OPEN 2019 ──────────────────────────────────────────────────────────────
  { id: 'open-2019-01', nombre: 'Open 19.1', categoria: 'open', año: 2019, formato: 'AMRAP', duracion_min: 15, tiempo_estimado_min: 15,
    descripcion: 'AMRAP 15 min: 19 Wall Balls (9/6kg), 19 Cal Row.',
    movimientos: [
      { nombre: 'Wall Ball Shot', reps_esquema: '19 por ronda', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana o altura reducida' },
      { nombre: 'Row', reps_esquema: '19 cal por ronda' },
    ],
  },
  { id: 'open-2019-02', nombre: 'Open 19.2', categoria: 'open', año: 2019, formato: 'AMRAP', duracion_min: 8, tiempo_estimado_min: 8,
    descripcion: 'AMRAP 8 min: 25 T2B, 50 DU, 15 Squat Cleans. Peso sube cada ronda: 61/43 → 84/52 → 102/61 → 120/79kg.',
    movimientos: [
      { nombre: 'Toes-to-Bar', reps_esquema: '25 por ronda', carga_scaled: 'Knees-to-elbows' },
      { nombre: 'Double-Under', reps_esquema: '50 por ronda', carga_scaled: 'Single-unders x3' },
      { nombre: 'Squat Clean', reps_esquema: '15 por ronda', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'open-2019-03', nombre: 'Open 19.3', categoria: 'open', año: 2019, formato: 'For Time', tiempo_estimado_min: 10,
    descripcion: 'For time (cap 10 min): 200m Farmer Carry (22/15kg), 50 HS Shoulder Taps, 200m Farmer Carry.',
    movimientos: [
      { nombre: 'Farmer Carry', reps_esquema: '200m x2', carga_rx_kg_hombre: 22, carga_rx_kg_mujer: 15, carga_scaled: 'Peso reducido' },
      { nombre: 'Handstand Shoulder Tap', reps_esquema: '50 total', carga_scaled: 'Plank shoulder taps' },
    ],
  },
  { id: 'open-2019-04', nombre: 'Open 19.4', categoria: 'open', año: 2019, formato: 'AMRAP', duracion_min: 3, tiempo_estimado_min: 3,
    descripcion: 'AMRAP 3 min: 3 Ring MU, 6 HR Push-ups, 9 Squat Cleans (61/43kg). Al completar, se reinicia el timer.',
    movimientos: [
      { nombre: 'Ring Muscle-up', reps_esquema: '3 por ronda', carga_scaled: 'Jumping MU o CTB' },
      { nombre: 'Hand-Release Push-up', reps_esquema: '6 por ronda', carga_scaled: 'Rodillas en tierra' },
      { nombre: 'Squat Clean', reps_esquema: '9 por ronda', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'open-2019-05', nombre: 'Open 19.5', categoria: 'open', año: 2019, formato: 'For Time', tiempo_estimado_min: 40,
    descripcion: 'For time (cap 40 min): 33-27-21-15-9 Thrusters (43/29kg) y CTB Pull-ups.',
    movimientos: [
      { nombre: 'Thruster', reps_esquema: '33-27-21-15-9', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'CTB Pull-up', reps_esquema: '33-27-21-15-9', carga_scaled: 'Pull-up' },
    ],
  },
  // ── OPEN 2020 ──────────────────────────────────────────────────────────────
  { id: 'open-2020-01', nombre: 'Open 20.1', categoria: 'open', año: 2020, formato: 'AMRAP', duracion_min: 15, tiempo_estimado_min: 15,
    descripcion: 'AMRAP 15 min: 8 Ground-to-Overhead (43/29kg), 10 Bar-Facing Burpees.',
    movimientos: [
      { nombre: 'Ground-to-Overhead', reps_esquema: '8 por ronda', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'Bar-Facing Burpee', reps_esquema: '10 por ronda' },
    ],
  },
  { id: 'open-2020-02', nombre: 'Open 20.2', categoria: 'open', año: 2020, formato: 'AMRAP', duracion_min: 20, tiempo_estimado_min: 20,
    descripcion: 'AMRAP 20 min: 4 DB Thrusters (22/15kg), 6 T2B, 24 Double-Unders.',
    movimientos: [
      { nombre: 'DB Thruster', reps_esquema: '4 por ronda', carga_rx_kg_hombre: 22, carga_rx_kg_mujer: 15, carga_scaled: 'Peso reducido' },
      { nombre: 'Toes-to-Bar', reps_esquema: '6 por ronda', carga_scaled: 'Knees-to-elbows' },
      { nombre: 'Double-Under', reps_esquema: '24 por ronda', carga_scaled: 'Single-unders x3' },
    ],
  },
  { id: 'open-2020-03', nombre: 'Open 20.3', categoria: 'open', año: 2020, formato: 'For Time', tiempo_estimado_min: 9,
    descripcion: 'For time (cap 9 min): 21 Ring MU, 21 Squat Snatches (84/52kg), 18 Ring MU, 15 Snatches, 15 Ring MU, 9 Snatches.',
    movimientos: [
      { nombre: 'Ring Muscle-up', reps_esquema: '21-18-15', carga_scaled: '60-48-36 CTB Pull-ups' },
      { nombre: 'Squat Snatch', reps_esquema: '21-15-9', carga_rx_kg_hombre: 84, carga_rx_kg_mujer: 52, carga_scaled: 'Peso reducido o Power Snatch' },
    ],
  },
  { id: 'open-2020-04', nombre: 'Open 20.4', categoria: 'open', año: 2020, formato: 'AMRAP', duracion_min: 20, tiempo_estimado_min: 20,
    descripcion: 'AMRAP 20 min: 30 Box Jumps (24/20"), 15 CTB Pull-ups, 15 Clean & Jerks (84/52kg).',
    movimientos: [
      { nombre: 'Box Jump', reps_esquema: '30 por ronda', carga_scaled: 'Step-ups' },
      { nombre: 'CTB Pull-up', reps_esquema: '15 por ronda', carga_scaled: 'Pull-up' },
      { nombre: 'Clean & Jerk', reps_esquema: '15 por ronda', carga_rx_kg_hombre: 84, carga_rx_kg_mujer: 52, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'open-2020-05', nombre: 'Open 20.5', categoria: 'open', año: 2020, formato: 'For Time', tiempo_estimado_min: 20,
    descripcion: 'For time (cap 20 min): 40 Ring Muscle-ups, 80 Cal Row, 120 Wall Balls (9/6kg).',
    movimientos: [
      { nombre: 'Ring Muscle-up', reps_esquema: '40', carga_scaled: 'CTB Pull-up x3' },
      { nombre: 'Row', reps_esquema: '80 cal' },
      { nombre: 'Wall Ball Shot', reps_esquema: '120', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
    ],
  },
  // ── OPEN 2021 ──────────────────────────────────────────────────────────────
  { id: 'open-2021-01', nombre: 'Open 21.1', categoria: 'open', año: 2021, formato: 'AMRAP', duracion_min: 15, tiempo_estimado_min: 15,
    descripcion: 'AMRAP 15 min: 1 Wall Walk, 10 DU, 3 Squat Snatches (34/25kg). Ronda 2: 2 WW, 10 DU, 3 Snatches. Suma 1 WW por ronda.',
    movimientos: [
      { nombre: 'Wall Walk', reps_esquema: '1-2-3-4... escalando por ronda', carga_scaled: 'Inchworm' },
      { nombre: 'Double-Under', reps_esquema: '10 por ronda', carga_scaled: 'Single-unders x3' },
      { nombre: 'Squat Snatch', reps_esquema: '3 por ronda', carga_rx_kg_hombre: 34, carga_rx_kg_mujer: 25, carga_scaled: 'Peso reducido o Hang Power Snatch' },
    ],
  },
  { id: 'open-2021-02', nombre: 'Open 21.2', categoria: 'open', año: 2021, formato: 'AMRAP', duracion_min: 20, tiempo_estimado_min: 20,
    descripcion: 'AMRAP 20 min: 95 Double-Unders, 5 Squat Snatches (43/29kg).',
    movimientos: [
      { nombre: 'Double-Under', reps_esquema: '95 por ronda', carga_scaled: 'Single-unders x3' },
      { nombre: 'Squat Snatch', reps_esquema: '5 por ronda', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido o Power Snatch' },
    ],
  },
  { id: 'open-2021-03', nombre: 'Open 21.3', categoria: 'open', año: 2021, formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: 'For time (cap 15 min): 1 Front Squat, 10 DU, 3 Bar MU; 1 FS, 20 DU, 6 Bar MU; 1 FS, 30 DU, 9 Bar MU... escalando.',
    movimientos: [
      { nombre: 'Front Squat', reps_esquema: '1 rep por ronda', carga_rx_kg_hombre: 90, carga_rx_kg_mujer: 61, carga_scaled: 'Peso reducido' },
      { nombre: 'Double-Under', reps_esquema: '10-20-30... escalando', carga_scaled: 'Single-unders x3' },
      { nombre: 'Bar Muscle-up', reps_esquema: '3-6-9... escalando', carga_scaled: 'CTB Pull-up x2' },
    ],
  },
  // ── OPEN 2022 ──────────────────────────────────────────────────────────────
  { id: 'open-2022-01', nombre: 'Open 22.1', categoria: 'open', año: 2022, formato: 'AMRAP', duracion_min: 15, tiempo_estimado_min: 15,
    descripcion: 'AMRAP 15 min: 3 Wall Walks, 12 DB Snatches (22/15kg, alternando brazo), 15 Box Jumps.',
    movimientos: [
      { nombre: 'Wall Walk', reps_esquema: '3 por ronda', carga_scaled: 'Inchworm' },
      { nombre: 'Dumbbell Snatch', reps_esquema: '12 por ronda (alternando)', carga_rx_kg_hombre: 22, carga_rx_kg_mujer: 15, carga_scaled: 'Peso reducido' },
      { nombre: 'Box Jump', reps_esquema: '15 por ronda', carga_scaled: 'Step-ups' },
    ],
  },
  { id: 'open-2022-02', nombre: 'Open 22.2', categoria: 'open', año: 2022, formato: 'AMRAP', duracion_min: 10, tiempo_estimado_min: 10,
    descripcion: 'AMRAP 10 min: 5 DL, 5 Hang Power Cleans, 5 S2OH (102/70kg).',
    movimientos: [
      { nombre: 'Deadlift', reps_esquema: '5 por ronda', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
      { nombre: 'Hang Power Clean', reps_esquema: '5 por ronda', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
      { nombre: 'Shoulder-to-Overhead', reps_esquema: '5 por ronda', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'open-2022-03', nombre: 'Open 22.3', categoria: 'open', año: 2022, formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: 'For time (cap 15 min): 21-15-9 Thrusters (43/29kg) + CTB, luego 21-15-9 Power Snatches (34/25kg) + Bar-Facing Burpees.',
    movimientos: [
      { nombre: 'Thruster', reps_esquema: '21-15-9', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'CTB Pull-up', reps_esquema: '21-15-9', carga_scaled: 'Pull-up' },
      { nombre: 'Power Snatch', reps_esquema: '21-15-9', carga_rx_kg_hombre: 34, carga_rx_kg_mujer: 25, carga_scaled: 'Peso reducido' },
      { nombre: 'Bar-Facing Burpee', reps_esquema: '21-15-9' },
    ],
  },
  // ── OPEN 2023 ──────────────────────────────────────────────────────────────
  { id: 'open-2023-01', nombre: 'Open 23.1', categoria: 'open', año: 2023, formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: 'For time (cap 15 min): 1000m Row, 50 Thrusters (20/15kg), 30 CTB Pull-ups.',
    movimientos: [
      { nombre: 'Row', reps_esquema: '1000m', carga_scaled: '750m' },
      { nombre: 'Thruster', reps_esquema: '50', carga_rx_kg_hombre: 20, carga_rx_kg_mujer: 15, carga_scaled: 'Peso reducido' },
      { nombre: 'CTB Pull-up', reps_esquema: '30', carga_scaled: 'Pull-up' },
    ],
  },
  { id: 'open-2023-02', nombre: 'Open 23.2', categoria: 'open', año: 2023, formato: 'AMRAP', duracion_min: 15, tiempo_estimado_min: 15,
    descripcion: 'AMRAP 15 min: 5 Ring MU (o 10 CTB), 10 Squat Cleans (61/43kg), 100m Run.',
    movimientos: [
      { nombre: 'Ring Muscle-up', reps_esquema: '5 por ronda', carga_scaled: '10 CTB Pull-ups' },
      { nombre: 'Squat Clean', reps_esquema: '10 por ronda', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
      { nombre: 'Run', reps_esquema: '100m por ronda' },
    ],
  },
  { id: 'open-2023-03', nombre: 'Open 23.3', categoria: 'open', año: 2023, formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: 'For time (cap 15 min): 15-12-9-6-3 DL (102/70kg), Box Jumps, HSPU.',
    movimientos: [
      { nombre: 'Deadlift', reps_esquema: '15-12-9-6-3', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
      { nombre: 'Box Jump', reps_esquema: '15-12-9-6-3' },
      { nombre: 'Handstand Push-up', reps_esquema: '15-12-9-6-3', carga_scaled: 'Pike push-up' },
    ],
  },
  // ── OPEN 2024 ──────────────────────────────────────────────────────────────
  { id: 'open-2024-01', nombre: 'Open 24.1', categoria: 'open', año: 2024, formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: 'For time (cap 15 min): 21-15-9 DB Snatches (alternando brazo) y Lateral Burpees over Dumbbell.',
    movimientos: [
      { nombre: 'Dumbbell Snatch', reps_esquema: '21-15-9 (alternando brazo)', carga_rx_kg_hombre: 22, carga_rx_kg_mujer: 15, carga_scaled: 'Peso reducido' },
      { nombre: 'Lateral Burpee over Dumbbell', reps_esquema: '21-15-9' },
    ],
  },
  { id: 'open-2024-02', nombre: 'Open 24.2', categoria: 'open', año: 2024, formato: 'AMRAP', duracion_min: 20, tiempo_estimado_min: 20,
    descripcion: 'AMRAP 20 min: 4 Legless Rope Climbs (o 8 Rope Climbs), 8 Squat Cleans (70/47kg), 12 Cal Bike.',
    movimientos: [
      { nombre: 'Legless Rope Climb', reps_esquema: '4 por ronda', carga_scaled: '8 Rope Climbs con piernas' },
      { nombre: 'Squat Clean', reps_esquema: '8 por ronda', carga_rx_kg_hombre: 70, carga_rx_kg_mujer: 47, carga_scaled: 'Peso reducido' },
      { nombre: 'Bike (Assault/Echo)', reps_esquema: '12 cal por ronda' },
    ],
  },
  { id: 'open-2024-03', nombre: 'Open 24.3', categoria: 'open', año: 2024, formato: 'For Time', tiempo_estimado_min: 25,
    descripcion: 'For time (cap 25 min): 50 Cal Bike, 50 T2B, 50 Wall Balls (9/6kg), 25 CTB, 25 Power Snatches (52/35kg), 100ft HS Walk, 10 Bar MU.',
    movimientos: [
      { nombre: 'Bike (Assault/Echo)', reps_esquema: '50 cal' },
      { nombre: 'Toes-to-Bar', reps_esquema: '50', carga_scaled: 'Knees-to-elbows' },
      { nombre: 'Wall Ball Shot', reps_esquema: '50', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
      { nombre: 'CTB Pull-up', reps_esquema: '25', carga_scaled: 'Pull-up' },
      { nombre: 'Power Snatch', reps_esquema: '25', carga_rx_kg_hombre: 52, carga_rx_kg_mujer: 35, carga_scaled: 'Peso reducido' },
      { nombre: 'Handstand Walk', reps_esquema: '100ft', carga_scaled: 'Bear crawl 100ft' },
      { nombre: 'Bar Muscle-up', reps_esquema: '10', carga_scaled: 'CTB Pull-up x2' },
    ],
  },
  // ── OPEN 2025 ──────────────────────────────────────────────────────────────
  { id: 'open-2025-01', nombre: 'Open 25.1', categoria: 'open', año: 2025, formato: 'AMRAP', duracion_min: 15, tiempo_estimado_min: 15,
    descripcion: 'AMRAP 15 min: 3 Lateral Burpees over Dumbbell, 3 DB Hang Clean-to-Overhead, 30ft Walking Lunge.',
    movimientos: [
      { nombre: 'Lateral Burpee over Dumbbell', reps_esquema: '3 por ronda' },
      { nombre: 'DB Hang Clean-to-Overhead', reps_esquema: '3 por ronda', carga_rx_kg_hombre: 22, carga_rx_kg_mujer: 15, carga_scaled: 'Peso reducido' },
      { nombre: 'Walking Lunge', reps_esquema: '30ft (9m) por ronda' },
    ],
  },
  { id: 'open-2025-02', nombre: 'Open 25.2', categoria: 'open', año: 2025, formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: 'For time (cap 15 min): 100 Double-Unders, 50 Wall Balls (9/6kg), 25 CTB Pull-ups, 5 Squat Snatches (70/47kg).',
    movimientos: [
      { nombre: 'Double-Under', reps_esquema: '100', carga_scaled: 'Single-unders x3' },
      { nombre: 'Wall Ball Shot', reps_esquema: '50', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
      { nombre: 'CTB Pull-up', reps_esquema: '25', carga_scaled: 'Pull-up' },
      { nombre: 'Squat Snatch', reps_esquema: '5', carga_rx_kg_hombre: 70, carga_rx_kg_mujer: 47, carga_scaled: 'Power Snatch peso reducido' },
    ],
  },
  { id: 'open-2025-03', nombre: 'Open 25.3', categoria: 'open', año: 2025, formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: 'For time (cap 15 min): 15-12-9 Squat Cleans (84/56kg), CTB Pull-ups, Box Jumps (24/20").',
    movimientos: [
      { nombre: 'Squat Clean', reps_esquema: '15-12-9', carga_rx_kg_hombre: 84, carga_rx_kg_mujer: 56, carga_scaled: 'Peso reducido o Power Clean' },
      { nombre: 'CTB Pull-up', reps_esquema: '15-12-9', carga_scaled: 'Pull-up' },
      { nombre: 'Box Jump', reps_esquema: '15-12-9' },
    ],
  },

  // ── CROSSFIT GAMES (workouts icónicos frecuentemente programados en boxes) ─
  { id: 'games-2011-amanda', nombre: 'Amanda', categoria: 'games', año: 2011, formato: 'For Time', tiempo_estimado_min: 10,
    descripcion: 'For time: 9-7-5 Ring Muscle-ups y Squat Snatches.',
    movimientos: [
      { nombre: 'Ring Muscle-up', reps_esquema: '9-7-5', carga_scaled: 'CTB Pull-up + Dip' },
      { nombre: 'Squat Snatch', reps_esquema: '9-7-5', carga_rx_kg_hombre: 70, carga_rx_kg_mujer: 52, carga_scaled: 'Peso reducido o Power Snatch' },
    ],
  },
  { id: 'games-2010-nasty-girls', nombre: 'Nasty Girls', categoria: 'games', año: 2010, formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: '3 rounds for time: 50 Air Squats, 7 Ring Muscle-ups, 10 Hang Power Cleans.',
    movimientos: [
      { nombre: 'Air Squat', reps_esquema: '50 x3' },
      { nombre: 'Ring Muscle-up', reps_esquema: '7 x3', carga_scaled: 'CTB Pull-up + Dip' },
      { nombre: 'Hang Power Clean', reps_esquema: '10 x3', carga_rx_kg_hombre: 61, carga_rx_kg_mujer: 43, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'games-2014-heavy-dt', nombre: 'Heavy DT', categoria: 'games', año: 2014, formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: '5 rounds for time: 12 DL, 9 Hang Power Cleans, 6 Push Jerks (102/70kg).',
    movimientos: [
      { nombre: 'Deadlift', reps_esquema: '12 x5', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
      { nombre: 'Hang Power Clean', reps_esquema: '9 x5', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
      { nombre: 'Push Jerk', reps_esquema: '6 x5', carga_rx_kg_hombre: 102, carga_rx_kg_mujer: 70, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'games-2015-triple3', nombre: 'Triple 3', categoria: 'games', año: 2015, formato: 'For Time', tiempo_estimado_min: 45,
    descripcion: 'For time: 3-mile Run (~4800m), 300 Double-Unders, 3000m Row.',
    movimientos: [
      { nombre: 'Run', reps_esquema: '3 millas (~4800m)' },
      { nombre: 'Double-Under', reps_esquema: '300' },
      { nombre: 'Row', reps_esquema: '3000m' },
    ],
  },
  { id: 'games-2015-chipper', nombre: 'The Chipper', categoria: 'games', año: 2015, formato: 'For Time', tiempo_estimado_min: 20,
    descripcion: 'For time: 30 T2B, 30 Box Jumps (30/24"), 10 Squat Cleans pesados, 30 Box Jumps, 30 T2B.',
    movimientos: [
      { nombre: 'Toes-to-Bar', reps_esquema: '30+30' },
      { nombre: 'Box Jump', reps_esquema: '30+30', carga_scaled: 'Caja más baja' },
      { nombre: 'Squat Clean', reps_esquema: '10', carga_rx_kg_hombre: 120, carga_rx_kg_mujer: 80, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'games-2018-fibonacci', nombre: 'Fibonacci', categoria: 'games', año: 2018, formato: 'For Time', tiempo_estimado_min: 15,
    descripcion: 'For time: 1 Squat Snatch, 1 Bar MU, 2 Snatches, 3 Bar MU, 5 Snatches, 8 Bar MU, 13 Snatches, 21 Bar MU.',
    movimientos: [
      { nombre: 'Squat Snatch', reps_esquema: '1-2-5-13', carga_rx_kg_hombre: 84, carga_rx_kg_mujer: 56, carga_scaled: 'Peso reducido' },
      { nombre: 'Bar Muscle-up', reps_esquema: '1-3-8-21', carga_scaled: 'CTB Pull-up x2' },
    ],
  },
  { id: 'games-2016-pedaler', nombre: 'Pedaler', categoria: 'games', año: 2016, formato: 'For Time', tiempo_estimado_min: 20,
    descripcion: 'For time: 1-mile Assault Bike, 100 Wall Balls (9/6kg), 1-mile Assault Bike.',
    movimientos: [
      { nombre: 'Assault Bike', reps_esquema: '1 milla x2' },
      { nombre: 'Wall Ball Shot', reps_esquema: '100', carga_rx_kg_hombre: 9, carga_rx_kg_mujer: 6, carga_scaled: 'Pelota más liviana' },
    ],
  },
  { id: 'games-2019-atalanta', nombre: 'Atalanta', categoria: 'games', año: 2019, formato: 'For Time', tiempo_estimado_min: 30,
    descripcion: '5 rounds for time: 800m Run, 7 Ring Muscle-ups, 10 Thrusters (34/25kg).',
    movimientos: [
      { nombre: 'Run', reps_esquema: '800m x5', carga_scaled: '400m' },
      { nombre: 'Ring Muscle-up', reps_esquema: '7 x5', carga_scaled: 'CTB Pull-up + Dip' },
      { nombre: 'Thruster', reps_esquema: '10 x5', carga_rx_kg_hombre: 34, carga_rx_kg_mujer: 25, carga_scaled: 'Peso reducido' },
    ],
  },
  { id: 'games-2022-sprint', nombre: 'Sprint Chipper 2022', categoria: 'games', año: 2022, formato: 'For Time', tiempo_estimado_min: 8,
    descripcion: 'For time: 10 rounds de 10 Thrusters (43/29kg) + 10 Bar-Facing Burpees.',
    movimientos: [
      { nombre: 'Thruster', reps_esquema: '10 x10 rounds', carga_rx_kg_hombre: 43, carga_rx_kg_mujer: 29, carga_scaled: 'Peso reducido' },
      { nombre: 'Bar-Facing Burpee', reps_esquema: '10 x10 rounds' },
    ],
  },
  { id: 'games-2017-strongman', nombre: 'Strongman Medley', categoria: 'games', año: 2017, formato: 'For Time', tiempo_estimado_min: 10,
    descripcion: 'Evento Strongman de los Games: Yoke Carry, Farmer Carry, Log Clean & Press.',
    movimientos: [
      { nombre: 'Yoke Carry', reps_esquema: '50ft', carga_rx_kg_hombre: 180, carga_rx_kg_mujer: 120, carga_scaled: 'Peso reducido' },
      { nombre: 'Farmer Carry', reps_esquema: '50ft', carga_rx_kg_hombre: 70, carga_rx_kg_mujer: 50, carga_scaled: 'Peso reducido' },
      { nombre: 'Log Clean & Press', reps_esquema: '5', carga_rx_kg_hombre: 80, carga_rx_kg_mujer: 55, carga_scaled: 'Barra convencional' },
    ],
  },
] as const

// ─── Seed ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Seeding benchmarks...')
  let created = 0
  let updated = 0

  for (const b of BENCHMARKS) {
    const { movimientos, id, categoria, año, duracion_min, tiempo_estimado_min, notas, ...rest } = b as any

    const existing = await prisma.benchmark.findUnique({ where: { externalId: id } })

    if (existing) {
      // Delete old movements and re-create to keep data fresh
      await prisma.benchmarkMovement.deleteMany({ where: { benchmarkId: existing.id } })
      await prisma.benchmark.update({
        where: { id: existing.id },
        data: {
          ...rest,
          categoria: CAT[categoria],
          año: año ?? null,
          duracionMins: duracion_min ?? null,
          tiempoEstMin: tiempo_estimado_min ?? null,
          notas: notas ?? null,
          movimientos: {
            create: movimientos.map((m: any, i: number) => ({
              nombre: m.nombre,
              repsEsquema: m.reps_esquema ?? null,
              cargaRxKgHombre: m.carga_rx_kg_hombre ?? null,
              cargaRxKgMujer: m.carga_rx_kg_mujer ?? null,
              alturaRxCmHombre: m.altura_rx_cm_hombre ?? null,
              alturaRxCmMujer: m.altura_rx_cm_mujer ?? null,
              cargaScaled: m.carga_scaled ?? null,
              orden: i,
            })),
          },
        },
      })
      updated++
    } else {
      await prisma.benchmark.create({
        data: {
          externalId: id,
          ...rest,
          categoria: CAT[categoria],
          año: año ?? null,
          duracionMins: duracion_min ?? null,
          tiempoEstMin: tiempo_estimado_min ?? null,
          notas: notas ?? null,
          isOfficial: true,
          movimientos: {
            create: movimientos.map((m: any, i: number) => ({
              nombre: m.nombre,
              repsEsquema: m.reps_esquema ?? null,
              cargaRxKgHombre: m.carga_rx_kg_hombre ?? null,
              cargaRxKgMujer: m.carga_rx_kg_mujer ?? null,
              alturaRxCmHombre: m.altura_rx_cm_hombre ?? null,
              alturaRxCmMujer: m.altura_rx_cm_mujer ?? null,
              cargaScaled: m.carga_scaled ?? null,
              orden: i,
            })),
          },
        },
      })
      created++
    }
  }

  console.log(`Done: ${created} created, ${updated} updated`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
