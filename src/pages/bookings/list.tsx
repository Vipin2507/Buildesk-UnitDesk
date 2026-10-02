import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownUp,
  CalendarCheck,
  CalendarRange,
  CircleDollarSign,
  Download,
  HandCoins,
  Handshake,
  Plus,
  Search,
  ShoppingBag,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CountUp } from "@/components/shared/count-up";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type ListResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, inr } from "@/lib/format";
import { EASE, prefersReducedMotion, staggerDelay } from "@/lib/motion";
import { qk } from "@/lib/query-keys";

type Booking = {
  id: string;
  bookingNumber: string;
  bookingDate: string;
  status: string;
  unit: { unitNumber: string; floor?: { wing?: { name: string } } };
  project: { name: string };
  customers: { name: string; role: string }[];
  financials: { totalCost: number; valueToBeCollected?: number; finance?: number } | null;
  channelPartner: { name: string } | null;
  toCollect: number;
  received: number;
  outstanding: number;
  collectionPct: number;
};

type Summary = {
  total: number;
  booked: number;
  confirmed: number;
  hold: number;
  totalValue: number;
  toCollect: number;
  received: number;
  outstanding: number;
  collectionPct: number;
  thisMonth: number;
  withPartner: number;
};

type KpiKey = "all" | "booked" | "confirmed" | "month" | "outstanding" | "partner" | "received";
type SortKey = "date" | "value" | "unit" | "booking";

/** Min % of value-to-collect received (booking amount ≈ 20%). */
const COLLECTED_PCT_OPTIONS = [
  { value: 20, label: "Booking % (≥20%)" },
  { value: 25, label: "≥25%" },
  { value: 50, label: "≥50%" },
  { value: 75, label: "≥75%" },
  { value: 100, label: "Fully paid" },
] as const;

function normalizeFlat(value: string) {
  return value.replace(/[\s_-]/g, "").toLowerCase();
}

