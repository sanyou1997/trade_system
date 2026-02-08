'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <ToastMessage key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastMessage({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), 4000);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  const icons = {
    success: <CheckCircle size={18} className="text-green-600" />,
    error: <XCircle size={18} className="text-red-600" />,
    info: <Info size={18} className="text-blue-600" />,
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 bg-white border rounded-lg shadow-lg animate-in slide-in-from-right',
        item.type === 'success' && 'border-green-200',
        item.type === 'error' && 'border-red-200',
        item.type === 'info' && 'border-blue-200',
      )}
    >
      {icons[item.type]}
      <p className="flex-1 text-sm text-slate-700">{item.message}</p>
      <button
        onClick={() => onDismiss(item.id)}
        className="p-0.5 rounded hover:bg-slate-100"
      >
        <X size={14} className="text-slate-400" />
      </button>
    </div>
  );
}
