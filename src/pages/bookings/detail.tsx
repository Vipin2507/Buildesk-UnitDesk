import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
  AlertCircle,
  CalendarClock,
  CircleDollarSign,
  HandCoins,
  LayoutDashboard,
  Percent,
  Wallet,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
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
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { DatePicker } from "@/components/shared/date-picker";
import { DocumentsPanel } from "@/components/shared/documents-panel";
import { Field } from "@/components/shared/field";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChartColors } from "@/hooks/use-chart-colors";
import { useMasterOptions } from "@/hooks/use-master-options";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, inr } from "@/lib/format";
import { EASE, prefersReducedMotion, staggerDelay } from "@/lib/motion";
import { qk } from "@/lib/query-keys";

type ScheduleRow = {
  id: string;
  name: string;
  afterDays?: number | null;
  dueDate: string;
  amount: number;
  received: number;
  outstanding: number;
  status: string;
  daysUntilDue?: number;
  daysOverdue?: number;
  isOverdue?: boolean;
  isUpcoming?: boolean;
  isPaid?: boolean;
};

type Booking = {
  id: string;
  bookingNumber: string;
  bookingDate: string;
  status: string;
  unit: {
    unitNumber: string;
    unitType?: string | null;
    floor?: { number: number; wing?: { name: string } };
  };
  project: {
    name: string;
    mandateTerm?: string | null;
    agreedMandateBrokerage?: number | null;
    totalBrokeragePct?: number | null;
    mandateBrokeragePaymentTerm?: string | null;
  };
  customers: { id: string; role: string; name: string; mobile: string; email: string | null }[];
  financials: {
    agreement: number;
    gst: number;
    otherCharges: number;
    totalCost: number;
    gstOnAgreement: number;
    stampDutyRegistration: number;
    valueToBeCollected: number;
    finance: number;
  } | null;
  entitlement: {
    entitlementPercent: number | null;
    entitlementAmount: number;
    received: number;
    outstanding: number;
  } | null;
  channelPartner: { id?: string; name: string } | null;
  payments: {
    id: string;
    paymentDate: string;
    amount: number;
    paymentMode: string;
    status: string;
    appliesTo: string;
  }[];
  schedules: ScheduleRow[];
  invoices: { id: string; number: string; kind: string; amount: number; issuedAt: string; status: string }[];
  reminders: { id: string; title: string; status: string; dueAt: string; channel: string }[];
  projectId: string;
  unitId: string;
  dashboard?: {
    dealValue: number;
    toCollect: number;
    received: number;
    remaining: number;
    collectionPct: number;
    finance: number;
    overdueAmount: number;
    overdueCount: number;
    upcomingAmount: number;
    upcomingCount: number;
    paidCount: number;
    installmentCount: number;
    nextDue: {
      id: string;
      name: string;
      dueDate: string;
      outstanding: number;
      daysUntilDue: number;
    } | null;
    dueIn30: number;
    dueIn60: number;
  };
  forecast?: {
    chart: Array<{
      id: string;
      name: string;
      dueDate: string;
      expected: number;
      received: number;
      outstanding: number;
      status: string;
    }>;
    collectionMix: Array<{ name: string; value: number }>;
  };
  brokerage?: {
    mandateTerm: string | null;
    agreedMandateBrokerage: number | null;
    totalBrokeragePct: number | null;
    mandateBrokeragePaymentTerm: string | null;
    milestones: { id: string; collectionPct: number; brokeragePct: number }[];
    customerCollectionPct: number;
    customerReceived: number;
    toCollect: number;
    unlockedBrokeragePct: number;
    dueAmount: number;
    partnerReceived: number;
    partnerOutstandingOnDue: number;
  };
};

type InstFilter = "all" | "upcoming" | "overdue" | "paid" | "open" | "due30";
type InstSort = "due_asc" | "due_desc" | "amount_desc" | "outstanding_desc" | "name";
type PayFilter = "all" | "customer" | "partner";
type KpiFocus = "all" | "deal" | "collect" | "received" | "remaining" | "overdue" | "due30";

const KPI_LABELS: Record<Exclude<KpiFocus, "all">, string> = {
  deal: "Deal value — showing financial breakdown",
  collect: "To collect — highlighting value to be collected",
  received: "Received — customer payments & paid installments",
  remaining: "Remaining — open installments still due",
  overdue: "Overdue — past-due installments",
  due30: "Due in 30 days — upcoming dues this month",
};

