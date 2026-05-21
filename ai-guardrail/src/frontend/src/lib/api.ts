const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface ApiOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAuthHeaders(): Record<string, string> {
    if (typeof window === "undefined") return {};
    const token = localStorage.getItem("access_token");
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.status === 401) {
      const refreshed = await this.refreshToken();
      if (!refreshed) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
        throw new Error("Session expired");
      }
      throw new Error("RETRY");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || `Request failed: ${response.status}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  private async refreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      return true;
    } catch {
      return false;
    }
  }

  async get<T>(path: string, options?: ApiOptions): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(),
        ...options?.headers,
      },
      signal: options?.signal,
    });
    try {
      return await this.handleResponse<T>(response);
    } catch (e) {
      if ((e as Error).message === "RETRY") return this.get<T>(path, options);
      throw e;
    }
  }

  async post<T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(),
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    });
    try {
      return await this.handleResponse<T>(response);
    } catch (e) {
      if ((e as Error).message === "RETRY") return this.post<T>(path, body, options);
      throw e;
    }
  }

  async put<T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(),
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    });
    try {
      return await this.handleResponse<T>(response);
    } catch (e) {
      if ((e as Error).message === "RETRY") return this.put<T>(path, body, options);
      throw e;
    }
  }

  async delete<T>(path: string, options?: ApiOptions): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(),
        ...options?.headers,
      },
      signal: options?.signal,
    });
    try {
      return await this.handleResponse<T>(response);
    } catch (e) {
      if ((e as Error).message === "RETRY") return this.delete<T>(path, options);
      throw e;
    }
  }

  async upload<T>(path: string, formData: FormData, options?: ApiOptions): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        ...this.getAuthHeaders(),
        ...options?.headers,
      },
      body: formData,
      signal: options?.signal,
    });
    try {
      return await this.handleResponse<T>(response);
    } catch (e) {
      if ((e as Error).message === "RETRY") return this.upload<T>(path, formData, options);
      throw e;
    }
  }

  getStreamUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("access_token");
  }
}

export const api = new ApiClient(API_BASE_URL);
