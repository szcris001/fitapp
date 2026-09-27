import React, { createContext, useContext, useState, useCallback } from 'react'
import { getTheme, Theme, SportTheme } from './themes'

interface ThemeContextValue {
  theme: Theme
  setSportTheme: (id: SportTheme | string) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: getTheme('neutral'),
  setSportTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getTheme('neutral'))

  const setSportTheme = useCallback((id: SportTheme | string) => {
    setTheme(getTheme(id))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setSportTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
