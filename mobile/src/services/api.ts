import { AuthUser, HealthAlert, IncidentReport } from '../shared/types';
import { getServerUrl } from './serverConfig';
import { getToken, notifyUnauthorized } from './session';

/**
 * Cliente de la misma API REST que usa la versión web/APK (server/).
 * En React Native no hay CORS: fetch llama directo a la dirección configurada.
 */
export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;

  constructor(status: number, message: string, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const absoluteUrl = (path: string) => `${getServerUrl()}${path}`;

export const authHeader = (): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 15000,
  { handleUnauthorized = true } = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const auth = authHeader();
  let response: Response;
  try {
    response = await fetch(absoluteUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...auth,
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  } catch (err) {
    throw new ApiError(
      0,
      (err as Error).name === 'AbortError'
        ? 'El servidor tardó demasiado en responder.'
        : 'No hay conexión con el servidor.'
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => null);
  if (response.ok && data === null) {
    throw new ApiError(0, 'La dirección configurada no responde como el servidor de RABIA-CUN.');
  }
  if (response.status === 401 && handleUnauthorized && auth.Authorization) notifyUnauthorized();
  if (!response.ok) {
    throw new ApiError(response.status, data?.error || `Error ${response.status} del servidor.`, data?.details);
  }
  return data as T;
}

export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    const fieldErrors = err.details ? Object.values(err.details).join(' ') : '';
    return fieldErrors ? `${err.message} ${fieldErrors}` : err.message;
  }
  return 'Ocurrió un error inesperado.';
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export const authApi = {
  login: (email: string, password: string) =>
    request<AuthResponse>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      15000,
      { handleUnauthorized: false }
    ),
  register: (name: string, email: string, password: string) =>
    request<AuthResponse>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify({ name, email, password }) },
      15000,
      { handleUnauthorized: false }
    ),
};

export interface NewIncidentPayload
  extends Omit<IncidentReport, 'id' | 'folio' | 'verificationStatus' | 'reportedAt' | 'photoUrl'> {
  photoDataUrl?: string | null;
  photoFileName?: string | null;
}

export const incidentsApi = {
  list: () => request<IncidentReport[]>('/api/incidents'),
  listMine: () => request<IncidentReport[]>('/api/incidents?mine=true'),
  create: (payload: NewIncidentPayload) =>
    request<IncidentReport>('/api/incidents', { method: 'POST', body: JSON.stringify(payload) }, 60000),
};

export const alertsApi = {
  list: () => request<HealthAlert[]>('/api/alerts'),
};
