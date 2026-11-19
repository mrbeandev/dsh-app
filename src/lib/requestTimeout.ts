/**
 * Time allowed for one request. Small calls get 20 s; big ones (messages with images) also get time to
 * upload at a slow mobile/tunnel rate (10 KB/s), capped at 10 min. (40 KB/s was too optimistic:
 * on a ~29 KB/s link a two-photo steer timed out and was re-sent from scratch until the turn had ended.) A fixed 20 s used to cut off image
 * messages mid-upload on tunnels, which then looped in the outbox for minutes.
 */
export function uploadTimeoutMs(bytes: number) {
  return Math.min(600_000, 20_000 + Math.ceil(bytes / 10_000) * 1000);
}
