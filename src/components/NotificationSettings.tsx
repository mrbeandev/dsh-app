import { useEffect, useState } from 'react';
import { AppState, Switch } from 'react-native';
import { useApp } from '../state/app';
import { useNotifications } from '../state/notifications';
import { background } from '../../modules/dsh-background';
import { Row, Section } from './ui';

/** Settings › Notifications: permission, per-kind toggles and the opt-in background connection. */
export function NotificationSection() {
  const { colors } = useApp(); const n = useNotifications();
  const [batteryOk, setBatteryOk] = useState(() => background.isIgnoringBatteryOptimizations());
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setBatteryOk(background.isIgnoringBatteryOptimizations()); });
    return () => sub.remove();
  }, []);
  const toggle = (value: boolean, onChange: (v: boolean) => void, label: string) =>
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.fill }} thumbColor="#ffffff" />;

  if (n.permission !== 'granted') return <Section header="Notifications" footer={n.permission === 'denied' ? 'Notifications are turned off for DSH Mobile in Android settings.' : 'Get notified when an agent finishes, fails, or needs your answer.'}>
    {n.permission === 'denied'
      ? <Row icon="notifications-off-outline" title="Open App Settings" onPress={background.openAppSettings} />
      : <Row icon="notifications-outline" title="Turn On Notifications" onPress={() => void n.requestPermission()} />}
  </Section>;

  return <>
    <Section header="Notifications" footer="You won’t be notified about the session you’re looking at. Each session shows one notification, updated as things change.">
      <Row icon="help-circle-outline" title="Needs your input" subtitle="Questions, approvals, plan reviews" chevron={false} accessory={toggle(n.prefs.input, v => n.setPref('input', v), 'Needs your input')} />
      <Row icon="checkmark-circle-outline" title="Finished" subtitle="With a preview of the reply" chevron={false} accessory={toggle(n.prefs.finished, v => n.setPref('finished', v), 'Finished')} />
      <Row icon="alert-circle-outline" title="Failed" subtitle="Errors, quota, crashes" chevron={false} accessory={toggle(n.prefs.failed, v => n.setPref('failed', v), 'Failed')} />
      <Row icon="stop-circle-outline" title="Stopped" subtitle="Cancelled or interrupted, not by you" chevron={false} accessory={toggle(n.prefs.stopped, v => n.setPref('stopped', v), 'Stopped')} />
    </Section>
    {background.available ? <Section header="Background" footer={n.prefs.background
      ? `Keeps a live connection while the app is closed, shown as a silent “Connected” notification. Uses some battery.${batteryOk ? '' : ' Allow unrestricted battery use so Android doesn’t stop it.'}`
      : 'Off: notifications arrive while the app is open or was used recently. On: also while it is closed.'}>
      <Row icon="radio-outline" title="Stay connected in background" chevron={false} accessory={toggle(n.prefs.background, v => { n.setPref('background', v); if (v && !background.isIgnoringBatteryOptimizations()) background.requestIgnoreBatteryOptimizations(); }, 'Stay connected in background')} />
      {n.prefs.background && !batteryOk ? <Row icon="battery-charging-outline" title="Allow Unrestricted Battery" onPress={background.requestIgnoreBatteryOptimizations} /> : null}
    </Section> : null}
  </>;
}
