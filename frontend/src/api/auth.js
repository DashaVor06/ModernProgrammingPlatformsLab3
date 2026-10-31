import { apiRequest } from './client.js';

export const authApi = {
  login: (email, password) => apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),

  register: (userData) => apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  }),

  me: () => apiRequest('/api/auth/me'),

  updateProfile: (data) => apiRequest('/api/auth/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  logout: (sessionId) => apiRequest('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify(sessionId ? { sessionId } : {}),
  }),

  // Управление активными подключениями (сессиями)
  listSessions: () => apiRequest('/api/auth/sessions'),

  terminateSession: (sessionId) => apiRequest(`/api/auth/sessions/${sessionId}`, {
    method: 'DELETE',
  }),

  terminateOtherSessions: () => apiRequest('/api/auth/sessions', {
    method: 'DELETE',
  }),

  listUsers: () => apiRequest('/api/auth/users'),

  recoverPassword: (email) => apiRequest('/api/auth/recover-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }),

  resetPassword: (token, newPassword) => apiRequest('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  }),
};
