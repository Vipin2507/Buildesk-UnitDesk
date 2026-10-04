import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarRange,
  CircleDollarSign,
  Download,
  FileBarChart,
  HandCoins,
  LayoutGrid,
  Search,
  ShoppingBag,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CountUp } from "@/components/shared/count-up";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type ListResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, inr } from "@/lib/format";
import { EASE, prefersReducedMotion, staggerDelay } from "@/lib/motion";
import { qk } from "@/lib/query-keys";

type ReportKind =
  | "cashflow"
  | "bookings-detail"
  | "collection-aging"
  | "partner-brokerage"
  | "inventory"
  | "payments";

type ProjectOption = { id: string; name: string };

const REPORTS: {
  id: ReportKind;
  label: string;
  hint: string;
  icon: typeof FileBarChart;
}[] = [
  {
    id: "cashflow",
    label: "Cashflow forecast",
    hint: "Month · week installment pipeline",
    icon: CalendarRange,
  },
  {
    id: "bookings-detail",
    label: "Booking details",
    hint: "Customer · deal · collection status",
    icon: FileBarChart,
  },
  {
    id: "collection-aging",
    label: "Collection aging",
    hint: "Overdue buckets & outstanding",
    icon: ShoppingBag,
  },
  {
    id: "partner-brokerage",
    label: "Partner brokerage",
    hint: "CP entitlement vs received",
    icon: Users,
  },
  {
    id: "inventory",
    label: "Inventory",
    hint: "Unit status by project",
    icon: LayoutGrid,
  },
  {
    id: "payments",
    label: "Payment ledger",
    hint: "All customer & partner receipts",
    icon: HandCoins,
  },
];

type CashflowRes = {
  month: string;
  monthLabel: string;
  summary: { expected: number; installments: number; bookings: number; weeks: number };
  weeks: Array<{
    week: number;
    label: string;
    rangeLabel: string;
    totalExpected: number;
    count: number;
    rows: Array<{
      id: string;
      bookingId: string;
      bookingNumber: string;
      customerName: string;
      unit: string;
      project: string;
      dealValue: number;
      valuePaid: number;
      upcomingInstallment: string;
      installmentAmount: number;
      dueDate: string;
      status: string;
    }>;
  }>;
};

type BookingDetailRow = {
  id: string;
  bookingNumber: string;
  customerName: string;
  unit: string;
  project: string;
  dealDate: string;
  dealValue: number;
  valueToBeCollected: number;
  paidValue: number;
  outstanding: number;
  collectionPct: number;
  upcomingInstallment: string;
  upcomingWeek: string;
  status: string;
  partner: string | null;
};

type AgingRes = {
  summary: { totalOutstanding: number; overdueOutstanding: number; count: number };
  buckets: Array<{ key: string; label: string; amount: number; count: number }>;
  data: Array<{
    id: string;
    bookingId: string;
    bookingNumber: string;
    customerName: string;
    unit: string;
    project: string;
    installment: string;
    dueDate: string;
    outstanding: number;
    daysOverdue: number;
    bucket: string;
    dealValue: number;
    valuePaid: number;
  }>;
};

type PartnerRes = {
  summary: { partners: number; entitlement: number; received: number; outstanding: number };
  data: Array<{
    id: string;
    bookingId: string;
    bookingNumber: string;
    partner: string;
    customerName: string;
    unit: string;
    project: string;
    dealValue: number;
    sharePct: number | null;
    entitlement: number;
    received: number;
    outstanding: number;
    status: string;
  }>;
};

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  money,
  delay = 0,
  tone = "info",
}: {
  label: string;
  value: number;
  hint?: string;
  icon: typeof Wallet;
  money?: boolean;
  delay?: number;
  tone?: "info" | "success" | "warning" | "muted";
}) {
  const reduced = prefersReducedMotion();
  const tones = {
    info: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: EASE }}
      className="card-soft flex min-w-0 flex-col gap-1.5 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", tones[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="text-lg font-semibold tabular-nums tracking-tight">
        {money ? (
          <>
            ₹<CountUp value={value} />
          </>
        ) : (
          <CountUp value={value} />
        )}
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </motion.div>
  );
}

