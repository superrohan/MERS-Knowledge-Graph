const STORAGE_KEY = "ci_auth_session";

/**
 * The one place that reads/writes the persisted session ({ token, user })
 * - used by both the AuthProvider (React state) and the axios instance
 * (which needs the token outside any component, on every request). A
 * private-browsing tab or blocked storage just means the session won't
 * survive a refresh; it still works for the current tab either way.
 */
export function getStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(session) {
  try {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage unavailable - nothing to do, session just stays in memory.
  }
}
