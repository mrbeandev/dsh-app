import { ScrollView, View } from 'react-native';
import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet';
import { Row, T } from './ui';
import { IMPORT_CATEGORIES, type ImportCategory } from '../lib/imports';

export function ImportPicker({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (category: ImportCategory) => void }) {
  return <Sheet visible={visible} onClose={onClose} title="Import files" height={0.68}>
    <ScrollView contentContainerStyle={{ padding: 12, gap: 4 }}>
      {IMPORT_CATEGORIES.map(c => <Row key={c.id} icon={c.icon as ComponentProps<typeof Ionicons>['name']} title={c.label} subtitle={c.detail} onPress={() => { onClose(); setTimeout(() => onSelect(c), 250); }} />)}
      <View style={{ padding: 12 }}><T style="caption1" color="secondary">Video, audio and documents are attached as files. What the agent can read depends on its model and tools.</T></View>
    </ScrollView>
  </Sheet>;
}
