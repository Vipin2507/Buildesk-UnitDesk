import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  FileText,
  HandCoins,
  LayoutTemplate,
  MoreHorizontal,
  Pencil,
  Plus,
  Upload,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DocumentsPanel } from "@/components/shared/documents-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { StatusPill } from "@/components/shared/status-pill";
import { UnitEditDialog } from "@/components/shared/unit-edit-dialog";
import { UnitPlanImage } from "@/components/shared/unit-plan-image";
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
import { UNIT_DOC_UPLOAD_ACTIONS, useUnitBulkUpload } from "@/hooks/use-unit-bulk-upload";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { floorLabel, formatDate, inr, pct } from "@/lib/format";
import { EASE, prefersReducedMotion } from "@/lib/motion";
import { qk } from "@/lib/query-keys";
import { statusLabel } from "@/lib/status";
import { isCustomUnitPhoto, projectPlansFrom, resolveUnitPhotoUrl } from "@/lib/unit-plans";
import { useDrilldownSheetStore } from "@/stores/drilldown";

type UnitTab = "overview" | "customer" | "financials" | "documents" | "activity";

type UnitPayment = {
  id: string;
  paymentDate: string;
  amount: number;
  paymentMode: string;
  status: string;
  appliesTo: string;
  utrOrCheque: string | null;
};

type UnitDetail = {
  id: string;
  unitNumber: string;
  unitType: string | null;
  configuration: string | null;
  carpetArea: number | null;
  builtUpArea: number | null;
  saleableArea: number | null;
  balconyArea: number | null;
  facing: string | null;
  parking: string | null;
  basePrice: number | null;
  plc: number | null;
  otherCharges: number | null;
  remarks: string | null;
  photoUrl: string | null;
  status: string;
  listPrice?: number;
  floor: {
    number: number;
    wing: {
      id: string;
      name: string;
      projectId?: string;
      project: {
        id: string;
        name: string;
        plan1bhkUrl?: string | null;
        plan2bhkUrl?: string | null;
        plan3bhkUrl?: string | null;
      };
    };
  };
  bookings: Array<{
    id: string;
    bookingNumber: string;
    bookingDate: string;
    status: string;
    toCollect?: number;
    received?: number;
    partnerReceived?: number;
    outstanding?: number;
    collectionPct?: number;
    channelPartner?: { id: string; name: string } | null;
    customers: Array<{ name: string; mobile: string; email?: string | null; role: string }>;
    financials: {
      agreement?: number;
      gst?: number;
      otherCharges?: number;
      totalCost: number;
      gstOnAgreement?: number;
      stampDutyRegistration?: number;
      valueToBeCollected?: number;
      finance?: number;
    } | null;
    payments?: UnitPayment[];
  }>;
};

type Audit = { id: string; action: string; actorName: string | null; createdAt: string; meta: string | null };

type PayForm = {
  amount: string;
  paymentDate: string;
  paymentMode: string;
  appliesTo: "customer" | "partner";
  status: string;
  utrOrCheque: string;
  bank: string;
  remarks: string;
};

function emptyPayForm(): PayForm {
  return {
    amount: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMode: "neft",
    appliesTo: "customer",
    status: "received",
    utrOrCheque: "",
    bank: "",
    remarks: "",
  };
}

function area(value?: number | null) {
  return value != null ? `${value.toLocaleString("en-IN")} sq.ft` : "—";
}

function Row({ label, value, emphasize }: { label: string; value?: string | number | null; emphasize?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/70 py-1.5 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("text-right text-xs tabular-nums", emphasize ? "font-semibold" : "font-medium")}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {action}
      </div>
      <div className="rounded-lg border bg-card/40 px-2.5 py-1">{children}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const tones = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  };
  return (
    <div className="min-w-0 rounded-lg border bg-muted/25 px-2 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("truncate text-xs font-semibold tabular-nums", tones[tone])}>{value}</p>
    </div>
  );
}

