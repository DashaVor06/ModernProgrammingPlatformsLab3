import React, { useState } from 'react';
import { X, User, Shield, Mail } from './Icons.jsx';
import { authApi } from '../api/auth.js';

const ROLE_LABELS = {
  ADMIN: 'Администратор',
  CARRIER: 'Перевозчик',
  PASSENGER: 'Пассажир',
};

const DEMO_ACCOUNTS = [
  { email: 'admin@bus.by', role: 'ADMIN' },
  { email: 'carrier@atlas.by', role: 'CARRIER' },
  { email: 'passenger@example.com', role: 'PASSENGER' },
];

export function AuthModal({
  onClose,
  onAuthenticated,
  onNotify,
  initialMode = 'login',
  initialResetToken = '',
  onResetComplete,
}) {
  const [mode, setMode] = useState(initialMode); // login | register | recover | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');

  // Поток сброса пароля по ссылке из письма
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setPhone('');
    setInfoMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const res = await authApi.login(email.trim(), password);
        onAuthenticated(res.data);
        onNotify('success', 'Вход выполнен', `Добро пожаловать, ${res.data.user.name}!`);
        onClose();
      } else if (mode === 'register') {
        await authApi.register({ email: email.trim(), password, name: name.trim(), phone: phone.trim() });
        onNotify('success', 'Регистрация', 'Аккаунт пассажира создан. Теперь выполните вход.');
        resetForm();
        setMode('login');
      } else if (mode === 'recover') {
        const res = await authApi.recoverPassword(email.trim());
        setInfoMessage(res.message);
        onNotify('info', 'Восстановление доступа', res.message);
      } else if (mode === 'reset') {
        if (!resetToken.trim()) {
          onNotify('error', 'Ошибка', 'Укажите токен из письма');
          return;
        }
        if (newPassword.length < 6) {
          onNotify('error', 'Ошибка', 'Пароль должен быть не короче 6 символов');
          return;
        }
        if (newPassword !== confirmPassword) {
          onNotify('error', 'Ошибка', 'Пароли не совпадают');
          return;
        }
        const res = await authApi.resetPassword(resetToken.trim(), newPassword);
        onNotify('success', 'Пароль изменён', res.message || 'Теперь войдите с новым паролем.');
        setResetToken('');
        setNewPassword('');
        setConfirmPassword('');
        setInfoMessage('');
        if (onResetComplete) onResetComplete();
        setMode('login');
      }
    } catch (err) {
      onNotify('error', 'Ошибка', err.message, err.details);
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setInfoMessage('');
  };

  const isReset = mode === 'reset';

  const submitLabel = submitting
    ? 'Обработка...'
    : mode === 'login'
      ? 'Войти'
      : mode === 'register'
        ? 'Создать аккаунт'
        : mode === 'recover'
          ? 'Отправить инструкцию'
          : 'Сохранить новый пароль';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div className="brand-icon" style={{ width: 36, height: 36 }}>
              <Shield size={20} />
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
              {isReset ? 'Новый пароль' : 'Доступ к системе'}
            </h2>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <X size={22} />
          </button>
        </div>

        {/* Tabs (скрыты для режима сброса по ссылке) */}
        {!isReset && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[
              ['login', 'Вход'],
              ['register', 'Регистрация'],
              ['recover', 'Восстановление'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => switchMode(key)}
                style={{
                  flex: 1,
                  padding: '0.7rem',
                  border: 'none',
                  background: mode === key ? 'var(--primary-light)' : 'transparent',
                  color: mode === key ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  borderBottom: mode === key ? '2px solid var(--primary)' : '2px solid transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {mode === 'register' && (
            <>
              <div className="input-group">
                <label className="input-label">Имя *</label>
                <input className="input-control" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Иван Иванов" />
              </div>
              <div className="input-group">
                <label className="input-label">Телефон</label>
                <input className="input-control" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+375 (29) 123-45-67" />
              </div>
            </>
          )}

          {isReset && (
            <>
              <div className="input-group">
                <label className="input-label">Токен из письма *</label>
                <input
                  className="input-control"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Токен из ссылки в письме"
                />
              </div>
              <div className="input-group">
                <label className="input-label">Новый пароль *</label>
                <input
                  className="input-control"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Не короче 6 символов"
                />
              </div>
              <div className="input-group">
                <label className="input-label">Повторите пароль *</label>
                <input
                  className="input-control"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Повторите пароль"
                />
              </div>
            </>
          )}

          {!isReset && (
            <div className="input-group">
              <label className="input-label">Email *</label>
              <input className="input-control" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
            </div>
          )}

          {(mode === 'login' || mode === 'register') && (
            <div className="input-group">
              <label className="input-label">Пароль *</label>
              <input className="input-control" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
          )}

          {infoMessage && (
            <div style={{ fontSize: '0.82rem', color: 'var(--primary)', background: 'var(--primary-light)', padding: '0.6rem 0.75rem', borderRadius: 8 }}>
              {infoMessage}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn btn-primary" style={{ padding: '0.75rem', marginTop: '0.25rem' }}>
            {submitLabel}
          </button>

          {isReset && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem' }}
            >
              ← Вернуться к входу
            </button>
          )}
        </form>

        {/* Demo accounts hint */}
        {mode === 'login' && (
          <div style={{ padding: '0.9rem 1.5rem 1.25rem', borderTop: '1px solid var(--border)', background: '#f8fafc', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
              <User size={14} /> Демо-учётные записи (пароль: password123)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => { setEmail(a.email); setPassword('password123'); setMode('login'); }}
                  style={{ textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--primary)', display: 'flex', gap: 8, alignItems: 'center' }}
                >
                  <Mail size={13} />
                  <span>{a.email}</span>
                  <span style={{ color: 'var(--text-muted)' }}>— {ROLE_LABELS[a.role]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
