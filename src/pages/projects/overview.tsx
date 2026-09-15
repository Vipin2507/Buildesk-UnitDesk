import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Ban, CircleDot, LayoutGrid, ShoppingBag } from "lucide-react";
import { CardSoft } from "@/components/shared/card-soft";
import { ImageUpload } from "@/components/shared/image-upload";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { formatDate, inr } from "@/lib/format";
import { DEFAULT_PROJECT_PHOTO } from "@/lib/project-photo";
import { qk } from "@/lib/query-keys";
import { systemUnitPlanUrl } from "@/lib/unit-plans";
import { useProjectContextStore } from "@/stores/project-context";
import { useEffect } from "react";
import { toast } from "sonner";

type Project = {
  id: string;
  name: string;
  location: string | null;
  reraNumber: string | null;
  status: string;
  totalUnits: number;
  launchDate: string | null;
  expectedCompletion: string | null;
  photoUrl: string | null;
  plan1bhkUrl: string | null;
  plan2bhkUrl: string | null;
  plan3bhkUrl: string | null;
  company: { id: string; name: string };
};

type Dash = {
  kpis: {
    units: number;
    available: number;
    booked: number;
    sold: number;
    hold: number;
    bookingValue: number;
    partnerOutstanding: number;
  };
};

export function ProjectOverviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setProject = useProjectContextStore((s) => s.setProject);
  const { data: project } = useQuery({
    queryKey: qk.project(id!),
    queryFn: () => api.get<Project>(`/api/projects/${id}`),
    enabled: Boolean(id),
  });
  const { data: dash } = useQuery({
    queryKey: qk.dashboardProject(id!),
    queryFn: () => api.get<Dash>(`/api/dashboard/project/${id}`),
    enabled: Boolean(id),
  });

  const setPhoto = useMutation({
    mutationFn: (photoUrl: string | null) => api.patch(`/api/projects/${id}`, { photoUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.project(id!) });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Project photo updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update photo"),
  });

  useEffect(() => {
    if (project) setProject(project.id, project.company.id);
  }, [project, setProject]);

  return (
    <PageWrap>
      <PageHeader
        title={project?.name ?? "Project"}
        subtitle={`${project?.company.name ?? ""} · ${project?.location ?? ""}`}
        breadcrumbs={[
          { label: "Companies", to: "/companies" },
          { label: project?.company.name ?? "…", to: project ? `/companies/${project.company.id}` : "/companies" },
          { label: project?.name ?? "Overview" },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/edit`)}>Edit</Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/units/new`)}>Add unit</Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/setup`)}>Setup</Button>
            <Button size="sm" onClick={() => navigate(`/projects/${id}/inventory`)}>Unit inventory</Button>
          </>
        }
      />
      {project ? <StatusPill status={project.status} /> : null}
      <div className="max-w-xl space-y-3">
        <ImageUpload
          label="Project photo"
          variant="cover"
          value={project?.photoUrl}
          fallback={DEFAULT_PROJECT_PHOTO}
          onChange={(url) => setPhoto.mutate(url)}
        />
        {project ? (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div>
              <p className="text-xs font-semibold">Floor plans by type (optional)</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Custom plans override system defaults for this project only.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["plan1bhkUrl", "1 BHK", "1bhk"],
                  ["plan2bhkUrl", "2 BHK", "2bhk"],
                  ["plan3bhkUrl", "3 BHK", "3bhk"],
                ] as const
              ).map(([key, label, sys]) => (
                <ImageUpload
                  key={key}
                  label={label}
                  variant="plan"
                  compact
                  hint=""
                  value={project[key]}
                  fallback={systemUnitPlanUrl(sys)}
                  onChange={(url) =>
                    api
                      .patch(`/api/projects/${id}`, { [key]: url })
                      .then(() => {
                        qc.invalidateQueries({ queryKey: qk.project(id!) });
                        toast.success(`${label} plan updated`);
                      })
                      .catch((err) =>
                        toast.error(err instanceof ApiError ? err.message : "Could not update plan"),
                      )
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard label="Units" value={dash?.kpis.units ?? 0} icon={LayoutGrid} onClick={() => navigate(`/projects/${id}/inventory`)} />
        <KpiCard label="Available" value={dash?.kpis.available ?? 0} icon={CircleDot} tone="success" onClick={() => navigate(`/projects/${id}/inventory`)} />
        <KpiCard label="Booked / sold" value={(dash?.kpis.booked ?? 0) + (dash?.kpis.sold ?? 0)} icon={ShoppingBag} onClick={() => navigate(`/projects/${id}/bookings`)} />
        <KpiCard label="On hold" value={dash?.kpis.hold ?? 0} icon={Ban} tone="warning" onClick={() => navigate(`/projects/${id}/inventory`)} />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <CardSoft>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Project facts</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <dt className="text-muted-foreground">RERA</dt>
            <dd>{project?.reraNumber ?? "—"}</dd>
            <dt className="text-muted-foreground">Launch</dt>
            <dd>{formatDate(project?.launchDate)}</dd>
            <dt className="text-muted-foreground">Possession</dt>
            <dd>{formatDate(project?.expectedCompletion)}</dd>
            <dt className="text-muted-foreground">Booking value</dt>
            <dd className="tabular-nums">{inr(dash?.kpis.bookingValue)}</dd>
            <dt className="text-muted-foreground">Partner outstanding</dt>
            <dd className="tabular-nums text-destructive">{inr(dash?.kpis.partnerOutstanding)}</dd>
          </dl>
        </CardSoft>
      </div>
    </PageWrap>
  );
}
