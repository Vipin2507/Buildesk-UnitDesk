import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
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
import { formatDate, inr, pct } from "@/lib/format";
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

export function PaymentsPage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [appliesFilter, setAppliesFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [confirm, setConfirm] = useState<Payment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data: summary } = useQuery({
    queryKey: [...qk.paymentsList({ projectId }), "summary"],
    queryFn: () => api.get<Summary>("/api/payments/summary", { projectId }),
  });

  const { data } = useQuery({
    queryKey: qk.paymentsList({ projectId, appliesFilter, statusFilter }),
    queryFn: () =>
      api.get<ListResponse<Payment>>("/api/payments", {
        pageSize: 100,
        projectId,
        appliesTo: appliesFilter ?? undefined,
        status: statusFilter ?? undefined,
      }),
  });

  const { data: bookings } = useQuery({
    queryKey: qk.bookings({ projectId, forPayments: true }),
    queryFn: () =>
      api.get<ListResponse<BookingOption>>("/api/bookings", {
        pageSize: 100,
        projectId,
        status: "booked,confirmed,hold",
      }),
    enabled: formOpen,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.data ?? []).filter((r) => {
      if (!q) return true;
      return (
        r.booking.bookingNumber.toLowerCase().includes(q) ||
        r.booking.unit.unitNumber.toLowerCase().includes(q) ||
        r.booking.project.name.toLowerCase().includes(q) ||
        (r.booking.customers?.[0]?.name ?? "").toLowerCase().includes(q) ||
        r.paymentMode.toLowerCase().includes(q)
      );
    });
  }, [data?.data, search]);

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

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(row: Payment) {
    setEditing(row);
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
        subtitle="CRUD against value to be collected · customer receipts and partner payouts"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> Add payment
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <CardSoft>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Value to collect</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{inr(summary?.toCollect)}</p>
          <p className="text-[11px] text-muted-foreground">{summary?.bookings ?? 0} bookings</p>
        </CardSoft>
        <CardSoft>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Received</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-success">{inr(summary?.received)}</p>
          <p className="text-[11px] text-muted-foreground">{summary?.collectionPct ?? 0}% collected</p>
        </CardSoft>
        <CardSoft>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Outstanding</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-warning">{inr(summary?.outstanding)}</p>
          <p className="text-[11px] text-muted-foreground">
            {pct(summary?.outstanding ?? 0, summary?.toCollect ?? 0)} of demand
          </p>
        </CardSoft>
        <CardSoft>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">This month</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{inr(summary?.thisMonth)}</p>
          <p className="text-[11px] text-muted-foreground">{summary?.payments ?? 0} receipts</p>
        </CardSoft>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8"
            placeholder="Search booking, unit, customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(["customer", "partner"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAppliesFilter(appliesFilter === v ? null : v)}
            className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${
              appliesFilter === v ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"
            }`}
          >
            {v}
          </button>
        ))}
        {["received", "pending", "verified", "reconciled"].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setStatusFilter(statusFilter === v ? null : v)}
            className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${
              statusFilter === v ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <DataTable
        rows={rows}
        onRowClick={(row) => navigate(`/bookings/${row.booking.id}`)}
        columns={[
          { key: "date", header: "Date", cell: (r) => formatDate(r.paymentDate) },
          {
            key: "bk",
            header: "Booking",
            cell: (r) => (
              <span>
                <span className="block font-medium">{r.booking.bookingNumber}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {r.booking.project.name} · {r.booking.unit.unitNumber}
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
          { key: "amt", header: "Amount", cell: (r) => inr(r.amount) },
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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit payment" : "Add payment"}</DialogTitle>
            <DialogDescription>
              Amounts are validated against the booking&apos;s value to be collected.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Booking" className="sm:col-span-2">
              <Select
                value={form.bookingId || undefined}
                onValueChange={(v) => {
                  const b = (bookings?.data ?? []).find((x) => x.id === v);
                  setForm((f) => ({
                    ...f,
                    bookingId: v,
                    amount:
                      f.amount ||
                      (b ? String(collectable(b)) : f.amount),
                  }));
                }}
                disabled={Boolean(editing)}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Select booking" /></SelectTrigger>
                <SelectContent>
                  {(bookings?.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bookingNumber} · {b.unit.unitNumber} · collect {inr(collectable(b))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {selectedBooking ? (
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                Value to be collected {inr(collectable(selectedBooking))}
                {bookingOutstanding != null ? ` · Outstanding ${inr(bookingOutstanding)}` : ""}
                {selectedBooking.customers?.[0]?.name
                  ? ` · ${selectedBooking.customers[0].name}`
                  : ""}
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
              disabled={
                save.isPending ||
                !form.bookingId ||
                !form.amount ||
                Number(form.amount) <= 0
              }
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
              Remove {inr(confirm?.amount)} on {confirm?.booking.bookingNumber}. Schedules will recompute from value to be collected.
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
