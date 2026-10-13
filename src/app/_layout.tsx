import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../state/app';
import { ActionMenuProvider } from '../components/ActionMenu';
import { DialogProvider } from '../components/Dialog';
import { UpdateProvider } from '../state/updates';

function Navigation() {
  const { colors } = useApp();
  return <>
    <StatusBar style={colors.dark ? 'light' : 'dark'} />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right', animationDuration: 220 }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="connect" options={{ presentation: 'modal' }} />
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      <Stack.Screen name="workspace-new" options={{ presentation: 'modal' }} />
    </Stack>
  </>;
}
export default function RootLayout() { return <GestureHandlerRootView style={{ flex: 1 }}><AppProvider><UpdateProvider><DialogProvider><ActionMenuProvider><Navigation /></ActionMenuProvider></DialogProvider></UpdateProvider></AppProvider></GestureHandlerRootView>; }
