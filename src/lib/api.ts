import { getTenantSlug, setTenantSlug, tenantPath } from "@/lib/tenant";

const TOKEN_KEY = "unitdesk.token";

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(
    message: string,
    status: number,
    errors?: Record<string, string[]>,
  ) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Auth + tenant headers for raw fetch (blobs, FormData outside api.upload). */
export function apiHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const slug = getTenantSlug();
  if (slug) headers.set("X-Tenant-Slug", slug);
  return headers;
}

type ListParams = Record<string, string | number | boolean | undefined | null>;

function qs(params?: ListParams) {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function handleUnauthorized(path: string, status: number) {
  const isLogin =
    path.includes("/api/auth/login") || path.includes("/api/partner-auth/login");
  if (status !== 401 || isLogin) return;
  setToken(null);
  const partner = location.pathname.includes("/partner");
  const dest = partner
    ? tenantPath("/partner/login")
    : getTenantSlug()
      ? tenantPath("/login")
      : "/login";
  if (location.pathname !== dest) location.assign(dest);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = apiHeaders(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...init, headers });
  handleUnauthorized(path, res.status);

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(
      json?.message ?? json?.error ?? "Request failed",
      res.status,
      json?.errors,
    );
  }
  return json as T;
}

/** fetch with auth/tenant headers; use for blob downloads. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = apiHeaders(init?.headers);
  const res = await fetch(path, { ...init, headers });
  handleUnauthorized(path, res.status);
  return res;
}

export const api = {
  get: <T>(path: string, params?: ListParams) =>
    request<T>(`${path}${qs(params)}`),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, body: FormData) => request<T>(path, { method: "POST", body }),
};

export type ListResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

export { setTenantSlug, getTenantSlug, tenantPath };
