import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  Building2,
  ChevronRight,
  CircleDollarSign,
  CircleDot,
  Download,
  HandCoins,
  LayoutGrid,
  Lock,
  Plus,
  Search,
  ShoppingBag,
  Square,
  Table2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Crossfade } from "@/components/shared/crossfade";
import { InventoryGrid, type GridFloor, type GridUnit } from "@/components/shared/inventory-grid";
import { ImageUpload } from "@/components/shared/image-upload";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { StatusPill } from "@/components/shared/status-pill";
import { DataTable } from "@/components/shared/data-table";
import { UnitDetailPanel } from "@/components/shared/unit-detail-panel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { UNIT_DOC_UPLOAD_ACTIONS, useUnitBulkUpload } from "@/hooks/use-unit-bulk-upload";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, inr, pct } from "@/lib/format";
import { useMediaQuery } from "@/lib/media";
import { EASE, prefersReducedMotion, staggerDelay } from "@/lib/motion";
import { DEFAULT_PROJECT_PHOTO } from "@/lib/project-photo";
import { qk } from "@/lib/query-keys";
import { statusDotClass } from "@/lib/status";
import { useDrilldownSheetStore } from "@/stores/drilldown";
import { type FinanceFocus, useInventoryFilterStore } from "@/stores/inventory-filters";
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
  finance: {
    totalValue: number;
    totalSold: number;
    totalRemaining: number;
    totalReceived: number;
    totalToCollect: number;
    totalOutstanding: number;
    bookedUnits: number;
    collectionPct: number;
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
    soldValue?: number;
    received?: number;
    remainingValue?: number;
  }[];
  floors: GridFloor[];
};

type ListRow = GridUnit & {
  floor: number;
  wing: string;
};

const STATUS_LEGEND = [
  ["available", "Available"],
  ["booked", "Booked"],
  ["sold", "Sold"],
  ["hold", "Hold"],
  ["blocked", "Blocked"],
  ["not_available", "Not released"],
] as const;

function normalizeFlat(value: string) {
  return value.replace(/[\s_-]/g, "").toLowerCase();
}

function matchesSearch(unitNumber: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return unitNumber.toLowerCase().includes(q) || normalizeFlat(unitNumber).includes(normalizeFlat(q));
}

function matchesFinance(unit: GridUnit, focus: FinanceFocus) {
  if (!focus || focus === "value") return true;
  if (focus === "sold") return unit.status === "sold" || unit.status === "booked";
  if (focus === "remaining") return unit.status === "available" || unit.status === "hold";
  if (focus === "received") return (unit.booking?.received ?? 0) > 0;
  if (focus === "outstanding") return (unit.booking?.outstanding ?? 0) > 0.5;
  return true;
}

function FinanceMoneyCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "info",
  active,
  delay = 0,
  onClick,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: typeof Wallet;
  tone?: "info" | "success" | "warning" | "danger" | "muted";
  active?: boolean;
  delay?: number;
  onClick?: () => void;
}) {
  const reduced = prefersReducedMotion();
  const tones = {
    info: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/12 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  const valueTone = {
    info: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    muted: "text-foreground",
  };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={!reduced ? { y: -2 } : undefined}
      whileTap={!reduced ? { scale: 0.985 } : undefined}
      transition={{ delay, duration: 0.35, ease: EASE }}
      className={cn(
        "card-soft flex h-full min-w-0 flex-col gap-1.5 p-3 text-left transition-[box-shadow,ring] duration-300",
        active ? "ring-2 ring-primary/40 shadow-sm" : "hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", tones[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className={cn("text-lg font-semibold tabular-nums tracking-tight", valueTone[tone])}>
        {inr(value, true)}
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </motion.button>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors duration-200",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted/50",
      )}
    >
      {children}
    </button>
  );
}

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
  const bulkUpload = useUnitBulkUpload(id);
  const [searchLocal, setSearchLocal] = useState(filters.search);

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

  useEffect(() => {
    const t = window.setTimeout(() => filters.setSearch(searchLocal), 200);
    return () => window.clearTimeout(t);
  }, [searchLocal]); // eslint-disable-line react-hooks/exhaustive-deps

  const unitTypes = useMemo(() => {
    const set = new Set<string>();
    for (const floor of data?.floors ?? []) {
      for (const u of floor.units) {
        if (u.unitType) set.add(u.unitType);
      }
    }
    return [...set].sort();
  }, [data?.floors]);

  function unitPasses(unit: GridUnit, floorNumber?: number) {
    if (filters.status && unit.status !== filters.status) return false;
    if (filters.wing && unit.wingId !== filters.wing) return false;
    if (filters.unitType && unit.unitType !== filters.unitType) return false;
    if (filters.floor != null && floorNumber != null && floorNumber !== filters.floor) return false;
    if (!matchesSearch(unit.unitNumber, filters.search)) return false;
    if (!matchesFinance(unit, filters.financeFocus)) return false;
    return true;
  }

  const listRows = useMemo<ListRow[]>(() => {
    const rows = (data?.floors ?? []).flatMap((floor) =>
      floor.units.map((unit) => ({
        ...unit,
        floor: floor.number,
        wing: unit.wingName ?? "",
      })),
    );
    return rows.filter((row) => unitPasses(row, row.floor));
  }, [data?.floors, filters.status, filters.wing, filters.unitType, filters.floor, filters.search, filters.financeFocus]);

  const neighborIds = useMemo(() => {
    const ids: string[] = [];
    for (const floor of data?.floors ?? []) {
      for (const unit of floor.units) {
        if (!unitPasses(unit, floor.number)) continue;
        ids.push(unit.id);
      }
    }
    return ids;
  }, [data?.floors, filters.status, filters.wing, filters.unitType, filters.floor, filters.search, filters.financeFocus]);

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
  const f = data?.finance;
  const soldPct = k ? pct(k.sold + k.booked, k.total) : "0%";
  const showTable = filters.view === "list" || filters.layout === "table";
  const gridVariant = filters.view === "wing" ? "wing" : filters.view === "floor" ? "floor" : "unit";

  const activeFilterCount = [
    filters.status,
    filters.wing,
    filters.unitType,
    filters.floor != null ? String(filters.floor) : null,
    filters.search.trim() || null,
    filters.financeFocus,
  ].filter(Boolean).length;

  function activateFinance(focus: FinanceFocus) {
    if (filters.financeFocus === focus) {
      filters.setFinanceFocus(null);
      return;
    }
    filters.setFinanceFocus(focus);
    if (focus === "sold" || focus === "received" || focus === "outstanding") {
      filters.setView("list");
      filters.setLayout("table");
    }
  }

  function clearFilters() {
    filters.reset();
    setSearchLocal("");
  }

  function selectUnit(unitId: string) {
    openSheet("unit", unitId, { docked: true, neighborIds });
    if (!isLg) {
      requestAnimationFrame(() => {
        panelRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      });
    }
  }

  const dimIf = useMemo(() => {
    if (!filters.financeFocus || filters.financeFocus === "value") return null;
    return (unit: GridUnit) => !matchesFinance(unit, filters.financeFocus);
  }, [filters.financeFocus]);

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
        subtitle="Wing-wise unit map · finance snapshot · click a cell for details"
        breadcrumbs={[
          { label: "Companies", to: "/companies" },
          { label: data?.project.company.name ?? "Company", to: data ? `/companies/${data.project.company.id}/projects` : "/companies" },
          { label: data?.project.name ?? "Project" },
        ]}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!selectedId || bulkUpload.uploading}>
                  <Upload className="h-3.5 w-3.5" />
                  {bulkUpload.uploading ? "Uploading…" : "Bulk upload"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {UNIT_DOC_UPLOAD_ACTIONS.map((action) => (
                  <DropdownMenuItem
                    key={action.category}
                    disabled={!selectedId || bulkUpload.uploading}
                    onClick={() => selectedId && bulkUpload.start(selectedId, action.category)}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
      {bulkUpload.fileInput}

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
        <KpiCard label="Total" value={k?.total ?? 0} icon={Square} onClick={() => { filters.setStatus(null); filters.setFinanceFocus(null); }} active={!filters.status && !filters.financeFocus} />
        <KpiCard label="Available" value={k?.available ?? 0} icon={CircleDot} tone="success" suffix={k ? pct(k.available, k.total) : undefined} onClick={() => filters.setStatus(filters.status === "available" ? null : "available")} active={filters.status === "available"} />
        <KpiCard label="Sold" value={k?.sold ?? 0} icon={ShoppingBag} tone="danger" suffix={k ? pct(k.sold, k.total) : undefined} onClick={() => filters.setStatus(filters.status === "sold" ? null : "sold")} active={filters.status === "sold"} />
        <KpiCard label="Hold" value={k?.hold ?? 0} icon={Lock} tone="warning" suffix={k ? pct(k.hold, k.total) : undefined} onClick={() => filters.setStatus(filters.status === "hold" ? null : "hold")} active={filters.status === "hold"} />
        <KpiCard label="Blocked" value={k?.blocked ?? 0} icon={Ban} tone="info" suffix={k ? pct(k.blocked, k.total) : undefined} onClick={() => filters.setStatus(filters.status === "blocked" ? null : "blocked")} active={filters.status === "blocked"} />
      </div>

      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <FinanceMoneyCard
          label="Total value"
          value={f?.totalValue ?? 0}
          hint="Sold booking cost + list price stock"
          icon={CircleDollarSign}
          tone="info"
          active={filters.financeFocus === "value"}
          delay={staggerDelay(0)}
          onClick={() => activateFinance("value")}
        />
        <FinanceMoneyCard
          label="Total sold"
          value={f?.totalSold ?? 0}
          hint={`${f?.bookedUnits ?? 0} booked / sold units`}
          icon={ShoppingBag}
          tone="danger"
          active={filters.financeFocus === "sold"}
          delay={staggerDelay(1)}
          onClick={() => activateFinance("sold")}
        />
        <FinanceMoneyCard
          label="Total remaining"
          value={f?.totalRemaining ?? 0}
          hint="Available + hold list price"
          icon={Wallet}
          tone="muted"
          active={filters.financeFocus === "remaining"}
          delay={staggerDelay(2)}
          onClick={() => activateFinance("remaining")}
        />
        <FinanceMoneyCard
          label="Received"
          value={f?.totalReceived ?? 0}
          hint={`${f?.collectionPct ?? 0}% of value to collect`}
          icon={HandCoins}
          tone="success"
          active={filters.financeFocus === "received"}
          delay={staggerDelay(3)}
          onClick={() => activateFinance("received")}
        />
        <FinanceMoneyCard
          label="Outstanding"
          value={f?.totalOutstanding ?? 0}
          hint={`${inr(f?.totalToCollect ?? 0, true)} to collect`}
          icon={Wallet}
          tone="warning"
          active={filters.financeFocus === "outstanding"}
          delay={staggerDelay(4)}
          onClick={() => activateFinance("outstanding")}
        />
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
          <p className="mt-2 text-[10px] text-muted-foreground">
            {soldPct} sold · {inr(f?.totalSold ?? 0, true)}
          </p>
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
                <p className="text-[10px] text-muted-foreground">
                  {wing.total} units · {inr(wing.soldValue ?? 0, true)} sold
                </p>
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

      <motion.div
        layout
        className="card-soft space-y-2 p-2.5 sm:p-3"
        transition={{ duration: 0.25, ease: EASE }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8"
              placeholder="Search flat / unit no…"
              value={searchLocal}
              onChange={(e) => setSearchLocal(e.target.value)}
            />
          </div>
          {unitTypes.map((t) => (
            <Chip
              key={t}
              active={filters.unitType === t}
              onClick={() => filters.setUnitType(filters.unitType === t ? null : t)}
            >
              {t}
            </Chip>
          ))}
          {(["available", "booked", "sold", "hold"] as const).map((st) => (
            <Chip
              key={st}
              active={filters.status === st}
              onClick={() => filters.setStatus(filters.status === st ? null : st)}
            >
              {st}
            </Chip>
          ))}
          {activeFilterCount ? (
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear ({activeFilterCount})
            </Button>
          ) : null}
          <span className="text-[11px] text-muted-foreground">{listRows.length} units</span>
        </div>
      </motion.div>

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
          <AnimatePresence mode="wait">
            <motion.div
              key={`${filters.view}-${filters.layout}-${filters.financeFocus}-${filters.status}-${filters.search}`}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <Crossfade id={showTable ? "list" : gridVariant}>
                {showTable ? (
                  <DataTable
                    rows={listRows}
                    selectedId={selectedId}
                    onRowClick={(row) => selectUnit(row.id)}
                    columns={[
                      { key: "no", header: "Unit no.", cell: (r) => <span className="font-medium tabular-nums">{r.unitNumber}</span> },
                      { key: "wing", header: "Wing", cell: (r) => r.wing || "—" },
                      { key: "floor", header: "Floor", cell: (r) => r.floor },
                      { key: "type", header: "Type", cell: (r) => r.unitType ?? "—" },
                      { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
                      {
                        key: "customer",
                        header: "Customer",
                        hideOnMobile: true,
                        cell: (r) => r.booking?.customerName ?? "—",
                      },
                      {
                        key: "sold",
                        header: "Sold value",
                        hideOnMobile: true,
                        cell: (r) =>
                          r.booking?.soldValue
                            ? <span className="font-semibold tabular-nums">{inr(r.booking.soldValue)}</span>
                            : <span className="text-muted-foreground">{inr(r.listPrice ?? r.basePrice)}</span>,
                      },
                      {
                        key: "bdate",
                        header: "Booking date",
                        hideOnMobile: true,
                        cell: (r) => formatDate(r.booking?.bookingDate),
                      },
                      {
                        key: "recv",
                        header: "Received",
                        hideOnMobile: true,
                        cell: (r) =>
                          r.booking ? (
                            <span className="tabular-nums text-success font-medium">{inr(r.booking.received)}</span>
                          ) : (
                            "—"
                          ),
                      },
                      {
                        key: "out",
                        header: "Outstanding",
                        hideOnMobile: true,
                        cell: (r) =>
                          r.booking ? (
                            <span className={cn("tabular-nums font-medium", r.booking.outstanding > 0 ? "text-warning" : "text-muted-foreground")}>
                              {inr(r.booking.outstanding)}
                            </span>
                          ) : (
                            "—"
                          ),
                      },
                      {
                        key: "upload",
                        header: "",
                        hideOnMobile: true,
                        cell: (r) => (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={bulkUpload.uploading}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Upload className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              {UNIT_DOC_UPLOAD_ACTIONS.map((action) => (
                                <DropdownMenuItem
                                  key={action.category}
                                  disabled={bulkUpload.uploading}
                                  onClick={() => bulkUpload.start(r.id, action.category)}
                                >
                                  {action.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ),
                      },
                    ]}
                  />
                ) : (
                  <InventoryGrid
                    floors={data?.floors ?? []}
                    variant={gridVariant}
                    dimStatus={filters.financeFocus ? null : filters.status}
                    dimWingId={filters.wing}
                    dimIf={dimIf}
                    selectedId={selectedId}
                    onSelect={selectUnit}
                  />
                )}
              </Crossfade>
            </motion.div>
          </AnimatePresence>
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
