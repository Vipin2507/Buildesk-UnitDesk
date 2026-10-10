const TENANT_KEY = "unitdesk.tenant";

export function getTenantSlug(): string | null {
  return localStorage.getItem(TENANT_KEY);
}

export function setTenantSlug(slug: string | null) {
  if (slug) localStorage.setItem(TENANT_KEY, slug.toLowerCase());
  else localStorage.removeItem(TENANT_KEY);
}

/** Prefix app paths with /t/{slug} when a workspace slug is active. */
export function tenantPath(path: string): string {
  const slug = getTenantSlug();
  if (!slug) return path.startsWith("/") ? path : `/${path}`;
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (clean.startsWith("/t/") || clean.startsWith("/admin") || clean.startsWith("/partner")) {
    return clean;
  }
  if (clean === "/") return `/t/${slug}`;
  return `/t/${slug}${clean}`;
}

export function stripTenantPrefix(pathname: string): string {
  const m = pathname.match(/^\/t\/[^/]+(\/.*)?$/);
  if (!m) return pathname;
  return m[1] || "/";
}
