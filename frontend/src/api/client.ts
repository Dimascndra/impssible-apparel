// API Client for IMPOSSIBLE APPAREL Modern Frontend

let csrfToken: string = '';

export function setCsrfToken(token: string) {
  csrfToken = token;
}

export function getCsrfToken(): string {
  return csrfToken;
}

export interface ApiResponse<T = any> {
  ok?: boolean;
  error?: string;
  data?: T;
  [key: string]: any;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;

  constructor(message: string, status: number, code?: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export interface RequestOptions extends RequestInit {
  skipAuthRedirect?: boolean;
}

export async function apiClient<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  // Only set Content-Type to application/json if body is not FormData
  if (options.body && !(options.body instanceof FormData)) {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  // Auto include X-CSRF-Token for mutation methods
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (csrfToken && !headers['X-CSRF-Token']) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (err: any) {
    throw new ApiError(
      'Koneksi server terputus. Pastikan server aplikasi menyala.',
      0,
      'NETWORK_ERROR'
    );
  }

  // Parse JSON response if present
  let data: any = {};
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = {};
    }
  }

  // Handle 401 Unauthorized
  if (response.status === 401) {
    const isPublicEndpoint = endpoint.startsWith('/api/public/');
    const isPublicPage =
      window.location.pathname === '/' ||
      window.location.pathname.startsWith('/katalog') ||
      window.location.pathname.startsWith('/cek-pesanan');

    if (!options.skipAuthRedirect && !isPublicEndpoint && !isPublicPage && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new ApiError(
      data.error || 'Sesi login telah berakhir. Silakan login kembali.',
      401,
      'UNAUTHORIZED',
      data
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new ApiError(
        data.error || 'Terlalu banyak percobaan. Akses dibatasi sementara (Rate Limit).',
        429,
        'RATE_LIMITED',
        data
      );
    }
    const message = data.error || `Permintaan gagal dengan status ${response.status}`;
    throw new ApiError(message, response.status, `HTTP_${response.status}`, data);
  }

  return data as T;
}

// Utility Helpers
export function formatRupiah(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}
