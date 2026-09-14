import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Ban, Building2, ChevronRight, CircleDot, Download, LayoutGrid, Lock, Plus, ShoppingBag, Square, Table2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Crossfade } from "@/components/shared/crossfade";
import { InventoryGrid, type GridFloor } from "@/components/shared/inventory-grid";
import { ImageUpload } from "@/components/shared/image-upload";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { StatusPill } from "@/components/shared/status-pill";
import { DataTable } from "@/components/shared/data-table";
import { UnitDetailPanel } from "@/components/shared/unit-detail-panel";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { formatDate, pct } from "@/lib/format";
import { useMediaQuery } from "@/lib/media";
import { DEFAULT_PROJECT_PHOTO } from "@/lib/project-photo";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/cn";
import { EASE, prefersReducedMotion, staggerDelay } from "@/lib/motion";
import { statusDotClass } from "@/lib/status";
import { useDrilldownSheetStore } from "@/stores/drilldown";
import { useInventoryFilterStore } from "@/stores/inventory-filters";
import { useProjectContextStore } from "@/stores/project-context";

type InventoryPayload = {
  project: {
    id: string;
    name: string;
    location: string | null;
    reraNumber: string | null;
    launchDate: string | null;
    expectedCompletion: string | null;
    status: string;
    photoUrl: string | null;
    company: { id: string; name: string };
  };
  kpis: {
    total: number;
    available: number;
    sold: number;
    hold: number;
    blocked: number;
    booked: number;
  };
  wings: {
    id: string;
    name: string;
    total: number;
    available: number;
    sold: number;
    booked: number;
    hold: number;
    blocked: number;
    pctSold: number;
  }[];
  floors: GridFloor[];
};

type ListRow = {
  id: string;
  unitNumber: string;
  unitType: string | null;
  status: string;
  floor: number;
  wing: string;
  wingId?: string;
};

const STATUS_LEGEND = [
  ["available", "Available"],
  ["booked", "Booked"],
  ["sold", "Sold"],
  ["hold", "Hold"],
  ["blocked", "Blocked"],
  ["not_available", "Not released"],
] as const;

