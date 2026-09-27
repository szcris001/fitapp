/**
 * ThemeDemoScreen
 * Muestra cómo se ve la app con diferentes temas deportivos.
 * Accesible desde MoreScreen → "Vista previa de temas"
 */
import React, { useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar,
} from 'react-native'
import { SPORT_THEMES } from '../theme/themes'
import { getTheme } from '../theme/themes'

type ThemePreviewCardProps = {
  themeId: string
}

function ThemePreviewCard({ themeId }: ThemePreviewCardProps) {
  const theme = getTheme(themeId)
  const c = theme.colors

  return (
    <View style={[styles.previewCard, { backgroundColor: c.background, borderColor: c.border }]}>
      {/* Mini header */}
      <View style={[styles.miniHeader, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={[styles.miniLogo, { backgroundColor: c.primary }]}>
          <Text style={styles.miniLogoText}>F</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.miniGymName, { color: c.text1 }]}>CrossFit Box</Text>
          <Text style={[styles.miniRole, { color: c.text3 }]}>Admin</Text>
        </View>
        <View style={[styles.miniBadge, { backgroundColor: c.primary + '20', borderColor: c.primary + '40' }]}>
          <Text style={[styles.miniBadgeText, { color: c.primary }]}>{theme.emoji} {theme.name}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={[styles.miniStats, { backgroundColor: c.surface }]}>
        {[
          { n: '124', l: 'Miembros', color: c.primary },
          { n: '98', l: 'Activos', color: c.success },
          { n: '5', l: 'Alertas', color: c.error },
        ].map(({ n, l, color }) => (
          <View key={l} style={[styles.miniStat, { borderColor: c.border }]}>
            <Text style={[styles.miniStatNum, { color }]}>{n}</Text>
            <Text style={[styles.miniStatLbl, { color: c.text3 }]}>{l}</Text>
          </View>
        ))}
      </View>

      {/* WOD card */}
      <View style={[styles.miniWod, { backgroundColor: c.surface, borderColor: c.primary + '35' }]}>
        <View style={[styles.miniWodBadge, { backgroundColor: c.primary }]}>
          <Text style={styles.miniWodBadgeText}>WOD DE HOY</Text>
        </View>
        <Text style={[styles.miniWodTitle, { color: c.text1 }]}>Fran</Text>
        {[
          { name: 'Thruster', detail: '21-15-9' },
          { name: 'Pull Up', detail: '21-15-9' },
        ].map(m => (
          <View key={m.name} style={styles.miniMovRow}>
            <Text style={[styles.miniMovName, { color: c.text2 }]}>{m.name}</Text>
            <View style={[styles.miniMovPill, { backgroundColor: c.primary + '22' }]}>
              <Text style={[styles.miniMovDetail, { color: c.primary }]}>{m.detail}</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity style={[styles.miniCta, { backgroundColor: c.primary + '15', borderColor: c.primary + '30' }]}>
          <Text style={[styles.miniCtaText, { color: c.primary }]}>Reservar clase →</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={[styles.miniTabBar, { backgroundColor: c.tabBar, borderTopColor: c.tabBarBorder }]}>
        {['⌂', '◉', '▦', '◈'].map((icon, i) => (
          <View key={i} style={styles.miniTab}>
            <Text style={{ fontSize: 14, color: i === 0 ? c.primary : c.text3, opacity: i === 0 ? 1 : 0.45 }}>
              {icon}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export default function ThemeDemoScreen({ navigation }: any) {
  const [selected, setSelected] = useState('crossfit')

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Temas deportivos</Text>
        <Text style={styles.subtitle}>Elige la identidad visual de tu gimnasio</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Theme selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.themeRow} contentContainerStyle={styles.themeRowContent}>
          {SPORT_THEMES.map(t => (
            <TouchableOpacity
              key={t.id}
              onPress={() => setSelected(t.id)}
              style={[
                styles.themeChip,
                { borderColor: t.primary + '60', backgroundColor: t.primary + '15' },
                selected === t.id && { borderColor: t.primary, backgroundColor: t.primary + '25' },
              ]}
            >
              <Text style={styles.themeChipEmoji}>{t.emoji}</Text>
              <Text style={[styles.themeChipName, { color: selected === t.id ? t.primary : '#9ca3af' }]}>
                {t.name}
              </Text>
              {selected === t.id && (
                <View style={[styles.themeChipDot, { backgroundColor: t.primary }]} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Preview */}
        <Text style={styles.sectionLabel}>VISTA PREVIA</Text>
        <ThemePreviewCard themeId={selected} />

        {/* Compare: CrossFit vs Swimming */}
        <Text style={styles.sectionLabel}>COMPARATIVA</Text>
        <View style={styles.compareRow}>
          <View style={styles.compareItem}>
            <Text style={styles.compareLabel}>CrossFit</Text>
            <ThemePreviewCard themeId="crossfit" />
          </View>
          <View style={styles.compareItem}>
            <Text style={styles.compareLabel}>Natación</Text>
            <ThemePreviewCard themeId="swimming" />
          </View>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#030712' },
  header: { paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 },
  backBtn: { marginBottom: 12 },
  backText: { color: '#6366F1', fontSize: 14, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  scroll: { flex: 1 },
  themeRow: { marginBottom: 8 },
  themeRowContent: { paddingHorizontal: 24, gap: 10, paddingVertical: 8 },
  themeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1.5,
  },
  themeChipEmoji: { fontSize: 16 },
  themeChipName: { fontSize: 13, fontWeight: '600' },
  themeChipDot: { width: 6, height: 6, borderRadius: 3 },
  sectionLabel: {
    fontSize: 11, color: '#4b5563', fontWeight: '700', letterSpacing: 1,
    paddingHorizontal: 24, marginTop: 24, marginBottom: 12,
  },
  compareRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10 },
  compareItem: { flex: 1 },
  compareLabel: { fontSize: 11, color: '#6b7280', fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, paddingLeft: 4 },

  // Preview card
  previewCard: { marginHorizontal: 24, borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  miniHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1,
  },
  miniLogo: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  miniLogoText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  miniGymName: { fontSize: 13, fontWeight: '700' },
  miniRole: { fontSize: 11 },
  miniBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  miniBadgeText: { fontSize: 11, fontWeight: '700' },

  miniStats: { flexDirection: 'row', padding: 12, gap: 8 },
  miniStat: { flex: 1, alignItems: 'center', padding: 8, borderRadius: 10, borderWidth: 1 },
  miniStatNum: { fontSize: 18, fontWeight: '800' },
  miniStatLbl: { fontSize: 9, fontWeight: '600', marginTop: 1 },

  miniWod: { margin: 12, borderRadius: 14, padding: 14, borderWidth: 1 },
  miniWodBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 },
  miniWodBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  miniWodTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10, letterSpacing: -0.3 },
  miniMovRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  miniMovName: { fontSize: 12, fontWeight: '500' },
  miniMovPill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  miniMovDetail: { fontSize: 11, fontWeight: '700' },
  miniCta: { marginTop: 10, borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 1 },
  miniCtaText: { fontSize: 11, fontWeight: '600' },

  miniTabBar: { flexDirection: 'row', height: 48, borderTopWidth: 1 },
  miniTab: { flex: 1, justifyContent: 'center', alignItems: 'center' },
})
