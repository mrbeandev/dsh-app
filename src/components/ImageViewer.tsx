import { Image, Modal, Pressable, ScrollView, StatusBar, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { T } from './ui';

/**
 * Full-screen image preview: tap an attachment thumbnail to see it clearly. Shows the file name and
 * details only here (not on the small thumbnail). Pinch-zoom via ScrollView's native zoom on iOS;
 * on Android the image fits the screen and can be scrolled when larger. Tap the backdrop or ✕ to close.
 */
export function ImageViewer({ uri, name, detail, visible, onClose, onRemove }: { uri: string; name?: string; detail?: string; visible: boolean; onClose: () => void; onRemove?: () => void }) {
  const { width, height } = useWindowDimensions(); const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <StatusBar barStyle="light-content" />
    <View style={{ flex: 1, backgroundColor: '#000000f2' }}>
      <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent bouncesZoom contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close preview" onPress={onClose} style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
          {uri ? <Image source={{ uri }} resizeMode="contain" accessibilityLabel={name ? `Image ${name}` : 'Image'} style={{ width, height: height - insets.top - insets.bottom - 120 }} /> : null}
        </Pressable>
      </ScrollView>
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          {name ? <T style="subhead" weight="600" numberOfLines={1} color="#ffffff">{name}</T> : null}
          {detail ? <T style="caption1" numberOfLines={1} color="#ffffffaa">{detail}</T> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff26' }}>
          <Ionicons name="close" size={22} color="#ffffff" />
        </Pressable>
      </View>
      {onRemove ? <View pointerEvents="box-none" style={{ position: 'absolute', bottom: insets.bottom + 20, left: 0, right: 0, alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Remove attachment" onPress={() => { onRemove(); onClose(); }} style={({ pressed }) => ({ height: 42, paddingHorizontal: 18, borderRadius: 21, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: pressed ? '#ffffff40' : '#ffffff26' })}>
          <Ionicons name="trash-outline" size={17} color="#ffffff" /><T style="footnote" weight="600" color="#ffffff">Remove</T>
        </Pressable>
      </View> : null}
    </View>
  </Modal>;
}
