import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordInput } from "@/components/shared/password-input";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { platformApi } from "@/lib/platform-api";
import {
  daysUntil,
  formatDate,
  planTone,
  UsageBar,
} from "@/pages/platform/shared";
import type { AccountRow, PlanRow } from "@/pages/platform/types";

type Detail = AccountRow & {
  workspaceUrl: string;
  notes: string | null;
  maxUsers: number | null;
  maxProjects: number | null;
  maxUnits: number | null;
  adminName: string;
  createdAt?: string;
};

export function PlatformAccountDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const detailQ = useQuery({
    queryKey: ["platform", "account", id],
    queryFn: () => platformApi.get<Detail>(`/api/platform/accounts/${id}`),
    enabled: Boolean(id),
  });
  const plansQ = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => platformApi.get<{ data: PlanRow[] }>("/api/platform/plans"),
  });

  const data = detailQ.data;
  const [name, setName] = useState("");
  const [planCode, setPlanCode] = useState("basic");
  const [status, setStatus] = useState("trial");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxUsers, setMaxUsers] = useState("");
  const [maxProjects, setMaxProjects] = useState("");
  const [maxUnits, setMaxUnits] = useState("");
  const [notes, setNotes] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [extendDays, setExtendDays] = useState("30");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setPlanCode(data.plan.code);
    setStatus(data.status);
    setExpiresAt(data.expiresAt ? data.expiresAt.slice(0, 10) : "");
    setMaxUsers(data.maxUsers != null ? String(data.maxUsers) : "");
    setMaxProjects(data.maxProjects != null ? String(data.maxProjects) : "");
    setMaxUnits(data.maxUnits != null ? String(data.maxUnits) : "");
    setNotes(data.notes ?? "");
    setAdminName(data.adminName);
    setAdminEmail(data.adminEmail);
  }, [data]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["platform", "account", id] });
    void qc.invalidateQueries({ queryKey: ["platform", "accounts"] });
    void qc.invalidateQueries({ queryKey: ["platform", "dashboard"] });
  };

  const save = useMutation({
    mutationFn: () =>
      platformApi.patch(`/api/platform/accounts/${id}`, {
        name,
        planCode,
        status,
        expiresAt: expiresAt || null,
        maxUsers: maxUsers ? Number(maxUsers) : null,
        maxProjects: maxProjects ? Number(maxProjects) : null,
        maxUnits: maxUnits ? Number(maxUnits) : null,
        notes: notes || null,
        adminName,
        adminEmail,
      }),
    onSuccess: () => {
      toast.success("Account updated");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Update failed"),
  });

  const resetPw = useMutation({
    mutationFn: () =>
      platformApi.post(`/api/platform/accounts/${id}/reset-admin-password`, {
        password: newPassword,
      }),
    onSuccess: () => {
      toast.success("Admin password reset");
      setNewPassword("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Reset failed"),
  });

  const suspend = useMutation({
    mutationFn: () => platformApi.post(`/api/platform/accounts/${id}/suspend`),
    onSuccess: () => {
      toast.success("Account suspended");
      invalidate();
    },
  });

  const activate = useMutation({
    mutationFn: () => platformApi.post(`/api/platform/accounts/${id}/activate`),
    onSuccess: () => {
      toast.success("Account activated");
      invalidate();
    },
  });

  const extend = useMutation({
    mutationFn: () =>
      platformApi.post(`/api/platform/accounts/${id}/extend`, {
        days: Number(extendDays) || 30,
      }),
    onSuccess: () => {
      toast.success(`Extended by ${extendDays} days`);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Extend failed"),
  });

  const remove = useMutation({
    mutationFn: () =>
      platformApi.post(`/api/platform/accounts/${id}/delete`, { confirmSlug }),
    onSuccess: () => {
      toast.success("Account deleted");
      navigate("/admin/accounts");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Delete failed"),
  });

  if (detailQ.isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading account…</p>;
  }

  const days = daysUntil(data.expiresAt);

  function copyText(label: string, value: string) {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={data.name}
        subtitle={`/${data.slug} · created ${formatDate(data.createdAt)}`}
        breadcrumbs={[
          { label: "Accounts", to: "/admin/accounts" },
          { label: data.name },
        ]}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" asChild>
              <a href="/login" target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open login
              </a>
            </Button>
            {data.status !== "suspended" ? (
              <Button size="sm" variant="outline" onClick={() => suspend.mutate()}>
                Suspend
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => activate.mutate()}>
                Activate
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={data.status} />
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
            planTone(data.plan.code),
          )}
        >
          {data.plan.name}
        </span>
        <span className="text-[11px] text-muted-foreground">
          Expires {formatDate(data.expiresAt)}
          {days != null ? ` · ${days}d left` : ""}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <UsageBar label="Users" used={data.usage.users} max={data.limits.maxUsers} />
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <UsageBar
            label="Projects"
            used={data.usage.projects}
            max={data.limits.maxProjects}
          />
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <UsageBar label="Units" used={data.usage.units} max={data.limits.maxUnits} />
        </div>
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Account settings</h2>
        <Field label="Organisation name">
          <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Plan">
            <Select value={planCode} onValueChange={setPlanCode}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(plansQ.data?.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.code}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Expires">
          <Input
            type="date"
            className="h-9"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Max users override">
            <Input
              className="h-9"
              value={maxUsers}
              onChange={(e) => setMaxUsers(e.target.value)}
              placeholder="Plan default"
            />
          </Field>
          <Field label="Max projects override">
            <Input
              className="h-9"
              value={maxProjects}
              onChange={(e) => setMaxProjects(e.target.value)}
              placeholder="Plan default"
            />
          </Field>
          <Field label="Max units override">
            <Input
              className="h-9"
              value={maxUnits}
              onChange={(e) => setMaxUnits(e.target.value)}
              placeholder="Plan default"
            />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <div className="flex justify-end">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Workspace admin</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Admin name">
            <Input
              className="h-9"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
            />
          </Field>
          <Field label="Admin email">
            <div className="flex gap-1.5">
              <Input
                type="email"
                className="h-9"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => copyText("Email", adminEmail)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Field>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Changing email updates the global login directory. Save account settings to apply.
        </p>
        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-medium">Reset password</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="New password" className="flex-1">
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Button
              size="sm"
              variant="outline"
              disabled={newPassword.length < 6 || resetPw.isPending}
              onClick={() => resetPw.mutate()}
            >
              Reset password
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Extend access</h2>
        <p className="text-[11px] text-muted-foreground">
          Push the expiry date forward from today (or current expiry if still in the future).
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Days">
            <Select value={extendDays} onValueChange={setExtendDays}>
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Button size="sm" disabled={extend.isPending} onClick={() => extend.mutate()}>
            Extend
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-destructive/25 bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
        <p className="text-[11px] text-muted-foreground">
          Permanently deletes this client account, email directory entries, and the tenant
          database file. This cannot be undone.
        </p>
        <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-3.5 w-3.5" />
          Delete account
        </Button>
      </section>

      <Button size="sm" variant="ghost" asChild>
        <Link to="/admin/accounts">Back to accounts</Link>
      </Button>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {data.name}?</DialogTitle>
            <DialogDescription>
              Type the workspace id <span className="font-mono font-medium">{data.slug}</span>{" "}
              to confirm permanent deletion.
            </DialogDescription>
          </DialogHeader>
          <Input
            className="h-9 font-mono"
            value={confirmSlug}
            onChange={(e) => setConfirmSlug(e.target.value)}
            placeholder={data.slug}
          />
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={confirmSlug !== data.slug || remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Deleting…" : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
