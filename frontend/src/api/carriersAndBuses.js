import { apiRequest } from './client.js';

export const carrierApi = {
  list: () => apiRequest('/api/carriers'),

  getById: (id) => apiRequest(`/api/carriers/${id}`),

  create: (formData) => apiRequest('/api/carriers', {
    method: 'POST',
    body: formData, // FormData with name, phone, email, logo file
  }),

  update: (id, formDataOrJson) => {
    const isFormData = formDataOrJson instanceof FormData;
    return apiRequest(`/api/carriers/${id}`, {
      method: 'PUT',
      body: isFormData ? formDataOrJson : JSON.stringify(formDataOrJson),
    });
  },

  delete: (id) => apiRequest(`/api/carriers/${id}`, {
    method: 'DELETE',
  }),
};

export const busApi = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/api/buses${query ? `?${query}` : ''}`);
  },

  getById: (id) => apiRequest(`/api/buses/${id}`),

  create: (formData) => apiRequest('/api/buses', {
    method: 'POST',
    body: formData, // FormData with photo file
  }),

  update: (id, formDataOrJson) => {
    const isFormData = formDataOrJson instanceof FormData;
    return apiRequest(`/api/buses/${id}`, {
      method: 'PUT',
      body: isFormData ? formDataOrJson : JSON.stringify(formDataOrJson),
    });
  },

  delete: (id) => apiRequest(`/api/buses/${id}`, {
    method: 'DELETE',
  }),
};
