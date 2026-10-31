import React, { useState, useEffect } from 'react';
import { X } from './Icons.jsx';

export function TripModal({ trip, carriers, buses, currentUser, onClose, onSave }) {
  const isCarrier = currentUser?.role === 'CARRIER';
  const ownedCarrierIds = (currentUser?.carrierIds || []).map(Number);

  // Перевозчик видит только своих перевозчиков; админ — всех
  const availableCarriers = isCarrier
    ? carriers.filter((c) => ownedCarrierIds.includes(Number(c.id)))
    : carriers;

  const busesForCarrier = (carrierId) =>
    buses.filter((b) => Number(b.carrier_id) === Number(carrierId));

  const defaultCarrierId = availableCarriers[0]?.id || 1;
  const defaultBusId = busesForCarrier(defaultCarrierId)[0]?.id || 1;

  const [formData, setFormData] = useState({
    originCity: '',
    destinationCity: '',
    departureStation: 'АВ Центральный',
    arrivalStation: 'АВ',
    departureTime: '',
    arrivalTime: '',
    price: 25.0,
    carrierId: defaultCarrierId,
    busId: defaultBusId,
    status: 'SCHEDULED',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (trip) {
      setFormData({
        originCity: trip.origin_city || '',
        destinationCity: trip.destination_city || '',
        departureStation: trip.departure_station || 'АВ Центральный',
        arrivalStation: trip.arrival_station || 'АВ',
        departureTime: trip.departure_time ? new Date(trip.departure_time).toISOString().slice(0, 16) : '',
        arrivalTime: trip.arrival_time ? new Date(trip.arrival_time).toISOString().slice(0, 16) : '',
        price: parseFloat(trip.price) || 25.0,
        carrierId: trip.carrier_id || defaultCarrierId,
        busId: trip.bus_id || defaultBusId,
        status: trip.status || 'SCHEDULED',
      });
    } else {
      const now = new Date();
      now.setHours(now.getHours() + 2);
      const arr = new Date(now.getTime() + 4 * 3600 * 1000);
      setFormData((prev) => ({
        ...prev,
        departureTime: now.toISOString().slice(0, 16),
        arrivalTime: arr.toISOString().slice(0, 16),
        carrierId: defaultCarrierId,
        busId: defaultBusId,
      }));
    }
  }, [trip, carriers, buses, currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSave(formData, trip?.id);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCarrierChange = (newCarrierId) => {
    const firstBus = busesForCarrier(newCarrierId)[0]?.id || '';
    setFormData({ ...formData, carrierId: newCarrierId, busId: firstBus });
  };

  const currentBuses = busesForCarrier(formData.carrierId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
            {trip ? 'Редактировать рейс' : 'Добавить рейс'}
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <X size={22} />
          </button>
        </div>

        {availableCarriers.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            У вашей учётной записи нет закреплённого перевозчика. Обратитесь к администратору.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label className="input-label">Откуда (город) *</label>
                <input
                  type="text"
                  required
                  className="input-control"
                  placeholder="Минск"
                  value={formData.originCity}
                  onChange={(e) => setFormData({ ...formData, originCity: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Куда (город) *</label>
                <input
                  type="text"
                  required
                  className="input-control"
                  placeholder="Гродно"
                  value={formData.destinationCity}
                  onChange={(e) => setFormData({ ...formData, destinationCity: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label className="input-label">Станция отправления</label>
                <input
                  type="text"
                  className="input-control"
                  value={formData.departureStation}
                  onChange={(e) => setFormData({ ...formData, departureStation: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Станция прибытия</label>
                <input
                  type="text"
                  className="input-control"
                  value={formData.arrivalStation}
                  onChange={(e) => setFormData({ ...formData, arrivalStation: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label className="input-label">Время отправления *</label>
                <input
                  type="datetime-local"
                  required
                  className="input-control"
                  value={formData.departureTime}
                  onChange={(e) => setFormData({ ...formData, departureTime: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Время прибытия *</label>
                <input
                  type="datetime-local"
                  required
                  className="input-control"
                  value={formData.arrivalTime}
                  onChange={(e) => setFormData({ ...formData, arrivalTime: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label className="input-label">Перевозчик *</label>
                <select
                  className="input-control"
                  value={formData.carrierId}
                  onChange={(e) => handleCarrierChange(parseInt(e.target.value, 10))}
                  disabled={isCarrier && availableCarriers.length === 1}
                >
                  {availableCarriers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Автобус *</label>
                <select
                  className="input-control"
                  value={formData.busId}
                  onChange={(e) => setFormData({ ...formData, busId: parseInt(e.target.value, 10) })}
                  required
                >
                  {currentBuses.length === 0 ? (
                    <option value="">Нет автобусов у перевозчика</option>
                  ) : (
                    currentBuses.map((b) => (
                      <option key={b.id} value={b.id}>{b.model} ({b.capacity} мест)</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label className="input-label">Цена билета (BYN) *</label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  className="input-control"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Статус рейса</label>
                <select
                  className="input-control"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="SCHEDULED">Запланирован</option>
                  <option value="ACTIVE">В пути</option>
                  <option value="COMPLETED">Завершен</option>
                  <option value="CANCELLED">Отменен</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Отмена
              </button>
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? 'Сохранение...' : trip ? 'Обновить рейс' : 'Создать рейс'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
