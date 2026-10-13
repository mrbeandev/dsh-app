import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../state/app';
function Navigation() { const { colors } = useApp(); return <><StatusBar style={colors.bg === '#fcfcfc' ? 'dark' : 'light'} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}><Stack.Screen name="index" /><Stack.Screen name="connect" options={{ presentation: 'modal' }} /><Stack.Screen name="new" options={{ presentation: 'modal' }} /><Stack.Screen name="settings" options={{ presentation: 'modal' }} /></Stack></>; }
export default function RootLayout() { return <AppProvider><Navigation /></AppProvider>; }
