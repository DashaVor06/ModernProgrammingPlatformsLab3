import React from 'react';
import { AlertCircle, CheckCircle, X } from './Icons.jsx';

export function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type || 'info'}`}>
          <div style={{ color: t.type === 'error' ? 'var(--danger)' : 'var(--success)', marginTop: 2 }}>
            {t.type === 'error' ? <AlertCircle size={22} /> : <CheckCircle size={22} />}
          </div>
          <div style={{ flexGrow: 1 }}>
            {t.title && <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: 2 }}>{t.title}</div>}
            <div style={{ fontSize: '0.86rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
              {t.message}
            </div>
            {t.details && Array.isArray(t.details) && t.details.length > 0 && (
              <ul style={{ marginTop: '0.4rem', fontSize: '0.8rem', paddingLeft: '1.2rem', color: 'var(--danger)' }}>
                {t.details.map((d, i) => (
                  <li key={i}>{d.field ? `${d.field}: ` : ''}{d.message}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => onDismiss(t.id)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}
