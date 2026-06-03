/**
 * Thin HTTP client for the FreshBasket backend API.
 *
 * In development, reads from .env (EXPO_PUBLIC_API_URL).
 * In production builds (EAS), reads from app.config.js extra.apiUrl.
 */
import Constants from 'expo-constants';

export const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL ??
  'https://f-b-r0iq.onrender.com';

async function request(method, path, body) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch (networkErr) {
    throw new Error('Network request failed. Check your connection.');
  }

  // Guard: only parse as JSON if the response is actually JSON.
  // An HTML error page (404/502 from proxy/CDN) starts with '<' and
  // causes "unexpected character" if passed to response.json().
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  if (!response.ok) {
    if (isJson) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error ?? `Request failed with status ${response.status}`);
    }
    // Non-JSON error (HTML proxy page, etc.)
    throw new Error(`Server error ${response.status}. Please try again.`);
  }

  // Success — parse JSON if available, otherwise return empty object
  if (isJson) {
    return response.json();
  }
  return {};
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  put:    (path, body)  => request('PUT',    path, body),
  patch:  (path, body)  => request('PATCH',  path, body),
  delete: (path)        => request('DELETE', path),
};
