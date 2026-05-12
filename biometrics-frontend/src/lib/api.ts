const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://10.10.0.21:5002';

export async function loginUser(username: string, password: string) {
  const res = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Login failed');
  }

  return res.json() as Promise<{ token: string }>;
}

export async function fetchWithAuth<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  // Handle empty responses (e.g. 204 No Content)
  const text = await res.text();
  if (!text) {
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return {} as T;
  }

  // Check if response is JSON
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    // Server returned non-JSON (HTML error page)
    throw new Error(`Server error ${res.status}: ${res.statusText}`);
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Request failed: ${res.status}`);
  }

  return data as T;
}