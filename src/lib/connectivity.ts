export function deviceIsOffline(state: { isConnected?: boolean; type?: string }) {
  // Internet reachability is not required: a localhost/LAN Harness may work without internet.
  return state.isConnected === false || state.type === 'NONE';
}
export function friendlyNetworkError(message: string) {
  return /UnknownHostException|Unable to resolve host|Network request failed|Failed to fetch|fetch failed|ENETUNREACH|ECONNREFUSED|NetworkError/i.test(message)
    ? 'Harness unreachable. Check your connection. Saved chats are still available offline.' : message;
}
