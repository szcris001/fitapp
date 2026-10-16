import React from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

// Franja horizontal de días, reusada tanto en la semana (ClassesScreen) como
// dentro de cada día (ClassDayScreen, para cambiar de día sin perder una
// selección múltiple en curso). countForDay es opcional: en ClassDayScreen no
// hace falta recorrer todas las clases de la semana solo para mostrar el badge.
export function WeekDayStrip({
  days, selectedDay, onSelect, countForDay, color, border, text1, text3,
}: {
  days: Date[]
  selectedDay: Date
  onSelect: (day: Date) => void
  countForDay?: (day: Date) => number
  color: string
  border: string
  text1: string
  text3: string
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.strip}
    >
      {days.map((day, i) => {
        const isSelected = isSameDay(day, selectedDay)
        const isToday = isSameDay(day, new Date())
        const count = countForDay?.(day) ?? 0
        return (
          <TouchableOpacity
            key={i}
            onPress={() => onSelect(day)}
            activeOpacity={0.75}
            style={[
              styles.pill,
              { borderColor: border },
              isSelected
                ? { backgroundColor: color, borderColor: 'transparent' }
                : isToday
                ? { borderColor: color }
                : null,
            ]}
          >
            <Text style={[styles.dayName, {
              color: isSelected ? 'rgba(255,255,255,0.75)' : isToday ? color : text3,
            }]}>
              {isToday ? 'HOY' : DAY_SHORT[day.getDay()]}
            </Text>
            <Text style={[styles.dayNum, { color: isSelected ? '#fff' : isToday ? color : text1 }]}>
              {day.getDate()}
            </Text>
            {countForDay && (
              <View style={[styles.clsCount, {
                backgroundColor: count > 0
                  ? (isSelected ? 'rgba(255,255,255,0.25)' : color + '22')
                  : 'transparent',
              }]}>
                {count > 0 && (
                  <Text style={[styles.clsCountText, { color: isSelected ? '#fff' : color }]}>
                    {count}
                  </Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  // flexGrow/flexShrink: 0 — sin esto, cuando el contenido de más abajo (la
  // lista de clases) es corto, el espacio vertical libre se lo repartían este
  // ScrollView y el de filtros en vez de quedar vacío donde corresponde: la
  // franja de días y los chips se estiraban verticalmente de forma rara
  // (feedback con capturas, Cristian, 2026-10-16).
  scroll: { flexGrow: 0, flexShrink: 0 },
  strip: { paddingHorizontal: 20, paddingBottom: 14, gap: 7 },
  pill: {
    width: 56, borderRadius: 18, borderWidth: 1.5,
    paddingVertical: 10, alignItems: 'center', gap: 3,
    flexShrink: 0,
  },
  dayName: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  dayNum: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  clsCount: { width: 22, height: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  clsCountText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.2 },
})
