import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { DisciplineIcon } from './DisciplineIcon'
import { getGymTimezone } from '../lib/gym-timezone'

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleTimeString('es-CL', { ...opts, timeZone: getGymTimezone() })
}

export interface MyBooking { bookingId: string; status: string; confirmDeadline?: string | null }

// Mismo criterio que habilita "Reservar lugar": no reservada/en lista de espera,
// no empezada, dentro de la ventana de reserva del gym, fuera del cutoff, con
// cupo. Se exporta para que ClassesScreen pueda buscar "próximas ocurrencias del
// mismo horario" al armar la lista de "repetir esta clase" en la hoja de detalle.
export function isClassSelectable(
  cls: any,
  myBooking: MyBooking | undefined,
  bookingWindowDays: number,
  bookingCutoffMins: number,
): boolean {
  const booked = !!myBooking && ['CONFIRMED', 'ATTENDED', 'PENDING_CONFIRM'].includes(myBooking.status)
  const isWaitlisted = myBooking?.status === 'WAITLIST'
  const now = new Date()
  const clsStart = new Date(cls.startsAt)
  const started = clsStart <= now
  const count = cls._count?.bookings ?? cls.currentCapacity ?? 0
  const cap = cls.capacity ?? 0
  const isFull = count >= cap
  const maxBookingDate = new Date(now.getTime() + bookingWindowDays * 24 * 60 * 60 * 1000)
  const outsideWindow = clsStart > maxBookingDate
  const cutoffTime = new Date(clsStart.getTime() - bookingCutoffMins * 60 * 1000)
  const withinCutoff = !started && now > cutoffTime
  return !booked && !isWaitlisted && !started && !outsideWindow && !withinCutoff && !isFull
}

