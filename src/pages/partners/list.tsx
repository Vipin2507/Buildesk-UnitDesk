import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Handshake,
  MoreHorizontal,
  Plus,
  Search,
  UserCheck,
  UserX,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { PasswordInput } from "@/components/shared/password-input";
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
import { inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Partner = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  panGst: string | null;
  firmName: string | null;
  status: string;
  hasPortalAccess?: boolean;
  _count: { bookings: number };
};

type Summary = {
  total: number;
  active: number;
  inactive: number;
  withBookings: number;
  entitlement: number;
  received: number;
  outstanding: number;
};

type Form = {
  name: string;
  phone: string;
  email: string;
  panGst: string;
  firmName: string;
  status: string;
  password: string;
};

const emptyForm = (): Form => ({
  name: "",
  phone: "",
  email: "",
  panGst: "",
  firmName: "",
  status: "active",
  password: "",
});

function fail(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback);
}

function stopRow(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

export function PartnersListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [kpiFilter, setKpiFilter] = useState<"all" | "active" | "inactive" | "bookings">("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [confirm, setConfirm] = useState<Partner | null>(null);

  const listParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      pageSize: 100,
    }),
    [search, statusFilter],
  );

  const { data: summary } = useQuery({
    queryKey: qk.partnersSummary,
    queryFn: () => api.get<Summary>("/api/channel-partners/summary"),
  });

  const { data, isLoading } = useQuery({
    queryKey: [...qk.partners, listParams],
    queryFn: () => api.get<ListResponse<Partner>>("/api/channel-partners", listParams),
  });

  const rows = useMemo(() => {
    const list = data?.data ?? [];
    if (kpiFilter === "active") return list.filter((r) => r.status === "active");
    if (kpiFilter === "inactive") return list.filter((r) => r.status === "inactive");
    if (kpiFilter === "bookings") return list.filter((r) => r._count.bookings > 0);
    return list;
  }, [data?.data, kpiFilter]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(row: Partner) {
    setEditing(row);
    setForm({
      name: row.name,
      phone: row.phone ?? "",
      email: row.email ?? "",
      panGst: row.panGst ?? "",
      firmName: row.firmName ?? "",
      status: row.status,
      password: "",
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        panGst: form.panGst.trim() || null,
        firmName: form.firmName.trim() || null,
        status: form.status,
        ...(form.password ? { password: form.password } : {}),
      };
      return editing
        ? api.patch(`/api/channel-partners/${editing.id}`, body)
        : api.post("/api/channel-partners", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.partners });
      qc.invalidateQueries({ queryKey: qk.partnersSummary });
      toast.success(editing ? "Partner updated" : "Partner added");
      setOpen(false);
    },
    onError: (err) => fail(err, "Could not save partner"),
  });

  const toggleStatus = useMutation({
    mutationFn: (row: Partner) =>
      api.patch(`/api/channel-partners/${row.id}`, {
        status: row.status === "active" ? "inactive" : "active",
      }),
    onSuccess: (_, row) => {
      qc.invalidateQueries({ queryKey: qk.partners });
      qc.invalidateQueries({ queryKey: qk.partnersSummary });
      toast.success(row.status === "active" ? "Partner deactivated" : "Partner activated");
    },
    onError: (err) => fail(err, "Could not update status"),
  });

  const remove = useMutation({
    mutationFn: () => api.del<{ deactivated?: boolean; ok?: boolean }>(`/api/channel-partners/${confirm!.id}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qk.partners });
      qc.invalidateQueries({ queryKey: qk.partnersSummary });
      toast.success(res?.deactivated ? "Partner deactivated (has bookings)" : "Partner deleted");
      setConfirm(null);
      setOpen(false);
    },
    onError: (err) => fail(err, "Could not delete partner"),
  });

  const valid = form.name.trim().length >= 2 && (!form.email || form.email.includes("@"));

  return (
    <PageWrap>
      <PageHeader
        title="Channel partners"
        subtitle="Brokers, CP firms, portal access and brokerage entitlements"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> Add partner
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard
          label="Partners"
          value={summary?.total ?? 0}
          icon={Handshake}
          active={kpiFilter === "all"}
          onClick={() => {
            setKpiFilter("all");
            setStatusFilter("all");
          }}
        />
        <KpiCard
          label="Active"
          value={summary?.active ?? 0}
          icon={UserCheck}
          tone="success"
          active={kpiFilter === "active"}
          onClick={() => {
            setKpiFilter("active");
            setStatusFilter("active");
          }}
        />
        <KpiCard
          label="Inactive"
          value={summary?.inactive ?? 0}
          icon={UserX}
          tone="muted"
          active={kpiFilter === "inactive"}
          onClick={() => {
            setKpiFilter("inactive");
            setStatusFilter("inactive");
          }}
        />
        <KpiCard
          label="With bookings"
          value={summary?.withBookings ?? 0}
          icon={Wallet}
          active={kpiFilter === "bookings"}
          onClick={() => setKpiFilter("bookings")}
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-md border px-3 py-2 text-xs">
          <p className="text-[10px] uppercase text-muted-foreground">Entitlement</p>
          <p className="font-semibold tabular-nums">{inr(summary?.entitlement ?? 0)}</p>
        </div>
        <div className="rounded-md border px-3 py-2 text-xs">
          <p className="text-[10px] uppercase text-muted-foreground">Received</p>
          <p className="font-semibold tabular-nums text-success">{inr(summary?.received ?? 0)}</p>
        </div>
        <div className="rounded-md border px-3 py-2 text-xs">
          <p className="text-[10px] uppercase text-muted-foreground">Outstanding</p>
          <p className="font-semibold tabular-nums text-destructive">{inr(summary?.outstanding ?? 0)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8"
            placeholder="Search name, phone, firm…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setKpiFilter(v === "active" ? "active" : v === "inactive" ? "inactive" : "all");
          }}
        >
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        rows={rows}
        onRowClick={(row) => navigate(`/settings/channel-partners/${row.id}`)}
        empty={
          <EmptyState
            icon={Handshake}
            title={isLoading ? "Loading partners…" : "No partners yet."}
            actionLabel="Add partner"
            onAction={openCreate}
          />
        }
        columns={[
          {
            key: "name",
            header: "Partner",
            cell: (r) => (
              <div>
                <p className="font-medium">{r.name}</p>
                {r.firmName ? <p className="text-[11px] text-muted-foreground">{r.firmName}</p> : null}
              </div>
            ),
          },
          { key: "phone", header: "Phone", cell: (r) => r.phone ?? "—" },
          { key: "email", header: "Email", cell: (r) => r.email ?? "—", hideOnMobile: true },
          { key: "gst", header: "PAN / GST", cell: (r) => r.panGst ?? "—", hideOnMobile: true },
          { key: "bk", header: "Bookings", cell: (r) => r._count.bookings },
          {
            key: "portal",
            header: "Portal",
            hideOnMobile: true,
            cell: (r) => (
              <span className={r.hasPortalAccess ? "text-success" : "text-muted-foreground"}>
                {r.hasPortalAccess ? "Enabled" : "—"}
              </span>
            ),
          },
          { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          {
            key: "actions",
            header: "",
            className: "w-10",
            cell: (r) => (
              <div onClick={stopRow} onPointerDown={stopRow}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`}>
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => navigate(`/settings/channel-partners/${r.id}`)}>
                      Open dashboard
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openEdit(r)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => toggleStatus.mutate(r)}>
                      {r.status === "active" ? "Deactivate" : "Activate"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setConfirm(r)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ),
          },
        ]}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit partner" : "Add channel partner"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update profile, status or portal password."
                : "Optional portal password lets the partner sign in at /partner/login."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Field label="Name">
              <Input className="h-8" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Firm name">
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
            <Field label={editing ? "New portal password (optional)" : "Portal password (optional)"}>
              <PasswordInput
                className="h-8"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
            <div className="mt-1 flex items-center justify-between gap-2">
              {editing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setConfirm(editing)}
                >
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : editing ? "Save changes" : "Create partner"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete partner?</DialogTitle>
            <DialogDescription>
              {confirm?._count.bookings
                ? `“${confirm.name}” has bookings and will be deactivated instead of hard-deleted.`
                : `Permanently delete “${confirm?.name}”. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? "Working…" : confirm?._count.bookings ? "Deactivate" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrap>
  );
}
