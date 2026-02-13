import React, { useState, useEffect, useCallback } from 'react';

const Toast = ({ toast, onDismiss }) => {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setLeaving(true), toast.duration - 300);
    const removeTimer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
  }, [toast.id, toast.duration, onDismiss]);

  const colorMap = {
    order_placed: 'border-yellow-500 bg-yellow-500/10',
    order_filled: 'border-green-500 bg-green-500/10',
    position_opened: 'border-blue-500 bg-blue-500/10',
    position_closed: 'border-gray-400 bg-gray-400/10',
  };

  const iconMap = {
    order_placed: '\u{1F4CB}',
    order_filled: '\u2705',
    position_opened: '\u{1F4C8}',
    position_closed: '\u{1F4C9}',
  };

  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 rounded border-l-2 text-sm text-white shadow-lg backdrop-blur-sm ${
        colorMap[toast.type] || 'border-gray-500 bg-gray-500/10'
      }`}
      style={{
        animation: leaving ? 'toast-exit 0.3s ease-in forwards' : 'toast-enter 0.3s ease-out',
        minWidth: '240px',
        maxWidth: '340px',
      }}
    >
      <span className="flex-shrink-0 text-base leading-none mt-0.5">{iconMap[toast.type] || '\u{1F514}'}</span>
      <span className="leading-snug">{toast.message}</span>
    </div>
  );
};

const ToastContainer = ({ toasts, onDismiss }) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
};

/** Helper to format a change event into a toast message string */
export const formatToastMessage = (event) => {
  const { type, data } = event;
  if (!data) return null;

  const formatPrice = (p) => {
    if (p == null) return '';
    return Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  switch (type) {
    case 'order_placed': {
      const side = (data.action || data.side || '').toUpperCase();
      const sym = data.symbol || '?';
      const qty = data.quantity || Math.abs(data.netPos) || 1;
      const price = data.price ? ` @ ${formatPrice(data.price)}` : '';
      return `Order placed: ${side} ${sym} x${qty}${price}`;
    }
    case 'order_filled': {
      const side = (data.action || data.side || '').toUpperCase();
      const sym = data.symbol || '?';
      const qty = data.quantity || 1;
      return `Order filled: ${side} ${sym} x${qty}`;
    }
    case 'position_opened': {
      const side = (data.side || '').toUpperCase() || (data.netPos > 0 ? 'LONG' : 'SHORT');
      const sym = data.symbol || '?';
      const qty = Math.abs(data.netPos || data.quantity || 1);
      return `Position opened: ${side} ${sym} x${qty}`;
    }
    case 'position_closed': {
      const sym = data.symbol || data.id || '?';
      return `Position closed: ${sym}`;
    }
    default:
      return null;
  }
};

export default ToastContainer;