function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const body = rows
    .map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([[header.join(","), body].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const navigate = useNavigate();
  const reduced = prefersReducedMotion();
  const [kind, setKind] = useState<ReportKind>("cashflow");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [month, setMonth] = useState(currentMonthValue);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [weekFocus, setWeekFocus] = useState<number | null>(null);

  const { data: projects } = useQuery({
    queryKey: qk.projects(),
    queryFn: () => api.get<ListResponse<ProjectOption>>("/api/projects", { pageSize: 50 }),
  });

  const filters = { projectId, month, search, statusFilter };

  const cashflowQ = useQuery({
    queryKey: qk.reports("cashflow", filters),
    queryFn: () =>
      api.get<CashflowRes>("/api/reports/cashflow", {
        projectId: projectId ?? undefined,
        month,
      }),
    enabled: kind === "cashflow",
  });

  const bookingsQ = useQuery({
    queryKey: qk.reports("bookings-detail", filters),
    queryFn: () =>
      api.get<ListResponse<BookingDetailRow> & { summary: Record<string, number> }>(
        "/api/reports/bookings-detail",
        {
          pageSize: 300,
          projectId: projectId ?? undefined,
          search: search || undefined,
          status: statusFilter ?? undefined,
        },
      ),
    enabled: kind === "bookings-detail",
  });

  const agingQ = useQuery({
    queryKey: qk.reports("collection-aging", { projectId }),
    queryFn: () =>
      api.get<AgingRes>("/api/reports/collection-aging", {
        projectId: projectId ?? undefined,
      }),
    enabled: kind === "collection-aging",
  });

  const partnerQ = useQuery({
    queryKey: qk.reports("partner-brokerage", { projectId }),
    queryFn: () =>
      api.get<PartnerRes>("/api/reports/partner-brokerage", {
        projectId: projectId ?? undefined,
      }),
    enabled: kind === "partner-brokerage",
  });

  const inventoryQ = useQuery({
    queryKey: qk.reports("inventory", { projectId }),
    queryFn: () =>
      api.get<
        ListResponse<{
          id: string;
          unitNumber: string;
          unitType: string | null;
          status: string;
          project: string;
          wing: string;
          floor: number;
          basePrice: number | null;
        }> & { summary: { total: number; byStatus: Record<string, number> } }
      >("/api/reports/inventory", {
        pageSize: 300,
        projectId: projectId ?? undefined,
      }),
    enabled: kind === "inventory",
  });

  const paymentsQ = useQuery({
    queryKey: qk.reports("payments", { projectId }),
    queryFn: () =>
      api.get<
        ListResponse<{
          id: string;
          paymentDate: string;
          amount: number;
          paymentMode: string;
          status: string;
          appliesTo: string;
          bookingNumber: string;
          bookingId: string;
          customerName: string;
          unit: string;
          project: string;
        }> & { summary: { total: number; amount: number } }
      >("/api/reports/payments", {
        pageSize: 300,
        projectId: projectId ?? undefined,
      }),
    enabled: kind === "payments",
  });

  const cashflowWeeks = useMemo(() => {
    const weeks = cashflowQ.data?.weeks ?? [];
    if (weekFocus == null) return weeks;
    return weeks.filter((w) => w.week === weekFocus);
  }, [cashflowQ.data?.weeks, weekFocus]);

  function exportCurrent() {
    if (kind === "cashflow" && cashflowQ.data) {
      const rows = cashflowQ.data.weeks.flatMap((w) =>
        w.rows.map((r) => [
          cashflowQ.data!.monthLabel,
          w.label,
          w.rangeLabel,
          r.customerName,
          r.unit,
          r.project,
          r.dealValue,
          r.valuePaid,
          r.upcomingInstallment,
          r.installmentAmount,
          formatDate(r.dueDate),
          r.bookingNumber,
        ]),
      );
      downloadCsv(
        `cashflow-${cashflowQ.data.month}.csv`,
        [
          "Month",
          "Week",
          "Range",
          "Customer",
          "Unit",
          "Project",
          "Deal value",
          "Value paid",
          "Upcoming installment",
          "Installment amount",
          "Due date",
          "Booking",
        ],
        rows,
      );
      return;
    }
    if (kind === "bookings-detail" && bookingsQ.data) {
      downloadCsv(
        "booking-details.csv",
        [
          "Customer",
          "Unit",
          "Deal date",
          "Deal value",
          "Value to be collected",
          "Paid value",
          "Upcoming installment",
          "Upcoming week",
          "Status",
          "Project",
          "Booking",
        ],
        (bookingsQ.data.data ?? []).map((r) => [
          r.customerName,
          r.unit,
          formatDate(r.dealDate),
          r.dealValue,
          r.valueToBeCollected,
          r.paidValue,
          r.upcomingInstallment,
          r.upcomingWeek,
          r.status,
          r.project,
          r.bookingNumber,
        ]),
      );
      return;
    }
    if (kind === "collection-aging" && agingQ.data) {
      downloadCsv(
        "collection-aging.csv",
        ["Customer", "Unit", "Installment", "Due", "Days overdue", "Outstanding", "Project", "Booking"],
        agingQ.data.data.map((r) => [
          r.customerName,
          r.unit,
          r.installment,
          formatDate(r.dueDate),
          r.daysOverdue,
          r.outstanding,
          r.project,
          r.bookingNumber,
        ]),
      );
      return;
    }
    if (kind === "partner-brokerage" && partnerQ.data) {
      downloadCsv(
        "partner-brokerage.csv",
        ["Partner", "Customer", "Unit", "Deal value", "Share %", "Entitlement", "Received", "Outstanding", "Status"],
        partnerQ.data.data.map((r) => [
          r.partner,
          r.customerName,
          r.unit,
          r.dealValue,
          r.sharePct ?? "",
          r.entitlement,
          r.received,
          r.outstanding,
          r.status,
        ]),
      );
      return;
    }
    if (kind === "inventory" && inventoryQ.data) {
      downloadCsv(
        "inventory.csv",
        ["Unit", "Type", "Status", "Project", "Wing", "Floor", "Base price"],
        (inventoryQ.data.data ?? []).map((r) => [
          r.unitNumber,
          r.unitType ?? "",
          r.status,
          r.project,
          r.wing,
          r.floor,
          r.basePrice ?? "",
        ]),
      );
      return;
    }
    if (kind === "payments" && paymentsQ.data) {
      downloadCsv(
        "payments.csv",
        ["Date", "Amount", "Mode", "Applies to", "Customer", "Unit", "Project", "Booking", "Status"],
        (paymentsQ.data.data ?? []).map((r) => [
          formatDate(r.paymentDate),
          r.amount,
          r.paymentMode,
          r.appliesTo,
          r.customerName,
          r.unit,
          r.project,
          r.bookingNumber,
          r.status,
        ]),
      );
    }
  }

  const activeReport = REPORTS.find((r) => r.id === kind)!;

  return (
    <PageWrap>
      <PageHeader
        title="Reports"
        subtitle="Cashflow, bookings, aging, brokerage and inventory · list views with CSV export"
        actions={
          <Button size="sm" variant="outline" onClick={exportCurrent}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        }
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {REPORTS.map((r, i) => {
          const Icon = r.icon;
          const active = kind === r.id;
          return (
            <motion.button
              key={r.id}
              type="button"
              onClick={() => {
                setKind(r.id);
                setWeekFocus(null);
                setStatusFilter(null);
              }}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: staggerDelay(i), duration: 0.3, ease: EASE }}
              className={cn(
                "card-soft flex flex-col gap-1 p-3 text-left transition-[box-shadow,ring]",
                active ? "ring-2 ring-primary/40 shadow-sm" : "hover:shadow-md",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md",
                  active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <p className="text-xs font-semibold">{r.label}</p>
              <p className="text-[11px] text-muted-foreground">{r.hint}</p>
            </motion.button>
          );
        })}
      </div>

      <div className="card-soft flex flex-wrap items-center gap-2 p-2.5 sm:p-3">
        <Select value={projectId ?? "all"} onValueChange={(v) => setProjectId(v === "all" ? null : v)}>
          <SelectTrigger className="h-8 w-full sm:w-52">
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
        {kind === "cashflow" ? (
          <Input
            className="h-8 w-[11rem]"
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setWeekFocus(null);
            }}
          />
        ) : null}
        {kind === "bookings-detail" ? (
          <>
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-8"
                placeholder="Search customer, unit, booking…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={statusFilter ?? "all"}
              onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}
            >
              <SelectTrigger className="h-8 w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="fully_paid">Fully paid</SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : null}
        <span className="text-[11px] text-muted-foreground">{activeReport.label}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={kind}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: EASE }}
          className="space-y-3"
        >
          {kind === "cashflow" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Kpi
                  label="Expected this month"
                  value={cashflowQ.data?.summary.expected ?? 0}
                  money
                  icon={Wallet}
                  delay={staggerDelay(0)}
                  hint={cashflowQ.data?.monthLabel}
                />
                <Kpi
                  label="Installments due"
                  value={cashflowQ.data?.summary.installments ?? 0}
                  icon={CalendarRange}
                  tone="muted"
                  delay={staggerDelay(1)}
                />
                <Kpi
                  label="Bookings"
                  value={cashflowQ.data?.summary.bookings ?? 0}
                  icon={FileBarChart}
                  tone="info"
                  delay={staggerDelay(2)}
                />
                <Kpi
                  label="Weeks"
                  value={cashflowQ.data?.summary.weeks ?? 0}
                  icon={CircleDollarSign}
                  tone="muted"
                  delay={staggerDelay(3)}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setWeekFocus(null)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    weekFocus == null
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  All weeks
                </button>
                {(cashflowQ.data?.weeks ?? []).map((w) => (
                  <button
                    key={w.week}
                    type="button"
                    onClick={() => setWeekFocus(weekFocus === w.week ? null : w.week)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                      weekFocus === w.week
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {w.label} · {inr(w.totalExpected)}
                  </button>
                ))}
              </div>

              {(cashflowWeeks.length === 0 || cashflowWeeks.every((w) => !w.rows.length)) &&
              !cashflowQ.isLoading ? (
                <EmptyState
                  icon={CalendarRange}
                  title="No upcoming installments in this month."
                />
              ) : (
                cashflowWeeks.map((w) => (
                  <div key={w.week} className="card-soft space-y-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">
                          {w.label}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {w.rangeLabel}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {w.count} installment(s) · expected {inr(w.totalExpected)}
                        </p>
                      </div>
                    </div>
                    <DataTable
                      rows={w.rows}
                      onRowClick={(r) => navigate(`/bookings/${r.bookingId}`)}
                      empty={<p className="py-4 text-center text-xs text-muted-foreground">No rows this week</p>}
                      columns={[
                        {
                          key: "customer",
                          header: "Customer",
                          cell: (r) => (
                            <span>
                              <span className="block font-medium">{r.customerName}</span>
                              <span className="block text-[10px] text-muted-foreground">
                                {r.bookingNumber} · {r.unit}
                              </span>
                            </span>
                          ),
                        },
                        {
                          key: "deal",
                          header: "Deal value",
                          hideOnMobile: true,
                          cell: (r) => <span className="tabular-nums font-medium">{inr(r.dealValue)}</span>,
                        },
                        {
                          key: "paid",
                          header: "Value paid",
                          hideOnMobile: true,
                          cell: (r) => (
                            <span className="tabular-nums font-medium text-success">{inr(r.valuePaid)}</span>
                          ),
                        },
                        {
                          key: "inst",
                          header: "Upcoming installment",
                          cell: (r) => (
                            <span>
                              <span className="block font-medium">{r.upcomingInstallment}</span>
                              <span className="block text-[10px] text-muted-foreground">
                                {formatDate(r.dueDate)} · {inr(r.installmentAmount)}
                              </span>
                            </span>
                          ),
                        },
                        {
                          key: "project",
                          header: "Project",
                          hideOnMobile: true,
                          cell: (r) => r.project,
                        },
                      ]}
                    />
                  </div>
                ))
              )}
            </>
          ) : null}

          {kind === "bookings-detail" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                <Kpi label="Bookings" value={bookingsQ.data?.summary?.total ?? 0} icon={FileBarChart} delay={0} />
                <Kpi
                  label="Deal value"
                  value={bookingsQ.data?.summary?.dealValue ?? 0}
                  money
                  icon={CircleDollarSign}
                  tone="muted"
                  delay={staggerDelay(1)}
                />
                <Kpi
                  label="To collect"
                  value={bookingsQ.data?.summary?.toCollect ?? 0}
                  money
                  icon={Wallet}
                  delay={staggerDelay(2)}
                />
                <Kpi
                  label="Paid"
                  value={bookingsQ.data?.summary?.paid ?? 0}
                  money
                  icon={HandCoins}
                  tone="success"
                  delay={staggerDelay(3)}
                />
                <Kpi
                  label="Overdue"
                  value={bookingsQ.data?.summary?.overdue ?? 0}
                  icon={ShoppingBag}
                  tone="warning"
                  delay={staggerDelay(4)}
                  hint="Dynamic status"
                />
              </div>
              <DataTable
                rows={bookingsQ.data?.data ?? []}
                onRowClick={(r) => navigate(`/bookings/${r.id}`)}
                empty={<EmptyState icon={FileBarChart} title="No bookings match these filters." />}
                columns={[
                  {
                    key: "customer",
                    header: "Customer",
                    cell: (r) => (
                      <span>
                        <span className="block font-medium">{r.customerName}</span>
                        <span className="block text-[10px] text-muted-foreground">{r.bookingNumber}</span>
                      </span>
                    ),
                  },
                  { key: "unit", header: "Unit", cell: (r) => <span className="font-semibold tabular-nums">{r.unit}</span> },
                  {
                    key: "date",
                    header: "Deal date",
                    hideOnMobile: true,
                    cell: (r) => formatDate(r.dealDate),
                  },
                  {
                    key: "deal",
                    header: "Deal value",
                    hideOnMobile: true,
                    cell: (r) => <span className="tabular-nums font-medium">{inr(r.dealValue)}</span>,
                  },
                  {
                    key: "collect",
                    header: "Value to be collected",
                    hideOnMobile: true,
                    cell: (r) => inr(r.valueToBeCollected),
                  },
                  {
                    key: "paid",
                    header: "Paid value",
                    cell: (r) => <span className="tabular-nums text-success font-medium">{inr(r.paidValue)}</span>,
                  },
                  {
                    key: "upcoming",
                    header: "Upcoming installment",
                    hideOnMobile: true,
                    cell: (r) => r.upcomingInstallment,
                  },
                  {
                    key: "week",
                    header: "Upcoming week",
                    cell: (r) => <span className="tabular-nums text-xs font-medium">{r.upcomingWeek}</span>,
                  },
                  { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
                ]}
              />
            </>
          ) : null}

          {kind === "collection-aging" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Kpi
                  label="Total outstanding"
                  value={agingQ.data?.summary.totalOutstanding ?? 0}
                  money
                  icon={Wallet}
                />
                <Kpi
                  label="Overdue"
                  value={agingQ.data?.summary.overdueOutstanding ?? 0}
                  money
                  icon={ShoppingBag}
                  tone="warning"
                />
                <Kpi label="Open installments" value={agingQ.data?.summary.count ?? 0} icon={CalendarRange} tone="muted" />
                <Kpi
                  label="90+ days"
                  value={agingQ.data?.buckets.find((b) => b.key === "d90p")?.amount ?? 0}
                  money
                  icon={CircleDollarSign}
                  tone="warning"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {(agingQ.data?.buckets ?? []).map((b) => (
                  <div key={b.key} className="card-soft p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {b.label}
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">{inr(b.amount)}</p>
                    <p className="text-[11px] text-muted-foreground">{b.count} row(s)</p>
                  </div>
                ))}
              </div>
              <DataTable
                rows={agingQ.data?.data ?? []}
                onRowClick={(r) => navigate(`/bookings/${r.bookingId}`)}
                empty={<EmptyState icon={ShoppingBag} title="No open installment dues." />}
                columns={[
                  { key: "c", header: "Customer", cell: (r) => r.customerName },
                  { key: "u", header: "Unit", cell: (r) => r.unit },
                  { key: "i", header: "Installment", cell: (r) => r.installment },
                  { key: "d", header: "Due", cell: (r) => formatDate(r.dueDate) },
                  {
                    key: "days",
                    header: "Days overdue",
                    cell: (r) => (
                      <span className={cn("tabular-nums font-medium", r.daysOverdue > 0 && "text-destructive")}>
                        {r.daysOverdue}
                      </span>
                    ),
                  },
                  {
                    key: "o",
                    header: "Outstanding",
                    cell: (r) => <span className="tabular-nums font-medium">{inr(r.outstanding)}</span>,
                  },
                  { key: "p", header: "Project", hideOnMobile: true, cell: (r) => r.project },
                ]}
              />
            </>
          ) : null}

          {kind === "partner-brokerage" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Kpi label="Partners" value={partnerQ.data?.summary.partners ?? 0} icon={Users} />
                <Kpi
                  label="Entitlement"
                  value={partnerQ.data?.summary.entitlement ?? 0}
                  money
                  icon={CircleDollarSign}
                  tone="muted"
                />
                <Kpi
                  label="Received"
                  value={partnerQ.data?.summary.received ?? 0}
                  money
                  icon={HandCoins}
                  tone="success"
                />
                <Kpi
                  label="Outstanding"
                  value={partnerQ.data?.summary.outstanding ?? 0}
                  money
                  icon={ShoppingBag}
                  tone="warning"
                />
              </div>
              <DataTable
                rows={partnerQ.data?.data ?? []}
                onRowClick={(r) => navigate(`/bookings/${r.bookingId}`)}
                empty={<EmptyState icon={Users} title="No partner entitlements yet." />}
                columns={[
                  { key: "p", header: "Partner", cell: (r) => r.partner },
                  { key: "c", header: "Customer", cell: (r) => r.customerName },
                  { key: "u", header: "Unit", cell: (r) => r.unit },
                  {
                    key: "d",
                    header: "Deal value",
                    hideOnMobile: true,
                    cell: (r) => inr(r.dealValue),
                  },
                  {
                    key: "pct",
                    header: "Share %",
                    hideOnMobile: true,
                    cell: (r) => (r.sharePct != null ? `${r.sharePct}%` : "—"),
                  },
                  { key: "e", header: "Entitlement", cell: (r) => inr(r.entitlement) },
                  {
                    key: "r",
                    header: "Received",
                    cell: (r) => <span className="text-success">{inr(r.received)}</span>,
                  },
                  { key: "o", header: "Outstanding", cell: (r) => inr(r.outstanding) },
                  { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
                ]}
              />
            </>
          ) : null}

          {kind === "inventory" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                <Kpi label="Total units" value={inventoryQ.data?.summary?.total ?? 0} icon={LayoutGrid} />
                {["available", "booked", "sold", "hold"].map((st, i) => (
                  <Kpi
                    key={st}
                    label={st}
                    value={inventoryQ.data?.summary?.byStatus?.[st] ?? 0}
                    icon={LayoutGrid}
                    tone={st === "available" ? "success" : st === "hold" ? "warning" : "muted"}
                    delay={staggerDelay(i + 1)}
                  />
                ))}
              </div>
              <DataTable
                rows={inventoryQ.data?.data ?? []}
                empty={<EmptyState icon={LayoutGrid} title="No units in scope." />}
                columns={[
                  { key: "u", header: "Unit", cell: (r) => <span className="font-semibold">{r.unitNumber}</span> },
                  { key: "t", header: "Type", cell: (r) => r.unitType ?? "—" },
                  { key: "p", header: "Project", cell: (r) => r.project },
                  {
                    key: "w",
                    header: "Wing / floor",
                    hideOnMobile: true,
                    cell: (r) => `${r.wing} · L${r.floor}`,
                  },
                  {
                    key: "price",
                    header: "Base price",
                    hideOnMobile: true,
                    cell: (r) => inr(r.basePrice),
                  },
                  { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
                ]}
              />
            </>
          ) : null}

          {kind === "payments" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-2">
                <Kpi label="Payments" value={paymentsQ.data?.summary?.total ?? 0} icon={HandCoins} />
                <Kpi
                  label="Total amount"
                  value={paymentsQ.data?.summary?.amount ?? 0}
                  money
                  icon={Wallet}
                  tone="success"
                />
              </div>
              <DataTable
                rows={paymentsQ.data?.data ?? []}
                onRowClick={(r) => navigate(`/bookings/${r.bookingId}`)}
                empty={<EmptyState icon={HandCoins} title="No payments recorded." />}
                columns={[
                  { key: "d", header: "Date", cell: (r) => formatDate(r.paymentDate) },
                  {
                    key: "a",
                    header: "Amount",
                    cell: (r) => <span className="font-semibold tabular-nums">{inr(r.amount)}</span>,
                  },
                  { key: "c", header: "Customer", cell: (r) => r.customerName },
                  { key: "u", header: "Unit", cell: (r) => r.unit },
                  { key: "m", header: "Mode", hideOnMobile: true, cell: (r) => r.paymentMode.toUpperCase() },
                  { key: "to", header: "Applies to", cell: (r) => r.appliesTo },
                  { key: "p", header: "Project", hideOnMobile: true, cell: (r) => r.project },
                  { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
                ]}
              />
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </PageWrap>
  );
}
