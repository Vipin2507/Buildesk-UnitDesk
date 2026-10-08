import { Navigate } from "react-router-dom";
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
    return <Navigate to={`/projects/${projectId}/${suffix}`} replace />;
  }
  if (projectId && !suffix) {
    return <Navigate to={`/projects/${projectId}`} replace />;
  }
  return <Navigate to="/projects" replace />;
}
