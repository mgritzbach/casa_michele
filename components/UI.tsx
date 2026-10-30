import React, { useEffect, useState, useCallback, useRef, useId } from 'react';
import { AlertCircle, CheckCircle, Info, X, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

/* ─── Button ──────────────────────────────────────── */
export const Button: React.FC<{
  onClick?: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  ariaLabel?: string;
}> = ({ onClick, children, variant = 'primary', className = '', disabled, type = 'button', ariaLabel }) => {
  const base = [
    'w-full h-14 flex items-center justify-center rounded-lg font-semibold',
    'transition-all duration-200 ease-out',
    'active:brightness-90',
    'disabled:opacity-40 disabled:active:scale-100 disabled:pointer-events-none',
    'px-6 text-base tracking-tight',
    'select-none cursor-pointer',
  ].join(' ');

  const styles = {
    primary: 'bg-amber-500 text-zinc-950 hover:bg-amber-400',
    secondary: 'bg-zinc-800/80 text-zinc-100 hover:bg-zinc-700/80 ring-1 ring-white/5',
    danger: 'bg-red-700 text-white hover:bg-red-600',
    ghost: 'bg-transparent text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${base} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

/* ─── Bottom Sheet ────────────────────────────────── */
export const BottomSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ isOpen, onClose, title, children, footer }) => {
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const scrollStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const background: { element: HTMLElement; inert: boolean }[] = [];
    let container = sheetRef.current?.parentElement;
    while (container && container !== document.body) {
      for (const element of Array.from(container.parentElement?.children || [])) {
        if (element !== container && element instanceof HTMLElement) {
          background.push({ element, inert: element.inert });
          element.inert = true;
        }
      }
      container = container.parentElement;
    }
    const timer = window.setTimeout(() => sheetRef.current?.focus(), 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], select, textarea, [tabindex="0"]') || []);
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer); document.removeEventListener('keydown', onKey);
      document.body.style.overflow = scrollStyle;
      background.forEach(({ element, inert }) => { element.inert = inert; });
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
    } else {
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!visible && !isOpen) return null;

  return (
    <div className="sheet-container" aria-hidden={!isOpen} style={{ pointerEvents: isOpen ? 'auto' : 'none' }}>
      {/* Overlay */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`relative bg-zinc-900 text-white rounded-t-2xl md:rounded-2xl md:max-w-2xl md:mx-auto w-full max-h-[92vh] flex flex-col border-t border-zinc-700/40 transition-transform duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ boxShadow: '0 -8px 40px rgba(0,0,0,0.5)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-[5px] bg-zinc-600/50 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 pb-4 pt-2 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-xl font-bold tracking-tight text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all duration-200 active:scale-90"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 overscroll-contain">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-5 border-t border-zinc-800/60 bg-zinc-900/95 backdrop-blur-xl safe-bottom">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Toast ───────────────────────────────────────── */
export const Toast: React.FC<{
  message: string;
  isVisible: boolean;
  onHide: () => void;
  type?: ToastType;
}> = ({ message, isVisible, onHide, type = 'success' }) => {
  const [progressKey, setProgressKey] = useState(0);

  const stableHide = useCallback(() => onHide(), [onHide]);

  useEffect(() => {
    if (isVisible) {
      setProgressKey(k => k + 1);
      const timer = setTimeout(stableHide, 3200);
      return () => clearTimeout(timer);
    }
  }, [isVisible, stableHide, message, type]);

  if (!isVisible) return null;

  const config = {
    success: {
      bg: 'bg-zinc-900 border-zinc-700',
      text: 'text-emerald-50',
      icon: 'text-emerald-400',
      bar: 'bg-emerald-400',
      Icon: CheckCircle,
    },
    error: {
      bg: 'bg-zinc-900 border-red-400/50',
      text: 'text-red-50',
      icon: 'text-red-400',
      bar: 'bg-red-400',
      Icon: XCircle,
    },
    info: {
      bg: 'bg-zinc-900 border-zinc-700',
      text: 'text-zinc-100',
      icon: 'text-amber-400',
      bar: 'bg-amber-400',
      Icon: Info,
    },
  };

  const c = config[type];
  const Icon = c.Icon;

  return (
    <div role="status" aria-live="polite" className="toast fixed top-5 left-1/2 z-[100] w-[calc(100vw-2rem)] max-w-sm animate-slideDown">
      <div
        className={`relative overflow-hidden rounded-2xl border px-4 py-3.5 shadow-2xl shadow-black/30 backdrop-blur-2xl ${c.bg}`}
      >
        <div className="flex items-center gap-3">
          <Icon size={18} className={`${c.icon} shrink-0`} />
          <span className={`text-sm font-semibold leading-snug ${c.text}`}>{message}</span>
        </div>
        <div
          key={progressKey}
          className={`absolute bottom-0 left-0 h-[2px] animate-[toast-progress_3200ms_linear_forwards] ${c.bar}`}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
};

/* ─── Badge ───────────────────────────────────────── */
export const Badge: React.FC<{
  children: React.ReactNode;
  variant: 'success' | 'warning' | 'error' | 'neutral';
}> = ({ children, variant }) => {
  const styles = {
    success: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/20',
    warning: 'bg-amber-500/15 text-amber-300 ring-amber-500/20',
    error: 'bg-red-500/15 text-red-300 ring-red-500/20',
    neutral: 'bg-zinc-700/50 text-zinc-400 ring-white/5',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ${styles[variant]}`}
    >
      {children}
    </span>
  );
};

/* ─── Inline Alert ────────────────────────────────── */
export const InlineAlert: React.FC<{
  children: React.ReactNode;
  variant?: 'warning' | 'error' | 'info';
}> = ({ children, variant = 'info' }) => {
  const styles = {
    warning: 'border-amber-500/20 bg-amber-500/8 text-amber-200',
    error: 'border-red-500/20 bg-red-500/8 text-red-200',
    info: 'border-blue-500/20 bg-blue-500/8 text-blue-200',
  };

  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border p-4 text-sm font-medium ${styles[variant]}`}>
      <AlertCircle size={16} className="mt-0.5 shrink-0 opacity-70" />
      <span>{children}</span>
    </div>
  );
};

/* ─── Toggle ──────────────────────────────────────── */
export const Toggle: React.FC<{
  on: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}> = ({ on, onToggle, size = 'md', ariaLabel }) => {
  const dims = size === 'sm'
    ? 'w-10 h-6'
    : 'w-[44px] h-7';
  const thumb = size === 'sm'
    ? 'w-5 h-5'
    : 'w-[22px] h-[22px]';
  const travel = size === 'sm' ? 'translate-x-4' : 'translate-x-[17px]';

  return (
    <button
      role="switch"
      aria-label={ariaLabel}
      aria-checked={on}
      onClick={onToggle}
      className="w-11 h-11 shrink-0 flex items-center justify-center"
    >
      <span className={`${dims} block rounded-full p-[3px] transition-colors ${on ? 'bg-amber-500' : 'bg-zinc-600'}`}>
      <div
        className={`${thumb} rounded-full bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          on ? travel : 'translate-x-0'
        }`}
      />
      </span>
    </button>
  );
};
