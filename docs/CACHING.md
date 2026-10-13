# Cache-first Harness navigation

## Storage and isolation

Native Android/iOS uses Expo SQLite (`dsh-cache.db`, WAL). Web uses IndexedDB rather than SQLite’s alpha WASM runtime. Cache keys use the normalized Harness URL including path prefix, never the token. Different Harness URLs never share session histories even if session ids collide. Native auth remains in SecureStore, not the cache database.

Tables: one catalog row per Harness, one durable transcript row per opened session. Transient streamed tokens and auth secrets are never written to the history cache. Cache size is the exact UTF-8 stored payload size per Harness, not SQLite’s shared index/page overhead. Clear removes only that Harness’s local catalog/transcripts and compacts the database; it never calls server delete/archive or clears credentials.

## Fetch policy

- Launch: read last Harness catalog before network/auth completes; cached statuses are not represented as live activity.
- Connection/reconnection: query session list and workspace registry; open `$events`, `session/control`, and `workspace/follow` for lightweight metadata/projections/activity. Debounce list invalidations. No transcript subscriptions for background sessions.
- Open/focus a chat: display cached history immediately; open one `session/follow` and replace cache with its authoritative snapshot, then append durable events and show token deltas live.
- Blur/close: cancel that session follow stream and flush durable cache. Returning opens a fresh snapshot, never resumes a stopped agent.
- Manual workspace refresh: invalidate histories belonging to that workspace and refresh list/registry; do not prefetch their transcripts. They fetch when opened.
- Clear cache: invalidate in-flight writes from the old cache generation. New network activity can legitimately repopulate the cache later.

## Ordering and chat UX

Workspaces sort by the maximum of registry mutation time and their latest session update. Each workspace’s sessions sort newest first. Unregistered sessions are grouped by cwd. Live session status arrives independently of cached history.

Chat follows new content while within 100dp of the bottom. Scrolling up pauses tail-follow and reveals “Latest messages”. Sending a prompt re-enables tail-follow. Older-history pagination should preserve the reader’s position; never force them to the tail while reading older messages.

## Privacy

Conversation cache contains potentially sensitive source code and messages. It is app-private but not SQLCipher encrypted. Device filesystem protection applies; users can clear individual Harness caches. Keys and tokens must never be committed or stored in this database. Disconnect does not delete the cache; clearing it is a separate explicit action.

## Remaining hardening

Add retention/size limits, history-page cache merging, exhaustive stream revision recovery, saved multi-Harness switching UI and per-account identity if a single URL serves multiple independent users. URL-based isolation is appropriate for the current single-user Harness model but not multi-tenant accounts sharing one endpoint.
