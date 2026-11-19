/**
 * What a message bubble says while it's on its way, in order:
 *   uploading (with %) → delivering (uploaded, waiting for the Harness to confirm) → steering / queued
 *   (the Harness has it in its inbox: steering = delivered at the agent's next step, queued = after the turn)
 * Once the Harness writes it into the chat, the bubble goes away (handled by the caller).
 */
export type SendStatus = { label: string; tone: 'muted' | 'primary'; icon: 'cloud-upload-outline' | 'arrow-up-circle-outline' | 'navigate-outline' | 'time-outline' };

export function sendStatus(s: { mode: 'queue' | 'steer'; progress?: number }, inbox?: 'steering' | 'queued'): SendStatus {
  if (inbox === 'steering') return { label: 'Steering · the agent reads it at its next step', tone: 'primary', icon: 'navigate-outline' };
  if (inbox === 'queued') return { label: 'Queued · sends after this turn', tone: 'muted', icon: 'time-outline' };
  if (s.progress !== undefined && s.progress < 1) return { label: `Uploading ${Math.floor(s.progress * 100)}%`, tone: 'muted', icon: 'cloud-upload-outline' };
  return { label: s.mode === 'steer' ? 'Sending to steer…' : 'Sending…', tone: 'muted', icon: 'arrow-up-circle-outline' };
}
