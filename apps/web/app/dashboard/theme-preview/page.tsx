'use client'
import { useState } from 'react'
import { SPORT_THEMES, ThemeConfig } from '../../../lib/themes'

// Per-theme CSS variable overrides injected as inline style on a scoped container
function themeVars(t: ThemeConfig, dark: boolean): React.CSSProperties {
  const darkMap: Record<string, { bg: string; card: string; sidebar: string; hover: string; b1: string; b2: string }> = {
    neutral:  { bg: '#0F172A', card: '#1E293B', sidebar: '#1E293B', hover: '#334155', b1: '#334155', b2: '#475569' },
    crossfit: { bg: '#0D0A06', card: '#1A1108', sidebar: '#130D05', hover: '#2A1E0E', b1: '#2A1E0E', b2: '#3D2B0F' },
    swimming: { bg: '#040D14', card: '#0C1929', sidebar: '#061220', hover: '#0E2340', b1: '#0E2340', b2: '#1A3D6B' },
    football: { bg: '#040D08', card: '#0A1F10', sidebar: '#071509', hover: '#102B18', b1: '#102B18', b2: '#1A4229' },
    boxing:   { bg: '#0D0404', card: '#1A0808', sidebar: '#110505', hover: '#2A0D0D', b1: '#2A0D0D', b2: '#3D1414' },
    yoga:     { bg: '#1A1425', card: '#241D35', sidebar: '#1D1630', hover: '#2F2548', b1: '#2F2548', b2: '#4A3B72' },
    running:  { bg: '#020B0D', card: '#071318', sidebar: '#050F14', hover: '#0A1E25', b1: '#0A1E25', b2: '#1A3A47' },
  }
  const d = darkMap[t.id] || darkMap.neutral

  return {
    '--primary': t.primary,
    '--secondary': t.secondary,
    '--accent': t.accent,
    '--primary-dim': `color-mix(in srgb, ${t.primary} 15%, ${dark ? d.card : '#ffffff'})`,
    '--surface-base':    dark ? d.bg      : '#F8FAFC',
    '--surface-card':    dark ? d.card    : '#FFFFFF',
    '--surface-sidebar': dark ? d.sidebar : '#FFFFFF',
    '--surface-hover':   dark ? d.hover   : '#F1F5F9',
    '--text-1': dark ? '#F1F5F9' : '#0F172A',
    '--text-2': dark ? '#E2E8F0' : '#374151',
    '--text-3': dark ? '#94A3B8' : '#6B7280',
    '--text-4': dark ? '#64748B' : '#9CA3AF',
    '--border-1': dark ? d.b1 : '#E5E7EB',
    '--border-2': dark ? d.b2 : '#D1D5DB',
    '--glow': `0 0 24px color-mix(in srgb, ${t.primary} 30%, transparent)`,
    backgroundColor: dark ? d.bg : '#F8FAFC',
  } as React.CSSProperties
}

function ThemeIsland({ t, dark }: { t: ThemeConfig; dark: boolean }) {
  return (
    <div style={{ ...themeVars(t, dark), borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border-1)', minWidth: 320 }}>
      {/* Sidebar strip */}
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{
          width: 220, backgroundColor: 'var(--surface-sidebar)', borderRight: '1px solid var(--border-1)',
          padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {/* Gym logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 16px' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, backgroundColor: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 18,
              boxShadow: 'var(--glow)',
            }}>
              {t.emoji}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Mi Gimnasio</div>
              <div style={{ fontSize: 11, color: 'var(--text-4)' }}>Administrador</div>
            </div>
          </div>
          {/* Nav items */}
          {['Inicio', 'Alumnos', 'Clases', 'Planificación', 'Planes', 'Reportes'].map((item, i) => (
            <div key={item} className={i === 0 ? 'nav-item-active' : ''}
              style={{
                padding: '10px 14px', borderRadius: 8, fontSize: 13,
                color: i === 0 ? 'var(--primary)' : 'var(--text-3)',
                cursor: 'default',
                backgroundColor: i === 0 ? `color-mix(in srgb, var(--primary) 10%, var(--surface-sidebar))` : 'transparent',
              }}>
              {item}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, backgroundColor: 'var(--surface-base)', padding: 20 }}>
          {/* Page title */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.03em' }}>
              Dashboard
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {t.name} — {dark ? 'Modo oscuro' : 'Modo claro'}
            </div>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Miembros', value: '124' },
              { label: 'Activos', value: '98' },
              { label: 'Este mes', value: '$420K' },
            ].map(({ label, value }) => (
              <div key={label} className="stat-card">
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                <div className="stat-number">{value}</div>
              </div>
            ))}
          </div>

          {/* WOD card */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              backgroundColor: 'var(--primary)', color: '#fff',
              borderRadius: 99, padding: '2px 10px', fontSize: 10, fontWeight: 800,
              letterSpacing: 1, marginBottom: 8,
            }}>
              WOD HOY
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>Fran</div>
            {[
              { name: 'Thruster', detail: '21-15-9 @ 95 lb' },
              { name: 'Pull Up', detail: '21-15-9' },
            ].map(m => (
              <div key={m.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{m.name}</span>
                <span style={{
                  fontSize: 11, color: 'var(--primary)', fontWeight: 700,
                  backgroundColor: 'var(--primary-dim)', padding: '2px 8px', borderRadius: 6,
                }}>{m.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ThemePreviewPage() {
  const [dark, setDark] = useState(true)

  return (
    <div className="p-8" style={{ backgroundColor: 'var(--surface-base)', minHeight: '100vh' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="section-title">Vista previa de temas</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 14, marginTop: 4 }}>
            Identidades visuales para cada deporte
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['claro', 'oscuro'] as const).map((m, i) => (
            <button key={m}
              onClick={() => setDark(i === 1)}
              style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: '1px solid var(--border-1)',
                backgroundColor: (i === 1) === dark ? 'var(--primary)' : 'var(--surface-card)',
                color: (i === 1) === dark ? '#fff' : 'var(--text-2)',
                cursor: 'pointer',
              }}>
              {m === 'claro' ? '☀ Claro' : '● Oscuro'}
            </button>
          ))}
        </div>
      </div>

      {/* All themes grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(560px, 1fr))', gap: 24 }}>
        {SPORT_THEMES.map(t => (
          <div key={t.id}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 10,
            }}>
              <span style={{ fontSize: 18 }}>{t.emoji}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>{t.name}</span>
              <span style={{
                fontSize: 11, color: t.primary, backgroundColor: `color-mix(in srgb, ${t.primary} 12%, var(--surface-base))`,
                padding: '2px 8px', borderRadius: 99, fontWeight: 600,
              }}>{t.description}</span>
            </div>
            <ThemeIsland t={t} dark={dark} />
          </div>
        ))}
      </div>
    </div>
  )
}
