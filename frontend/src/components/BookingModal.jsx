import React, { useState, useEffect } from 'react';
import { X, Trash2 } from './Icons.jsx';
import { bookingApi } from '../api/bookings.js';

export function BookingModal({ trip, currentUser, onClose, onBookingChanged, onNotify }) {
  const [seatNumber, setSeatNumber] = useState('');
  // Данные пассажира подставляются из личного кабинета
  const [passengerName, setPassengerName] = useState(currentUser?.name || '');
  const [passengerPhone, setPassengerPhone] = useState(currentUser?.phone || '');
  const [passengerEmail, setPassengerEmail] = useState(currentUser?.email || '');
  const [documentFile, setDocumentFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [tripBookings, setTripBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const capacity = trip.bus_capacity || 19;
  const occupiedSeats = new Set((trip.occupied_seats || []).map(Number));

  // Build list of free seat numbers
  const freeSeatNumbers = [];
  for (let i = 1; i <= capacity; i++) {
    if (!occupiedSeats.has(i)) {
      freeSeatNumbers.push(i);
    }
  }

  // Pre-select first free seat
  useEffect(() => {
    if (freeSeatNumbers.length > 0 && !seatNumber) {
      setSeatNumber(freeSeatNumbers[0]);
    }
  }, [trip.id]);

  // Load existing bookings for this trip
  const loadTripBookings = async () => {
    try {
      setLoadingBookings(true);
      const res = await bookingApi.list({ tripId: trip.id });
      setTripBookings(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBookings(false);
    }
  };

  useEffect(() => {
    loadTripBookings();
  }, [trip.id]);

  // Submit booking (JSON or multipart/form-data)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!seatNumber) {
      onNotify('error', 'Выберите место', 'Укажите номер посадочного места');
      return;
    }

    setSubmitting(true);
    try {
      if (documentFile) {
        // multipart/form-data
        const formData = new FormData();
        formData.append('tripId', trip.id);
        formData.append('seatNumber', seatNumber);
        formData.append('passengerName', passengerName.trim());
        formData.append('passengerPhone', passengerPhone.trim());
        formData.append('passengerEmail', passengerEmail.trim());
        formData.append('document', documentFile);

        await bookingApi.create(formData);
      } else {
        // pure JSON
        await bookingApi.create({
          tripId: trip.id,
          seatNumber: parseInt(seatNumber, 10),
          passengerName: passengerName.trim(),
          passengerPhone: passengerPhone.trim(),
          passengerEmail: passengerEmail.trim(),
        });
      }

      onNotify('success', 'Успешно', `Место №${seatNumber} успешно забронировано.`);
      setPassengerName('');
      setPassengerPhone('');
      setPassengerEmail('');
      setDocumentFile(null);
      loadTripBookings();
      onBookingChanged();
    } catch (err) {
      onNotify('error', 'Ошибка бронирования', err.message, err.details);
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel booking (DELETE operation)
  const handleCancelBooking = async (bookingId, seatNum) => {
    if (!window.confirm(`Отменить бронирование места №${seatNum}?`)) return;
    try {
      await bookingApi.delete(bookingId);
      onNotify('success', 'Бронь отменена', `Место №${seatNum} освобождено.`);
      loadTripBookings();
      onBookingChanged();
    } catch (err) {
      onNotify('error', 'Ошибка отмены', err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
              Бронирование билета
            </h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {trip.origin_city} ➔ {trip.destination_city} • {parseFloat(trip.price).toFixed(2)} BYN
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div className="input-group">
            <label className="input-label">Номер места *</label>
            <select
              required
              className="input-control"
              value={seatNumber}
              onChange={(e) => setSeatNumber(parseInt(e.target.value, 10))}
            >
              {freeSeatNumbers.length === 0 ? (
                <option value="">Свободных мест нет</option>
              ) : (
                freeSeatNumbers.map((num) => (
                  <option key={num} value={num}>
                    Место №{num}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">ФИО Пассажира *</label>
            <input
              type="text"
              required
              className="input-control"
              placeholder="Иванов Иван Иванович"
              value={passengerName}
              onChange={(e) => setPassengerName(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="input-group">
              <label className="input-label">Телефон *</label>
              <input
                type="tel"
                required
                className="input-control"
                placeholder="+375 (29) 123-45-67"
                value={passengerPhone}
                onChange={(e) => setPassengerPhone(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Email *</label>
              <input
                type="email"
                required
                className="input-control"
                placeholder="passenger@example.com"
                value={passengerEmail}
                onChange={(e) => setPassengerEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Файл документа / билета (опционально)</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="input-control"
              onChange={(e) => setDocumentFile(e.target.files[0] || null)}
            />
          </div>

          <button
            type="submit"
            disabled={freeSeatNumbers.length === 0 || submitting}
            className="btn btn-primary"
            style={{ padding: '0.75rem', marginTop: '0.5rem' }}
          >
            {submitting ? 'Оформление...' : 'Забронировать'}
          </button>
        </form>

        {/* Existing Bookings List */}
        <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.5rem' }}>
            Текущие бронирования на этот рейс ({tripBookings.length}):
          </div>

          {loadingBookings ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Загрузка...</div>
          ) : tripBookings.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Бронирований нет.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '130px', overflowY: 'auto' }}>
              {tripBookings.map((b) => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '0.45rem 0.75rem', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem' }}>
                  <div>
                    <strong>Место №{b.seat_number}</strong> — {b.passenger_name} ({b.passenger_phone})
                    {b.doc_file_url && (
                      <a href={b.doc_file_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: 'var(--primary)', textDecoration: 'underline' }}>
                        📎 файл
                      </a>
                    )}
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleCancelBooking(b.id, b.seat_number)}
                    title="Отменить бронирование"
                  >
                    <Trash2 size={13} />
                    <span>Отменить</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
