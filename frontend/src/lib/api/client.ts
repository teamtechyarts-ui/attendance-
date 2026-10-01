import { ApiResponse, ApiErrorResponse } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

class ApiClient {
  private token: string | null = null;
  private isRefreshing = false;

  public setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('workos_access_token', token);
      } else {
        localStorage.removeItem('workos_access_token');
      }
    }
  }

  public getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('workos_access_token');
    }
    return this.token;
  }

  public async request<T = any>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    };

    // Only set Content-Type: application/json if a request body is legitimately present and not already specified
    if (options.body !== undefined && options.body !== null) {
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const url = `${API_BASE_URL}${path}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include', // sends cookies
      });

      // Handle 204 No Content
      if (response.status === 204) {
        return null as unknown as T;
      }

      const text = await response.text();
      let data: any = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }

      if (!response.ok) {
        // Handle 401 Unauthorized - attempt refresh if not already refreshing
        if (
          response.status === 401 &&
          !path.includes('/auth/login') &&
          !path.includes('/auth/refresh') &&
          !path.includes('/auth/forgot-password') &&
          !path.includes('/auth/reset-password') &&
          !this.isRefreshing
        ) {
          this.isRefreshing = true;
          try {
            const storedRefreshToken = typeof window !== 'undefined' ? localStorage.getItem('workos_refresh_token') : null;
            const refreshRes = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ refreshToken: storedRefreshToken }),
              credentials: 'include',
            });
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              const newAccessToken = refreshData.data?.accessToken;
              const newRefreshToken = refreshData.data?.refreshToken;
              if (newAccessToken) {
                this.setToken(newAccessToken);
                if (newRefreshToken && typeof window !== 'undefined') {
                  localStorage.setItem('workos_refresh_token', newRefreshToken);
                }
                this.isRefreshing = false;
                // Retry original request
                return await this.request<T>(path, options);
              }
            } else if (refreshRes.status === 401 || refreshRes.status === 403) {
              // Only genuine authentication/authorization failure revokes the token
              this.setToken(null);
              if (typeof window !== 'undefined') {
                localStorage.removeItem('workos_refresh_token');
              }
            }
            // For 429 or 500 during refresh, do NOT revoke or wipe token!
          } catch {
            // Network failure during refresh - keep token intact
          } finally {
            this.isRefreshing = false;
          }
        }

        const retryAfter = response.headers.get('Retry-After') || response.headers.get('retry-after') || null;
        let defaultMsg = 'An error occurred';
        if (response.status === 429) {
          defaultMsg = retryAfter
            ? `Too many requests. Please try again after ${retryAfter}s.`
            : 'Too many requests. Please try again shortly.';
        } else if (response.status === 401) {
          defaultMsg = 'Your session has expired. Please sign in again.';
        } else if (response.status === 403) {
          defaultMsg = 'You do not have permission to perform this action.';
        } else if (response.status === 423) {
          defaultMsg = 'This account or resource is currently locked.';
        }

        const err: any = new Error(data.error?.message || data.message || defaultMsg);
        err.status = response.status;
        err.statusCode = response.status;
        err.code = data.error?.code || (response.status === 429 ? 'RATE_LIMIT_EXCEEDED' : response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'FORBIDDEN' : 'API_ERROR');
        err.details = data.error?.details;
        err.retryAfter = retryAfter;
        throw err;
      }

      return data.data !== undefined ? data.data : data;
    } catch (error: any) {
      throw error;
    }
  }

  public get<T = any>(path: string, options: RequestInit = {}) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  public post<T = any>(path: string, body?: any, options: RequestInit = {}) {
    const hasBody = body !== undefined && body !== null;
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      ...(hasBody ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    });
  }

  public put<T = any>(path: string, body?: any, options: RequestInit = {}) {
    const hasBody = body !== undefined && body !== null;
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      ...(hasBody ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    });
  }

  public patch<T = any>(path: string, body?: any, options: RequestInit = {}) {
    const hasBody = body !== undefined && body !== null;
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      ...(hasBody ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    });
  }

  public delete<T = any>(path: string, options: RequestInit = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
