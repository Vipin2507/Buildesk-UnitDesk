import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { setToken } from "@/lib/api";
import { getTenantSlug, setTenantSlug, tenantPath } from "@/lib/tenant";
import { usePlatformAuthStore } from "@/stores/platform-auth";
import { setPlatformToken } from "@/stores/platform-auth";

export function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const { slug } = useParams();

  useEffect(() => {
    if (token) setToken(token);
    if (slug) setTenantSlug(slug);
  }, [token, slug]);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user?.kind === "partner") {
    return <Navigate to={tenantPath("/partner")} replace />;
  }
  return <Outlet />;
}

export function PartnerProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const { slug } = useParams();

  useEffect(() => {
    if (token) setToken(token);
    if (slug) setTenantSlug(slug);
  }, [token, slug]);

  if (!token) {
    return (
      <Navigate
        to={slug ? `/t/${slug}/partner/login` : "/partner/login"}
        replace
        state={{ from: location.pathname }}
      />
    );
  }
  if (user && user.kind !== "partner") {
    return <Navigate to={tenantPath("/")} replace />;
  }
  return <Outlet />;
}

export function PlatformProtectedRoute() {
  const token = usePlatformAuthStore((s) => s.token);
  const location = useLocation();

  useEffect(() => {
    if (token) setPlatformToken(token);
  }, [token]);

  if (!token) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
