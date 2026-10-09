import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

const ICONS = { success: "✓", error: "⚠", info: "ℹ" };

/**
 * Lightweight, dependency-free toast notifications for confirming an
 * action actually happened (created, deleted, re-index started, ...) -
 * feedback that previously only showed up as a page navigation or was
 * silent. Mounted once at the app root (see App.jsx).
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message, { type = "info", duration = 4000 } = {}) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      if (duration) {
        setTimeout(() => dismissToast(id), duration);
      }
      return id;
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`} role="status">
            <span className="toast__icon" aria-hidden="true">
              {ICONS[t.type] ?? ICONS.info}
            </span>
            <span className="toast__message">{t.message}</span>
            <button type="button" className="toast__close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Returns a `showToast(message, { type, duration })` function. Safe to
 * call even outside a ToastProvider (e.g. a component under test in
 * isolation) - it's a no-op then, since a toast is always an enhancement
 * on top of the real state change, never load-bearing. */
export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx ?? (() => {});
}
