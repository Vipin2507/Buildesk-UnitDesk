import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, MoreHorizontal, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { resolveUnitPhotoUrl, projectPlansFrom } from "@/lib/unit-plans";
import { useDrilldownSheetStore } from "@/stores/drilldown";
import { useInventoryFilterStore } from "@/stores/inventory-filters";
import { LayoutGrid } from "lucide-react";

type UnitRow = {
  id: string;
  unitNumber: string;
  unitType: string | null;
  carpetArea: number | null;
  photoUrl: string | null;
  status: string;
  floor: { number: number; wing: { name: string } };
};

export function UnitMasterPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const openSheet = useDrilldownSheetStore((s) => s.open);
  const filters = useInventoryFilterStore();
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<UnitRow | null>(null);

  const { data: project } = useQuery({
    queryKey: qk.project(id!),
    queryFn: () =>
      api.get<{
        plan1bhkUrl: string | null;
        plan2bhkUrl: string | null;
        plan3bhkUrl: string | null;
      }>(`/api/projects/${id}`),
    enabled: Boolean(id),
  });

  const { data } = useQuery({
    queryKey: qk.units(id!, { search, status: filters.status, wing: filters.wing }),
    queryFn: () =>
      api.get<ListResponse<UnitRow>>(`/api/projects/${id}/units`, {
        search,
        status: filters.status ?? undefined,
        pageSize: 100,
      }),
    enabled: Boolean(id),
  });

  const plans = projectPlansFrom(project);
  const remove = useMutation({
    mutationFn: (unitId: string) => api.del(`/api/units/${unitId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Unit deleted");
      setConfirm(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete"),
  });

  function exportCsv() {
    const rows = data?.data ?? [];
    const header = "Unit,Wing,Floor,Type,Carpet,Status";
    const body = rows
      .map((r) => [r.unitNumber, r.floor.wing.name, r.floor.number, r.unitType, r.carpetArea, r.status].join(","))
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "units.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageWrap>
      <PageHeader
        title="Unit master"
        subtitle="Create, edit and photograph individual units"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/inventory`)}>
              Grid view
            </Button>
            <Button size="sm" onClick={() => navigate(`/projects/${id}/units/new`)}>
              <Plus className="h-3.5 w-3.5" /> Add unit
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="Search unit no." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {["available", "hold", "booked", "sold", "blocked"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => filters.setStatus(filters.status === s ? null : s)}
            className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${filters.status === s ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
        <span className="text-[11px] text-muted-foreground">{data?.total ?? 0} results</span>
      </div>
      <DataTable
        rows={data?.data ?? []}
        onRowClick={(row) => openSheet("unit", row.id)}
        empty={
          <EmptyState
            icon={LayoutGrid}
            title="No units yet."
            actionLabel="Add unit"
            onAction={() => navigate(`/projects/${id}/units/new`)}
          />
        }
        columns={[
          {
            key: "no",
            header: "Unit no.",
            cell: (r) => (
              <span className="flex items-center gap-2">
                <span className="h-8 w-8 shrink-0 overflow-hidden rounded-md border bg-muted">
                  <img
                    src={resolveUnitPhotoUrl(r.photoUrl, r.unitType, null, plans)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="font-medium">{r.unitNumber}</span>
              </span>
            ),
          },
          { key: "wing", header: "Wing", cell: (r) => r.floor.wing.name },
          { key: "floor", header: "Floor", cell: (r) => r.floor.number },
          { key: "type", header: "Type", cell: (r) => r.unitType ?? "—" },
          { key: "carpet", header: "Carpet area", cell: (r) => r.carpetArea ?? "—" },
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
                  <DropdownMenuItem onClick={() => navigate(`/projects/${id}/units/${r.id}/edit`)}>Edit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openSheet("unit", r.id)}>Quick view</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/projects/${id}/units/new`)}>Add another unit</DropdownMenuItem>
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
            <DialogTitle>Delete unit?</DialogTitle>
            <DialogDescription>
              Delete {confirm?.unitNumber}. Blocked if this unit has an active booking.
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
