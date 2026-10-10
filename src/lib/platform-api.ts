import { ApiError } from "@/lib/api";
import { getPlatformToken, setPlatformToken } from "@/stores/platform-auth";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getPlatformToken();
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  const isLogin = path.includes("/api/platform/auth/login");
  if (res.status === 401 && !isLogin) {
    setPlatformToken(null);
    if (!location.pathname.startsWith("/admin/login")) {
      location.assign("/admin/login");
    }
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(json?.message ?? json?.error ?? "Request failed", res.status, json?.errors);
  }
  return json as T;
}

export const platformApi = {
  get: <T>(path: string, params?: ListParams) => request<T>(`${path}${qs(params)}`),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
