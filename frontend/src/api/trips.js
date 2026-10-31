import { apiRequest } from './client.js';

export const tripApi = {
  list: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query.append(key, val);
      }
    });
    const qs = query.toString();
    return apiRequest(`/api/trips${qs ? `?${qs}` : ''}`);
  },

  getById: (id) => apiRequest(`/api/trips/${id}`),

  create: (tripData) => apiRequest('/api/trips', {
    method: 'POST',
    body: JSON.stringify(tripData),
  }),

  update: (id, tripData) => apiRequest(`/api/trips/${id}`, {
    method: 'PUT',
    body: JSON.stringify(tripData),
  }),

  delete: (id) => apiRequest(`/api/trips/${id}`, {
    method: 'DELETE',
  }),
};
