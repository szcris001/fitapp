import { MaterialCommunityIcons } from '@expo/vector-icons'

// Mapeo disciplina → ícono de MaterialCommunityIcons
const DISCIPLINE_ICON: Record<string, string> = {
  crossfit:      'weight-lifter',     // persona levantando barra sobre cabeza
  weightlifting: 'barbell',           // barra olímpica horizontal
  powerlifting:  'dumbbell',          // mancuerna
  gymnastics:    'gymnastics',        // persona en paralelas/anillos
  endurance:     'run',               // persona corriendo
  hyrox:         'lightning-bolt',    // rayo
  rowing:        'rowing',            // remo ergómetro
  cycling:       'bike',              // bicicleta
  mobility:      'yoga',              // postura yoga
  swimming:      'swim',              // persona nadando
  boxing:        'sword-cross',       // espadas cruzadas — artes marciales/combate
  kids:          'star',              // estrella — CrossFit Kids
  competition:   'trophy',            // trofeo
  open:          'stadium',           // estadio
  manual:        'pencil',            // lápiz
}

const FALLBACK = 'dumbbell'

interface Props {
  discipline?: string | null
  size?: number
  color?: string
}

export function DisciplineIcon({ discipline, size = 18, color = 'currentColor' }: Props) {
  const iconName = (discipline ? DISCIPLINE_ICON[discipline] : null) ?? FALLBACK
  return (
    <MaterialCommunityIcons
      name={iconName as any}
      size={size}
      color={color}
    />
  )
}
