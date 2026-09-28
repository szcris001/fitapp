export type SportTheme =
  | 'neutral'
  | 'crossfit'
  | 'swimming'
  | 'football'
  | 'boxing'
  | 'yoga'
  | 'running'

export interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  surfaceHighlight: string
  text1: string
  text2: string
  text3: string
  border: string
  borderStrong: string
  success: string
  warning: string
  error: string
  tabBar: string
  tabBarBorder: string
}

export interface Theme {
  id: SportTheme
  name: string
  emoji: string
  colors: ThemeColors
  gradients: {
    hero: [string, string]
    card: [string, string]
  }
}

const STATUS = {
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
}

export const themes: Record<SportTheme, Theme> = {
  neutral: {
    id: 'neutral',
    name: 'Neutral',
    emoji: '⚡',
    colors: {
      primary: '#6366F1',
      secondary: '#818CF8',
      accent: '#C7D2FE',
      background: '#030712',
      surface: '#111827',
      surfaceHighlight: '#1F2937',
      text1: '#FFFFFF',
      text2: '#E5E7EB',
      text3: '#6B7280',
      border: '#1F2937',
      borderStrong: '#374151',
      tabBar: '#111827',
      tabBarBorder: '#1F2937',
      ...STATUS,
    },
    gradients: {
      hero: ['#030712', '#0F172A'],
      card: ['#111827', '#1E293B'],
    },
  },

  crossfit: {
    id: 'crossfit',
    name: 'CrossFit',
    emoji: '🏋️',
    colors: {
      primary: '#F97316',
      secondary: '#FB923C',
      accent: '#FED7AA',
      background: '#0D0A06',
      surface: '#1A1108',
      surfaceHighlight: '#2A1E0E',
      text1: '#FFFFFF',
      text2: '#FEF3C7',
      text3: '#92400E',
      border: '#2A1E0E',
      borderStrong: '#451A03',
      tabBar: '#130D05',
      tabBarBorder: '#2A1E0E',
      ...STATUS,
    },
    gradients: {
      hero: ['#0D0A06', '#1C120A'],
      card: ['#1A1108', '#221507'],
    },
  },

  swimming: {
    id: 'swimming',
    name: 'Natación',
    emoji: '🏊',
    colors: {
      primary: '#0EA5E9',
      secondary: '#38BDF8',
      accent: '#BAE6FD',
      background: '#040D14',
      surface: '#0C1929',
      surfaceHighlight: '#0E2340',
      text1: '#FFFFFF',
      text2: '#E0F2FE',
      text3: '#0369A1',
      border: '#0E2340',
      borderStrong: '#075985',
      tabBar: '#061220',
      tabBarBorder: '#0E2340',
      ...STATUS,
    },
    gradients: {
      hero: ['#040D14', '#071F36'],
      card: ['#0C1929', '#0E2340'],
    },
  },

  football: {
    id: 'football',
    name: 'Fútbol',
    emoji: '⚽',
    colors: {
      primary: '#22C55E',
      secondary: '#4ADE80',
      accent: '#BBF7D0',
      background: '#040D08',
      surface: '#0A1F10',
      surfaceHighlight: '#102B18',
      text1: '#FFFFFF',
      text2: '#DCFCE7',
      text3: '#166534',
      border: '#102B18',
      borderStrong: '#14532D',
      tabBar: '#071509',
      tabBarBorder: '#102B18',
      ...STATUS,
    },
    gradients: {
      hero: ['#040D08', '#0C1F12'],
      card: ['#0A1F10', '#102B18'],
    },
  },

  boxing: {
    id: 'boxing',
    name: 'Boxeo / MMA',
    emoji: '🥊',
    colors: {
      primary: '#EF4444',
      secondary: '#F87171',
      accent: '#FECACA',
      background: '#0D0404',
      surface: '#1A0808',
      surfaceHighlight: '#2A0D0D',
      text1: '#FFFFFF',
      text2: '#FEE2E2',
      text3: '#991B1B',
      border: '#2A0D0D',
      borderStrong: '#450A0A',
      tabBar: '#110505',
      tabBarBorder: '#2A0D0D',
      success: '#22C55E',
      warning: '#F59E0B',
      error: '#F97316',
    },
    gradients: {
      hero: ['#0D0404', '#1A0808'],
      card: ['#1A0808', '#2A0D0D'],
    },
  },

  yoga: {
    id: 'yoga',
    name: 'Yoga / Pilates',
    emoji: '🧘',
    colors: {
      primary: '#7C3AED',
      secondary: '#A78BFA',
      accent: '#EDE9FE',
      background: '#FAF7F5',
      surface: '#FFFFFF',
      surfaceHighlight: '#F5F3FF',
      text1: '#1C1917',
      text2: '#44403C',
      text3: '#78716C',
      border: '#E8E5FF',
      borderStrong: '#DDD6FE',
      tabBar: '#FFFFFF',
      tabBarBorder: '#E8E5FF',
      success: '#16A34A',
      warning: '#D97706',
      error: '#DC2626',
    },
    gradients: {
      hero: ['#FAF7F5', '#F0EBFF'],
      card: ['#FFFFFF', '#F9F7FE'],
    },
  },

  running: {
    id: 'running',
    name: 'Running',
    emoji: '🏃',
    colors: {
      primary: '#06B6D4',
      secondary: '#22D3EE',
      accent: '#CFFAFE',
      background: '#020B0D',
      surface: '#071318',
      surfaceHighlight: '#0A1E25',
      text1: '#FFFFFF',
      text2: '#E0FAFB',
      text3: '#0E7490',
      border: '#0A1E25',
      borderStrong: '#155E75',
      tabBar: '#050F14',
      tabBarBorder: '#0A1E25',
      ...STATUS,
    },
    gradients: {
      hero: ['#020B0D', '#061820'],
      card: ['#071318', '#0A1E25'],
    },
  },
}

export function getTheme(id?: string | null): Theme {
  if (id && id in themes) return themes[id as SportTheme]
  return themes.neutral
}

export const SPORT_THEMES = Object.values(themes).map(t => ({
  id: t.id,
  name: t.name,
  emoji: t.emoji,
  primary: t.colors.primary,
}))
