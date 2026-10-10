import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { setTenantSlug } from "@/lib/tenant";

/** Syncs URL workspace slug into localStorage for API headers. */
export function TenantLayout() {
  const { slug } = useParams();

  useEffect(() => {
    if (slug) setTenantSlug(slug);
  }, [slug]);

  return <Outlet />;
}
