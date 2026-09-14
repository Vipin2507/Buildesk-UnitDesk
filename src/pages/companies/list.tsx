import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MoreHorizontal, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
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
import { qk } from "@/lib/query-keys";

type Company = {
  id: string;
  name: string;
  code: string;
  city: string | null;
  status: string;
  logoUrl: string | null;
  _count: { projects: number };
};

export function CompaniesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<Company | null>(null);
  const { data } = useQuery({
    queryKey: [...qk.companies, search],
    queryFn: () => api.get<ListResponse<Company>>("/api/companies", { search, pageSize: 50 }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/companies/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.companies });
      toast.success("Company deleted");
      setConfirm(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete"),
  });

  return (
    <PageWrap>
      <PageHeader
        title="Companies"
        subtitle="Developer entities that own projects"
        actions={
          <Button size="sm" onClick={() => navigate("/companies/new")}>
            <Plus className="h-3.5 w-3.5" /> Add company
          </Button>
        }
      />
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="Search companies" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-[11px] text-muted-foreground">{data?.total ?? 0} results</span>
      </div>
      <DataTable
        rows={data?.data ?? []}
        onRowClick={(row) => navigate(`/companies/${row.id}`)}
        empty={<EmptyState icon={Building2} title="No companies yet." actionLabel="Add company" onAction={() => navigate("/companies/new")} />}
        columns={[
          {
            key: "name",
            header: "Company",
            cell: (r) => (
              <span className="flex items-center gap-2">
                <span className="h-8 w-8 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {r.logoUrl ? <img src={r.logoUrl} alt="" className="h-full w-full object-cover" /> : <Building2 className="m-1.5 h-5 w-5 text-muted-foreground" />}
                </span>
                <span className="font-medium">{r.name}</span>
              </span>
            ),
          },
          { key: "code", header: "Code", cell: (r) => r.code },
          { key: "city", header: "City", cell: (r) => r.city ?? "—" },
          { key: "projects", header: "Projects", cell: (r) => r._count.projects },
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
                  <DropdownMenuItem onClick={() => navigate(`/companies/${r.id}`)}>View</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/companies/${r.id}/edit`)}>Edit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/companies/${r.id}/projects`)}>View projects</DropdownMenuItem>
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
            <DialogTitle>Delete company?</DialogTitle>
            <DialogDescription>
              Delete {confirm?.name}. This is blocked if the company still has projects.
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
