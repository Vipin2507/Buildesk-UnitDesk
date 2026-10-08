import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Bookmark,
  CalendarRange,
  CircleDollarSign,
  Download,
  FileBarChart,
  HandCoins,
  ImageDown,
  LayoutGrid,
  MoreHorizontal,
  Search,
  ShoppingBag,
  Table2,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { CountUp } from "@/components/shared/count-up";
import { DataTable } from "@/components/shared/data-table";
import { DateRangePicker, MonthPicker } from "@/components/shared/date-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChartColors } from "@/hooks/use-chart-colors";
import { useMasterOptions } from "@/hooks/use-master-options";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { downloadAllCharts, downloadChartElement, downloadCsv, downloadJson } from "@/lib/download";
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

type ViewMode = "split" | "charts" | "table";

type ProjectOption = { id: string; name: string };

type Preset = {
  id: string;
  name: string;
  kind: string;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const REPORTS: {
  id: ReportKind;
  label: string;
  hint: string;
  icon: typeof FileBarChart;
}[] = [
  { id: "cashflow", label: "Cashflow forecast", hint: "Month · week installment pipeline", icon: CalendarRange },
  { id: "bookings-detail", label: "Booking details", hint: "Customer · deal · collection %", icon: FileBarChart },
  { id: "collection-aging", label: "Collection aging", hint: "Overdue buckets & outstanding", icon: ShoppingBag },
  { id: "partner-brokerage", label: "Partner brokerage", hint: "CP entitlement vs received", icon: Users },
  { id: "inventory", label: "Inventory", hint: "Unit status by project", icon: LayoutGrid },
  { id: "payments", label: "Payment ledger", hint: "Customer & partner receipts", icon: HandCoins },
];

const PCT_OPTIONS = [
  { value: "all", label: "Any %" },
  { value: "0", label: "≥ 0%" },
  { value: "20", label: "≥ 20%" },
  { value: "25", label: "≥ 25%" },
  { value: "50", label: "≥ 50%" },
  { value: "75", label: "≥ 75%" },
  { value: "100", label: "100%" },
] as const;

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
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: typeof Wallet;
  money?: boolean;
  delay?: number;
  tone?: "info" | "success" | "warning" | "muted";
  active?: boolean;
  onClick?: () => void;
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
    >
      <button
        type="button"
        disabled={!onClick}
        onClick={onClick}
        className={cn(
          "card-soft flex min-w-0 w-full flex-col gap-1.5 p-3 text-left transition-[box-shadow,ring]",
          onClick && "hover:shadow-md",
          !onClick && "cursor-default disabled:opacity-100",
          active && "ring-2 ring-primary/35",
        )}
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
      </button>
    </motion.div>
  );
}

function ChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function exportChart(format: "png" | "svg") {
    try {
      setBusy(true);
      await downloadChartElement(bodyRef.current, title, format);
      toast.success(`Chart downloaded as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chart download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      className={cn("card-soft p-3", className)}
      data-chart-export
      data-chart-title={title}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              disabled={busy}
              aria-label={`Download ${title} chart`}
            >
              <ImageDown className="h-3.5 w-3.5" />
              {busy ? "…" : "Image"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void exportChart("png")}>Download PNG</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportChart("svg")}>Download SVG</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div ref={bodyRef} className="h-56 w-full min-w-0">
        {children}
      </div>
    </motion.div>
  );
}

export function ReportsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const colors = useChartColors();
  const reduced = prefersReducedMotion();
  const { data: paymentModes } = useMasterOptions("paymentMode");

  const [kind, setKind] = useState<ReportKind>("cashflow");
  const [view, setView] = useState<ViewMode>("split");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [month, setMonth] = useState(currentMonthValue);
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [minPct, setMinPct] = useState<string>("all");
  const [weekFocus, setWeekFocus] = useState<number | null>(null);
  const [bucketFilter, setBucketFilter] = useState<string | null>(null);
  const [appliesTo, setAppliesTo] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<string | null>(null);
  const [unitStatus, setUnitStatus] = useState<string | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);

  const tooltipStyle = {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--color-foreground)",
  };

  const { data: projects } = useQuery({
    queryKey: qk.projects(),
    queryFn: () => api.get<ListResponse<ProjectOption>>("/api/projects", { pageSize: 50 }),
  });

  const { data: presets } = useQuery({
    queryKey: qk.reportPresets,
    queryFn: () => api.get<ListResponse<Preset>>("/api/reports/presets"),
  });

  const filters = {
    projectId,
    month,
    fromDate,
    toDate,
    search,
    statusFilter,
    minPct,
    bucketFilter,
    appliesTo,
    paymentMode,
    unitStatus,
  };

  const cashflowQ = useQuery({
    queryKey: qk.reports("cashflow", { projectId, month }),
    queryFn: () =>
      api.get<{
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
        chart: Array<{ name: string; expected: number; count: number }>;
      }>("/api/reports/cashflow", { projectId: projectId ?? undefined, month }),
    enabled: kind === "cashflow",
  });

  const bookingsQ = useQuery({
    queryKey: qk.reports("bookings-detail", filters),
    queryFn: () =>
      api.get<
        ListResponse<{
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
        }> & {
          summary: Record<string, number>;
          chart: {
            status: Array<{ name: string; value: number }>;
            collection: Array<{ name: string; value: number }>;
          };
        }
      >("/api/reports/bookings-detail", {
        pageSize: 300,
        projectId: projectId ?? undefined,
        search: search || undefined,
        status: statusFilter ?? undefined,
        fromDate: fromDate ?? undefined,
        toDate: toDate ?? undefined,
        minPct: minPct === "all" ? undefined : minPct,
      }),
    enabled: kind === "bookings-detail",
  });

  const agingQ = useQuery({
    queryKey: qk.reports("collection-aging", { projectId, fromDate, toDate, bucketFilter }),
    queryFn: () =>
      api.get<{
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
        }>;
        chart: Array<{ key: string; name: string; amount: number; count: number }>;
      }>("/api/reports/collection-aging", {
        projectId: projectId ?? undefined,
        fromDate: fromDate ?? undefined,
        toDate: toDate ?? undefined,
        bucket: bucketFilter ?? undefined,
      }),
    enabled: kind === "collection-aging",
  });

  const partnerQ = useQuery({
    queryKey: qk.reports("partner-brokerage", { projectId, statusFilter, minPct }),
    queryFn: () =>
      api.get<{
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
        chart: Array<{ name: string; entitlement: number; received: number; outstanding: number }>;
      }>("/api/reports/partner-brokerage", {
        projectId: projectId ?? undefined,
        status: statusFilter ?? undefined,
        minPct: minPct === "all" ? undefined : minPct,
      }),
    enabled: kind === "partner-brokerage",
  });

  const inventoryQ = useQuery({
    queryKey: qk.reports("inventory", { projectId, unitStatus }),
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
        }> & {
          summary: { total: number; byStatus: Record<string, number> };
          chart: Array<{ name: string; value: number }>;
        }
      >("/api/reports/inventory", {
        pageSize: 300,
        projectId: projectId ?? undefined,
        status: unitStatus ?? undefined,
      }),
    enabled: kind === "inventory",
  });

  const paymentsQ = useQuery({
    queryKey: qk.reports("payments", { projectId, fromDate, toDate, appliesTo, paymentMode, statusFilter }),
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
        }> & {
          summary: { total: number; amount: number };
          chart: {
            byMode: Array<{ name: string; value: number; count: number }>;
            byDay: Array<{ name: string; value: number }>;
          };
        }
      >("/api/reports/payments", {
        pageSize: 300,
        projectId: projectId ?? undefined,
        fromDate: fromDate ?? undefined,
        toDate: toDate ?? undefined,
        appliesTo: appliesTo ?? undefined,
        paymentMode: paymentMode ?? undefined,
        status: statusFilter ?? undefined,
      }),
    enabled: kind === "payments",
  });

  const cashflowWeeks = useMemo(() => {
    const weeks = cashflowQ.data?.weeks ?? [];
    if (weekFocus == null) return weeks;
    return weeks.filter((w) => w.week === weekFocus);
  }, [cashflowQ.data?.weeks, weekFocus]);

  const currentFiltersPayload = useMemo(
    () => ({
      projectId,
      month,
      fromDate,
      toDate,
      search,
      statusFilter,
      minPct,
      bucketFilter,
      appliesTo,
      paymentMode,
      unitStatus,
      view,
    }),
    [
      projectId,
      month,
      fromDate,
      toDate,
      search,
      statusFilter,
      minPct,
      bucketFilter,
      appliesTo,
      paymentMode,
      unitStatus,
      view,
    ],
  );

  function applyPreset(p: Preset) {
    const f = p.filters ?? {};
    setKind(p.kind as ReportKind);
    setProjectId((f.projectId as string) || null);
    setMonth((f.month as string) || currentMonthValue());
    setFromDate((f.fromDate as string) || null);
    setToDate((f.toDate as string) || null);
    setSearch((f.search as string) || "");
    setStatusFilter((f.statusFilter as string) || null);
    setMinPct((f.minPct as string) || "all");
    setBucketFilter((f.bucketFilter as string) || null);
    setAppliesTo((f.appliesTo as string) || null);
    setPaymentMode((f.paymentMode as string) || null);
    setUnitStatus((f.unitStatus as string) || null);
    setView(((f.view as ViewMode) || "split") as ViewMode);
    setWeekFocus(null);
    toast.success(`Loaded “${p.name}”`);
  }

  const savePreset = useMutation({
    mutationFn: () => {
      const body = {
        name: presetName.trim(),
        kind,
        filters: currentFiltersPayload,
      };
      return editingPreset
        ? api.patch<Preset>(`/api/reports/presets/${editingPreset.id}`, body)
        : api.post<Preset>("/api/reports/presets", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.reportPresets });
      toast.success(editingPreset ? "Saved report updated" : "Report view saved");
      setPresetOpen(false);
      setPresetName("");
      setEditingPreset(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not save"),
  });

  const deletePreset = useMutation({
    mutationFn: (id: string) => api.del(`/api/reports/presets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.reportPresets });
      toast.success("Saved report deleted");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete"),
  });

  function exportCurrent(format: "csv" | "json" = "csv") {
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === "cashflow" && cashflowQ.data) {
      if (format === "json") {
        downloadJson(`cashflow-${cashflowQ.data.month}.json`, cashflowQ.data);
        return;
      }
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
      downloadCsv(`cashflow-${cashflowQ.data.month}-${stamp}`, [
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
      ], rows);
      return;
    }
    if (kind === "bookings-detail" && bookingsQ.data) {
      if (format === "json") {
        downloadJson(`booking-details-${stamp}.json`, bookingsQ.data);
        return;
      }
      downloadCsv(
        `booking-details-${stamp}`,
        [
          "Customer",
          "Unit",
          "Deal date",
          "Deal value",
          "Value to be collected",
          "Paid value",
          "Collection %",
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
          r.collectionPct,
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
      if (format === "json") {
        downloadJson(`collection-aging-${stamp}.json`, agingQ.data);
        return;
      }
      downloadCsv(
        `collection-aging-${stamp}`,
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
      if (format === "json") {
        downloadJson(`partner-brokerage-${stamp}.json`, partnerQ.data);
        return;
      }
      downloadCsv(
        `partner-brokerage-${stamp}`,
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
      if (format === "json") {
        downloadJson(`inventory-${stamp}.json`, inventoryQ.data);
        return;
      }
      downloadCsv(
        `inventory-${stamp}`,
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
      if (format === "json") {
        downloadJson(`payments-${stamp}.json`, paymentsQ.data);
        return;
      }
      downloadCsv(
        `payments-${stamp}`,
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
  const showCharts = view === "split" || view === "charts";
  const showTable = view === "split" || view === "table";

  function resetFilters() {
    setProjectId(null);
    setFromDate(null);
    setToDate(null);
    setSearch("");
    setStatusFilter(null);
    setMinPct("all");
    setWeekFocus(null);
    setBucketFilter(null);
    setAppliesTo(null);
    setPaymentMode(null);
    setUnitStatus(null);
    setMonth(currentMonthValue());
  }

  return (
    <PageWrap>
      <PageHeader
        title="Reports"
        subtitle="Interactive analytics · filters · charts · saved views · CSV / JSON export"
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex rounded-lg border bg-muted/30 p-0.5">
              {(
                [
                  { id: "split", icon: LayoutGrid, label: "Split" },
                  { id: "charts", icon: BarChart3, label: "Charts" },
                  { id: "table", icon: Table2, label: "Table" },
                ] as const
              ).map((v) => {
                const Icon = v.icon;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setView(v.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                      view === v.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {v.label}
                  </button>
                );
              })}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingPreset(null);
                setPresetName(`${activeReport.label} · ${new Date().toLocaleDateString("en-IN")}`);
                setPresetOpen(true);
              }}
            >
              <Bookmark className="h-3.5 w-3.5" /> Save view
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => exportCurrent("csv")}>Export CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportCurrent("json")}>Export JSON</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    void (async () => {
                      try {
                        if (view === "table") setView("split");
                        await new Promise((r) => setTimeout(r, view === "table" ? 320 : 40));
                        const n = await downloadAllCharts("png");
                        toast.success(`Downloaded ${n} chart image${n === 1 ? "" : "s"}`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Chart download failed");
                      }
                    })();
                  }}
                >
                  Download charts (PNG)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    void (async () => {
                      try {
                        if (view === "table") setView("split");
                        await new Promise((r) => setTimeout(r, view === "table" ? 320 : 40));
                        const n = await downloadAllCharts("svg");
                        toast.success(`Downloaded ${n} chart SVG${n === 1 ? "" : "s"}`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Chart download failed");
                      }
                    })();
                  }}
                >
                  Download charts (SVG)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
                setBucketFilter(null);
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

      {(presets?.data?.length ?? 0) > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Saved</span>
          {presets!.data.map((p) => (
            <div
              key={p.id}
              className="inline-flex items-center gap-0.5 rounded-full border bg-card pl-2.5 text-[11px]"
            >
              <button type="button" className="py-1 font-medium hover:text-primary" onClick={() => applyPreset(p)}>
                {p.name}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-full">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => applyPreset(p)}>Load</DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditingPreset(p);
                      setPresetName(p.name);
                      setPresetOpen(true);
                    }}
                  >
                    Rename / update
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => deletePreset.mutate(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      ) : null}

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
          <MonthPicker
            value={month}
            onChange={(m) => {
              setMonth(m);
              setWeekFocus(null);
            }}
          />
        ) : null}

        {kind === "bookings-detail" || kind === "collection-aging" || kind === "payments" ? (
          <DateRangePicker
            from={fromDate}
            to={toDate}
            onChange={({ from, to }) => {
              setFromDate(from);
              setToDate(to);
            }}
          />
        ) : null}

        {kind === "bookings-detail" || kind === "partner-brokerage" ? (
          <Select value={minPct} onValueChange={setMinPct}>
            <SelectTrigger className="h-8 w-[8.5rem]">
              <SelectValue placeholder="Collection %" />
            </SelectTrigger>
            <SelectContent>
              {PCT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {kind === "partner-brokerage" ? o.label.replace("Collection", "Share") : o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <Select value={statusFilter ?? "all"} onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}>
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

        {kind === "partner-brokerage" ? (
          <Select value={statusFilter ?? "all"} onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="settled">Settled</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        {kind === "collection-aging" ? (
          <Select value={bucketFilter ?? "all"} onValueChange={(v) => setBucketFilter(v === "all" ? null : v)}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue placeholder="Bucket" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All buckets</SelectItem>
              <SelectItem value="current">Not yet due</SelectItem>
              <SelectItem value="d0_30">1–30 days</SelectItem>
              <SelectItem value="d31_60">31–60 days</SelectItem>
              <SelectItem value="d61_90">61–90 days</SelectItem>
              <SelectItem value="d90p">90+ days</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        {kind === "inventory" ? (
          <Select value={unitStatus ?? "all"} onValueChange={(v) => setUnitStatus(v === "all" ? null : v)}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Unit status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["available", "hold", "booked", "sold", "blocked", "not_available"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {kind === "payments" ? (
          <>
            <Select value={appliesTo ?? "all"} onValueChange={(v) => setAppliesTo(v === "all" ? null : v)}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue placeholder="Applies to" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Customer + partner</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="partner">Partner</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentMode ?? "all"} onValueChange={(v) => setPaymentMode(v === "all" ? null : v)}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                {(paymentModes?.data?.length
                  ? paymentModes.data
                  : ["neft", "rtgs", "upi", "cash", "cheque"].map((m) => ({ value: m, label: m.toUpperCase() }))
                ).map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter ?? "all"} onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : null}

        <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={resetFilters}>
          Reset
        </Button>
        <span className="ml-auto text-[11px] text-muted-foreground">{activeReport.label}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${kind}-${view}`}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: EASE }}
          className="space-y-3"
        >
          {kind === "cashflow" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Kpi label="Expected this month" value={cashflowQ.data?.summary.expected ?? 0} money icon={Wallet} hint={cashflowQ.data?.monthLabel} />
                <Kpi label="Installments due" value={cashflowQ.data?.summary.installments ?? 0} icon={CalendarRange} tone="muted" />
                <Kpi label="Bookings" value={cashflowQ.data?.summary.bookings ?? 0} icon={FileBarChart} />
                <Kpi label="Weeks" value={cashflowQ.data?.summary.weeks ?? 0} icon={CircleDollarSign} tone="muted" />
              </div>
              {showCharts ? (
                <ChartCard title="Weekly expected collection">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={cashflowQ.data?.chart ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => inr(Number(v), true)} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => inr(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="expected" name="Expected" fill={colors[0]} radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="count" name="Installments" stroke={colors[2]} strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>
              ) : null}
              {showTable ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setWeekFocus(null)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                        weekFocus == null ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50",
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
                  {(cashflowWeeks.length === 0 || cashflowWeeks.every((w) => !w.rows.length)) && !cashflowQ.isLoading ? (
                    <EmptyState icon={CalendarRange} title="No upcoming installments in this month." />
                  ) : (
                    cashflowWeeks.map((w) => (
                      <div key={w.week} className="card-soft space-y-2 p-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {w.label}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">{w.rangeLabel}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {w.count} installment(s) · expected {inr(w.totalExpected)}
                          </p>
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
                              cell: (r) => <span className="tabular-nums font-medium text-success">{inr(r.valuePaid)}</span>,
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
                            { key: "project", header: "Project", hideOnMobile: true, cell: (r) => r.project },
                          ]}
                        />
                      </div>
                    ))
                  )}
                </>
              ) : null}
            </>
          ) : null}

          {kind === "bookings-detail" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                <Kpi label="Bookings" value={bookingsQ.data?.summary?.total ?? 0} icon={FileBarChart} />
                <Kpi label="Deal value" value={bookingsQ.data?.summary?.dealValue ?? 0} money icon={CircleDollarSign} tone="muted" />
                <Kpi label="To collect" value={bookingsQ.data?.summary?.toCollect ?? 0} money icon={Wallet} />
                <Kpi label="Paid" value={bookingsQ.data?.summary?.paid ?? 0} money icon={HandCoins} tone="success" />
                <Kpi
                  label="Avg collection"
                  value={bookingsQ.data?.summary?.avgCollectionPct ?? 0}
                  icon={BarChart3}
                  tone="warning"
                  hint="%"
                />
              </div>
              {showCharts ? (
                <div className="grid gap-2 lg:grid-cols-2">
                  <ChartCard title="Collection mix">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={bookingsQ.data?.chart?.collection ?? []}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={2}
                        >
                          {(bookingsQ.data?.chart?.collection ?? []).map((_, i) => (
                            <Cell key={i} fill={colors[i % colors.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => inr(Number(v))} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Status distribution">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChartLike data={bookingsQ.data?.chart?.status ?? []} colors={colors} tooltipStyle={tooltipStyle} />
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
              ) : null}
              {showTable ? (
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
                    { key: "date", header: "Deal date", hideOnMobile: true, cell: (r) => formatDate(r.dealDate) },
                    {
                      key: "deal",
                      header: "Deal value",
                      hideOnMobile: true,
                      cell: (r) => <span className="tabular-nums font-medium">{inr(r.dealValue)}</span>,
                    },
                    {
                      key: "pct",
                      header: "Collected %",
                      cell: (r) => (
                        <span className="tabular-nums font-semibold text-primary">{r.collectionPct}%</span>
                      ),
                    },
                    {
                      key: "paid",
                      header: "Paid value",
                      cell: (r) => <span className="tabular-nums font-medium text-success">{inr(r.paidValue)}</span>,
                    },
                    { key: "upcoming", header: "Upcoming", hideOnMobile: true, cell: (r) => r.upcomingInstallment },
                    { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
                  ]}
                />
              ) : null}
            </>
          ) : null}

          {kind === "collection-aging" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Kpi label="Total outstanding" value={agingQ.data?.summary.totalOutstanding ?? 0} money icon={Wallet} />
                <Kpi label="Overdue" value={agingQ.data?.summary.overdueOutstanding ?? 0} money icon={ShoppingBag} tone="warning" />
                <Kpi label="Open installments" value={agingQ.data?.summary.count ?? 0} icon={CalendarRange} tone="muted" />
                <Kpi
                  label="90+ days"
                  value={agingQ.data?.buckets.find((b) => b.key === "d90p")?.amount ?? 0}
                  money
                  icon={CircleDollarSign}
                  tone="warning"
                />
              </div>
              {showCharts ? (
                <ChartCard title="Aging buckets">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={agingQ.data?.chart ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => inr(Number(v), true)} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => inr(Number(v))} />
                      <Bar dataKey="amount" name="Outstanding" fill={colors[3]} radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="count" name="Count" stroke={colors[0]} strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>
              ) : null}
              {showTable ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {(agingQ.data?.buckets ?? []).map((b) => (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => setBucketFilter(bucketFilter === b.key ? null : b.key)}
                        className={cn(
                          "card-soft p-3 text-left transition-shadow hover:shadow-md",
                          bucketFilter === b.key && "ring-2 ring-primary/35",
                        )}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{b.label}</p>
                        <p className="mt-1 text-sm font-semibold tabular-nums">{inr(b.amount)}</p>
                        <p className="text-[11px] text-muted-foreground">{b.count} row(s)</p>
                      </button>
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
            </>
          ) : null}

          {kind === "partner-brokerage" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Kpi label="Partners" value={partnerQ.data?.summary.partners ?? 0} icon={Users} />
                <Kpi label="Entitlement" value={partnerQ.data?.summary.entitlement ?? 0} money icon={CircleDollarSign} tone="muted" />
                <Kpi label="Received" value={partnerQ.data?.summary.received ?? 0} money icon={HandCoins} tone="success" />
                <Kpi label="Outstanding" value={partnerQ.data?.summary.outstanding ?? 0} money icon={ShoppingBag} tone="warning" />
              </div>
              {showCharts ? (
                <ChartCard title="Top partners · entitlement vs received">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={partnerQ.data?.chart ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={56} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => inr(Number(v), true)} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => inr(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="entitlement" name="Entitlement" fill={colors[1]} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="received" name="Received" fill={colors[0]} radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="outstanding" name="Outstanding" stroke={colors[3]} strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>
              ) : null}
              {showTable ? (
                <DataTable
                  rows={partnerQ.data?.data ?? []}
                  onRowClick={(r) => navigate(`/bookings/${r.bookingId}`)}
                  empty={<EmptyState icon={Users} title="No partner entitlements yet." />}
                  columns={[
                    { key: "p", header: "Partner", cell: (r) => r.partner },
                    { key: "c", header: "Customer", cell: (r) => r.customerName },
                    { key: "u", header: "Unit", cell: (r) => r.unit },
                    { key: "d", header: "Deal value", hideOnMobile: true, cell: (r) => inr(r.dealValue) },
                    {
                      key: "pct",
                      header: "Share %",
                      hideOnMobile: true,
                      cell: (r) => (r.sharePct != null ? `${r.sharePct}%` : "—"),
                    },
                    { key: "e", header: "Entitlement", cell: (r) => inr(r.entitlement) },
                    { key: "r", header: "Received", cell: (r) => <span className="text-success">{inr(r.received)}</span> },
                    { key: "o", header: "Outstanding", cell: (r) => inr(r.outstanding) },
                    { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
                  ]}
                />
              ) : null}
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
                    active={unitStatus === st}
                    onClick={() => setUnitStatus(unitStatus === st ? null : st)}
                  />
                ))}
              </div>
              {showCharts ? (
                <ChartCard title="Inventory by status">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={inventoryQ.data?.chart ?? []}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={2}
                      >
                        {(inventoryQ.data?.chart ?? []).map((_, i) => (
                          <Cell key={i} fill={colors[i % colors.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              ) : null}
              {showTable ? (
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
                    { key: "price", header: "Base price", hideOnMobile: true, cell: (r) => inr(r.basePrice) },
                    { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
                  ]}
                />
              ) : null}
            </>
          ) : null}

          {kind === "payments" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-2">
                <Kpi label="Payments" value={paymentsQ.data?.summary?.total ?? 0} icon={HandCoins} />
                <Kpi label="Total amount" value={paymentsQ.data?.summary?.amount ?? 0} money icon={Wallet} tone="success" />
              </div>
              {showCharts ? (
                <div className="grid gap-2 lg:grid-cols-2">
                  <ChartCard title="Amount by mode">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentsQ.data?.chart?.byMode ?? []}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={2}
                        >
                          {(paymentsQ.data?.chart?.byMode ?? []).map((_, i) => (
                            <Cell key={i} fill={colors[i % colors.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => inr(Number(v))} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Daily receipts">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={paymentsQ.data?.chart?.byDay ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} hide={(paymentsQ.data?.chart?.byDay.length ?? 0) > 20} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => inr(Number(v), true)} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => inr(Number(v))} />
                        <Area type="monotone" dataKey="value" name="Amount" fill={colors[0]} fillOpacity={0.15} stroke={colors[0]} strokeWidth={2} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
              ) : null}
              {showTable ? (
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
              ) : null}
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <Dialog
        open={presetOpen}
        onOpenChange={(o) => {
          setPresetOpen(o);
          if (!o) setEditingPreset(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPreset ? "Update saved report" : "Save report view"}</DialogTitle>
            <DialogDescription>
              Stores the current report type, filters and layout so you can reload it later.
            </DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input className="h-8" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPresetOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={presetName.trim().length < 2 || savePreset.isPending}
              onClick={() => savePreset.mutate()}
            >
              {savePreset.isPending ? "Saving…" : editingPreset ? "Update" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrap>
  );
}

function BarChartLike({
  data,
  colors,
  tooltipStyle,
}: {
  data: Array<{ name: string; value: number }>;
  colors: string[];
  tooltipStyle: Record<string, string | number>;
}) {
  return (
    <ComposedChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
      <Tooltip contentStyle={tooltipStyle} />
      <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
        {data.map((_, i) => (
          <Cell key={i} fill={colors[i % colors.length]} />
        ))}
      </Bar>
    </ComposedChart>
  );
}
