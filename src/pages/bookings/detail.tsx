import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { formatDate, inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { DataTable } from "@/components/shared/data-table";
import { DocumentsPanel } from "@/components/shared/documents-panel";

type Booking = {
  id: string;
  bookingNumber: string;
  bookingDate: string;
  status: string;
  unit: { unitNumber: string };
  project: { name: string };
  customers: { id: string; role: string; name: string; mobile: string; email: string | null }[];
  financials: {
    basicSaleValue: number;
    otherCharges: number;
    totalCost: number;
    agreementValue: number;
    cashComponent: number;
    financedComponent: number;
  } | null;
  entitlement: {
    entitlementPercent: number | null;
    entitlementAmount: number;
    received: number;
    outstanding: number;
  } | null;
  channelPartner: { name: string } | null;
  payments: {
    id: string;
    paymentDate: string;
    amount: number;
    paymentMode: string;
    status: string;
    appliesTo: string;
  }[];
  schedules: { id: string; name: string; dueDate: string; amount: number; received: number; outstanding: number; status: string }[];
  invoices: { id: string; number: string; kind: string; amount: number; issuedAt: string; status: string }[];
  reminders: { id: string; title: string; status: string; dueAt: string; channel: string }[];
  projectId: string;
  unitId: string;
};

export function BookingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({
    amount: 0,
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMode: "neft",
    appliesTo: "partner" as "customer" | "partner",
    utrOrCheque: "",
    bank: "",
  });

  const { data } = useQuery({
    queryKey: qk.booking(id!),
    queryFn: () => api.get<Booking>(`/api/bookings/${id}`),
    enabled: Boolean(id),
  });

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
      api.patch<{ approval?: { id: string }; message?: string; status?: string }>(`/api/bookings/${id}/status`, { status }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qk.booking(id!) });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
      if (res.approval) toast.message(res.message ?? "Sent for approval");
      else toast.success("Status updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed"),
  });

  return (
    <PageWrap>
      <PageHeader
        title={data?.bookingNumber ?? "Booking"}
        subtitle={`${data?.project.name ?? ""} · ${data?.unit.unitNumber ?? ""} · ${formatDate(data?.bookingDate)}`}
        breadcrumbs={[{ label: "Bookings", to: "/bookings" }, { label: data?.bookingNumber ?? "Detail" }]}
        actions={
          data ? (
            <div className="flex gap-1.5">
              {data.status !== "confirmed" ? (
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate("confirmed")}>Confirm</Button>
              ) : null}
              {data.status !== "cancelled" ? (
                <Button size="sm" variant="destructive" onClick={() => setStatus.mutate("cancelled")}>Cancel</Button>
              ) : null}
            </div>
          ) : null
        }
      />
      {data ? <StatusPill status={data.status} /> : null}

      <div className="grid gap-2 lg:grid-cols-2">
        <CardSoft className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer details</p>
          {data?.customers.map((c) => (
            <div key={c.id} className="rounded-lg border p-2.5">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">{c.role.replace("_", " ")}</p>
              <p className="text-sm font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.mobile} {c.email ? `· ${c.email}` : ""}</p>
            </div>
          ))}
        </CardSoft>
        <CardSoft className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Financial details</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Basic sale value</span>
            <span className="text-right tabular-nums">{inr(data?.financials?.basicSaleValue)}</span>
            <span className="text-muted-foreground">Other charges</span>
            <span className="text-right tabular-nums">{inr(data?.financials?.otherCharges)}</span>
            <span className="text-muted-foreground">Total cost</span>
            <span className="text-right font-semibold tabular-nums">{inr(data?.financials?.totalCost)}</span>
            <span className="text-muted-foreground">Agreement value</span>
            <span className="text-right tabular-nums">{inr(data?.financials?.agreementValue)}</span>
            <span className="text-muted-foreground">Cash component</span>
            <span className="text-right tabular-nums">{inr(data?.financials?.cashComponent)}</span>
            <span className="text-muted-foreground">Financed component</span>
            <span className="text-right tabular-nums">{inr(data?.financials?.financedComponent)}</span>
          </div>
        </CardSoft>
      </div>

      <CardSoft className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Channel partner collection</p>
          <Button size="sm" onClick={() => setPayOpen(true)}>Add payment</Button>
        </div>
        {data?.channelPartner ? (
          <div className="grid gap-2 sm:grid-cols-5 text-sm">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Partner</p>
              <p className="font-medium">{data.channelPartner.name}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Share %</p>
              <p className="tabular-nums">{data.entitlement?.entitlementPercent ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Receivable</p>
              <p className="tabular-nums">{inr(data.entitlement?.entitlementAmount)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Received</p>
              <p className="tabular-nums">{inr(data.entitlement?.received)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Outstanding</p>
              <p className={`font-semibold tabular-nums ${(data.entitlement?.outstanding ?? 0) > 0 ? "text-destructive" : ""}`}>
                {inr(data.entitlement?.outstanding)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No channel partner on this booking.</p>
        )}
      </CardSoft>

      <CardSoft>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payments</p>
        <DataTable
          rows={data?.payments ?? []}
          columns={[
            { key: "date", header: "Date", cell: (r) => formatDate(r.paymentDate) },
            { key: "amt", header: "Amount", cell: (r) => inr(r.amount) },
            { key: "mode", header: "Mode", cell: (r) => r.paymentMode.toUpperCase() },
            { key: "to", header: "Applies to", cell: (r) => r.appliesTo },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          ]}
        />
      </CardSoft>

      <CardSoft>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payment schedule</p>
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
              Generate
            </Button>
          ) : null}
        </div>
        <DataTable
          rows={data?.schedules ?? []}
          columns={[
            { key: "n", header: "Milestone", cell: (r) => r.name },
            { key: "d", header: "Due", cell: (r) => formatDate(r.dueDate) },
            { key: "a", header: "Amount", cell: (r) => inr(r.amount) },
            { key: "r", header: "Received", cell: (r) => inr(r.received) },
            { key: "o", header: "Outstanding", cell: (r) => inr(r.outstanding) },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          ]}
        />
      </CardSoft>

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
              <Input className="h-8" type="number" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: Number(e.target.value) }))} />
            </Field>
            <Field label="Date">
              <Input className="h-8" type="date" value={pay.paymentDate} onChange={(e) => setPay((p) => ({ ...p, paymentDate: e.target.value }))} />
            </Field>
            <Field label="Mode">
              <Select value={pay.paymentMode} onValueChange={(v) => setPay((p) => ({ ...p, paymentMode: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["cash", "cheque", "neft", "rtgs", "upi"].map((m) => (
                    <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Applies to">
              <Select value={pay.appliesTo} onValueChange={(v) => setPay((p) => ({ ...p, appliesTo: v as "customer" | "partner" }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="UTR / cheque">
              <Input className="h-8" value={pay.utrOrCheque} onChange={(e) => setPay((p) => ({ ...p, utrOrCheque: e.target.value }))} />
            </Field>
            <Field label="Bank">
              <Input className="h-8" value={pay.bank} onChange={(e) => setPay((p) => ({ ...p, bank: e.target.value }))} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => addPay.mutate()} disabled={addPay.isPending}>Save payment</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrap>
  );
}
