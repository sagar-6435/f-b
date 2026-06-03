/**
 * Thin HTTP client for the FreshBasket backend API.
 *
 * The base URL is read from the EXPO_PUBLIC_API_URL variable in the root .env file.
 * Update that one value whenever your machine's IP changes — no source file edits needed.
 *
 *   .env examples:
 *     EXPO_PUBLIC_API_URL=http://192.168.x.x:3000   ← physical device (same Wi-Fi)
 *     EXPO_PUBLIC_API_URL=http://10.0.2.2:3000       ← Android emulator
 *     EXPO_PUBLIC_API_URL=http://localhost:3000       ← iOS simulator
 *     EXPO_PUBLIC_API_URL=https://api.example.com    ← production
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.55.105:3000';

async function request(method, path, body) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed with status ${response.status}`);
  }

  return data;
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  put:    (path, body)  => request('PUT',    path, body),
  patch:  (path, body)  => request('PATCH',  path, body),
  delete: (path)        => request('DELETE', path),
};
