import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { api, type ListResponse } from "@/lib/api";
import { resolveProjectPhotoUrl } from "@/lib/project-photo";
import { qk } from "@/lib/query-keys";
import { useProjectContextStore } from "@/stores/project-context";

type Project = {
  id: string;
  name: string;
  location: string | null;
  totalUnits: number;
  status: string;
  companyId: string;
  photoUrl: string | null;
  company: { name: string };
};

export function InventoryHomePage() {
  const navigate = useNavigate();
  const setProject = useProjectContextStore((s) => s.setProject);
  const { data } = useQuery({
    queryKey: qk.projects(),
    queryFn: () => api.get<ListResponse<Project>>("/api/projects", { pageSize: 50 }),
  });

  return (
    <PageWrap>
      <PageHeader
        title="Inventory"
        subtitle="Pick a project to open the unit grid"
        actions={
          <Button size="sm" onClick={() => navigate("/projects/new")}>
            <Plus className="h-3.5 w-3.5" /> Add project
          </Button>
        }
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.data ?? []).map((p) => (
          <button
            key={p.id}
            type="button"
            className="card-soft overflow-hidden p-0 text-left"
            onClick={() => {
              setProject(p.id, p.companyId);
              navigate(`/projects/${p.id}/inventory`);
            }}
          >
            <div className="h-28 bg-muted">
              <img
                src={resolveProjectPhotoUrl(p.photoUrl)}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <div className="space-y-1.5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.company.name} · {p.location}</p>
                </div>
                <StatusPill status={p.status} />
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">{p.totalUnits} units</p>
            </div>
          </button>
        ))}
      </div>
    </PageWrap>
  );
}
