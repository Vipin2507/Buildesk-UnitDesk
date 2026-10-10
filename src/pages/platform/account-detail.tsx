import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { platformApi } from "@/lib/platform-api";
import type { AccountRow, PlanRow } from "@/pages/platform/accounts";

type Detail = AccountRow & {
  workspaceUrl: string;
  notes: string | null;
  maxUsers: number | null;
  maxProjects: number | null;
  maxUnits: number | null;
  adminName: string;
};

export function PlatformAccountDetailPage() {
  const { id } = useParams();
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
  const [newPassword, setNewPassword] = useState("");

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
  }, [data]);

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
      }),
    onSuccess: () => {
      toast.success("Account updated");
      qc.invalidateQueries({ queryKey: ["platform", "account", id] });
      qc.invalidateQueries({ queryKey: ["platform", "accounts"] });
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
      toast.success("Suspended");
      qc.invalidateQueries({ queryKey: ["platform", "account", id] });
    },
  });

  const activate = useMutation({
    mutationFn: () => platformApi.post(`/api/platform/accounts/${id}/activate`),
    onSuccess: () => {
      toast.success("Activated");
      qc.invalidateQueries({ queryKey: ["platform", "account", id] });
    },
  });

  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <PageHeader
        title={data.name}
        subtitle={`/${data.slug} · ${data.adminEmail}`}
        breadcrumbs={[
          { label: "Accounts", to: "/admin" },
          { label: data.name },
        ]}
        actions={
          <Button size="sm" variant="outline" asChild>
            <a href="/login" target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Open login
            </a>
          </Button>
        }
      />

      <div className="grid gap-2 sm:grid-cols-3">
        <CardSoft>
          <p className="text-[10px] uppercase text-muted-foreground">Users</p>
          <p className="text-lg font-semibold tabular-nums">
            {data.usage.users}/{data.limits.maxUsers}
          </p>
        </CardSoft>
        <CardSoft>
          <p className="text-[10px] uppercase text-muted-foreground">Projects</p>
          <p className="text-lg font-semibold tabular-nums">
            {data.usage.projects}/{data.limits.maxProjects}
          </p>
        </CardSoft>
        <CardSoft>
          <p className="text-[10px] uppercase text-muted-foreground">Units</p>
          <p className="text-lg font-semibold tabular-nums">
            {data.usage.units}/{data.limits.maxUnits}
          </p>
        </CardSoft>
      </div>

      <CardSoft className="space-y-3">
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
            <Input className="h-9" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} placeholder="Plan default" />
          </Field>
          <Field label="Max projects override">
            <Input className="h-9" value={maxProjects} onChange={(e) => setMaxProjects(e.target.value)} placeholder="Plan default" />
          </Field>
          <Field label="Max units override">
            <Input className="h-9" value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} placeholder="Plan default" />
          </Field>
        </div>
        <Field label="Notes">
          <Input className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex flex-wrap justify-between gap-1.5">
          <div className="flex gap-1.5">
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
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        </div>
      </CardSoft>

      <CardSoft className="space-y-3">
        <p className="text-sm font-medium">Reset admin password</p>
        <p className="text-xs text-muted-foreground">
          Sets a new password for {data.adminEmail} in the tenant database.
        </p>
        <Field label="New password">
          <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
        <Button
          size="sm"
          variant="outline"
          disabled={newPassword.length < 6 || resetPw.isPending}
          onClick={() => resetPw.mutate()}
        >
          Reset password
        </Button>
      </CardSoft>

      <Button size="sm" variant="ghost" asChild>
        <Link to="/admin">Back to accounts</Link>
      </Button>
    </div>
  );
}
