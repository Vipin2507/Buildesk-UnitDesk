import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownUp,
  CalendarRange,
  CircleDollarSign,
  Download,
  HandCoins,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CountUp } from "@/components/shared/count-up";
import { DataTable } from "@/components/shared/data-table";
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
import { api, ApiError, type ListResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, inr, pct } from "@/lib/format";
import { EASE, prefersReducedMotion, staggerDelay } from "@/lib/motion";
import { qk } from "@/lib/query-keys";

type Payment = {
  id: string;
  paymentDate: string;
  amount: number;
  paymentMode: string;
  status: string;
  appliesTo: string;
  utrOrCheque: string | null;
  bank: string | null;
  remarks: string | null;
  bookingId: string;
  booking: {
    id: string;
    bookingNumber: string;
    unit: { unitNumber: string };
    project: { name: string };
    toCollect?: number;
    financials?: { valueToBeCollected: number; totalCost: number; finance: number } | null;
    customers?: { name: string }[];
    received?: number;
    outstanding?: number;
    collectionPct?: number;
  };
};

type BookingOption = {
  id: string;
  bookingNumber: string;
  status: string;
  unit: { unitNumber: string };
  project: { name: string };
  financials: { valueToBeCollected: number; totalCost: number; finance: number } | null;
  customers: { name: string; role: string }[];
};

type Summary = {
  toCollect: number;
  received: number;
  outstanding: number;
  thisMonth: number;
  collectionPct: number;
  bookings: number;
  payments: number;
};

type FormState = {
  bookingId: string;
  paymentDate: string;
  amount: string;
  paymentMode: string;
  appliesTo: "customer" | "partner";
  status: string;
  utrOrCheque: string;
  bank: string;
  remarks: string;
};

type KpiKey = "all" | "received" | "outstanding" | "month";
type SortKey = "date" | "amount" | "unit" | "booking";

const COLLECTED_PCT_OPTIONS = [
  { value: 20, label: "Booking % (≥20%)" },
  { value: 25, label: "≥25%" },
  { value: 50, label: "≥50%" },
  { value: 75, label: "≥75%" },
  { value: 100, label: "Fully paid" },
] as const;

const emptyForm = (): FormState => ({
  bookingId: "",
  paymentDate: new Date().toISOString().slice(0, 10),
  amount: "",
  paymentMode: "neft",
  appliesTo: "customer",
  status: "received",
  utrOrCheque: "",
  bank: "",
  remarks: "",
});

function collectable(b?: BookingOption | Payment["booking"] | null) {
  if (!b) return 0;
  if ("toCollect" in b && typeof b.toCollect === "number") return b.toCollect;
  const f = b.financials;
  if (!f) return 0;
  if (f.valueToBeCollected > 0) return f.valueToBeCollected;
  return Math.max(0, (f.totalCost ?? 0) - (f.finance ?? 0));
}

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
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "info" | "success" | "warning" | "muted";
  icon: typeof Wallet;
  active?: boolean;
  delay?: number;
  onClick?: () => void;
}) {
  const reduced = prefersReducedMotion();
  const tones = {
    info: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    muted: "bg-muted text-muted-foreground",
  };
  const valueClass = {
    info: "text-foreground",
    success: "text-success",
    warning: "text-warning",
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
        ₹<CountUp value={value} />
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </motion.button>
  );
}

