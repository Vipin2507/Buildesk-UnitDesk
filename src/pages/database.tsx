import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Database,
  Download,
  HardDrive,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api, ApiError, getToken, type ListResponse } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/cn";

type BackupRow = {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
  kind: "daily" | "manual";
};

type DbStatus = {
  dbPath: string;
  exists: boolean;
  sizeBytes: number;
  todayBackup: BackupRow | null;
  lastBackup: BackupRow | null;
  backupCount: number;
  maxBackups: number;
  counts: {
    users: number;
    roles: number;
    companies: number;
    projects: number;
    units: number;
    bookings: number;
    partners: number;
    payments: number;
  };
};

function fail(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback);
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function downloadBackupFile(name: string) {
  const token = getToken();
  const res = await fetch(`/api/database/backups/${encodeURIComponent(name)}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = "Download failed";
    try {
      const json = await res.json();
      message = json?.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function DatabasePage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [restoreTarget, setRestoreTarget] = useState<BackupRow | null>(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearPassword, setClearPassword] = useState("");
  const [clearConfirm, setClearConfirm] = useState("");

  const isSuper = Boolean(user?.isSuperAdmin);

  const statusQ = useQuery({
    queryKey: qk.databaseStatus,
    queryFn: () => api.get<DbStatus>("/api/database/status"),
    enabled: isSuper,
    refetchInterval: 30_000,
  });

  const backupsQ = useQuery({
    queryKey: qk.databaseBackups,
    queryFn: () => api.get<ListResponse<BackupRow>>("/api/database/backups"),
    enabled: isSuper,
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.databaseStatus });
    qc.invalidateQueries({ queryKey: qk.databaseBackups });
  };

  const createBackup = useMutation({
    mutationFn: () => api.post<BackupRow>("/api/database/backups"),
    onSuccess: (row) => {
      toast.success(`Backup created · ${row.name}`);
      invalidate();
    },
    onError: (err) => fail(err, "Backup failed"),
  });

  const restore = useMutation({
    mutationFn: () =>
      api.post(`/api/database/backups/${encodeURIComponent(restoreTarget!.id)}/restore`, {
        password: restorePassword,
      }),
    onSuccess: () => {
      toast.success("Database restored — reloading…");
      setRestoreTarget(null);
      setRestorePassword("");
      setTimeout(() => window.location.assign("/"), 800);
    },
    onError: (err) => fail(err, "Restore failed"),
  });

  const removeBackup = useMutation({
    mutationFn: (id: string) => api.del(`/api/database/backups/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success("Backup deleted");
      invalidate();
    },
    onError: (err) => fail(err, "Delete failed"),
  });

  const clearDb = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; usersKept: number }>("/api/database/clear", {
        password: clearPassword,
        confirm: "CLEAR",
      }),
    onSuccess: (res) => {
      toast.success(`Database cleared · ${res.usersKept} users kept`);
      setClearOpen(false);
      setClearPassword("");
      setClearConfirm("");
      invalidate();
      qc.clear();
      setTimeout(() => window.location.assign("/"), 900);
    },
    onError: (err) => fail(err, "Clear failed"),
  });

  if (!isSuper) {
    return (
      <PageWrap>
        <PageHeader title="Database" subtitle="Backup, restore & data wipe" />
        <EmptyState icon={Database} title="Super Admin only — database management is restricted" />
      </PageWrap>
    );
  }

  const status = statusQ.data;
  const backups = backupsQ.data?.data ?? [];

  return (
    <PageWrap>
      <PageHeader
        title="Database management"
        subtitle="Daily backups, restore, download · clear business data while keeping users"
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => invalidate()}
              disabled={statusQ.isFetching}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", statusQ.isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => createBackup.mutate()}
              disabled={createBackup.isPending}
            >
              <HardDrive className="h-3.5 w-3.5" />
              {createBackup.isPending ? "Backing up…" : "Backup now"}
            </Button>
          </div>
        }
      />

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Database"
          value={status ? formatBytes(status.sizeBytes) : "—"}
          hint={status?.dbPath ?? "…"}
        />
        <Stat
          label="Today’s backup"
          value={status?.todayBackup ? "Ready" : "Pending"}
          hint={
            status?.todayBackup
              ? formatWhen(status.todayBackup.createdAt)
              : "Auto-created once per day"
          }
          tone={status?.todayBackup ? "ok" : "warn"}
        />
        <Stat
          label="Backups kept"
          value={status ? String(status.backupCount) : "—"}
          hint={`Max ${status?.maxBackups ?? 30} · oldest pruned`}
        />
        <Stat
          label="Users kept on clear"
          value={status ? String(status.counts.users) : "—"}
          hint={`${status?.counts.roles ?? "—"} roles · credentials preserved`}
        />
      </div>

      <CardSoft className="mb-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Live record counts
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[
            ["Companies", status?.counts.companies],
            ["Projects", status?.counts.projects],
            ["Units", status?.counts.units],
            ["Bookings", status?.counts.bookings],
            ["Partners", status?.counts.partners],
            ["Payments", status?.counts.payments],
          ].map(([label, n]) => (
            <span
              key={String(label)}
              className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-[11px]"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold tabular-nums">{n ?? "—"}</span>
            </span>
          ))}
        </div>
      </CardSoft>

      <CardSoft className="mb-3 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div>
            <p className="text-sm font-medium">Backups</p>
            <p className="text-[11px] text-muted-foreground">
              Daily snapshot at first check each day · manual anytime
            </p>
          </div>
        </div>
        <div className="p-2">
          <DataTable
            rows={backups}
            empty={
              <EmptyState
                icon={HardDrive}
                title="No backups yet — create one now or wait for the daily snapshot"
              />
            }
            columns={[
              {
                key: "name",
                header: "File",
                cell: (r) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatWhen(r.createdAt)}</p>
                  </div>
                ),
              },
              {
                key: "kind",
                header: "Type",
                cell: (r) => (
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                      r.kind === "daily"
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {r.kind}
                  </span>
                ),
              },
              {
                key: "size",
                header: "Size",
                cell: (r) => (
                  <span className="tabular-nums text-muted-foreground">{formatBytes(r.sizeBytes)}</span>
                ),
              },
              {
                key: "actions",
                header: "",
                className: "w-10",
                cell: (r) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          downloadBackupFile(r.name)
                            .then(() => toast.success("Download started"))
                            .catch((err) => fail(err, "Download failed"))
                        }
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setRestoreTarget(r)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restore…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (!confirm(`Delete backup ${r.name}?`)) return;
                          removeBackup.mutate(r.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ),
              },
            ]}
          />
        </div>
      </CardSoft>

      <CardSoft className="border-destructive/30 bg-destructive/[0.03]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Clear database</p>
              <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
                Removes companies, projects, units, bookings, payments, partners, documents, and
                related records. Keeps users, roles, and passwords. A safety backup is created
                automatically before the wipe.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="shrink-0"
            onClick={() => setClearOpen(true)}
          >
            Clear database…
          </Button>
        </div>
      </CardSoft>

      <Dialog
        open={Boolean(restoreTarget)}
        onOpenChange={(o) => {
          if (!o) {
            setRestoreTarget(null);
            setRestorePassword("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restore backup</DialogTitle>
            <DialogDescription>
              Replaces the live database with{" "}
              <span className="font-medium text-foreground">{restoreTarget?.name}</span>. Enter your
              admin password to confirm.
            </DialogDescription>
          </DialogHeader>
          <Field label="Admin password">
            <Input
              type="password"
              className="h-8"
              autoComplete="current-password"
              value={restorePassword}
              onChange={(e) => setRestorePassword(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-1.5 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRestoreTarget(null);
                setRestorePassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!restorePassword || restore.isPending}
              onClick={() => restore.mutate()}
            >
              {restore.isPending ? "Restoring…" : "Restore"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={clearOpen}
        onOpenChange={(o) => {
          setClearOpen(o);
          if (!o) {
            setClearPassword("");
            setClearConfirm("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clear database</DialogTitle>
            <DialogDescription>
              This permanently deletes all business data. User accounts and roles stay. Type{" "}
              <span className="font-semibold text-foreground">CLEAR</span> and enter your password.
            </DialogDescription>
          </DialogHeader>
          <Field label='Type CLEAR to confirm'>
            <Input
              className="h-8 font-mono"
              value={clearConfirm}
              onChange={(e) => setClearConfirm(e.target.value)}
              placeholder="CLEAR"
            />
          </Field>
          <Field label="Admin password">
            <Input
              type="password"
              className="h-8"
              autoComplete="current-password"
              value={clearPassword}
              onChange={(e) => setClearPassword(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-1.5 pt-1">
            <Button size="sm" variant="outline" onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={
                clearConfirm !== "CLEAR" || !clearPassword || clearDb.isPending
              }
              onClick={() => clearDb.mutate()}
            >
              {clearDb.isPending ? "Clearing…" : "Clear everything"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrap>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <CardSoft className="space-y-0.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "text-lg font-semibold tracking-tight",
          tone === "ok" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </p>
      {hint ? <p className="truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </CardSoft>
  );
}
