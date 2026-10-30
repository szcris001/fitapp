'use client'
import React from 'react'

// Selector de hora en formato militar (24h) explícito — el <input type="time">
// nativo muestra AM/PM según el locale del navegador/SO, no del `lang` del HTML,
// así que no hay forma confiable de forzar 24h con el widget nativo en todos los
// navegadores. Dos <select> garantizan "18:00" sin importar la config del browser.
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

export function TimeInput24({
  value,
  onChange,
  className = '',
}: {
  value: string // 'HH:MM'
  onChange: (value: string) => void
  className?: string
}) {
  const [h, m] = value.split(':')

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <select
        value={h}
        onChange={e => onChange(`${e.target.value}:${m}`)}
        className="input text-sm"
        aria-label="Hora"
      >
        {HOURS.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span style={{ color: 'var(--text-4)' }}>:</span>
      <select
        value={m}
        onChange={e => onChange(`${h}:${e.target.value}`)}
        className="input text-sm"
        aria-label="Minutos"
      >
        {MINUTES.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  )
}