// Una clase del día. Tocar siempre abre la hoja de detalle (incluso cuando está
// PENDING_CONFIRM) — las acciones (reservar, confirmar, cancelar) viven adentro
// de esa hoja, nunca se disparan directo al tocar la tarjeta (antes, confirmar sí
// se disparaba directo y no dejaba "entrar" a ver/cancelar la clase — feedback
// Cristian, 2026-10-16).
export function ClassCard({
  cls, myBooking, c, bookingWindowDays, bookingCutoffMins, cancelCutoffMins,
  onOpenSheet,
}: {
  cls: any
  myBooking?: MyBooking
  c: any
  bookingWindowDays: number
  bookingCutoffMins: number
  cancelCutoffMins: number
  onOpenSheet: (cls: any) => void
}) {
  const booked = !!myBooking && ['CONFIRMED', 'ATTENDED', 'PENDING_CONFIRM'].includes(myBooking.status)
  const isPendingConfirm = myBooking?.status === 'PENDING_CONFIRM'
  const isWaitlisted = myBooking?.status === 'WAITLIST'
  const now = new Date()
  const clsStart = new Date(cls.startsAt)
  const started = clsStart <= now
  const count = cls._count?.bookings ?? cls.currentCapacity ?? 0
  const cap = cls.capacity ?? 0
  const isFull = count >= cap
  const occupancy = cap > 0 ? Math.min(Math.round((count / cap) * 100), 100) : 0
  const barColor = occupancy >= 90 ? '#ef4444' : occupancy >= 60 ? '#f59e0b' : c.success
  const accentColor = cls.classType?.color || c.primary

  const maxBookingDate = new Date(now.getTime() + bookingWindowDays * 24 * 60 * 60 * 1000)
  const outsideWindow = clsStart > maxBookingDate
  const cutoffTime = new Date(clsStart.getTime() - bookingCutoffMins * 60 * 1000)
  const withinCutoff = !started && now > cutoffTime
  const cancelCutoffTime = new Date(clsStart.getTime() - cancelCutoffMins * 60 * 1000)
  const withinCancelCutoff = !started && now > cancelCutoffTime

  const s = makeStyles(c)

  return (
    <View style={[s.cardWrap, { shadowColor: accentColor, opacity: started ? 0.65 : 1 }]}>
      <View style={[s.card, { borderColor: isPendingConfirm ? '#f59e0b60' : booked ? accentColor + '60' : c.border }]}>
        <View style={[s.stripe, { backgroundColor: isPendingConfirm ? '#f59e0b' : accentColor }]} />

        <View style={s.cardBody}>
          <View style={s.cardTop}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                <DisciplineIcon discipline={cls.classType?.discipline} size={14} color={accentColor} />
                <Text style={[s.cardName, { color: c.text1 }]}>{cls.classType?.name || 'Clase'}</Text>
              </View>
              <Text style={[s.cardTime, { color: c.text3 }]}>
                {fmt(cls.startsAt, { hour: '2-digit', minute: '2-digit' })} — {fmt(cls.endsAt, { hour: '2-digit', minute: '2-digit' })}
              </Text>
              {cls.coach?.name && (
                <Text style={[s.cardCoach, { color: c.text3 }]}>👤 {cls.coach.name}</Text>
              )}
            </View>
            <View style={s.cardMeta}>
              <Text style={[s.slotsText, { color: isFull ? '#ef4444' : c.primary }]}>
                {count}/{cap}
              </Text>
              {isPendingConfirm ? (
                <View style={[s.bookedBadge, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b50' }]}>
                  <Text style={[s.bookedText, { color: '#f59e0b' }]}>⏱ Confirmar</Text>
                </View>
              ) : booked ? (
                <View style={[s.bookedBadge, { backgroundColor: c.success + '20', borderColor: c.success + '50' }]}>
                  <Text style={[s.bookedText, { color: c.success }]}>Inscrito ✓</Text>
                </View>
              ) : isWaitlisted ? (
                <View style={[s.bookedBadge, { backgroundColor: c.text3 + '20', borderColor: c.text3 + '50' }]}>
                  <Text style={[s.bookedText, { color: c.text3 }]}>⏳ En lista</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={[s.progBar, { backgroundColor: c.border }]}>
            <View style={[s.progFill, { width: `${occupancy}%` as any, backgroundColor: barColor }]} />
          </View>

          {/* key fuerza un remount limpio al cambiar de rama (ej. booked true→false
              tras cancelar): sin esto, el TouchableOpacity exterior se reutilizaba
              entre ramas con el mismo tipo de elemento y el LinearGradient de
              "Reservar lugar" quedaba montado con layout inicial 0x0, invisible pero
              tappable (QA H-MOBILE-01, docs/QA_MOBILE_MAESTRO.md). */}
          <React.Fragment key={`${isPendingConfirm}-${started}-${booked}-${isWaitlisted}-${outsideWindow}-${withinCutoff}-${isFull}`}>
          {isPendingConfirm ? (
            <TouchableOpacity
              style={[s.btn, { backgroundColor: '#f59e0b' }]}
              onPress={() => onOpenSheet(cls)}
            >
              <Text style={[s.btnText, { color: '#fff' }]}>⏱ Confirmar · Ver clase</Text>
            </TouchableOpacity>
          ) : started ? (
            <View style={[s.btn, s.btnFull]}>
              <Text style={[s.btnText, { color: c.text3 }]}>
                {booked ? 'Clase iniciada · Inscrito ✓' : 'Clase ya iniciada'}
              </Text>
            </View>
          ) : booked ? (
            withinCancelCutoff ? (
              <View style={[s.btn, s.btnFull]}>
                <Text style={[s.btnText, { color: c.text3 }]}>No se puede cancelar · plazo vencido</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.btn, s.btnCancel, { borderColor: '#ef444460' }]}
                onPress={() => onOpenSheet(cls)}
              >
                <Text style={[s.btnText, { color: '#ef4444' }]}>Inscrito ✓  · Ver clase</Text>
              </TouchableOpacity>
            )
          ) : isWaitlisted ? (
            <TouchableOpacity
              style={[s.btn, s.btnCancel, { borderColor: c.text3 + '60' }]}
              onPress={() => onOpenSheet(cls)}
            >
              <Text style={[s.btnText, { color: c.text3 }]}>⏳ En lista de espera · Ver clase</Text>
            </TouchableOpacity>
          ) : outsideWindow ? (
            <View style={[s.btn, s.btnFull]}>
              <Text style={[s.btnText, { color: c.text3 }]}>
                Reservas abren {clsStart.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: getGymTimezone() })}
              </Text>
            </View>
          ) : withinCutoff ? (
            <View style={[s.btn, s.btnFull]}>
              <Text style={[s.btnText, { color: c.text3 }]}>Plazo de reserva cerrado</Text>
            </View>
          ) : isFull ? (
            <TouchableOpacity
              style={[s.btn, s.btnFull]}
              onPress={() => onOpenSheet(cls)}
            >
              <Text style={[s.btnText, { color: c.text1 }]}>Unirme a lista de espera</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => onOpenSheet(cls)}
              activeOpacity={0.82}
              style={{ borderRadius: 14, overflow: 'hidden' }}
            >
              <LinearGradient
                colors={[accentColor, accentColor + 'AA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.btn}
              >
                <Text style={[s.btnText, { color: '#fff' }]}>Reservar lugar</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          </React.Fragment>
        </View>
      </View>
    </View>
  )
}

function makeStyles(c: any) {
  return StyleSheet.create({
    cardWrap: {
      marginBottom: 12, borderRadius: 18,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.22,
      shadowRadius: 14,
      elevation: 6,
    },
    card: {
      flexDirection: 'row', borderRadius: 18, borderWidth: 1,
      backgroundColor: c.surface, overflow: 'hidden',
    },
    stripe: { width: 6 },
    cardBody: { flex: 1, padding: 16, gap: 10 },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    cardName: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
    cardTime: { fontSize: 13, marginBottom: 2 },
    cardCoach: { fontSize: 12 },
    cardMeta: { alignItems: 'flex-end', gap: 6 },
    slotsText: { fontSize: 14, fontWeight: '700' },
    bookedBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
    bookedText: { fontSize: 10, fontWeight: '700' },

    progBar: { height: 5, borderRadius: 3 },
    progFill: { height: 5, borderRadius: 3 },

    btn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
    btnFull: { backgroundColor: c.border },
    btnCancel: { backgroundColor: 'transparent', borderWidth: 1 },
    btnText: { fontSize: 14, fontWeight: '700' },
  })
}
