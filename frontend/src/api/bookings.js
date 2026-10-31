import { apiRequest } from './client.js';

export const bookingApi = {
  list: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query.append(key, val);
      }
    });
    const qs = query.toString();
    return apiRequest(`/api/bookings${qs ? `?${qs}` : ''}`);
  },

  getById: (id) => apiRequest(`/api/bookings/${id}`),

  create: (formDataOrJson) => {
    const isFormData = formDataOrJson instanceof FormData;
    return apiRequest('/api/bookings', {
      method: 'POST',
      body: isFormData ? formDataOrJson : JSON.stringify(formDataOrJson),
    });
  },

  update: (id, data) => apiRequest(`/api/bookings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  delete: (id) => apiRequest(`/api/bookings/${id}`, {
    method: 'DELETE',
  }),
};