export function BookingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const colors = useChartColors();
  const reduced = prefersReducedMotion();
  const { data: paymentModes } = useMasterOptions("paymentMode");

  const financialsRef = useRef<HTMLDivElement>(null);
  const installmentsRef = useRef<HTMLDivElement>(null);
  const paymentsRef = useRef<HTMLDivElement>(null);

  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({
    amount: 0,
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMode: "neft",
    appliesTo: "customer" as "customer" | "partner",
    utrOrCheque: "",
    bank: "",
  });
  const [instFilter, setInstFilter] = useState<InstFilter>("all");
  const [instSort, setInstSort] = useState<InstSort>("due_asc");
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [kpiFocus, setKpiFocus] = useState<KpiFocus>("all");

  const { data, isLoading } = useQuery({
    queryKey: qk.booking(id!),
    queryFn: () => api.get<Booking>(`/api/bookings/${id}`),
    enabled: Boolean(id),
  });

  const dash = data?.dashboard;
  const tooltipStyle = {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--color-foreground)",
  };

  function scrollTo(ref: { current: HTMLElement | null }) {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });
  }

  function activateKpi(focus: Exclude<KpiFocus, "all">) {
    const next = kpiFocus === focus ? "all" : focus;
    setKpiFocus(next);

    if (next === "all") {
      setInstFilter("all");
      setPayFilter("all");
      setInstSort("due_asc");
      return;
    }

    if (next === "deal" || next === "collect") {
      setInstFilter("all");
      setPayFilter("all");
      scrollTo(financialsRef);
      return;
    }

    if (next === "received") {
      setInstFilter("paid");
      setPayFilter("customer");
      setInstSort("due_desc");
      scrollTo(paymentsRef);
      return;
    }

    if (next === "remaining") {
      setInstFilter("open");
      setPayFilter("all");
      setInstSort("outstanding_desc");
      scrollTo(installmentsRef);
      return;
    }

    if (next === "overdue") {
      setInstFilter("overdue");
      setPayFilter("all");
      setInstSort("due_asc");
      scrollTo(installmentsRef);
      return;
    }

    if (next === "due30") {
      setInstFilter("due30");
      setPayFilter("all");
      setInstSort("due_asc");
      scrollTo(installmentsRef);
    }
  }

  const schedulesFiltered = useMemo(() => {
    let rows = [...(data?.schedules ?? [])];
    const focus = kpiFocus === "all" ? instFilter : kpiFocus === "remaining" ? "open" : kpiFocus === "due30" ? "due30" : kpiFocus === "overdue" ? "overdue" : kpiFocus === "received" ? "paid" : instFilter;

    if (focus === "overdue") rows = rows.filter((r) => r.isOverdue);
    else if (focus === "upcoming") rows = rows.filter((r) => r.isUpcoming);
    else if (focus === "paid") rows = rows.filter((r) => r.isPaid);
    else if (focus === "open") rows = rows.filter((r) => !r.isPaid && r.outstanding > 0);
    else if (focus === "due30")
      rows = rows.filter((r) => r.isUpcoming && (r.daysUntilDue ?? 999) <= 30);

    rows.sort((a, b) => {
      if (instSort === "due_desc") return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
      if (instSort === "amount_desc") return b.amount - a.amount;
      if (instSort === "outstanding_desc") return b.outstanding - a.outstanding;
      if (instSort === "name") return a.name.localeCompare(b.name);
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
    return rows;
  }, [data?.schedules, instFilter, instSort, kpiFocus]);

  const paymentsFiltered = useMemo(() => {
    const rows = data?.payments ?? [];
    if (payFilter === "all") return rows;
    return rows.filter((p) => p.appliesTo === payFilter);
  }, [data?.payments, payFilter]);

  const activeKpiHint = kpiFocus !== "all" ? KPI_LABELS[kpiFocus] : null;

  const addPay = useMutation({
    mutationFn: () => api.post("/api/payments", { ...pay, bookingId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.booking(id!) });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Payment recorded");
      setPayOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed"),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      api.patch<{ approval?: { id: string }; message?: string; status?: string }>(`/api/bookings/${id}/status`, {
        status,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qk.booking(id!) });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
      if (res.approval) toast.message(res.message ?? "Sent for approval");
      else toast.success("Status updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed"),
  });

  function openPay(appliesTo: "customer" | "partner" = "customer", amount?: number) {
    setPay((p) => ({
      ...p,
      appliesTo,
      amount: amount ?? p.amount,
      paymentDate: new Date().toISOString().slice(0, 10),
    }));
    setPayOpen(true);
  }

  return (
    <PageWrap>
      <PageHeader
        title={data?.bookingNumber ?? "Booking"}
        subtitle={`${data?.project.name ?? ""} · ${data?.unit.unitNumber ?? ""} · ${formatDate(data?.bookingDate)}`}
        breadcrumbs={[
          {
            label: "Bookings",
            to: data?.projectId ? `/projects/${data.projectId}/bookings` : "/projects",
          },
          { label: data?.bookingNumber ?? "Detail" },
        ]}
        actions={
          data ? (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => openPay("customer", dash?.remaining)}>
                <HandCoins className="h-3.5 w-3.5" /> Record payment
              </Button>
              {data.status !== "confirmed" ? (
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate("confirmed")}>
                  Confirm
                </Button>
              ) : null}
              {data.status !== "cancelled" ? (
                <Button size="sm" variant="destructive" onClick={() => setStatus.mutate("cancelled")}>
                  Cancel
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />

      {data ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={data.status} />
          {dash?.nextDue ? (
            <span className="rounded-full border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
              Next due · <span className="font-medium text-foreground">{dash.nextDue.name}</span> ·{" "}
              {formatDate(dash.nextDue.dueDate)} · {inr(dash.nextDue.outstanding)}
              {dash.nextDue.daysUntilDue === 0
                ? " · today"
                : dash.nextDue.daysUntilDue > 0
                  ? ` · in ${dash.nextDue.daysUntilDue}d`
                  : null}
            </span>
          ) : null}
          {(dash?.overdueCount ?? 0) > 0 ? (
            <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
              {dash!.overdueCount} overdue · {inr(dash!.overdueAmount)}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Dashboard KPIs — click to filter + jump to section */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground">Tap a KPI to filter this booking and jump to the related section</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Deal value"
            value={Math.round(dash?.dealValue ?? 0)}
            icon={CircleDollarSign}
            money
            active={kpiFocus === "deal"}
            hint="View financials"
            onClick={() => activateKpi("deal")}
          />
          <KpiCard
            label="To collect"
            value={Math.round(dash?.toCollect ?? 0)}
            icon={Wallet}
            money
            active={kpiFocus === "collect"}
            hint="View collectable"
            onClick={() => activateKpi("collect")}
          />
          <KpiCard
            label="Received"
            value={Math.round(dash?.received ?? 0)}
            icon={HandCoins}
            tone="success"
            money
            suffix={dash ? `${dash.collectionPct}%` : undefined}
            active={kpiFocus === "received"}
            hint="Paid installments"
            onClick={() => activateKpi("received")}
          />
          <KpiCard
            label="Remaining"
            value={Math.round(dash?.remaining ?? 0)}
            icon={Wallet}
            money
            tone={(dash?.remaining ?? 0) > 0 ? "warning" : "success"}
            active={kpiFocus === "remaining"}
            hint="Open installments"
            onClick={() => activateKpi("remaining")}
          />
          <KpiCard
            label="Overdue"
            value={Math.round(dash?.overdueAmount ?? 0)}
            icon={AlertCircle}
            money
            tone="danger"
            active={kpiFocus === "overdue"}
            hint={`${dash?.overdueCount ?? 0} installment(s)`}
            onClick={() => activateKpi("overdue")}
          />
          <KpiCard
            label="Due in 30d"
            value={Math.round(dash?.dueIn30 ?? 0)}
            icon={CalendarClock}
            money
            tone="muted"
            active={kpiFocus === "due30"}
            hint="Upcoming this month"
            onClick={() => activateKpi("due30")}
          />
        </div>
        {activeKpiHint ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-[11px]">
            <span className="font-medium text-primary">{activeKpiHint}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => activateKpi(kpiFocus as Exclude<KpiFocus, "all">)}
            >
              Clear filter
            </Button>
          </div>
        ) : null}
      </div>

      {/* Collection progress */}
      <CardSoft className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Collection progress
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {inr(dash?.received)} of {inr(dash?.toCollect)} · {dash?.collectionPct ?? 0}%
          </p>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={reduced ? false : { width: 0 }}
            animate={{ width: `${Math.min(100, dash?.collectionPct ?? 0)}%` }}
            transition={{ duration: 0.6, ease: EASE }}
          />
        </div>
        <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
          <span>
            Paid installments · <span className="font-medium text-foreground">{dash?.paidCount ?? 0}</span>
          </span>
          <span>
            Open · <span className="font-medium text-foreground">{dash?.upcomingCount ?? 0}</span>
          </span>
          <span>
            Overdue ·{" "}
            <span className={cn("font-medium", (dash?.overdueCount ?? 0) > 0 ? "text-destructive" : "text-foreground")}>
              {dash?.overdueCount ?? 0}
            </span>
          </span>
        </div>
      </CardSoft>

      {/* 1. Customers + Financials */}
      <div
        ref={financialsRef}
        className={cn(
          "grid scroll-mt-3 gap-2 lg:grid-cols-2",
          (kpiFocus === "deal" || kpiFocus === "collect") && "rounded-xl ring-2 ring-primary/30",
        )}
      >
        <CardSoft className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer details</p>
          {(data?.customers.length ?? 0) === 0 && !isLoading ? (
            <p className="text-xs text-muted-foreground">No customers linked.</p>
          ) : (
            data?.customers.map((c, i) => (
              <motion.div
                key={c.id}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: staggerDelay(i), duration: 0.25, ease: EASE }}
                className="rounded-lg border p-2.5"
              >
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {c.role.replace("_", " ")}
                </p>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.mobile}
                  {c.email ? ` · ${c.email}` : ""}
                </p>
              </motion.div>
            ))
          )}
        </CardSoft>
        <CardSoft
          className={cn(
            "space-y-2",
            kpiFocus === "deal" && "ring-2 ring-primary/25",
            kpiFocus === "collect" && "ring-2 ring-primary/25",
          )}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Financial details</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <FinRow label="Agreement" value={data?.financials?.agreement} />
            <FinRow label="GST" value={data?.financials?.gst} />
            <FinRow label="Other charges" value={data?.financials?.otherCharges} />
            <FinRow
              label="Total cost"
              value={data?.financials?.totalCost}
              strong
              highlight={kpiFocus === "deal"}
            />
            <FinRow label="GST on agreement" value={data?.financials?.gstOnAgreement} />
            <FinRow label="Stamp duty registration" value={data?.financials?.stampDutyRegistration} />
            <FinRow
              label="Value to be collected"
              value={data?.financials?.valueToBeCollected}
              highlight={kpiFocus === "collect"}
            />
            <FinRow label="Finance" value={data?.financials?.finance} />
            <FinRow label="Received" value={dash?.received} tone="success" highlight={kpiFocus === "received"} />
            <FinRow label="Remaining" value={dash?.remaining} tone="warning" highlight={kpiFocus === "remaining"} />
          </div>
        </CardSoft>
      </div>

      {/* 2. Installment break-up */}
      <div
        ref={installmentsRef}
        className={cn(
          "scroll-mt-3",
          (kpiFocus === "remaining" || kpiFocus === "overdue" || kpiFocus === "due30" || kpiFocus === "received") &&
            "rounded-xl ring-2 ring-primary/30",
        )}
      >
      <CardSoft className="space-y-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Installment break-up
            </p>
            {(data?.schedules.length ?? 0) > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {data!.schedules.length} installment(s) · {dash?.overdueCount ?? 0} overdue ·{" "}
                {dash?.upcomingCount ?? 0} upcoming
              </p>
            ) : null}
          </div>
          {(data?.schedules.length ?? 0) === 0 && data ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                api.post(`/api/bookings/${data.id}/schedule/generate`).then(() => {
                  qc.invalidateQueries({ queryKey: qk.booking(data.id) });
                  toast.success("Schedule generated");
                })
              }
            >
              Generate schedule
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "all", label: "All" },
              { id: "upcoming", label: "Upcoming" },
              { id: "open", label: "Open" },
              { id: "overdue", label: "Overdue" },
              { id: "due30", label: "Due 30d" },
              { id: "paid", label: "Paid" },
            ] as const
          ).map((f) => {
            const chipActive =
              instFilter === f.id ||
              (f.id === "open" && kpiFocus === "remaining") ||
              (f.id === "overdue" && kpiFocus === "overdue") ||
              (f.id === "due30" && kpiFocus === "due30") ||
              (f.id === "paid" && kpiFocus === "received");
            return (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setInstFilter(f.id);
                setKpiFocus("all");
              }}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                chipActive
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              {f.label}
            </button>
            );
          })}
          <Select value={instSort} onValueChange={(v) => setInstSort(v as InstSort)}>
            <SelectTrigger className="ml-auto h-8 w-[10.5rem]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due_asc">Due date ↑</SelectItem>
              <SelectItem value="due_desc">Due date ↓</SelectItem>
              <SelectItem value="outstanding_desc">Outstanding ↓</SelectItem>
              <SelectItem value="amount_desc">Amount ↓</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DataTable
          rows={schedulesFiltered}
          empty={<p className="py-6 text-center text-xs text-muted-foreground">No installments match this filter.</p>}
          columns={[
            {
              key: "n",
              header: "Installment",
              cell: (r) => (
                <span>
                  <span className="block font-medium">{r.name}</span>
                  {r.afterDays != null ? (
                    <span className="block text-[10px] text-muted-foreground">After {r.afterDays} days</span>
                  ) : null}
                </span>
              ),
            },
            {
              key: "d",
              header: "Due date",
              cell: (r) => (
                <span className={cn("tabular-nums", r.isOverdue && "font-medium text-destructive")}>
                  {formatDate(r.dueDate)}
                </span>
              ),
            },
            {
              key: "timing",
              header: "Timing",
              cell: (r) => {
                if (r.isPaid) return <span className="text-[11px] text-success">Settled</span>;
                if (r.isOverdue)
                  return (
                    <span className="text-[11px] font-medium text-destructive">
                      {r.daysOverdue}d overdue
                    </span>
                  );
                if (r.daysUntilDue === 0) return <span className="text-[11px] font-medium text-warning">Due today</span>;
                if ((r.daysUntilDue ?? 0) > 0)
                  return <span className="text-[11px] text-muted-foreground">In {r.daysUntilDue}d</span>;
                return "—";
              },
            },
            { key: "a", header: "Value", cell: (r) => <span className="tabular-nums">{inr(r.amount)}</span> },
            {
              key: "r",
              header: "Received",
              hideOnMobile: true,
              cell: (r) => <span className="tabular-nums text-success">{inr(r.received)}</span>,
            },
            {
              key: "o",
              header: "Remaining",
              cell: (r) => (
                <span className={cn("tabular-nums font-medium", r.outstanding > 0 && "text-warning")}>
                  {inr(r.outstanding)}
                </span>
              ),
            },
            {
              key: "st",
              header: "Status",
              cell: (r) => <StatusPill status={r.isOverdue ? "overdue" : r.status} />,
            },
          ]}
        />
      </CardSoft>
      </div>

      {/* 3. Booking details */}
      <CardSoft className="space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Booking details</p>
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Booking no." value={data?.bookingNumber} />
          <Detail label="Deal date" value={formatDate(data?.bookingDate)} />
          <Detail label="Project" value={data?.project.name} />
          <Detail label="Unit" value={data?.unit.unitNumber} />
          <Detail label="Unit type" value={data?.unit.unitType ?? "—"} />
          <Detail
            label="Wing / floor"
            value={
              data?.unit.floor
                ? `${data.unit.floor.wing?.name ?? "—"} · L${data.unit.floor.number}`
                : "—"
            }
          />
          <Detail label="Channel partner" value={data?.channelPartner?.name ?? "Direct"} />
          <Detail label="Finance" value={inr(dash?.finance ?? data?.financials?.finance)} />
          <Detail label="Status" value={<StatusPill status={data?.status ?? "booked"} />} />
          <Detail label="Installments" value={String(dash?.installmentCount ?? data?.schedules.length ?? 0)} />
          <Detail
            label="Next due"
            value={
              dash?.nextDue
                ? `${dash.nextDue.name} · ${formatDate(dash.nextDue.dueDate)}`
                : "—"
            }
          />
          <Detail label="Due in 60d" value={inr(dash?.dueIn60)} />
        </div>
      </CardSoft>

      {/* Forecast */}
      <div className="grid gap-2 lg:grid-cols-5">
        <CardSoft className="space-y-2 lg:col-span-3">
          <div className="flex items-center gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5 text-primary" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Collection forecast
            </p>
          </div>
          <div className="h-56 w-full min-w-0">
            {(data?.forecast?.chart.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data!.forecast!.chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => inr(Number(v), true)} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => inr(Number(v))}
                    labelFormatter={(label, payload) => {
                      const row = payload?.[0]?.payload as { dueDate?: string } | undefined;
                      return row?.dueDate ? `${label} · ${formatDate(row.dueDate)}` : String(label);
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="expected" name="Expected" fill={colors[1]} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="received" name="Received" fill={colors[0]} radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="outstanding" name="Remaining" stroke={colors[3]} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Generate a schedule to see forecast charts.
              </p>
            )}
          </div>
        </CardSoft>
        <CardSoft className="space-y-2 lg:col-span-2">
          <div className="flex items-center gap-1.5">
            <Percent className="h-3.5 w-3.5 text-primary" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Collected vs remaining
            </p>
          </div>
          <div className="h-56 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.forecast?.collectionMix ?? []}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {(data?.forecast?.collectionMix ?? []).map((_, i) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => inr(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardSoft>
      </div>

      {/* Mandate collection (renamed from Channel partner collection) */}
      <CardSoft className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Mandate collection
          </p>
          {data?.channelPartner ? (
            <Button size="sm" onClick={() => openPay("partner", data.brokerage?.partnerOutstandingOnDue)}>
              Add mandate payment
            </Button>
          ) : null}
        </div>
        {data?.channelPartner ? (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <Detail label="Partner" value={data.channelPartner.name} />
              <Detail
                label="Agreed / share %"
                value={`${data.brokerage?.agreedMandateBrokerage ?? data.entitlement?.entitlementPercent ?? "—"}%`}
              />
              <Detail label="Full receivable" value={inr(data.entitlement?.entitlementAmount)} />
              <Detail label="Received" value={inr(data.entitlement?.received)} />
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Outstanding</p>
                <p
                  className={cn(
                    "font-semibold tabular-nums",
                    (data.entitlement?.outstanding ?? 0) > 0 && "text-destructive",
                  )}
                >
                  {inr(data.entitlement?.outstanding)}
                </p>
              </div>
            </div>
            {data.brokerage ? (
              <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
                <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <Detail label="Customer collection" value={`${data.brokerage.customerCollectionPct}%`} />
                  <Detail label="Brokerage unlocked" value={`${data.brokerage.unlockedBrokeragePct}%`} />
                  <Detail label="Due now" value={inr(data.brokerage.dueAmount)} />
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Due outstanding</p>
                    <p
                      className={cn(
                        "font-semibold tabular-nums",
                        data.brokerage.partnerOutstandingOnDue > 0 && "text-warning",
                      )}
                    >
                      {inr(data.brokerage.partnerOutstandingOnDue)}
                    </p>
                  </div>
                </div>
                {(data.brokerage.milestones?.length ?? 0) > 0 ? (
                  <div className="overflow-hidden rounded-md border bg-background">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium">When collection hits</th>
                          <th className="px-2 py-1.5 text-left font-medium">Brokerage due</th>
                          <th className="px-2 py-1.5 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.brokerage.milestones.map((m) => {
                          const unlocked = data.brokerage!.customerCollectionPct + 0.05 >= m.collectionPct;
                          return (
                            <tr key={m.id} className="border-t">
                              <td className="px-2 py-1.5 tabular-nums">{m.collectionPct}%</td>
                              <td className="px-2 py-1.5 tabular-nums font-medium">{m.brokeragePct}%</td>
                              <td className="px-2 py-1.5">
                                <span className={unlocked ? "text-success" : "text-muted-foreground"}>
                                  {unlocked ? "Unlocked" : "Pending"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {data.brokerage.mandateBrokeragePaymentTerm ? (
                  <p className="text-[11px] text-muted-foreground">
                    Payment term · {data.brokerage.mandateBrokeragePaymentTerm}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No channel partner on this booking — mandate collection N/A.</p>
        )}
      </CardSoft>

      {/* Payments */}
      <div
        ref={paymentsRef}
        className={cn("scroll-mt-3", kpiFocus === "received" && "rounded-xl ring-2 ring-primary/30")}
      >
      <CardSoft className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payments</p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "all", label: "All" },
                { id: "customer", label: "Customer" },
                { id: "partner", label: "Mandate" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setPayFilter(f.id);
                  if (kpiFocus === "received") setKpiFocus("all");
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  payFilter === f.id
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                {f.label}
              </button>
            ))}
            <Button size="sm" variant="outline" onClick={() => openPay("customer")}>
              Add
            </Button>
          </div>
        </div>
        <DataTable
          rows={paymentsFiltered}
          empty={<p className="py-6 text-center text-xs text-muted-foreground">No payments for this filter.</p>}
          columns={[
            { key: "date", header: "Date", cell: (r) => formatDate(r.paymentDate) },
            {
              key: "amt",
              header: "Amount",
              cell: (r) => <span className="font-semibold tabular-nums">{inr(r.amount)}</span>,
            },
            { key: "mode", header: "Mode", cell: (r) => r.paymentMode.toUpperCase() },
            {
              key: "to",
              header: "Applies to",
              cell: (r) => (r.appliesTo === "partner" ? "Mandate" : "Customer"),
            },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          ]}
        />
      </CardSoft>
      </div>

      <CardSoft>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Invoices & receipts</p>
          {data ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                api.post(`/api/bookings/${data.id}/invoices`, { kind: "invoice" }).then(() => {
                  qc.invalidateQueries({ queryKey: qk.booking(data.id) });
                  toast.success("Invoice issued");
                })
              }
            >
              Issue invoice
            </Button>
          ) : null}
        </div>
        <DataTable
          rows={data?.invoices ?? []}
          onRowClick={(row) => navigate(`/invoices/${row.id}`)}
          columns={[
            { key: "n", header: "Number", cell: (r) => r.number },
            { key: "k", header: "Kind", cell: (r) => r.kind },
            { key: "a", header: "Amount", cell: (r) => inr(r.amount) },
            { key: "d", header: "Issued", cell: (r) => formatDate(r.issuedAt) },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          ]}
        />
      </CardSoft>

      <div className="grid gap-2 lg:grid-cols-2">
        <CardSoft>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</p>
          {data ? (
            <DocumentsPanel
              compact
              projectId={data.projectId}
              bookingId={data.id}
              unitId={data.unitId}
              entityType="booking"
              entityId={data.id}
            />
          ) : null}
        </CardSoft>
        <CardSoft>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reminders</p>
          <DataTable
            rows={data?.reminders ?? []}
            columns={[
              { key: "t", header: "Title", cell: (r) => r.title },
              { key: "d", header: "Due", cell: (r) => formatDate(r.dueAt) },
              { key: "c", header: "Channel", cell: (r) => r.channel },
              { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
            ]}
          />
        </CardSoft>
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment entry</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Amount">
              <Input
                className="h-8"
                type="number"
                value={pay.amount}
                onChange={(e) => setPay((p) => ({ ...p, amount: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Date">
              <DatePicker
                value={pay.paymentDate}
                onChange={(v) => setPay((p) => ({ ...p, paymentDate: v ?? p.paymentDate }))}
                allowClear={false}
                className="w-full"
              />
            </Field>
            <Field label="Mode">
              <Select value={pay.paymentMode} onValueChange={(v) => setPay((p) => ({ ...p, paymentMode: v }))}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(paymentModes?.data?.length
                    ? paymentModes.data
                    : ["cash", "cheque", "neft", "rtgs", "upi"].map((m) => ({
                        value: m,
                        label: m.toUpperCase(),
                      }))
                  ).map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Applies to">
              <Select
                value={pay.appliesTo}
                onValueChange={(v) => setPay((p) => ({ ...p, appliesTo: v as "customer" | "partner" }))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="partner">Mandate (partner)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="UTR / cheque">
              <Input
                className="h-8"
                value={pay.utrOrCheque}
                onChange={(e) => setPay((p) => ({ ...p, utrOrCheque: e.target.value }))}
              />
            </Field>
            <Field label="Bank">
              <Input className="h-8" value={pay.bank} onChange={(e) => setPay((p) => ({ ...p, bank: e.target.value }))} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => addPay.mutate()} disabled={addPay.isPending || !pay.amount}>
              {addPay.isPending ? "Saving…" : "Save payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrap>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}

function FinRow({
  label,
  value,
  strong,
  tone,
  highlight,
}: {
  label: string;
  value?: number | null;
  strong?: boolean;
  tone?: "success" | "warning";
  highlight?: boolean;
}) {
  return (
    <>
      <span className={cn("text-muted-foreground", highlight && "font-medium text-primary")}>{label}</span>
      <span
        className={cn(
          "text-right tabular-nums",
          strong && "font-semibold",
          tone === "success" && "font-medium text-success",
          tone === "warning" && "font-medium text-warning",
          highlight && "rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary",
        )}
      >
        {inr(value)}
      </span>
    </>
  );
}
