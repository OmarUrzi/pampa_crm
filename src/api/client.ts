export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

export class AuthRequiredError extends Error {
  name = "AuthRequiredError";
}

export class ApiError extends Error {
  name = "ApiError";
  status: number;
  url: string;
  method: string;
  bodyText: string;
  requestId?: string;
  constructor(input: { status: number; url: string; method: string; bodyText: string }) {
    super(`API ${input.status}: ${input.bodyText}`);
    this.status = input.status;
    this.url = input.url;
    this.method = input.method;
    this.bodyText = input.bodyText;
  }
}

export function getToken() {
  try {
    return localStorage.getItem("pampa-crm:token");
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (!token) localStorage.removeItem("pampa-crm:token");
    else localStorage.setItem("pampa-crm:token", token);
    try {
      window.dispatchEvent(new Event("pampa-crm:token"));
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { token?: string };
    return json.token ?? null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const method = (init?.method ?? "GET").toUpperCase();
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const isPublicAuthRoute = path.startsWith("/auth/");
  if (isMutation && !token && !isPublicAuthRoute) {
    throw new AuthRequiredError("auth_required");
  }
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timeoutMs = (init as any)?.timeoutMs ?? 15_000;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError({ status: 0, url, method, bodyText: "timeout" });
    }
    throw new ApiError({ status: 0, url, method, bodyText: "network_error" });
  } finally {
    clearTimeout(t);
  }
  const requestId = res.headers.get("x-request-id") ?? undefined;
  if (res.status === 401) {
    // For idempotent requests, attempt a refresh+retry once before forcing re-login.
    if (!isMutation && !isPublicAuthRoute && !(init as any)?._retriedAfterRefresh) {
      const next = await refreshAccessToken();
      if (next) {
        setToken(next);
        return await apiFetch<T>(path, { ...(init ?? {}), headers: init?.headers, _retriedAfterRefresh: true } as any);
      }
    }
    try {
      sessionStorage.setItem("pampa-crm:auth_notice", "Tu sesión expiró. Volvé a ingresar.");
    } catch {
      // ignore
    }
    setToken(null);
    throw new AuthRequiredError("session_expired");
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let bodyText = txt || res.statusText;
    try {
      const asJson = JSON.parse(txt) as { error?: string; message?: string };
      bodyText = asJson.message ?? asJson.error ?? bodyText;
    } catch {
      // ignore
    }
    const e = new ApiError({ status: res.status, url, method, bodyText });
    e.requestId = requestId;
    // eslint-disable-next-line no-console
    console.warn("[apiFetch]", { status: e.status, method: e.method, url: e.url, bodyText: e.bodyText, requestId });
    throw e;
  }
  return (await res.json()) as T;
}

