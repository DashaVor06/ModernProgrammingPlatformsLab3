import React, { useState, useEffect, useCallback } from 'react';
import { User, Shield, Clock, MapPin, CheckCircle, Ticket, Trash2 } from '../components/Icons.jsx';
import { authApi } from '../api/auth.js';
import { bookingApi } from '../api/bookings.js';
import { getCurrentSessionId } from '../api/client.js';

const ROLE_LABELS = {
  ADMIN: 'Администратор',
  CARRIER: 'Перевозчик',
  PASSENGER: 'Пассажир',
};

const BOOKING_STATUS = {
  CONFIRMED: 'Оплачен',
  CANCELLED: 'Отменён',
};

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function describeUserAgent(ua) {
  if (!ua) return 'Неизвестное устройство';
  if (/PostmanRuntime|curl|axios|node-fetch|node/i.test(ua)) return '🛠 API-клиент';
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  let browser = 'Браузер';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  return `${isMobile ? '📱' : '💻'} ${browser}${isMobile ? ' (моб.)' : ''}`;
}

export function AccountPage({ currentUser, onUserUpdated, onLogout, onNotify, navigate }) {
  const [tab, setTab] = useState('profile'); // profile | bookings | sessions

  // --- Профиль ---
  const [profileForm, setProfileForm] = useState({
    name: currentUser?.name || '',
    phone: currentUser?.phone || '',
    email: currentUser?.email || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setProfileForm({
      name: currentUser?.name || '',
      phone: currentUser?.phone || '',
      email: currentUser?.email || '',
    });
  }, [currentUser?.name, currentUser?.phone, currentUser?.email]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await authApi.updateProfile({
        name: profileForm.name.trim(),
        phone: profileForm.phone.trim(),
        email: profileForm.email.trim(),
      });
      onUserUpdated(res.data);
      onNotify('success', 'Сохранено', 'Личная информация обновлена.');
    } catch (err) {
      onNotify('error', 'Ошибка сохранения', err.message, err.details);
    } finally {
      setSavingProfile(false);
    }
  };

  // --- Билеты ---
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const loadBookings = useCallback(async () => {
    setLoadingBookings(true);
    try {
      // userId ограничивает выборку билетами текущего пользователя (важно для админа)
      const res = await bookingApi.list({ userId: currentUser?.id });
      setBookings(res.data || []);
    } catch (err) {
      onNotify('error', 'Ошибка загрузки билетов', err.message);
    } finally {
      setLoadingBookings(false);
    }
  }, [onNotify, currentUser?.id]);

  useEffect(() => {
    if (tab === 'bookings') loadBookings();
  }, [tab, loadBookings]);

  const handleCancelBooking = async (booking) => {
    if (!window.confirm(`Отменить билет на место №${booking.seat_number}?`)) return;
    setCancellingId(booking.id);
    try {
      await bookingApi.delete(booking.id);
      onNotify('success', 'Билет отменён', `Место №${booking.seat_number} освобождено.`);
      await loadBookings();
    } catch (err) {
      onNotify('error', 'Ошибка отмены', err.message);
    } finally {
      setCancellingId(null);
    }
  };

  // --- Сессии ---
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [busySessionId, setBusySessionId] = useState(null);
  const [busyAllSessions, setBusyAllSessions] = useState(false);
  const currentSessionId = getCurrentSessionId();

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await authApi.listSessions();
      setSessions(res.data || []);
    } catch (err) {
      onNotify('error', 'Ошибка загрузки сессий', err.message);
    } finally {
      setLoadingSessions(false);
    }
  }, [onNotify]);

  useEffect(() => {
    if (tab === 'sessions') loadSessions();
  }, [tab, loadSessions]);

  const handleTerminateSession = async (session) => {
    const isCurrent = session.id === currentSessionId;
    const ok = window.confirm(
      isCurrent
        ? 'Это текущее устройство. Завершить сеанс и выйти из системы?'
        : 'Завершить этот сеанс на другом устройстве?'
    );
    if (!ok) return;

    // Текущую сессию завершаем через logout — она удаляется из БД
    if (isCurrent) {
      await onLogout(true);
      return;
    }

    setBusySessionId(session.id);
    try {
      await authApi.terminateSession(session.id);
      onNotify('success', 'Сеанс завершён', 'Устройство отключено.');
      await loadSessions();
    } catch (err) {
      onNotify('error', 'Ошибка', err.message);
    } finally {
      setBusySessionId(null);
    }
  };

  const handleTerminateOtherSessions = async () => {
    if (!window.confirm('Завершить все сеансы на других устройствах? Текущее останется активным.')) return;
    setBusyAllSessions(true);
    try {
      const res = await authApi.terminateOtherSessions();
      onNotify('success', 'Готово', `Завершено сеансов: ${res.data?.revokedCount ?? 0}`);
      await loadSessions();
    } catch (err) {
      onNotify('error', 'Ошибка', err.message);
    } finally {
      setBusyAllSessions(false);
    }
  };

  const otherSessionsCount = sessions.filter((s) => s.id !== currentSessionId).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1.5rem 3rem' }}>
      <div className="card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <div className="carrier-logo" style={{ width: 56, height: 56, fontSize: '1.3rem' }}>
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : <User size={24} />}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{currentUser?.name}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>
                <Shield size={14} /> {ROLE_LABELS[currentUser?.role] || currentUser?.role}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>← К рейсам</button>
        </div>
      </div>

      {/* Tabs: Личная информация | Билеты | Активные сессии */}
      <div className="card" style={{ marginBottom: '1.25rem', display: 'flex', overflow: 'hidden' }}>
        {[
          ['profile', 'Личная информация'],
          ['bookings', 'Мои билеты'],
          ['sessions', 'Активные сессии'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              flex: 1,
              padding: '0.85rem 0.5rem',
              border: 'none',
              background: tab === key ? 'var(--primary-light)' : 'transparent',
              color: tab === key ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ===== Личная информация ===== */}
      {tab === 'profile' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.25rem' }}>Личная информация</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Эти данные автоматически подставляются при бронировании билета.
          </p>

          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
            <div className="input-group">
              <label className="input-label">ФИО</label>
              <input
                className="input-control"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                placeholder="Иванов Иван Иванович"
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Телефон</label>
              <input
                className="input-control"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                placeholder="+375 (29) 123-45-67"
              />
            </div>
            <div className="input-group">
              <label className="input-label">Email</label>
              <input
                className="input-control"
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                placeholder="user@example.com"
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Роль</label>
              <div className="input-control" style={{ background: '#f8fafc' }}>
                {ROLE_LABELS[currentUser?.role] || currentUser?.role}
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={savingProfile} style={{ alignSelf: 'flex-start' }}>
              {savingProfile ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </form>
        </div>
      )}

      {/* ===== Мои билеты ===== */}
      {tab === 'bookings' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Мои билеты</h2>
            <button className="btn btn-secondary btn-sm" onClick={loadBookings} disabled={loadingBookings}>
              {loadingBookings ? 'Обновление...' : 'Обновить'}
            </button>
          </div>

          {loadingBookings ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Загрузка...</div>
          ) : bookings.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              У вас пока нет забронированных билетов.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {bookings.map((b) => (
                <div key={b.id} className="card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.88rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem' }}>
                      {b.origin_city} → {b.destination_city}
                    </div>
                    <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Clock size={13} /> {formatDate(b.departure_time)} · {b.departure_station} → {b.arrival_station}
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>
                      <Ticket size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      Место №<strong>{b.seat_number}</strong> · {b.carrier_name} · {b.bus_model}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                    <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.1rem' }}>
                      {parseFloat(b.total_price).toFixed(2)} BYN
                    </div>
                    <span className={`seat-tag ${b.status === 'CANCELLED' ? 'full' : 'available'}`} style={{ fontSize: '0.72rem' }}>
                      {BOOKING_STATUS[b.status] || b.status}
                    </span>
                    {b.status !== 'CANCELLED' && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleCancelBooking(b)}
                        disabled={cancellingId === b.id}
                      >
                        <Trash2 size={13} /> Отменить
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Активные сессии ===== */}
      {tab === 'sessions' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Активные сессии</h2>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Всего активных подключений: <strong>{sessions.length}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={loadSessions} disabled={loadingSessions}>
                {loadingSessions ? 'Обновление...' : 'Обновить'}
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleTerminateOtherSessions}
                disabled={busyAllSessions || otherSessionsCount === 0}
                title="Завершить все сессии, кроме текущей"
              >
                Завершить остальные
              </button>
            </div>
          </div>

          {loadingSessions ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Загрузка...</div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Активных подключений нет.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {sessions.map((s) => {
                const isCurrent = s.id === currentSessionId;
                return (
                  <div
                    key={s.id}
                    className="card"
                    style={{
                      padding: '0.9rem 1rem',
                      borderColor: isCurrent ? 'var(--primary)' : 'var(--border)',
                      background: isCurrent ? 'var(--primary-light)' : 'var(--surface)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {describeUserAgent(s.user_agent)}
                          {isCurrent && (
                            <span className="seat-tag available" style={{ fontSize: '0.7rem', padding: '0.1rem 0.45rem' }}>
                              <CheckCircle size={11} /> это устройство
                            </span>
                          )}
                        </div>
                        <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <MapPin size={13} /> IP: {s.ip_address || '—'}
                        </div>
                        <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Clock size={13} /> Вход: {formatDate(s.created_at)} · Активность: {formatDate(s.last_active_at)}
                        </div>
                      </div>

                      <button
                        type="button"
                        className={isCurrent ? 'btn btn-secondary btn-sm' : 'btn btn-danger btn-sm'}
                        onClick={() => handleTerminateSession(s)}
                        disabled={busySessionId === s.id}
                      >
                        {isCurrent ? 'Выйти' : 'Завершить'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
