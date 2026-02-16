import { ApiResponse } from './types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiClient<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Don't set Content-Type for FormData — browser sets it with boundary
  const isFormData = options?.body instanceof FormData;
  const headers: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };

  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    credentials: 'include',
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    // Global 401 handler: redirect to login on expired/invalid session
    if (response.status === 401 && !endpoint.startsWith('/auth/')) {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new ApiError(401, 'Session expired');
    }

    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const body: ApiResponse<null> = await response.json();
      if (body.error) {
        errorMessage = body.error;
      }
    } catch {
      // keep default message
    }
    throw new ApiError(response.status, errorMessage);
  }

  const body: ApiResponse<T> = await response.json();

  if (!body.success) {
    throw new ApiError(response.status, body.error ?? 'Unknown error');
  }

  return body.data as T;
}

async function apiClientRaw<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body.error) errorMessage = body.error;
    } catch {
      // keep default
    }
    throw new ApiError(response.status, errorMessage);
  }

  return response.json();
}

export const api = {
  get<T>(endpoint: string): Promise<T> {
    return apiClient<T>(endpoint, { method: 'GET' });
  },

  getRaw<T>(endpoint: string): Promise<ApiResponse<T>> {
    return apiClientRaw<T>(endpoint, { method: 'GET' });
  },

  post<T>(endpoint: string, data?: unknown): Promise<T> {
    return apiClient<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  put<T>(endpoint: string, data?: unknown): Promise<T> {
    return apiClient<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  delete<T>(endpoint: string): Promise<T> {
    return apiClient<T>(endpoint, { method: 'DELETE' });
  },

  upload<T>(endpoint: string, file: File, fieldName = 'file'): Promise<T> {
    const formData = new FormData();
    formData.append(fieldName, file);
    // Do NOT set Content-Type header — browser will set it with the correct boundary
    return apiClient<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  uploadWithParams<T>(
    endpoint: string,
    file: File,
    params: Record<string, string>,
    fieldName = 'file',
  ): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${endpoint}?${qs}` : endpoint;
    const formData = new FormData();
    formData.append(fieldName, file);
    return apiClient<T>(url, {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },
};

export { ApiError };
