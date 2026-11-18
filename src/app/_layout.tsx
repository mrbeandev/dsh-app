import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../state/app';
import { ActionMenuProvider } from '../components/ActionMenu';
import { DialogProvider } from '../components/Dialog';
import { UpdateProvider } from '../state/updates';
import { NotificationProvider } from '../state/notifications';
import { UnseenProvider } from '../state/unseen';
import { BetaDiagnostics } from '../components/BetaDiagnostics';
import { Dimensions } from 'react-native';
import { isTabletScreen } from '../lib/layout';

function Navigation() {
  const { colors } = useApp();
  // Phones: portrait only (unchanged; app.json also locks portrait, so launch is portrait too).
  // Tablets: any orientation — this unlocks the activity at runtime. Screen size is fixed per device.
  const screen = Dimensions.get('screen'); const orientation = isTabletScreen(screen.width, screen.height) ? 'default' as const : 'portrait' as const;
  return <>
    <BetaDiagnostics />
    <StatusBar style={colors.dark ? 'light' : 'dark'} />
    <Stack screenOptions={{ headerShown: false, orientation, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right', animationDuration: 220 }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="connect" options={{ presentation: 'modal' }} />
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      <Stack.Screen name="workspace-new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="local-setup" options={{ presentation: 'modal' }} />
      <Stack.Screen name="add-provider" options={{ presentation: 'modal' }} />
      {/* Chat: transparent card so the interactive swipe-back reveals the screen underneath. */}
      <Stack.Screen name="thread/[id]" options={{ presentation: 'transparentModal', animation: 'slide_from_right', contentStyle: { backgroundColor: 'transparent' } }} />
    </Stack>
  </>;
}
export default function RootLayout() { return <GestureHandlerRootView style={{ flex: 1 }}><KeyboardProvider><AppProvider><UpdateProvider><NotificationProvider><UnseenProvider><DialogProvider><ActionMenuProvider><Navigation /></ActionMenuProvider></DialogProvider></UnseenProvider></NotificationProvider></UpdateProvider></AppProvider></KeyboardProvider></GestureHandlerRootView>; }
