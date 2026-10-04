export type SportTheme =
  | 'neutral'
  | 'crossfit'
  | 'hyrox'
  | 'swimming'
  | 'football'
  | 'boxing'
  | 'yoga'
  | 'running'

export interface ThemeConfig {
  id: SportTheme
  name: string
  emoji: string
  primary: string
  secondary: string
  accent: string
  description: string
}

export const SPORT_THEMES: ThemeConfig[] = [
  {
    id: 'neutral',
    name: 'Neutral',
    emoji: '⚡',
    primary: '#6366F1',
    secondary: '#818CF8',
    accent: '#C7D2FE',
    description: 'Diseño limpio y profesional',
  },
  {
    id: 'crossfit',
    name: 'CrossFit',
    emoji: '🏋️',
    primary: '#F97316',
    secondary: '#FB923C',
    accent: '#FED7AA',
    description: 'Fuego, industrial, raw',
  },
  {
    id: 'hyrox',
    name: 'HYROX',
    emoji: '🔥',
    primary: '#B91C1C',
    secondary: '#DC2626',
    accent: '#FCA5A5',
    description: 'Carrera funcional, resistencia, acero',
  },
  {
    id: 'swimming',
    name: 'Natación',
    emoji: '🏊',
    primary: '#0EA5E9',
    secondary: '#38BDF8',
    accent: '#BAE6FD',
    description: 'Agua, profundidad, fluidez',
  },
  {
    id: 'football',
    name: 'Fútbol',
    emoji: '⚽',
    primary: '#22C55E',
    secondary: '#4ADE80',
    accent: '#BBF7D0',
    description: 'Césped, energía, outdoor',
  },
  {
    id: 'boxing',
    name: 'Boxeo / MMA',
    emoji: '🥊',
    primary: '#EF4444',
    secondary: '#F87171',
    accent: '#FECACA',
    description: 'Intensidad, oscuro, combate',
  },
  {
    id: 'yoga',
    name: 'Yoga / Pilates',
    emoji: '🧘',
    primary: '#7C3AED',
    secondary: '#A78BFA',
    accent: '#EDE9FE',
    description: 'Tierra, orgánico, calma',
  },
  {
    id: 'running',
    name: 'Running',
    emoji: '🏃',
    primary: '#06B6D4',
    secondary: '#22D3EE',
    accent: '#CFFAFE',
    description: 'Velocidad, eléctrico, mínimo',
  },
]

export function getTheme(id: SportTheme | string): ThemeConfig {
  return SPORT_THEMES.find(t => t.id === id) ?? SPORT_THEMES[0]
}
