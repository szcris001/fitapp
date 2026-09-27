export function applyBrandColors(colors: { primary: string; secondary: string; accent: string }) {
  document.documentElement.style.setProperty('--brand-primary', colors.primary)
  document.documentElement.style.setProperty('--brand-secondary', colors.secondary)
  document.documentElement.style.setProperty('--brand-accent', colors.accent)
  localStorage.setItem('fitapp_colors', JSON.stringify(colors))
  window.dispatchEvent(new CustomEvent('brand-colors-changed', { detail: colors }))
}

export function loadBrandColors(): { primary: string; secondary: string; accent: string } | null {
  try {
    const stored = localStorage.getItem('fitapp_colors')
    if (!stored) return null
    return JSON.parse(stored)
  } catch { return null }
}
