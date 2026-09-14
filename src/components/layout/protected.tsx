import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { setToken } from "@/lib/api";

export function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  useEffect(() => {
    if (token) setToken(token);
  }, [token]);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user?.kind === "partner") {
    return <Navigate to="/partner" replace />;
  }
  return <Outlet />;
}

export function PartnerProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  useEffect(() => {
    if (token) setToken(token);
  }, [token]);

  if (!token) {
    return <Navigate to="/partner/login" replace state={{ from: location.pathname }} />;
  }
  if (user && user.kind !== "partner") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
