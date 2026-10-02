import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownUp,
  CalendarRange,
  CircleDollarSign,
  Download,
  HandCoins,
  MoreHorizontal,
  Phone,
  Search,
  ShoppingBag,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CountUp } from "@/components/shared/count-up";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type ListResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, inr } from "@/lib/format";
import { EASE, prefersReducedMotion, staggerDelay } from "@/lib/motion";
import { qk } from "@/lib/query-keys";

type Customer = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  pan: string | null;
  role: string;
  booking: {
    id: string;
    bookingNumber: string;
    bookingDate: string;
    status: string;
    unit: { unitNumber: string };
    project: { id: string; name: string };
    financials: { totalCost: number; valueToBeCollected?: number; finance?: number } | null;
    toCollect: number;
    received: number;
    outstanding: number;
    collectionPct: number;
  };
};

type Summary = {
  total: number;
  primary: number;
  coApplicants: number;
  uniqueBuyers: number;
  withEmail: number;
  withPan: number;
  thisMonth: number;
  toCollect: number;
  received: number;
  outstanding: number;
  collectionPct: number;
};

type ProjectOption = { id: string; name: string };

type KpiKey = "all" | "primary" | "co" | "unique" | "month" | "outstanding";
type SortKey = "name" | "date" | "unit" | "booking" | "mobile";

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
  money = false,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "info" | "success" | "warning" | "danger" | "muted";
  icon: typeof Users;
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

function roleLabel(role: string) {
  return role.replaceAll("_", " ");
}

