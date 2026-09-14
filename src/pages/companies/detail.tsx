import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { resolveProjectPhotoUrl } from "@/lib/project-photo";
import { qk } from "@/lib/query-keys";
import { useProjectContextStore } from "@/stores/project-context";

type Company = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  state: string | null;
  gst: string | null;
  pan: string | null;
  contactPerson: string | null;
  contactNumber: string | null;
  email: string | null;
  logoUrl: string | null;
  status: string;
  _count: { projects: number };
};

type Project = {
  id: string;
  name: string;
  code: string;
  location: string | null;
  totalUnits: number;
  status: string;
  photoUrl: string | null;
};

export function CompanyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setProject = useProjectContextStore((s) => s.setProject);
  const [confirm, setConfirm] = useState(false);

  const { data: company } = useQuery({
    queryKey: qk.company(id!),
    queryFn: () => api.get<Company>(`/api/companies/${id}`),
    enabled: Boolean(id),
  });

  const { data: projects } = useQuery({
    queryKey: qk.projects(id),
    queryFn: () => api.get<ListResponse<Project>>(`/api/companies/${id}/projects`, { pageSize: 50 }),
    enabled: Boolean(id),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/companies/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.companies });
      toast.success("Company deleted");
      navigate("/companies");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete"),
  });

  return (
    <PageWrap>
      <PageHeader
        title={company?.name ?? "Company"}
        subtitle={`${company?.code ?? ""} · ${company?.city ?? "—"}`}
        breadcrumbs={[
          { label: "Companies", to: "/companies" },
          { label: company?.name ?? "…" },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate(`/companies/${id}/edit`)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button size="sm" onClick={() => navigate(`/companies/${id}/projects/new`)}>
              <Plus className="h-3.5 w-3.5" /> Add project
            </Button>
          </>
        }
      />

      <div className="grid gap-2.5 lg:grid-cols-[18rem_1fr]">
        <CardSoft className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
              {company?.logoUrl ? (
                <img src={company.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Building2 className="m-4 h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              {company ? <StatusPill status={company.status} /> : null}
              <p className="mt-1 text-sm font-semibold">{company?.name}</p>
              <p className="text-xs text-muted-foreground">{company?.code}</p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">Address</dt>
            <dd>{company?.address || "—"}</dd>
            <dt className="text-muted-foreground">City / State</dt>
            <dd>{[company?.city, company?.state].filter(Boolean).join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">GST</dt>
            <dd>{company?.gst || "—"}</dd>
            <dt className="text-muted-foreground">PAN</dt>
            <dd>{company?.pan || "—"}</dd>
            <dt className="text-muted-foreground">Contact</dt>
            <dd>{company?.contactPerson || "—"}</dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{company?.contactNumber || "—"}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate">{company?.email || "—"}</dd>
            <dt className="text-muted-foreground">Projects</dt>
            <dd className="tabular-nums">{company?._count.projects ?? 0}</dd>
          </dl>
          <Button variant="outline" size="sm" className="w-full text-destructive" onClick={() => setConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete company
          </Button>
        </CardSoft>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Projects</p>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/companies/${id}/projects`)}>
              View all
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(projects?.data ?? []).map((p) => (
              <div key={p.id} className="card-soft flex gap-2.5 p-2.5">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 gap-2.5 text-left"
                  onClick={() => {
                    setProject(p.id, id ?? null);
                    navigate(`/projects/${p.id}/inventory`);
                  }}
                >
                  <span className="h-14 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                    <img
                      src={resolveProjectPhotoUrl(p.photoUrl)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{p.name}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {p.location ?? "—"} · {p.totalUnits} units
                    </span>
                    <span className="mt-1 inline-block"><StatusPill status={p.status} /></span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`/projects/${p.id}/edit`)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate(`/projects/${p.id}`)}>Overview</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate(`/projects/${p.id}/units`)}>Units</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate(`/projects/${p.id}/inventory`)}>Inventory</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {!projects?.data?.length ? (
              <CardSoft className="sm:col-span-2 py-8 text-center">
                <p className="text-xs text-muted-foreground">No projects yet.</p>
                <Button size="sm" className="mt-2" onClick={() => navigate(`/companies/${id}/projects/new`)}>
                  <Plus className="h-3.5 w-3.5" /> Add project
                </Button>
              </CardSoft>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete company?</DialogTitle>
            <DialogDescription>
              Delete {company?.name}. Blocked if this company still has projects.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrap>
  );
}
