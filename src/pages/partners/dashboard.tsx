import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Handshake, IndianRupee, Pencil, Wallet } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { Field } from "@/components/shared/field";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { PasswordInput } from "@/components/shared/password-input";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Dash = {
  partner: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    panGst: string | null;
    firmName: string | null;
    status: string;
    hasPortalAccess?: boolean;
  };
  kpis: {
    bookingValue: number;
    entitlement: number;
    received: number;
    outstanding: number;
    bookings: number;
  };
  bookings: {
    id: string;
    project: string;
    projectId: string;
    unit: string;
    bookingNumber: string;
    bookingValue: number;
    entitlement: number;
    received: number;
    outstanding: number;
    status: string;
  }[];
};

export function PartnerDashboardPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    panGst: "",
    firmName: "",
    status: "active",
    password: "",
  });

  const { data } = useQuery({
    queryKey: qk.partnerDashboard(id!),
    queryFn: () => api.get<Dash>(`/api/channel-partners/${id}/dashboard`),
    enabled: Boolean(id),
  });

  function openEdit() {
    if (!data?.partner) return;
    const p = data.partner;
    setForm({
      name: p.name,
      phone: p.phone ?? "",
      email: p.email ?? "",
      panGst: p.panGst ?? "",
      firmName: p.firmName ?? "",
      status: p.status,
      password: "",
    });
    setEditOpen(true);
  }

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/channel-partners/${id}`, {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        panGst: form.panGst.trim() || null,
        firmName: form.firmName.trim() || null,
        status: form.status,
        ...(form.password ? { password: form.password } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.partnerDashboard(id!) });
      qc.invalidateQueries({ queryKey: qk.partners });
      qc.invalidateQueries({ queryKey: qk.partnersSummary });
      toast.success("Partner updated");
      setEditOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not save"),
  });

  return (
    <PageWrap>
      <PageHeader
        title={data?.partner.name ?? "Partner"}
        subtitle={[data?.partner.firmName, data?.partner.phone, data?.partner.email]
          .filter(Boolean)
          .join(" · ") || "Channel partner dashboard"}
        breadcrumbs={[
          { label: "Settings", to: "/settings" },
          { label: "Channel partners", to: "/settings/channel-partners" },
          { label: data?.partner.name ?? "…" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {data?.partner.status ? <StatusPill status={data.partner.status} /> : null}
            <Button size="sm" variant="outline" onClick={openEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard label="Total booking value" value={Math.round(data?.kpis.bookingValue ?? 0)} icon={IndianRupee} />
        <KpiCard label="Total entitlement" value={Math.round(data?.kpis.entitlement ?? 0)} icon={Handshake} />
        <KpiCard label="Total received" value={Math.round(data?.kpis.received ?? 0)} icon={Wallet} tone="success" />
        <KpiCard label="Outstanding" value={Math.round(data?.kpis.outstanding ?? 0)} icon={AlertCircle} tone="danger" />
      </div>
      <CardSoft padded={false} className="p-0">
        <div className="flex items-center justify-between p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Booking-wise ({data?.kpis.bookings ?? 0})
          </p>
          {data?.partner.hasPortalAccess ? (
            <span className="text-[11px] text-success">Portal enabled</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">No portal password</span>
          )}
        </div>
        <DataTable
          rows={(data?.bookings ?? []).map((b) => ({ ...b }))}
          columns={[
            {
              key: "booking",
              header: "Booking",
              cell: (r) => (
                <Link to={`/bookings/${r.id}`} className="font-medium hover:underline">
                  {r.bookingNumber || r.unit}
                </Link>
              ),
            },
            { key: "project", header: "Project", cell: (r) => r.project },
            { key: "unit", header: "Unit", cell: (r) => r.unit },
            { key: "val", header: "Booking value", cell: (r) => inr(r.bookingValue) },
            { key: "ent", header: "Entitlement", cell: (r) => inr(r.entitlement) },
            { key: "rec", header: "Received", cell: (r) => inr(r.received) },
            {
              key: "out",
              header: "Outstanding",
              cell: (r) => (
                <span className={r.outstanding > 0 ? "font-medium text-destructive" : ""}>
                  {inr(r.outstanding)}
                </span>
              ),
            },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          ]}
        />
      </CardSoft>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit partner</DialogTitle>
            <DialogDescription>Changes sync immediately to the partner directory and portal login.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Field label="Name">
              <Input className="h-8" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Firm">
              <Input
                className="h-8"
                value={form.firmName}
                onChange={(e) => setForm({ ...form, firmName: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input className="h-8" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input
                className="h-8"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="PAN / GST">
              <Input
                className="h-8"
                value={form.panGst}
                onChange={(e) => setForm({ ...form, panGst: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="New portal password (optional)">
              <PasswordInput
                className="h-8"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={form.name.trim().length < 2 || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrap>
  );
}