export function CustomersPage() {
  const navigate = useNavigate();
  const reduced = prefersReducedMotion();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [flatOnly, setFlatOnly] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>("primary");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [kpiFocus, setKpiFocus] = useState<KpiKey>("all");
  const [minCollected, setMinCollected] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 220);
    return () => window.clearTimeout(t);
  }, [search]);

  const thisMonth = kpiFocus === "month";
  const apiRole =
    kpiFocus === "primary" ? "primary" : kpiFocus === "co" ? "co_applicant" : roleFilter;

  const { data: projects } = useQuery({
    queryKey: qk.projects(),
    queryFn: () => api.get<ListResponse<ProjectOption>>("/api/projects", { pageSize: 50 }),
  });

  const { data: summary } = useQuery({
    queryKey: [...qk.customers({ projectId }), "summary"],
    queryFn: () => api.get<Summary>("/api/customers/summary", { projectId: projectId ?? undefined }),
  });

  const { data, isFetching } = useQuery({
    queryKey: qk.customers({
      search: debouncedSearch,
      flatOnly,
      roleFilter: apiRole,
      statusFilter,
      projectId,
      thisMonth,
      minCollected,
      sort,
      sortDir,
      kpiFocus,
    }),
    queryFn: () =>
      api.get<ListResponse<Customer>>("/api/customers", {
        pageSize: 300,
        search: debouncedSearch || undefined,
        unit: flatOnly || undefined,
        role: apiRole ?? undefined,
        status: statusFilter ?? undefined,
        projectId: projectId ?? undefined,
        thisMonth: thisMonth ? 1 : undefined,
        minCollected: minCollected ?? undefined,
        sort,
        dir: sortDir,
      }),
  });

  const rows = useMemo(() => {
    let list = [...(data?.data ?? [])];
    const q = debouncedSearch.trim().toLowerCase();
    const flatQ = flatOnly.trim();

    if (q || flatQ) {
      list = list.filter((r) => {
        const unit = r.booking.unit.unitNumber;
        if (flatQ && !matchesFlat(unit, flatQ)) return false;
        if (!q) return true;
        return (
          matchesFlat(unit, q) ||
          r.name.toLowerCase().includes(q) ||
          r.mobile.includes(q) ||
          (r.email ?? "").toLowerCase().includes(q) ||
          (r.pan ?? "").toLowerCase().includes(q) ||
          r.booking.bookingNumber.toLowerCase().includes(q) ||
          r.booking.project.name.toLowerCase().includes(q)
        );
      });
    }

    if (kpiFocus === "outstanding") {
      list = list.filter((r) => r.booking.outstanding > 0.5);
    }
    if (kpiFocus === "unique") {
      const seen = new Set<string>();
      list = list.filter((r) => {
        if (r.role !== "primary") return false;
        const key = r.mobile.replace(/\D/g, "") || r.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (minCollected != null) {
      list = list.filter((r) => r.booking.collectionPct + 0.05 >= minCollected);
    }

    if (kpiFocus === "outstanding") {
      list.sort((a, b) => (b.booking.outstanding - a.booking.outstanding) * (sortDir === "asc" ? -1 : 1));
    }

    return list;
  }, [data?.data, debouncedSearch, flatOnly, kpiFocus, sortDir, minCollected]);

  const activeFilterCount = [
    roleFilter && kpiFocus === "all" ? roleFilter : null,
    statusFilter,
    flatOnly,
    projectId,
    minCollected != null ? String(minCollected) : null,
    kpiFocus !== "all" ? kpiFocus : null,
  ].filter(Boolean).length;

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setFlatOnly("");
    setRoleFilter("primary");
    setStatusFilter(null);
    setProjectId(null);
    setKpiFocus("all");
    setMinCollected(null);
    setSort("name");
    setSortDir("asc");
  }

  function activateKpi(key: KpiKey) {
    if (kpiFocus === key) {
      setKpiFocus("all");
      return;
    }
    setKpiFocus(key);
    if (key === "primary") setRoleFilter("primary");
    if (key === "co") setRoleFilter("co_applicant");
    if (key === "unique") setRoleFilter("primary");
    if (key === "month" || key === "outstanding" || key === "all") {
      /* keep role chip unless primary/co KPI */
    }
  }

  function toggleSort(key: SortKey) {
    if (sort === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  }

  function exportCsv() {
    const header =
      "Name,Role,Mobile,Email,PAN,Project,Unit,Booking,BookingDate,Status,ToCollect,Received,Outstanding,CollectedPct";
    const body = rows
      .map((r) =>
        [
          r.name,
          r.role,
          r.mobile,
          r.email ?? "",
          r.pan ?? "",
          r.booking.project.name,
          r.booking.unit.unitNumber,
          r.booking.bookingNumber,
          formatDate(r.booking.bookingDate),
          r.booking.status,
          r.booking.toCollect,
          r.booking.received,
          r.booking.outstanding,
          r.booking.collectionPct,
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageWrap>
      <PageHeader
        title="Customers"
        subtitle="Applicants by booking · search flat, mobile or name · collection on value to collect"
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MoneyKpi
          label="Applicants"
          value={summary?.total ?? 0}
          hint={`${summary?.primary ?? 0} primary · ${summary?.coApplicants ?? 0} co`}
          icon={Users}
          tone="info"
          active={kpiFocus === "all"}
          delay={staggerDelay(0)}
          onClick={() => activateKpi("all")}
        />
        <MoneyKpi
          label="Unique buyers"
          value={summary?.uniqueBuyers ?? 0}
          hint="Distinct primary mobiles"
          icon={UserRound}
          tone="muted"
          active={kpiFocus === "unique"}
          delay={staggerDelay(1)}
          onClick={() => activateKpi("unique")}
        />
        <MoneyKpi
          label="This month"
          value={summary?.thisMonth ?? 0}
          hint="New primary applicants MTD"
          icon={CalendarRange}
          tone="muted"
          active={kpiFocus === "month"}
          delay={staggerDelay(2)}
          onClick={() => activateKpi("month")}
        />
        <MoneyKpi
          label="To collect"
          value={summary?.toCollect ?? 0}
          hint="Across linked bookings"
          icon={CircleDollarSign}
          tone="info"
          money
          delay={staggerDelay(3)}
          onClick={() => activateKpi("all")}
        />
        <MoneyKpi
          label="Received"
          value={summary?.received ?? 0}
          hint={`${summary?.collectionPct ?? 0}% collected`}
          icon={HandCoins}
          tone="success"
          money
          delay={staggerDelay(4)}
          onClick={() => activateKpi("all")}
        />
        <MoneyKpi
          label="Outstanding"
          value={summary?.outstanding ?? 0}
          hint="Tap to filter balance due"
          icon={ShoppingBag}
          tone="warning"
          money
          active={kpiFocus === "outstanding"}
          delay={staggerDelay(5)}
          onClick={() => activateKpi("outstanding")}
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
              placeholder="Search name, mobile, email, flat, booking…"
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
          <Select
            value={projectId ?? "all"}
            onValueChange={(v) => setProjectId(v === "all" ? null : v)}
          >
            <SelectTrigger className="h-8 w-full sm:w-48">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {(projects?.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Role</span>
          {(
            [
              ["primary", "Primary"],
              ["co_applicant", "Co-applicant"],
              ["nominee", "Nominee"],
            ] as const
          ).map(([value, label]) => (
            <Chip
              key={value}
              active={apiRole === value && kpiFocus !== "unique"}
              onClick={() => {
                setKpiFocus("all");
                setRoleFilter(roleFilter === value ? null : value);
              }}
            >
              {label}
            </Chip>
          ))}
          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Booking
          </span>
          {["booked", "confirmed", "hold"].map((v) => (
            <Chip
              key={v}
              active={statusFilter === v}
              onClick={() => setStatusFilter(statusFilter === v ? null : v)}
            >
              {v}
            </Chip>
          ))}
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
          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sort
          </span>
          {(
            [
              ["name", "Name"],
              ["date", "Date"],
              ["unit", "Flat"],
              ["booking", "Booking"],
              ["mobile", "Mobile"],
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
          key={`${kpiFocus}-${apiRole}-${debouncedSearch}-${flatOnly}-${sort}-${sortDir}-${projectId}-${minCollected}-${statusFilter}`}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          <DataTable
            rows={rows}
            onRowClick={(row) => navigate(`/bookings/${row.booking.id}`)}
            empty={
              <EmptyState
                icon={Users}
                title={
                  activeFilterCount || search || flatOnly
                    ? "No customers match these filters."
                    : "No customers yet."
                }
                actionLabel={activeFilterCount || search || flatOnly ? "Clear filters" : undefined}
                onAction={activeFilterCount || search || flatOnly ? clearFilters : undefined}
              />
            }
            columns={[
              {
                key: "name",
                header: "Name",
                cell: (r) => (
                  <span>
                    <span className="block font-medium">{r.name}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {r.email?.trim() || (r.pan ? `PAN ${r.pan}` : "—")}
                    </span>
                  </span>
                ),
              },
              {
                key: "role",
                header: "Role",
                cell: (r) => (
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                      r.role === "primary"
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-border bg-muted/50 text-muted-foreground",
                    )}
                  >
                    {roleLabel(r.role)}
                  </span>
                ),
              },
              {
                key: "mobile",
                header: "Mobile",
                cell: (r) => (
                  <a
                    href={`tel:${r.mobile}`}
                    className="tabular-nums text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.mobile}
                  </a>
                ),
              },
              {
                key: "project",
                header: "Project",
                hideOnMobile: true,
                cell: (r) => r.booking.project.name,
              },
              {
                key: "unit",
                header: "Unit",
                cell: (r) => <span className="font-semibold tabular-nums">{r.booking.unit.unitNumber}</span>,
              },
              {
                key: "bk",
                header: "Booking",
                hideOnMobile: true,
                cell: (r) => (
                  <span>
                    <span className="block font-medium">{r.booking.bookingNumber}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {formatDate(r.booking.bookingDate)}
                    </span>
                  </span>
                ),
              },
              {
                key: "recv",
                header: "Received",
                hideOnMobile: true,
                cell: (r) => (
                  <span className="tabular-nums font-medium text-success">{inr(r.booking.received)}</span>
                ),
              },
              {
                key: "out",
                header: "Outstanding",
                hideOnMobile: true,
                cell: (r) => (
                  <span
                    className={cn(
                      "tabular-nums font-medium",
                      r.booking.outstanding > 0 ? "text-warning" : "text-muted-foreground",
                    )}
                  >
                    {inr(r.booking.outstanding)}
                  </span>
                ),
              },
              {
                key: "pct",
                header: "Collected",
                hideOnMobile: true,
                cell: (r) => <span className="tabular-nums font-medium">{r.booking.collectionPct}%</span>,
              },
              {
                key: "status",
                header: "Status",
                cell: (r) => <StatusPill status={r.booking.status} />,
              },
              {
                key: "actions",
                header: "",
                className: "w-10",
                cell: (r) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => navigate(`/bookings/${r.booking.id}`)}>
                        Open booking
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={`tel:${r.mobile}`}>
                          <Phone className="mr-2 h-3.5 w-3.5" /> Call
                        </a>
                      </DropdownMenuItem>
                      {r.email ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <a href={`mailto:${r.email}`}>Email</a>
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ),
              },
            ]}
          />
        </motion.div>
      </AnimatePresence>
    </PageWrap>
  );
}
