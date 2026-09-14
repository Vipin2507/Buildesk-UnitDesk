import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building, MoreHorizontal, Plus, Search } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
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
import { Input } from "@/components/ui/input";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { resolveProjectPhotoUrl } from "@/lib/project-photo";
import { qk } from "@/lib/query-keys";
import { useProjectContextStore } from "@/stores/project-context";
import { useState } from "react";
import { toast } from "sonner";

type Project = {
  id: string;
  name: string;
  code: string;
  location: string | null;
  totalUnits: number;
  status: string;
  photoUrl: string | null;
};

type Company = { id: string; name: string };

export function ProjectsListPage() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setProject = useProjectContextStore((s) => s.setProject);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<Project | null>(null);

  const { data: company } = useQuery({
    queryKey: companyId ? qk.company(companyId) : ["no-co"],
    queryFn: () => api.get<Company>(`/api/companies/${companyId}`),
    enabled: Boolean(companyId),
  });

  const { data } = useQuery({
    queryKey: qk.projects(companyId),
    queryFn: () =>
      companyId
        ? api.get<ListResponse<Project>>(`/api/companies/${companyId}/projects`, { pageSize: 50 })
        : api.get<ListResponse<Project>>("/api/projects", { pageSize: 50 }),
  });

  const rows = (data?.data ?? []).filter((p) =>
    search ? p.name.toLowerCase().includes(search.toLowerCase()) : true,
  );

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
      setConfirm(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete"),
  });

  return (
    <PageWrap>
      <PageHeader
        title={company ? company.name : "Projects"}
        subtitle="Projects under this company"
        breadcrumbs={companyId ? [{ label: "Companies", to: "/companies" }, { label: company?.name ?? "…" }] : undefined}
        actions={
          <Button
            size="sm"
            onClick={() => navigate(companyId ? `/companies/${companyId}/projects/new` : "/projects/new")}
          >
            <Plus className="h-3.5 w-3.5" /> Add project
          </Button>
        }
      />
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="Search projects" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-[11px] text-muted-foreground">{rows.length} results</span>
      </div>
      <DataTable
        rows={rows}
        onRowClick={(row) => {
          setProject(row.id, companyId ?? null);
          navigate(`/projects/${row.id}/inventory`);
        }}
        empty={
          <EmptyState
            icon={Building}
            title="No projects yet."
            actionLabel="Add project"
            onAction={() => navigate(companyId ? `/companies/${companyId}/projects/new` : "/projects/new")}
          />
        }
        columns={[
          {
            key: "name",
            header: "Project",
            cell: (r) => (
              <span className="flex items-center gap-2">
                <span className="h-9 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                  <img
                    src={resolveProjectPhotoUrl(r.photoUrl)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="font-medium">{r.name}</span>
              </span>
            ),
          },
          { key: "code", header: "Code", cell: (r) => r.code },
          { key: "location", header: "Location", cell: (r) => r.location ?? "—" },
          { key: "units", header: "Total units", cell: (r) => r.totalUnits },
          { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          {
            key: "actions",
            header: "",
            hideOnMobile: true,
            cell: (r) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onClick={() => navigate(`/projects/${r.id}/edit`)}>Edit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/projects/${r.id}`)}>Overview</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/projects/${r.id}/units`)}>Units</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => setConfirm(r)}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          },
        ]}
      />
      <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              Delete {confirm?.name} and its inventory. Blocked if any units still have active bookings.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => confirm && remove.mutate(confirm.id)}>
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrap>
  );
}