export function InventoryViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const openSheet = useDrilldownSheetStore((s) => s.open);
  const closeSheet = useDrilldownSheetStore((s) => s.close);
  const selectedId = useDrilldownSheetStore((s) => (s.entity === "unit" ? s.id : null));
  const setProject = useProjectContextStore((s) => s.setProject);
  const filters = useInventoryFilterStore();
  const reduced = prefersReducedMotion();
  const isLg = useMediaQuery("(min-width: 1024px)");
  const panelRef = useRef<HTMLElement>(null);

  const { data } = useQuery({
    queryKey: qk.inventory(id!),
    queryFn: () => api.get<InventoryPayload>(`/api/projects/${id}/inventory`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (data?.project) setProject(data.project.id, data.project.company.id);
  }, [data, setProject]);

  useEffect(() => {
    return () => {
      const state = useDrilldownSheetStore.getState();
      if (state.docked) state.close();
    };
  }, []);

  const listRows = useMemo<ListRow[]>(() => {
    const rows = (data?.floors ?? []).flatMap((floor) =>
      floor.units.map((unit) => ({
        id: unit.id,
        unitNumber: unit.unitNumber,
        unitType: unit.unitType ?? null,
        status: unit.status,
        floor: floor.number,
        wing: unit.wingName ?? "",
        wingId: unit.wingId,
      })),
    );
    return rows.filter((row) => {
      if (filters.status && row.status !== filters.status) return false;
      if (filters.wing && row.wingId !== filters.wing) return false;
      if (filters.unitType && row.unitType !== filters.unitType) return false;
      return true;
    });
  }, [data?.floors, filters.status, filters.wing, filters.unitType]);

  const neighborIds = useMemo(() => {
    const ids: string[] = [];
    for (const floor of data?.floors ?? []) {
      for (const unit of floor.units) {
        if (filters.status && unit.status !== filters.status) continue;
        if (filters.wing && unit.wingId !== filters.wing) continue;
        if (filters.unitType && unit.unitType !== filters.unitType) continue;
        ids.push(unit.id);
      }
    }
    return ids;
  }, [data?.floors, filters.status, filters.wing, filters.unitType]);

  useEffect(() => {
    useDrilldownSheetStore.setState({ neighborIds });
  }, [neighborIds]);

  useEffect(() => {
    if (!neighborIds.length) return;
    const state = useDrilldownSheetStore.getState();
    if (state.entity === "unit" && state.id) return;
    openSheet("unit", neighborIds[0], { docked: true, neighborIds });
  }, [neighborIds, openSheet]);

  const k = data?.kpis;
  const soldPct = k ? pct(k.sold + k.booked, k.total) : "0%";
  const showTable = filters.view === "list" || filters.layout === "table";
  const gridVariant = filters.view === "wing" ? "wing" : filters.view === "floor" ? "floor" : "unit";

  function selectUnit(unitId: string) {
    openSheet("unit", unitId, { docked: true, neighborIds });
    if (!isLg) {
      requestAnimationFrame(() => {
        panelRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      });
    }
  }

  const setProjectPhoto = useMutation({
    mutationFn: (photoUrl: string | null) => api.patch(`/api/projects/${id}`, { photoUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.inventory(id!) });
      qc.invalidateQueries({ queryKey: qk.project(id!) });
      toast.success("Project photo updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update photo"),
  });

  return (
    <PageWrap>
      <PageHeader
        title={data?.project.name ?? "Inventory"}
        subtitle="Wing-wise unit map · click a cell for details"
        breadcrumbs={[
          { label: "Companies", to: "/companies" },
          { label: data?.project.company.name ?? "Company", to: data ? `/companies/${data.project.company.id}/projects` : "/companies" },
          { label: data?.project.name ?? "Project" },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/edit`)}>
              Edit project
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/units`)}>
              <Download className="h-3.5 w-3.5" /> Units
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/units/new`)}>
              <Plus className="h-3.5 w-3.5" /> Add unit
            </Button>
            <Button size="sm" onClick={() => navigate(`/bookings/new?projectId=${id}`)}>
              Create booking
            </Button>
          </>
        }
      />

      <CardSoft className="flex flex-col gap-3 md:flex-row md:items-stretch">
        <div className="w-full shrink-0 md:w-56">
          <ImageUpload
            compact
            variant="cover"
            className="h-full [&_>div]:h-28 md:[&_>div]:h-full md:[&_>div]:min-h-[7.5rem]"
            hint=""
            value={data?.project.photoUrl}
            fallback={DEFAULT_PROJECT_PHOTO}
            onChange={(url) => setProjectPhoto.mutate(url)}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">{data?.project.name}</h2>
            {data ? <StatusPill status={data.project.status} /> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {data?.project.location} · RERA {data?.project.reraNumber ?? "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Launch {formatDate(data?.project.launchDate)} · Possession {formatDate(data?.project.expectedCompletion)}
          </p>
        </div>
        <div className="w-full md:max-w-xs">
          <div className="mb-1 flex justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Sales progress</span>
            <span className="tabular-nums text-foreground">{soldPct}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: soldPct }}
              transition={{ duration: 0.45, ease: EASE }}
            />
          </div>
        </div>
      </CardSoft>

      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Total" value={k?.total ?? 0} icon={Square} onClick={() => filters.setStatus(null)} active={!filters.status} />
          <KpiCard label="Available" value={k?.available ?? 0} icon={CircleDot} tone="success" suffix={k ? pct(k.available, k.total) : undefined} onClick={() => filters.setStatus(filters.status === "available" ? null : "available")} active={filters.status === "available"} />
          <KpiCard label="Sold" value={k?.sold ?? 0} icon={ShoppingBag} tone="danger" suffix={k ? pct(k.sold, k.total) : undefined} onClick={() => filters.setStatus(filters.status === "sold" ? null : "sold")} active={filters.status === "sold"} />
          <KpiCard label="Hold" value={k?.hold ?? 0} icon={Lock} tone="warning" suffix={k ? pct(k.hold, k.total) : undefined} onClick={() => filters.setStatus(filters.status === "hold" ? null : "hold")} active={filters.status === "hold"} />
          <KpiCard label="Blocked" value={k?.blocked ?? 0} icon={Ban} tone="info" suffix={k ? pct(k.blocked, k.total) : undefined} onClick={() => filters.setStatus(filters.status === "blocked" ? null : "blocked")} active={filters.status === "blocked"} />
        </div>

      <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(11.5rem,1fr))] gap-2">
          <button
            type="button"
            onClick={() => filters.setWing(null)}
            className={cn(
              "card-soft group flex min-w-0 flex-col p-2.5 text-left transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5",
              !filters.wing && "ring-2 ring-primary/40",
            )}
          >
            <div className="flex items-start gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary">
                <Building2 className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">All wings</p>
                <p className="text-[10px] text-muted-foreground">{k?.total ?? 0} units</p>
              </div>
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">{soldPct} sold</p>
          </button>
          {(data?.wings ?? []).map((wing, i) => (
            <motion.div
              key={wing.id}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: staggerDelay(i), duration: 0.3, ease: EASE }}
              className={cn(
                "card-soft group flex min-w-0 flex-col p-2.5 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5",
                filters.wing === wing.id && "ring-2 ring-primary/40",
              )}
            >
              <button
                type="button"
                onClick={() => filters.setWing(filters.wing === wing.id ? null : wing.id)}
                className="flex w-full items-start gap-2 text-left"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary">
                  <Building2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-sm font-semibold">Wing {wing.name}</p>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{wing.pctSold}%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{wing.total} units</p>
                </div>
                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
              </button>
              <div className="mt-2 flex flex-wrap gap-1">
                {(
                  [
                    { key: "available" as const, count: wing.available, icon: CircleDot, className: "border-success/25 bg-success/10 text-success hover:bg-success/18" },
                    { key: "sold" as const, count: wing.sold, icon: ShoppingBag, className: "border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/18" },
                    { key: "hold" as const, count: wing.hold, icon: Lock, className: "border-warning/30 bg-warning/15 text-warning-foreground hover:bg-warning/25" },
                    { key: "blocked" as const, count: wing.blocked, icon: Ban, className: "border-primary/25 bg-primary/10 text-primary hover:bg-primary/16" },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = filters.wing === wing.id && filters.status === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      title={`${item.key} · filter`}
                      onClick={() => {
                        filters.setWing(wing.id);
                        filters.setStatus(filters.status === item.key && filters.wing === wing.id ? null : item.key);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors",
                        item.className,
                        active && "ring-2 ring-primary/35",
                      )}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {item.count}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>

      <SegmentedTabs
        tabs={[
          { id: "unit", label: "Unit View" },
          { id: "wing", label: "Wing View" },
          { id: "floor", label: "Floor View" },
          { id: "list", label: "List View" },
        ]}
        value={filters.view}
        onChange={filters.setView}
      />

      <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-start">
        <CardSoft className="min-w-0 flex-1 overflow-hidden" padded>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-lg border bg-muted/30 p-0.5">
              {([
                { id: "grid" as const, icon: LayoutGrid },
                { id: "table" as const, icon: Table2 },
              ]).map((item) => {
                const active = filters.layout === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => filters.setLayout(item.id)}
                    className={cn(
                      "relative rounded-md px-2 py-1 transition-colors duration-200",
                      active ? "text-foreground" : "text-muted-foreground",
                      reduced && active && "bg-card shadow-sm",
                    )}
                  >
                    {active && !reduced ? (
                      <motion.span
                        layoutId="inventory-layout-pill"
                        className="absolute inset-0 rounded-md bg-card shadow-sm"
                        transition={{ duration: 0.28, ease: EASE }}
                      />
                    ) : null}
                    <Icon className="relative z-10 h-3.5 w-3.5" />
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {STATUS_LEGEND.map(([status, label]) => (
                <span key={status} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <i className={cn("h-1.5 w-1.5 rounded-full", statusDotClass[status])} />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <Crossfade id={showTable ? "list" : gridVariant}>
            {showTable ? (
              <DataTable
                rows={listRows}
                selectedId={selectedId}
                onRowClick={(row) => selectUnit(row.id)}
                columns={[
                  { key: "no", header: "Unit no.", cell: (r) => <span className="font-medium">{r.unitNumber}</span> },
                  { key: "wing", header: "Wing", cell: (r) => r.wing || "—" },
                  { key: "floor", header: "Floor", cell: (r) => r.floor },
                  { key: "type", header: "Type", cell: (r) => r.unitType ?? "—" },
                  { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
                ]}
              />
            ) : (
              <InventoryGrid
                floors={data?.floors ?? []}
                variant={gridVariant}
                dimStatus={filters.status}
                dimWingId={filters.wing}
                selectedId={selectedId}
                onSelect={selectUnit}
              />
            )}
          </Crossfade>
        </CardSoft>

        <aside ref={panelRef} className="w-full shrink-0 lg:w-[22.5rem]">
          <div className="lg:sticky lg:top-[4.25rem]">
            <UnitDetailPanel unitId={selectedId} neighborIds={neighborIds} variant="docked" onClose={closeSheet} />
          </div>
        </aside>
      </div>
    </PageWrap>
  );
}