export function UnitDetailPanel({
  unitId,
  neighborIds = [],
  variant = "docked",
  onClose,
}: {
  unitId: string | null;
  neighborIds?: string[];
  variant?: "docked" | "sheet";
  onClose?: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const open = useDrilldownSheetStore((s) => s.open);
  const docked = useDrilldownSheetStore((s) => s.docked);
  const storedNeighbors = useDrilldownSheetStore((s) => s.neighborIds);
  const [tab, setTab] = useState<UnitTab>("overview");
  const [editing, setEditing] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState<PayForm>(emptyPayForm);
  const navIds = neighborIds.length ? neighborIds : storedNeighbors;
  const reduced = prefersReducedMotion();

  useEffect(() => {
    setTab("overview");
    setPayOpen(false);
    setPayForm(emptyPayForm());
  }, [unitId]);

  const { data, isFetching } = useQuery({
    queryKey: qk.unit(unitId ?? ""),
    queryFn: () => api.get<UnitDetail>(`/api/units/${unitId}`),
    enabled: Boolean(unitId),
    placeholderData: keepPreviousData,
  });
  const { data: audit } = useQuery({
    queryKey: qk.audit({ entityType: "unit", entityId: unitId }),
    queryFn: () => api.get<ListResponse<Audit>>("/api/audit", { entityType: "unit", entityId: unitId, pageSize: 20 }),
    enabled: tab === "activity" && Boolean(unitId),
    placeholderData: keepPreviousData,
  });

  const booking = data?.bookings?.find((b) => b.status !== "cancelled");
  const projectId = data?.floor.wing.project.id;
  const bulkUpload = useUnitBulkUpload(projectId);
  const index = unitId ? navIds.indexOf(unitId) : -1;
  const prevId = index > 0 ? navIds[index - 1] : undefined;
  const nextId = index >= 0 && index < navIds.length - 1 ? navIds[index + 1] : undefined;
  const canBook = Boolean(data) && !booking && data?.status !== "blocked" && data?.status !== "sold";
  const canBlock = Boolean(data) && data?.status !== "blocked" && !booking && data?.status !== "sold";
  const canAddPayment = Boolean(booking);

  const listPrice =
    data?.listPrice ??
    (data ? (data.basePrice ?? 0) + (data.plc ?? 0) + (data.otherCharges ?? 0) : 0);
  const soldValue = booking?.financials?.totalCost ?? 0;
  const toCollect = booking?.toCollect ?? booking?.financials?.valueToBeCollected ?? 0;
  const received = booking?.received ?? 0;
  const outstanding = booking?.outstanding ?? Math.max(0, toCollect - received);
  const collectionPct = booking?.collectionPct ?? (toCollect ? Math.round((received / toCollect) * 1000) / 10 : 0);
  const primary = booking?.customers.find((c) => c.role === "primary") ?? booking?.customers[0];
  const customerPayments = (booking?.payments ?? []).filter((p) => p.appliesTo === "customer");

  const setStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/api/units/${unitId}`, { status }),
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: qk.unit(unitId ?? "") });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`Marked ${statusLabel[status] ?? status}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update unit"),
  });

  const setPhoto = useMutation({
    mutationFn: (photoUrl: string | null) => api.patch(`/api/units/${unitId}`, { photoUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.unit(unitId ?? "") });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update photo"),
  });

  const addPayment = useMutation({
    mutationFn: () =>
      api.post("/api/payments", {
        bookingId: booking!.id,
        paymentDate: payForm.paymentDate,
        amount: Number(payForm.amount),
        paymentMode: payForm.paymentMode,
        appliesTo: payForm.appliesTo,
        status: payForm.status,
        utrOrCheque: payForm.utrOrCheque || null,
        bank: payForm.bank || null,
        remarks: payForm.remarks || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.unit(unitId ?? "") });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["payments-list"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Payment recorded");
      setPayOpen(false);
      setPayForm(emptyPayForm());
      setTab("financials");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not save payment"),
  });

  function openAddPayment() {
    if (!booking) return;
    setPayForm({
      ...emptyPayForm(),
      amount: outstanding > 0 ? String(outstanding) : "",
      appliesTo: "customer",
    });
    setPayOpen(true);
  }

  const shown = unitId ? data : undefined;

  function goAddBooking() {
    if (!shown || !canBook) return;
    onClose?.();
    navigate(`/bookings/new?unitId=${shown.id}&projectId=${shown.floor.wing.project.id}`);
  }

  function startBulkUpload(category: string) {
    if (!unitId) return;
    setTab("documents");
    bulkUpload.start(unitId, category, booking?.id);
  }

  function goNeighbor(id?: string) {
    if (!id) return;
    open("unit", id, { docked });
  }

  const projectPlans = projectPlansFrom(shown?.floor.wing.project);
  const planUrl = shown
    ? resolveUnitPhotoUrl(shown.photoUrl, shown.unitType, shown.configuration, projectPlans)
    : null;
  const customPhoto = isCustomUnitPhoto(shown?.photoUrl);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-card",
        variant === "docked" && "card-soft min-h-[32rem] overflow-hidden lg:h-[calc(100vh-6.75rem)] lg:min-h-0",
        variant === "sheet" && "h-full",
      )}
    >
      <div className={cn("flex items-center justify-between border-b px-3 py-2", variant === "sheet" && "pr-10")}>
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unit Details</p>
          {isFetching && unitId ? (
            <span className="text-[10px] text-muted-foreground">Updating…</span>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" disabled={!prevId} onClick={() => goNeighbor(prevId)} aria-label="Previous unit">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[2.5rem] text-center text-[10px] tabular-nums text-muted-foreground">
            {index >= 0 ? `${index + 1}/${navIds.length}` : "—"}
          </span>
          <Button variant="ghost" size="icon-sm" disabled={!nextId} onClick={() => goNeighbor(nextId)} aria-label="Next unit">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!unitId ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium">Select a unit</p>
          <p className="text-xs text-muted-foreground">Click a cell on the map to inspect availability, customer and financials.</p>
        </div>
      ) : (
        <>
          {bulkUpload.fileInput}
          <div className="flex min-h-0 flex-1 flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={unitId}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="space-y-2.5 border-b px-3 pb-3 pt-3"
              >
                <div className="flex items-stretch gap-3">
                  <div className="min-w-0 flex-1">
                    {shown ? <StatusPill status={shown.status} /> : <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />}
                    <h2 className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums">
                      {shown?.unitNumber ?? "…"}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {shown
                        ? `Wing ${shown.floor.wing.name} · ${floorLabel(shown.floor.number)} · ${shown.configuration ?? shown.unitType ?? "—"}`
                        : "Loading…"}
                    </p>
                    {primary ? (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {primary.name}
                        {booking ? ` · ${booking.bookingNumber}` : ""}
                      </p>
                    ) : null}
                    {shown ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button variant="outline" size="sm" className="h-7" onClick={() => setEditing(true)}>
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                        {canBook ? (
                          <Button size="sm" className="h-7" onClick={goAddBooking}>
                            <Plus className="h-3 w-3" />
                            Add booking
                          </Button>
                        ) : null}
                        {canAddPayment ? (
                          <Button size="sm" className="h-7" onClick={openAddPayment}>
                            <HandCoins className="h-3 w-3" />
                            Add payment
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {planUrl ? (
                    <UnitPlanImage
                      src={planUrl}
                      size="fill"
                      fit="contain"
                      className="min-h-[7.5rem] w-[9.5rem] shrink-0 sm:w-[10.5rem]"
                      editable
                      isCustom={customPhoto}
                      onChange={(url) => setPhoto.mutate(url)}
                    />
                  ) : (
                    <div className="min-h-[7.5rem] w-[9.5rem] shrink-0 rounded-lg border bg-muted" />
                  )}
                </div>

                {booking ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      <MiniStat label="Sold value" value={inr(soldValue, true)} tone="danger" />
                      <MiniStat label="Received" value={inr(received, true)} tone="success" />
                      <MiniStat label="Outstanding" value={inr(outstanding, true)} tone={outstanding > 0 ? "warning" : "default"} />
                      <MiniStat label="Booked" value={formatDate(booking.bookingDate)} />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <HandCoins className="h-3 w-3" /> Collection
                        </span>
                        <span className="tabular-nums text-foreground">{collectionPct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className="h-full rounded-full bg-success"
                          initial={false}
                          animate={{ width: toCollect ? pct(received, toCollect) : "0%" }}
                          transition={{ duration: 0.4, ease: EASE }}
                        />
                      </div>
                    </div>
                  </div>
                ) : shown ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    <MiniStat label="List price" value={inr(listPrice, true)} />
                    <MiniStat label="Base + PLC" value={inr((shown.basePrice ?? 0) + (shown.plc ?? 0), true)} />
                  </div>
                ) : null}
              </motion.div>
            </AnimatePresence>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <SegmentedTabs
                compact
                tabs={[
                  { id: "overview", label: "Overview" },
                  { id: "customer", label: "Customer" },
                  { id: "financials", label: "Financials" },
                  { id: "documents", label: "Docs" },
                  { id: "activity", label: "Activity" },
                ]}
                value={tab}
                onChange={setTab}
              >
                {tab === "overview" && shown ? (
                  <div className="space-y-3">
                    <Section title="Unit">
                      <Row label="Unit No." value={shown.unitNumber} />
                      <Row label="Wing" value={shown.floor.wing.name} />
                      <Row label="Floor" value={floorLabel(shown.floor.number)} />
                      <Row label="Type" value={shown.configuration ?? shown.unitType} />
                      <Row label="Facing" value={shown.facing} />
                      <Row label="Parking" value={shown.parking} />
                      <div className="flex items-center justify-between gap-3 border-b border-border/70 py-1.5 last:border-0">
                        <span className="text-[11px] text-muted-foreground">Status</span>
                        <StatusPill status={shown.status} />
                      </div>
                    </Section>
                    <Section title="Areas">
                      <Row label="Carpet" value={area(shown.carpetArea)} />
                      <Row label="Built-up" value={area(shown.builtUpArea)} />
                      <Row label="Saleable" value={area(shown.saleableArea)} />
                      <Row label="Balcony" value={area(shown.balconyArea)} />
                    </Section>
                    <Section title="Pricing">
                      <Row label="Base price" value={inr(shown.basePrice)} />
                      <Row label="PLC" value={inr(shown.plc)} />
                      <Row label="Other charges" value={inr(shown.otherCharges)} />
                      <Row label="List price" value={inr(listPrice)} emphasize />
                    </Section>
                    {shown.remarks ? (
                      <Section title="Remarks">
                        <p className="py-1.5 text-xs text-muted-foreground">{shown.remarks}</p>
                      </Section>
                    ) : null}
                  </div>
                ) : null}

                {tab === "customer" ? (
                  booking ? (
                    <div className="space-y-3">
                      <button
                        type="button"
                        className="w-full rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted/40"
                        onClick={() => {
                          onClose?.();
                          navigate(`/bookings/${booking.id}`);
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Booking</p>
                            <p className="text-sm font-medium">{booking.bookingNumber}</p>
                          </div>
                          <StatusPill status={booking.status} />
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Booked {formatDate(booking.bookingDate)}
                          {booking.channelPartner ? ` · CP ${booking.channelPartner.name}` : ""}
                        </p>
                      </button>
                      {booking.customers.map((c) => (
                        <div key={`${c.role}-${c.mobile}-${c.name}`} className="rounded-lg border px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{c.role.replaceAll("_", " ")}</p>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.mobile}</p>
                          {c.email ? <p className="text-xs text-muted-foreground">{c.email}</p> : null}
                        </div>
                      ))}
                      <div className="grid grid-cols-2 gap-1.5">
                        <MiniStat label="Received" value={inr(received, true)} tone="success" />
                        <MiniStat label="Outstanding" value={inr(outstanding, true)} tone={outstanding > 0 ? "warning" : "default"} />
                      </div>
                      <Button size="sm" className="w-full" onClick={openAddPayment}>
                        <HandCoins className="h-3.5 w-3.5" />
                        Add payment
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                      <UserRound className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">No customer linked to this unit yet.</p>
                      {canBook ? (
                        <Button size="sm" onClick={goAddBooking}>
                          <Plus className="h-3.5 w-3.5" />
                          Add booking
                        </Button>
                      ) : null}
                    </div>
                  )
                ) : null}

                {tab === "financials" ? (
                  booking?.financials ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-1.5">
                        <MiniStat label="Total cost" value={inr(soldValue, true)} tone="danger" />
                        <MiniStat label="To collect" value={inr(toCollect, true)} />
                        <MiniStat label="Received" value={inr(received, true)} tone="success" />
                        <MiniStat label="Outstanding" value={inr(outstanding, true)} tone={outstanding > 0 ? "warning" : "default"} />
                      </div>
                      <Section title="Cost breakup">
                        <Row label="Agreement" value={inr(booking.financials.agreement)} />
                        <Row label="GST" value={inr(booking.financials.gst)} />
                        <Row label="Other charges" value={inr(booking.financials.otherCharges)} />
                        <Row label="GST on agreement" value={inr(booking.financials.gstOnAgreement)} />
                        <Row label="Stamp duty / registration" value={inr(booking.financials.stampDutyRegistration)} />
                        <Row label="Total cost" value={inr(booking.financials.totalCost)} emphasize />
                        <Row label="Finance" value={inr(booking.financials.finance)} />
                        <Row label="Value to be collected" value={inr(booking.financials.valueToBeCollected)} emphasize />
                      </Section>
                      <Section
                        title="Customer receipts"
                        action={
                          <Button variant="outline" size="sm" className="h-7" onClick={openAddPayment}>
                            <Plus className="h-3 w-3" />
                            Add payment
                          </Button>
                        }
                      >
                        {customerPayments.length ? (
                          <ul className="divide-y divide-border/70">
                            {customerPayments.map((p) => (
                              <li key={p.id} className="flex items-start justify-between gap-2 py-1.5">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium tabular-nums">{inr(p.amount)}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {formatDate(p.paymentDate)} · {p.paymentMode.toUpperCase()}
                                    {p.utrOrCheque ? ` · ${p.utrOrCheque}` : ""}
                                  </p>
                                </div>
                                <StatusPill status={p.status} />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="py-2 text-xs text-muted-foreground">No customer receipts yet.</p>
                        )}
                      </Section>
                      <div className="flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            onClose?.();
                            navigate(`/bookings/${booking.id}`);
                          }}
                        >
                          <CircleDollarSign className="h-3.5 w-3.5" />
                          Booking detail
                        </Button>
                        <Button size="sm" className="flex-1" onClick={openAddPayment}>
                          <HandCoins className="h-3.5 w-3.5" />
                          Add payment
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Section title="Inventory pricing">
                        <Row label="Base price" value={inr(shown?.basePrice)} />
                        <Row label="PLC" value={inr(shown?.plc)} />
                        <Row label="Other charges" value={inr(shown?.otherCharges)} />
                        <Row label="List price" value={inr(listPrice)} emphasize />
                      </Section>
                      <EmptyState
                        icon={FileText}
                        title="No booking financials yet."
                        actionLabel={canBook ? "Add booking" : undefined}
                        onAction={canBook ? goAddBooking : undefined}
                      />
                    </div>
                  )
                ) : null}

                {tab === "documents" && shown && projectId ? (
                  <div className="space-y-2">
                    {bulkUpload.uploading ? (
                      <p className="text-xs text-muted-foreground">Uploading documents…</p>
                    ) : null}
                    <DocumentsPanel
                      compact
                      showBulkActions
                      projectId={projectId}
                      unitId={shown.id}
                      bookingId={booking?.id}
                      entityType="unit"
                      entityId={shown.id}
                    />
                  </div>
                ) : null}

                {tab === "activity" ? (
                  (audit?.data ?? []).length ? (
                    <ul className="space-y-1.5">
                      {(audit?.data ?? []).map((row) => (
                        <li key={row.id} className="rounded-md border px-2 py-1.5">
                          <p className="text-xs font-medium">{row.action}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {row.actorName ?? "system"} · {formatDate(row.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState icon={FileText} title="No activity recorded yet." />
                  )
                ) : null}
              </SegmentedTabs>
            </div>
          </div>

          {shown ? (
            <div className="flex items-center gap-1.5 border-t p-2.5">
              <Button variant="outline" size="sm" className="flex-1" disabled={!canBook} onClick={goAddBooking}>
                <Plus className="h-3.5 w-3.5" />
                Add booking
              </Button>
              <Button size="sm" className="flex-1" disabled={!canAddPayment} onClick={openAddPayment}>
                <HandCoins className="h-3.5 w-3.5" />
                Add payment
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="px-2">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="hidden sm:inline">More</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={!canBook} onClick={goAddBooking}>
                    <Plus className="h-3.5 w-3.5" />
                    Add booking
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!canAddPayment} onClick={openAddPayment}>
                    <HandCoins className="h-3.5 w-3.5" />
                    Add payment
                  </DropdownMenuItem>
                  {booking ? (
                    <DropdownMenuItem
                      onClick={() => {
                        onClose?.();
                        navigate(`/bookings/${booking.id}`);
                      }}
                    >
                      Open booking
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!canBlock || setStatus.isPending}
                    onClick={() => setStatus.mutate("blocked")}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Block unit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={shown.status === "hold" || Boolean(booking) || setStatus.isPending}
                    onClick={() => setStatus.mutate("hold")}
                  >
                    Put on hold
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={shown.status === "available" || Boolean(booking) || setStatus.isPending}
                    onClick={() => setStatus.mutate("available")}
                  >
                    Mark available
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={shown.status === "not_available" || Boolean(booking) || setStatus.isPending}
                    onClick={() => setStatus.mutate("not_available")}
                  >
                    Mark not released
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {UNIT_DOC_UPLOAD_ACTIONS.map((action) => (
                    <DropdownMenuItem
                      key={action.category}
                      disabled={bulkUpload.uploading}
                      onClick={() => startBulkUpload(action.category)}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onClick={() => setTab("documents")}>
                    <FileText className="h-3.5 w-3.5" />
                    Open documents
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTab("financials")}>
                    <Wallet className="h-3.5 w-3.5" />
                    View financials
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setEditing(true)}>Edit unit</DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      onClose?.();
                      navigate(`/projects/${shown.floor.wing.project.id}/units/${shown.id}/edit`);
                    }}
                  >
                    Full edit page
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      onClose?.();
                      navigate(`/projects/${shown.floor.wing.project.id}/units`);
                    }}
                  >
                    Open in unit master
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </>
      )}

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add payment</DialogTitle>
            <DialogDescription>
              {booking
                ? `${booking.bookingNumber} · ${shown?.unitNumber ?? ""} · outstanding ${inr(outstanding)}`
                : "Record a receipt against this unit’s booking."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Date">
              <Input
                className="h-9"
                type="date"
                value={payForm.paymentDate}
                onChange={(e) => setPayForm((f) => ({ ...f, paymentDate: e.target.value }))}
              />
            </Field>
            <Field label="Amount">
              <Input
                className="h-9"
                type="number"
                value={payForm.amount}
                onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </Field>
            <Field label="Mode">
              <Select value={payForm.paymentMode} onValueChange={(v) => setPayForm((f) => ({ ...f, paymentMode: v }))}>
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
                value={payForm.appliesTo}
                onValueChange={(v) => setPayForm((f) => ({ ...f, appliesTo: v as "customer" | "partner" }))}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={payForm.status} onValueChange={(v) => setPayForm((f) => ({ ...f, status: v }))}>
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
                value={payForm.utrOrCheque}
                onChange={(e) => setPayForm((f) => ({ ...f, utrOrCheque: e.target.value }))}
              />
            </Field>
            <Field label="Bank" className="sm:col-span-2">
              <Input
                className="h-9"
                value={payForm.bank}
                onChange={(e) => setPayForm((f) => ({ ...f, bank: e.target.value }))}
              />
            </Field>
            <Field label="Remarks" className="sm:col-span-2">
              <Input
                className="h-9"
                value={payForm.remarks}
                onChange={(e) => setPayForm((f) => ({ ...f, remarks: e.target.value }))}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={addPayment.isPending || !payForm.amount || Number(payForm.amount) <= 0 || !booking}
              onClick={() => addPayment.mutate()}
            >
              {addPayment.isPending ? "Saving…" : "Save payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <UnitEditDialog unitId={unitId} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
