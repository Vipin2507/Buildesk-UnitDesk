import { Navigate } from "react-router-dom";
import { tenantPath } from "@/lib/tenant";
import { useProjectContextStore } from "@/stores/project-context";

/** Send legacy global routes into the project workspace. */
export function ProjectRedirect({
  suffix,
}: {
  /** Path under /projects/:id, e.g. "inventory" or "receipts". Empty = project list or overview. */
  suffix?: string;
}) {
  const projectId = useProjectContextStore((s) => s.projectId);

  if (projectId && suffix) {
    return <Navigate to={tenantPath(`/projects/${projectId}/${suffix}`)} replace />;
  }
  if (projectId && !suffix) {
    return <Navigate to={tenantPath(`/projects/${projectId}`)} replace />;
  }
  return <Navigate to={tenantPath("/projects")} replace />;
}
