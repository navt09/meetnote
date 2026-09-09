"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastKind = "ok" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

/** useToast()("Saved") — a small message that slides in and leaves on its own. */
export function useToast() {
  return useContext(ToastContext);
}

const ICON: Record<ToastKind, string> = { ok: "✓", error: "!", info: "•" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, kind, message }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span
              aria-hidden
              className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full text-[0.7rem] font-bold ${
                t.kind === "ok" ? "bg-ok/20 text-ok" : t.kind === "error" ? "bg-danger/20 text-danger" : "bg-white/10 text-muted"
              }`}
            >
              {ICON[t.kind]}
            </span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
              className="ml-1 flex-none text-muted transition-colors hover:text-fg"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
