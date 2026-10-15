import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../state/app';
import { ActionMenuProvider } from '../components/ActionMenu';
import { DialogProvider } from '../components/Dialog';
import { UpdateProvider } from '../state/updates';
import { NotificationProvider } from '../state/notifications';
import { UnseenProvider } from '../state/unseen';

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
      {/* Chat: transparent card so the interactive swipe-back reveals the screen underneath. */}
      <Stack.Screen name="thread/[id]" options={{ presentation: 'transparentModal', animation: 'slide_from_right', contentStyle: { backgroundColor: 'transparent' } }} />
    </Stack>
  </>;
}
export default function RootLayout() { return <GestureHandlerRootView style={{ flex: 1 }}><AppProvider><UpdateProvider><NotificationProvider><UnseenProvider><DialogProvider><ActionMenuProvider><Navigation /></ActionMenuProvider></DialogProvider></UnseenProvider></NotificationProvider></UpdateProvider></AppProvider></GestureHandlerRootView>; }
