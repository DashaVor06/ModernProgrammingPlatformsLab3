/**
 * Unified API Client for Frontend
 * Supports JSON, multipart/form-data, and extracts semantic server error messages
 */
export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is FormData (multipart/form-data), let the browser set Content-Type with boundary
  if (!(options.body instanceof FormData) && !headers['Content-Type'] && options.method && options.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorMessage = data?.error?.message || data?.message || `Ошибка сервера (${response.status})`;
      const errorDetails = data?.error?.details || null;
      const errorObj = new Error(errorMessage);
      errorObj.status = response.status;
      errorObj.code = data?.error?.code || 'API_ERROR';
      errorObj.details = errorDetails;
      throw errorObj;
    }

    return data;
  } catch (error) {
    console.error(`API Request to ${endpoint} failed:`, error);
    throw error;
  }
}

/**
 * Декодирует payload JWT из localStorage (без проверки подписи — только для UI).
 * Возвращает объект с полями sub/email/role/sessionId или null.
 */
export function getAuthTokenPayload() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
    const json = decodeURIComponent(
      Array.prototype.map
        .call(atob(padded), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Идентификатор текущей сессии (из JWT) — чтобы отличать её в списке. */
export function getCurrentSessionId() {
  return getAuthTokenPayload()?.sessionId || null;
}
