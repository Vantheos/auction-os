import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'warning' | 'danger' | 'info';

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;     // default 5000; pass 0 to require manual dismiss
  actionLabel?: string;
  onAction?: () => void;
};

type ToastEntry = ToastInput & { id: number };

type Ctx = {
  toast: (t: ToastInput) => void;
  dismiss: (id: number) => void;
  toasts: ToastEntry[];
};

const ToastCtx = createContext<Ctx | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const toast = useCallback((t: ToastInput) => {
    const id = nextId++;
    setToasts((curr) => [...curr, { ...t, id }]);
    const ms = t.durationMs ?? 5000;
    if (ms > 0) {
      setTimeout(() => dismiss(id), ms);
    }
  }, [dismiss]);
  return <ToastCtx.Provider value={{ toast, dismiss, toasts }}>{children}</ToastCtx.Provider>;
}

// react-refresh/only-export-components: useToast reads ToastCtx defined
// in this file. Splitting it requires exporting the context (leaking
// internals) or circular imports. Co-located with the provider per
// React idiom for context-bound hooks. Accept the warning.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const VARIANT_CLS: Record<ToastVariant, string> = {
  success: 'bg-success-bg border-success/30 text-success',
  warning: 'bg-warning-bg border-warning/30 text-warning',
  danger:  'bg-danger-bg border-danger/30 text-danger',
  info:    'bg-info-bg border-brand/30 text-brand',
};

export function Toaster() {
  const ctx = useContext(ToastCtx);
  if (!ctx) return null;
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
    >
      {ctx.toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto rounded-lg border px-3 py-2 shadow-md flex items-start gap-2',
            VARIANT_CLS[t.variant ?? 'info']
          )}
          role="status"
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-text">{t.title}</div>
            {t.description && <div className="text-xs text-textDim mt-0.5">{t.description}</div>}
          </div>
          {t.actionLabel && (
            <button
              type="button"
              onClick={() => { try { t.onAction?.(); } finally { ctx.dismiss(t.id); } }}
              className="text-xs font-semibold text-brand hover:underline shrink-0"
            >
              {t.actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => ctx.dismiss(t.id)}
            aria-label="Dismiss notification"
            className="text-textDim hover:text-text shrink-0 leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