function matchesFlat(unitNumber: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const unit = unitNumber.toLowerCase();
  return unit.includes(q) || normalizeFlat(unit).includes(normalizeFlat(q));
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

function MoneyKpi({
  label,
  value,
  hint,
  tone = "info",
  icon: Icon,
  active,
  delay = 0,
  onClick,
  money = true,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "info" | "success" | "warning" | "danger" | "muted";
  icon: typeof Wallet;
  active?: boolean;
  delay?: number;
  onClick?: () => void;
  money?: boolean;
}) {
  const reduced = prefersReducedMotion();
  const tones = {
    info: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/12 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  const valueClass = {
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
      <p className={cn("text-lg font-semibold tabular-nums tracking-tight", valueClass[tone])}>
        {money ? (
          <>
            ₹<CountUp value={value} />
          </>
        ) : (
          <CountUp value={value} />
        )}
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </motion.button>
  );
}

export function BookingsListPage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const reduced = prefersReducedMotion();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [flatOnly, setFlatOnly] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [kpiFocus, setKpiFocus] = useState<KpiKey>("all");
  const [hasPartner, setHasPartner] = useState(false);
  const [minCollected, setMinCollected] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 220);
    return () => window.clearTimeout(t);
  }, [search]);

  const thisMonth = kpiFocus === "month";
  const apiStatus =
    kpiFocus === "booked"
      ? "booked"
      : kpiFocus === "confirmed"
        ? "confirmed"
        : statusFilter;

  const { data: summary } = useQuery({
    queryKey: [...qk.bookings({ projectId }), "summary"],
    queryFn: () => api.get<Summary>("/api/bookings/summary", { projectId }),
  });

  const { data, isFetching } = useQuery({
    queryKey: qk.bookings({
      projectId,
      search: debouncedSearch,
      flatOnly,
      statusFilter: apiStatus,
      fromDate,
      toDate,
      thisMonth,
      hasPartner: hasPartner || kpiFocus === "partner",
      minCollected,
      sort,
      sortDir,
      kpiFocus,
    }),
    queryFn: () =>
      api.get<ListResponse<Booking>>("/api/bookings", {
        pageSize: 200,
        projectId,
        search: debouncedSearch || undefined,
        unit: flatOnly || undefined,
        status: apiStatus ?? undefined,
        from: !thisMonth && fromDate ? fromDate : undefined,
        to: !thisMonth && toDate ? toDate : undefined,
        thisMonth: thisMonth ? 1 : undefined,
        hasPartner: hasPartner || kpiFocus === "partner" ? 1 : undefined,
        minCollected: minCollected ?? undefined,
        sort: sort === "date" ? undefined : sort,
        dir: sortDir,
      }),
  });

  const rows = useMemo(() => {
    let list = [...(data?.data ?? [])];
    const q = debouncedSearch.trim();
    const flatQ = flatOnly.trim();

    if (q || flatQ) {
      list = list.filter((r) => {
        const unit = r.unit.unitNumber;
        const customer = r.customers.find((c) => c.role === "primary")?.name ?? "";
        if (flatQ && !matchesFlat(unit, flatQ)) return false;
        if (!q) return true;
        return (
          matchesFlat(unit, q) ||
          r.bookingNumber.toLowerCase().includes(q.toLowerCase()) ||
          customer.toLowerCase().includes(q.toLowerCase()) ||
          r.project.name.toLowerCase().includes(q.toLowerCase()) ||
          (r.channelPartner?.name ?? "").toLowerCase().includes(q.toLowerCase())
        );
      });
    }

    if (kpiFocus === "outstanding") {
      list = list.filter((r) => r.outstanding > 0.5);
    }
    if (kpiFocus === "received") {
      list = list.filter((r) => r.received > 0);
    }
    if (minCollected != null) {
      list = list.filter((r) => r.collectionPct + 0.05 >= minCollected);
    }

    if (sort === "value" || sort === "unit" || sort === "booking") {
      // server sorted; client reinforce for outstanding filter
    } else if (kpiFocus === "outstanding") {
      list.sort((a, b) => (b.outstanding - a.outstanding) * (sortDir === "asc" ? -1 : 1));
    }

    return list;
  }, [data?.data, debouncedSearch, flatOnly, kpiFocus, sort, sortDir, minCollected]);

  const activeFilterCount = [
    statusFilter && kpiFocus === "all" ? statusFilter : null,
    fromDate,
    toDate,
    flatOnly,
    hasPartner || kpiFocus === "partner" ? "partner" : null,
    minCollected != null ? String(minCollected) : null,
    kpiFocus !== "all" ? kpiFocus : null,
  ].filter(Boolean).length;

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setFlatOnly("");
    setStatusFilter(null);
    setFromDate("");
    setToDate("");
    setKpiFocus("all");
    setHasPartner(false);
    setMinCollected(null);
    setSort("date");
    setSortDir("desc");
  }

  function activateKpi(key: KpiKey) {
    if (kpiFocus === key) {
      setKpiFocus("all");
      setStatusFilter(null);
      setHasPartner(false);
      return;
    }
    setKpiFocus(key);
    if (key === "all") {
      setStatusFilter(null);
      setHasPartner(false);
    }
    if (key === "booked" || key === "confirmed") {
      setStatusFilter(null);
      setHasPartner(false);
    }
    if (key === "partner") {
      setHasPartner(true);
      setStatusFilter(null);
    }
    if (key === "month") {
      setFromDate("");
      setToDate("");
    }
    if (key === "outstanding" || key === "received") {
      setStatusFilter(null);
    }
  }

  function toggleSort(key: SortKey) {
    if (sort === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setSortDir(key === "unit" || key === "booking" ? "asc" : "desc");
    }
  }

  function exportCsv() {
    const header = "Booking,Date,Flat,Project,Customer,TotalCost,ToCollect,Received,Outstanding,Status,Partner";
    const body = rows
      .map((r) =>
        [
          r.bookingNumber,
          formatDate(r.bookingDate),
          r.unit.unitNumber,
          r.project.name,
          r.customers.find((c) => c.role === "primary")?.name ?? "",
          r.financials?.totalCost ?? 0,
          r.toCollect,
          r.received,
          r.outstanding,
          r.status,
          r.channelPartner?.name ?? "",
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bookings.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const newBookingPath = projectId ? `/bookings/new?projectId=${projectId}` : "/bookings/new";

  return (
    <PageWrap>
      <PageHeader
        title={projectId ? "Bookings" : "Bookings"}
        subtitle="Search by flat, booking or customer · collection against value to be collected"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button size="sm" onClick={() => navigate(newBookingPath)}>
              <Plus className="h-3.5 w-3.5" /> New booking
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MoneyKpi
          label="Total bookings"
          value={summary?.total ?? 0}
          hint="Tap to show all"
          icon={CalendarCheck}
          tone="info"
          active={kpiFocus === "all"}
          delay={staggerDelay(0)}
          money={false}
          onClick={() => activateKpi("all")}
        />
        <MoneyKpi
          label="Booking value"
          value={summary?.totalValue ?? 0}
          hint={`${summary?.confirmed ?? 0} confirmed`}
          icon={CircleDollarSign}
          tone="muted"
          delay={staggerDelay(1)}
          onClick={() => activateKpi("all")}
        />
        <MoneyKpi
          label="To collect"
          value={summary?.toCollect ?? 0}
          hint="Customer demand"
          icon={Wallet}
          tone="info"
          delay={staggerDelay(2)}
          onClick={() => activateKpi("all")}
        />
        <MoneyKpi
          label="Received"
          value={summary?.received ?? 0}
          hint={`${summary?.collectionPct ?? 0}% collected`}
          icon={HandCoins}
          tone="success"
          active={kpiFocus === "received"}
          delay={staggerDelay(3)}
          onClick={() => activateKpi("received")}
        />
        <MoneyKpi
          label="Outstanding"
          value={summary?.outstanding ?? 0}
          hint="Filter bookings with balance"
          icon={ShoppingBag}
          tone="warning"
          active={kpiFocus === "outstanding"}
          delay={staggerDelay(4)}
          onClick={() => activateKpi("outstanding")}
        />
        <MoneyKpi
          label="This month"
          value={summary?.thisMonth ?? 0}
          hint={`${summary?.withPartner ?? 0} with CP · tap MTD`}
          icon={CalendarRange}
          tone="muted"
          active={kpiFocus === "month"}
          delay={staggerDelay(5)}
          money={false}
          onClick={() => activateKpi("month")}
        />
      </div>

      <motion.div
        layout
        className="card-soft space-y-2.5 p-2.5 sm:p-3"
        transition={{ duration: 0.25, ease: EASE }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8"
              placeholder="Search flat, booking, customer, partner…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Input
            className="h-8 w-full sm:w-36"
            placeholder="Flat / unit no."
            value={flatOnly}
            onChange={(e) => setFlatOnly(e.target.value)}
          />
          <Input
            className="h-8 w-[9.5rem]"
            type="date"
            value={fromDate}
            disabled={thisMonth}
            onChange={(e) => {
              setKpiFocus("all");
              setFromDate(e.target.value);
            }}
          />
          <Input
            className="h-8 w-[9.5rem]"
            type="date"
            value={toDate}
            disabled={thisMonth}
            onChange={(e) => {
              setKpiFocus("all");
              setToDate(e.target.value);
            }}
          />
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => toggleSort(sort)}>
            <ArrowDownUp className="h-3.5 w-3.5" />
            {sort} · {sortDir}
          </Button>
          {activeFilterCount ? (
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear ({activeFilterCount})
            </Button>
          ) : null}
          {isFetching ? (
            <span className="text-[11px] text-muted-foreground">Updating…</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">{rows.length} shown</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
          {["booked", "confirmed", "hold"].map((v) => (
            <Chip
              key={v}
              active={statusFilter === v && kpiFocus === "all"}
              onClick={() => {
                setKpiFocus("all");
                setStatusFilter(statusFilter === v ? null : v);
              }}
            >
              {v}
            </Chip>
          ))}
          <Chip
            active={hasPartner || kpiFocus === "partner"}
            onClick={() => {
              setKpiFocus("all");
              setHasPartner(!hasPartner);
            }}
          >
            <span className="inline-flex items-center gap-1">
              <Handshake className="h-3 w-3" /> Channel partner
            </span>
          </Chip>
          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Collected %
          </span>
          {COLLECTED_PCT_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              active={minCollected === opt.value}
              onClick={() => setMinCollected(minCollected === opt.value ? null : opt.value)}
            >
              {opt.label}
            </Chip>
          ))}
          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sort</span>
          {(
            [
              ["date", "Date"],
              ["unit", "Flat"],
              ["booking", "Booking"],
              ["value", "Value"],
            ] as const
          ).map(([key, label]) => (
            <Chip key={key} active={sort === key} onClick={() => toggleSort(key)}>
              {label}
            </Chip>
          ))}
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${kpiFocus}-${apiStatus}-${debouncedSearch}-${flatOnly}-${sort}-${sortDir}-${hasPartner}-${minCollected}`}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          <DataTable
            rows={rows}
            onRowClick={(row) => navigate(`/bookings/${row.id}`)}
            empty={
              <EmptyState
                icon={CalendarCheck}
                title={activeFilterCount || search || flatOnly ? "No bookings match these filters." : "No bookings yet."}
                actionLabel={activeFilterCount || search || flatOnly ? "Clear filters" : "Create booking"}
                onAction={
                  activeFilterCount || search || flatOnly ? clearFilters : () => navigate(newBookingPath)
                }
              />
            }
            columns={[
              {
                key: "no",
                header: "Booking",
                cell: (r) => (
                  <span>
                    <span className="block font-medium">{r.bookingNumber}</span>
                    <span className="block text-[10px] text-muted-foreground">{formatDate(r.bookingDate)}</span>
                  </span>
                ),
              },
              {
                key: "flat",
                header: "Flat",
                cell: (r) => <span className="font-semibold tabular-nums">{r.unit.unitNumber}</span>,
              },
              {
                key: "project",
                header: "Project",
                hideOnMobile: true,
                cell: (r) => r.project.name,
              },
              {
                key: "customer",
                header: "Customer",
                cell: (r) => r.customers.find((c) => c.role === "primary")?.name ?? "—",
              },
              {
                key: "value",
                header: "Sold value",
                hideOnMobile: true,
                cell: (r) => <span className="font-semibold tabular-nums">{inr(r.financials?.totalCost)}</span>,
              },
              {
                key: "collect",
                header: "To collect",
                hideOnMobile: true,
                cell: (r) => inr(r.toCollect),
              },
              {
                key: "recv",
                header: "Received",
                hideOnMobile: true,
                cell: (r) => <span className="tabular-nums text-success font-medium">{inr(r.received)}</span>,
              },
              {
                key: "out",
                header: "Outstanding",
                hideOnMobile: true,
                cell: (r) => (
                  <span
                    className={cn(
                      "tabular-nums font-medium",
                      r.outstanding > 0 ? "text-warning" : "text-muted-foreground",
                    )}
                  >
                    {inr(r.outstanding)}
                  </span>
                ),
              },
              {
                key: "pct",
                header: "Collected",
                hideOnMobile: true,
                cell: (r) => (
                  <span className="tabular-nums font-medium">
                    {r.collectionPct}%
                  </span>
                ),
              },
              {
                key: "cp",
                header: "Partner",
                hideOnMobile: true,
                cell: (r) => r.channelPartner?.name ?? "—",
              },
              { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
            ]}
          />
        </motion.div>
      </AnimatePresence>
    </PageWrap>
  );
}
