import { View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { T } from './ui';

/**
 * In-app player for a video/audio file already on the phone (a downloaded copy). Native controls:
 * play/pause, seek, fullscreen. Audio files show a large icon behind the controls.
 */
export function MediaPlayer({ uri, name, audio }: { uri: string; name: string; audio?: boolean }) {
  const { colors } = useApp();
  const player = useVideoPlayer({ uri, metadata: { title: name } }, p => { p.loop = false; p.play(); });
  return <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
    {audio ? <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <Ionicons name="musical-notes-outline" size={64} color={colors.muted} />
      <T style="footnote" color="#ffffffaa" numberOfLines={1}>{name}</T>
    </View> : null}
    <VideoView player={player} style={{ width: '100%', height: audio ? 120 : '100%', marginTop: audio ? 'auto' : 0 }} contentFit="contain" nativeControls fullscreenOptions={{ enable: !audio }} />
  </View>;
}
