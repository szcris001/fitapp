import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native'
import HomeScreen from './HomeScreen'
import BookingScreen from './BookingScreen'
import MyBookingsScreen from './MyBookingsScreen'
import ProfileScreen from './ProfileScreen'
import NotificationsScreen from './NotificationsScreen'
import PlanesScreen from './PlanesScreen'

type Tab = 'home' | 'booking' | 'mybookings' | 'planes' | 'profile'

export default function MainScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('home')

  const tabs = [
    { id: 'home',       label: 'Inicio',    icon: '🏠' },
    { id: 'booking',    label: 'Reservar',  icon: '📅' },
    { id: 'mybookings', label: 'Mis clases',icon: '✓'  },
    { id: 'planes',     label: 'Mi Plan',   icon: '💳' },
    { id: 'profile',    label: 'Perfil',    icon: '👤' },
  ]

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':       return <HomeScreen onNavigate={setActiveTab} />
      case 'booking':    return <BookingScreen />
      case 'mybookings': return <MyBookingsScreen />
      case 'planes':     return <PlanesScreen />
      case 'profile':    return <ProfileScreen />
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>{renderScreen()}</View>
      <View style={styles.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={styles.tabItem}
            onPress={() => setActiveTab(tab.id as Tab)}
          >
            <Text style={[styles.tabIcon, activeTab === tab.id && styles.tabIconActive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#111827',
    borderTopWidth: 1, borderTopColor: '#1f2937',
    paddingBottom: 8, paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { fontSize: 20, opacity: 0.4 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: 10, color: '#4b5563' },
  tabLabelActive: { color: '#6366f1', fontWeight: '500' },
})