export function PaymentsPage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const reduced = prefersReducedMotion();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [flatOnly, setFlatOnly] = useState("");
  const [appliesFilter, setAppliesFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [kpiFocus, setKpiFocus] = useState<KpiKey>("all");
  const [minCollected, setMinCollected] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [bookingPickerQ, setBookingPickerQ] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [confirm, setConfirm] = useState<Payment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 220);
    return () => window.clearTimeout(t);
  }, [search]);

  const thisMonth = kpiFocus === "month";
  const apiStatus =
    kpiFocus === "received"
      ? "received,verified,reconciled"
      : kpiFocus === "outstanding"
        ? statusFilter
        : statusFilter;

  const apiApplies =
    kpiFocus === "received" || kpiFocus === "outstanding"
      ? appliesFilter ?? "customer"
      : appliesFilter;

  const { data: summary } = useQuery({
    queryKey: [...qk.paymentsList({ projectId }), "summary"],
    queryFn: () => api.get<Summary>("/api/payments/summary", { projectId }),
  });

  const { data, isFetching } = useQuery({
    queryKey: qk.paymentsList({
      projectId,
      appliesFilter: apiApplies,
      statusFilter: apiStatus,
      modeFilter,
      fromDate,
      toDate,
      thisMonth,
      search: debouncedSearch,
      flatOnly,
      minCollected,
      sort,
      sortDir,
    }),
    queryFn: () =>
      api.get<ListResponse<Payment>>("/api/payments", {
        pageSize: 200,
        projectId,
        appliesTo: apiApplies ?? undefined,
        status: apiStatus ?? undefined,
        paymentMode: modeFilter ?? undefined,
        from: !thisMonth && fromDate ? fromDate : undefined,
        to: !thisMonth && toDate ? toDate : undefined,
        thisMonth: thisMonth ? 1 : undefined,
        search: debouncedSearch || undefined,
        unit: flatOnly || undefined,
        minCollected: minCollected ?? undefined,
        sort: sort === "date" ? undefined : sort === "booking" ? undefined : sort,
        dir: sortDir,
      }),
  });

  const { data: bookings } = useQuery({
    queryKey: qk.bookings({ projectId, forPayments: true }),
    queryFn: () =>
      api.get<ListResponse<BookingOption>>("/api/bookings", {
        pageSize: 200,
        projectId,
        status: "booked,confirmed,hold",
      }),
    enabled: formOpen,
  });

  const rows = useMemo(() => {
    let list = [...(data?.data ?? [])];

    // Client reinforce flat / booking search (covers compact flat matches)
    const q = debouncedSearch.trim();
    const flatQ = flatOnly.trim();
    if (q || flatQ) {
      list = list.filter((r) => {
        const unit = r.booking.unit.unitNumber;
        const booking = r.booking.bookingNumber;
        const project = r.booking.project.name;
        const customer = r.booking.customers?.[0]?.name ?? "";
        if (flatQ && !matchesFlat(unit, flatQ)) return false;
        if (!q) return true;
        return (
          matchesFlat(unit, q) ||
          booking.toLowerCase().includes(q.toLowerCase()) ||
          project.toLowerCase().includes(q.toLowerCase()) ||
          customer.toLowerCase().includes(q.toLowerCase()) ||
          r.paymentMode.toLowerCase().includes(q.toLowerCase()) ||
          (r.utrOrCheque ?? "").toLowerCase().includes(q.toLowerCase())
        );
      });
    }

    if (kpiFocus === "outstanding") {
      const receivedByBooking = new Map<string, number>();
      for (const p of data?.data ?? []) {
        if (p.appliesTo !== "customer" || p.status === "pending") continue;
        receivedByBooking.set(p.bookingId, (receivedByBooking.get(p.bookingId) ?? 0) + p.amount);
      }
      // Prefer pending rows; else rows on bookings still short of value-to-collect
      const hasPending = list.some((r) => r.status === "pending");
      if (hasPending) {
        list = list.filter((r) => r.status === "pending");
      } else {
        list = list.filter((r) => {
          const target = collectable(r.booking);
          const got = receivedByBooking.get(r.bookingId) ?? 0;
          return target - got > 0.5;
        });
      }
    }

    if (minCollected != null) {
      list = list.filter((r) => (r.booking.collectionPct ?? 0) + 0.05 >= minCollected);
    }

    list.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sort === "amount") return (a.amount - b.amount) * dir;
      if (sort === "unit") return a.booking.unit.unitNumber.localeCompare(b.booking.unit.unitNumber) * dir;
      if (sort === "booking") return a.booking.bookingNumber.localeCompare(b.booking.bookingNumber) * dir;
      return (new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()) * dir;
    });
    return list;
  }, [data?.data, debouncedSearch, flatOnly, sort, sortDir, kpiFocus, minCollected]);

  const filteredBookings = useMemo(() => {
    const q = bookingPickerQ.trim();
    return (bookings?.data ?? []).filter((b) => {
      if (!q) return true;
      return (
        matchesFlat(b.unit.unitNumber, q) ||
        b.bookingNumber.toLowerCase().includes(q.toLowerCase()) ||
        b.project.name.toLowerCase().includes(q.toLowerCase()) ||
        (b.customers.find((c) => c.role === "primary")?.name ?? "").toLowerCase().includes(q.toLowerCase())
      );
    });
  }, [bookings?.data, bookingPickerQ]);

  const selectedBooking =
    (bookings?.data ?? []).find((b) => b.id === form.bookingId) ??
    (editing && editing.bookingId === form.bookingId ? editing.booking : null);

  const bookingOutstanding = useMemo(() => {
    if (!selectedBooking) return null;
    const target = collectable(selectedBooking);
    const receivedOthers = (data?.data ?? [])
      .filter(
        (p) =>
          p.bookingId === form.bookingId &&
          p.appliesTo === "customer" &&
          p.status !== "pending" &&
          p.id !== editing?.id,
      )
      .reduce((s, p) => s + p.amount, 0);
    return Math.max(0, target - receivedOthers);
  }, [selectedBooking, data?.data, form.bookingId, editing?.id]);

  const activeFilterCount = [
    appliesFilter,
    statusFilter && kpiFocus === "all" ? statusFilter : null,
    modeFilter,
    fromDate,
    toDate,
    flatOnly,
    minCollected != null ? String(minCollected) : null,
    kpiFocus !== "all" ? kpiFocus : null,
  ].filter(Boolean).length;

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setFlatOnly("");
    setAppliesFilter(null);
    setStatusFilter(null);
    setModeFilter(null);
    setFromDate("");
    setToDate("");
    setKpiFocus("all");
    setMinCollected(null);
    setSort("date");
    setSortDir("desc");
  }

  function activateKpi(key: KpiKey) {
    if (kpiFocus === key) {
      setKpiFocus("all");
      setAppliesFilter(null);
      setStatusFilter(null);
      return;
    }
    setKpiFocus(key);
    if (key === "all") {
      setAppliesFilter(null);
      setStatusFilter(null);
    }
    if (key === "received") {
      setAppliesFilter("customer");
      setStatusFilter(null);
    }
    if (key === "outstanding") {
      setAppliesFilter("customer");
      setStatusFilter(null);
    }
    if (key === "month") {
      setAppliesFilter("customer");
      setStatusFilter(null);
      setFromDate("");
      setToDate("");
    }
  }

  function toggleSort(key: SortKey) {
    if (sort === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setSortDir(key === "unit" || key === "booking" ? "asc" : "desc");
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setBookingPickerQ("");
    setFormOpen(true);
  }

  function openEdit(row: Payment) {
    setEditing(row);
    setBookingPickerQ(row.booking.unit.unitNumber);
    setForm({
      bookingId: row.bookingId,
      paymentDate: row.paymentDate.slice(0, 10),
      amount: String(row.amount),
      paymentMode: row.paymentMode,
      appliesTo: row.appliesTo as "customer" | "partner",
      status: row.status,
      utrOrCheque: row.utrOrCheque ?? "",
      bank: row.bank ?? "",
      remarks: row.remarks ?? "",
    });
    setFormOpen(true);
  }

  function exportCsv() {
    const header = "Date,Booking,Flat,Project,ToCollect,Amount,Mode,AppliesTo,Status,UTR,Bank";
    const body = rows
      .map((r) =>
        [
          formatDate(r.paymentDate),
          r.booking.bookingNumber,
          r.booking.unit.unitNumber,
          r.booking.project.name,
          collectable(r.booking),
          r.amount,
          r.paymentMode,
          r.appliesTo,
          r.status,
          r.utrOrCheque ?? "",
          r.bank ?? "",
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payments.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        bookingId: form.bookingId,
        paymentDate: form.paymentDate,
        amount: Number(form.amount),
        paymentMode: form.paymentMode,
        appliesTo: form.appliesTo,
        status: form.status,
        utrOrCheque: form.utrOrCheque || null,
        bank: form.bank || null,
        remarks: form.remarks || null,
      };
      if (editing) return api.patch(`/api/payments/${editing.id}`, payload);
      return api.post("/api/payments", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments-list"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success(editing ? "Payment updated" : "Payment recorded");
      setFormOpen(false);
      setEditing(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/payments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments-list"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Payment deleted");
      setConfirm(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Delete failed"),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/payments/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments-list"] });
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Update failed"),
  });

  return (
    <PageWrap>
      <PageHeader
        title={projectId ? "Demand & receipts" : "Payments"}
        subtitle="Collect against value to be collected · search by flat, booking or customer"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add payment
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MoneyKpi
          label="Value to collect"
          value={summary?.toCollect ?? 0}
          hint={`${summary?.bookings ?? 0} bookings · tap to show all`}
          icon={CircleDollarSign}
          tone="info"
          active={kpiFocus === "all"}
          delay={staggerDelay(0)}
          onClick={() => activateKpi("all")}
        />
        <MoneyKpi
          label="Received"
          value={summary?.received ?? 0}
          hint={`${summary?.collectionPct ?? 0}% collected · customer receipts`}
          icon={HandCoins}
          tone="success"
          active={kpiFocus === "received"}
          delay={staggerDelay(1)}
          onClick={() => activateKpi("received")}
        />
        <MoneyKpi
          label="Outstanding"
          value={summary?.outstanding ?? 0}
          hint={`${pct(summary?.outstanding ?? 0, summary?.toCollect ?? 0)} of demand · pending entries`}
          icon={Wallet}
          tone="warning"
          active={kpiFocus === "outstanding"}
          delay={staggerDelay(2)}
          onClick={() => activateKpi("outstanding")}
        />
        <MoneyKpi
          label="This month"
          value={summary?.thisMonth ?? 0}
          hint={`${summary?.payments ?? 0} receipts on file · filter MTD`}
          icon={CalendarRange}
          tone="muted"
          active={kpiFocus === "month"}
          delay={staggerDelay(3)}
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
              placeholder="Search flat no., booking, customer, UTR…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative w-full sm:w-40">
            <Input
              className="h-8"
              placeholder="Flat / unit no."
              value={flatOnly}
              onChange={(e) => setFlatOnly(e.target.value)}
            />
          </div>
          <Select value={modeFilter ?? "all"} onValueChange={(v) => setModeFilter(v === "all" ? null : v)}>
            <SelectTrigger className="h-8 w-[7.5rem]">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              {["neft", "rtgs", "upi", "cash", "cheque"].map((m) => (
                <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => toggleSort(sort)}
            title="Toggle sort direction"
          >
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
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Applies</span>
          {(["customer", "partner"] as const).map((v) => (
            <Chip
              key={v}
              active={appliesFilter === v}
              onClick={() => {
                setKpiFocus("all");
                setAppliesFilter(appliesFilter === v ? null : v);
              }}
            >
              {v}
            </Chip>
          ))}
          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
          {["received", "pending", "verified", "reconciled"].map((v) => (
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
          {([
            ["date", "Date"],
            ["unit", "Flat"],
            ["booking", "Booking"],
            ["amount", "Amount"],
          ] as const).map(([key, label]) => (
            <Chip key={key} active={sort === key} onClick={() => toggleSort(key)}>
              {label}
            </Chip>
          ))}
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${kpiFocus}-${apiApplies}-${apiStatus}-${modeFilter}-${debouncedSearch}-${flatOnly}-${sort}-${sortDir}-${minCollected}`}
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
                icon={Wallet}
                title={activeFilterCount || search || flatOnly ? "No payments match these filters." : "No payments yet."}
                actionLabel={activeFilterCount || search || flatOnly ? "Clear filters" : "Add payment"}
                onAction={activeFilterCount || search || flatOnly ? clearFilters : openCreate}
              />
            }
            columns={[
              { key: "date", header: "Date", cell: (r) => formatDate(r.paymentDate) },
              {
                key: "flat",
                header: "Flat",
                cell: (r) => <span className="font-semibold tabular-nums">{r.booking.unit.unitNumber}</span>,
              },
              {
                key: "bk",
                header: "Booking",
                cell: (r) => (
                  <span>
                    <span className="block font-medium">{r.booking.bookingNumber}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {r.booking.project.name}
                      {r.booking.customers?.[0]?.name ? ` · ${r.booking.customers[0].name}` : ""}
                    </span>
                  </span>
                ),
              },
              {
                key: "collect",
                header: "To collect",
                hideOnMobile: true,
                cell: (r) => inr(collectable(r.booking)),
              },
              {
                key: "pct",
                header: "Collected",
                hideOnMobile: true,
                cell: (r) => (
                  <span className="tabular-nums font-medium">{r.booking.collectionPct ?? 0}%</span>
                ),
              },
              { key: "amt", header: "Amount", cell: (r) => <span className="font-semibold tabular-nums">{inr(r.amount)}</span> },
              { key: "mode", header: "Mode", cell: (r) => r.paymentMode.toUpperCase() },
              { key: "to", header: "Applies to", cell: (r) => r.appliesTo },
              { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
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
                      <DropdownMenuItem onClick={() => openEdit(r)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/bookings/${r.booking.id}`)}>Open booking</DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setFlatOnly(r.booking.unit.unitNumber);
                          setSearch("");
                        }}
                      >
                        Filter this flat
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {["received", "verified", "reconciled", "pending"].map((st) => (
                        <DropdownMenuItem
                          key={st}
                          disabled={r.status === st || setStatus.isPending}
                          onClick={() => setStatus.mutate({ id: r.id, status: st })}
                        >
                          Mark {st}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setConfirm(r)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ),
              },
            ]}
          />
        </motion.div>
      </AnimatePresence>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit payment" : "Add payment"}</DialogTitle>
            <DialogDescription>
              Amounts are capped by the booking&apos;s value to be collected. Find bookings by flat number.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Find booking / flat" className="sm:col-span-2">
              <Input
                className="h-9"
                placeholder="Type flat no. or booking…"
                value={bookingPickerQ}
                disabled={Boolean(editing)}
                onChange={(e) => setBookingPickerQ(e.target.value)}
              />
            </Field>
            <Field label="Booking" className="sm:col-span-2">
              <Select
                value={form.bookingId || undefined}
                onValueChange={(v) => {
                  const b = (bookings?.data ?? []).find((x) => x.id === v);
                  setForm((f) => ({ ...f, bookingId: v }));
                  if (b) setBookingPickerQ(b.unit.unitNumber);
                }}
                disabled={Boolean(editing)}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Select booking" /></SelectTrigger>
                <SelectContent>
                  {filteredBookings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.unit.unitNumber} · {b.bookingNumber} · {inr(collectable(b))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {selectedBooking ? (
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                Flat <span className="font-semibold">{("unit" in selectedBooking ? selectedBooking.unit.unitNumber : "—")}</span>
                {" · "}Value to collect {inr(collectable(selectedBooking))}
                {bookingOutstanding != null ? ` · Outstanding ${inr(bookingOutstanding)}` : ""}
              </p>
            ) : null}
            <Field label="Date">
              <Input
                className="h-9"
                type="date"
                value={form.paymentDate}
                onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
              />
            </Field>
            <Field label="Amount">
              <Input
                className="h-9"
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </Field>
            <Field label="Mode">
              <Select value={form.paymentMode} onValueChange={(v) => setForm((f) => ({ ...f, paymentMode: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["neft", "rtgs", "upi", "cash", "cheque"].map((m) => (
                    <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Applies to">
              <Select
                value={form.appliesTo}
                onValueChange={(v) => setForm((f) => ({ ...f, appliesTo: v as "customer" | "partner" }))}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["received", "pending", "verified", "reconciled"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="UTR / Cheque">
              <Input
                className="h-9"
                value={form.utrOrCheque}
                onChange={(e) => setForm((f) => ({ ...f, utrOrCheque: e.target.value }))}
              />
            </Field>
            <Field label="Bank" className="sm:col-span-2">
              <Input
                className="h-9"
                value={form.bank}
                onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))}
              />
            </Field>
            <Field label="Remarks" className="sm:col-span-2">
              <Input
                className="h-9"
                value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={save.isPending || !form.bookingId || !form.amount || Number(form.amount) <= 0}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : editing ? "Update" : "Save payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete payment?</DialogTitle>
            <DialogDescription>
              Remove {inr(confirm?.amount)} on {confirm?.booking.bookingNumber} (flat {confirm?.booking.unit.unitNumber}).
              Schedules will recompute from value to be collected.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={() => confirm && remove.mutate(confirm.id)}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrap>
  );
}
