import { useQuery } from "@tanstack/react-query";
import { Building2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ListResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { platformApi } from "@/lib/platform-api";
import { formatDate, planTone, UsageBar } from "@/pages/platform/shared";
import type { AccountRow } from "@/pages/platform/types";

export type { AccountRow, PlanRow } from "@/pages/platform/types";

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "trial", label: "Trial" },
  { value: "suspended", label: "Suspended" },
  { value: "expired", label: "Expired" },
] as const;

export function PlatformAccountsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupResult, setLookupResult] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["platform", "accounts", search, status],
    queryFn: () =>
      platformApi.get<ListResponse<AccountRow>>("/api/platform/accounts", {
        pageSize: 100,
        search: search || undefined,
        status: status === "all" ? undefined : status,
      }),
  });

  const rows = listQ.data?.data ?? [];
  const counts = useMemo(() => {
    const all = listQ.data?.total ?? rows.length;
    return { shown: rows.length, total: all };
  }, [listQ.data?.total, rows.length]);

  async function runLookup() {
    const email = lookupEmail.trim();
    if (!email) return;
    try {
      const res = await platformApi.get<{
        found: boolean;
        account?: { id: string; name: string; slug: string };
      }>("/api/platform/emails/lookup", { email });
      if (!res.found || !res.account) {
        setLookupResult("No workspace found for that email");
        return;
      }
      setLookupResult(`${res.account.name} (/ ${res.account.slug})`);
      navigate(`/admin/accounts/${res.account.id}`);
    } catch {
      setLookupResult("Lookup failed");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Client accounts"
        subtitle="Provision, search, and manage isolated workspaces"
        actions={
          <Button size="sm" asChild>
            <Link to="/admin/accounts/new">
              <Plus className="h-3.5 w-3.5" />
              New account
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-end">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Search name, slug, or admin email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex min-w-0 flex-1 gap-1.5">
          <Input
            className="h-9"
            type="email"
            placeholder="Lookup login email…"
            value={lookupEmail}
            onChange={(e) => {
              setLookupEmail(e.target.value);
              setLookupResult(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runLookup();
            }}
          />
          <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={() => void runLookup()}>
            Find
          </Button>
        </div>
      </div>
      {lookupResult ? (
        <p className="text-[11px] text-muted-foreground">{lookupResult}</p>
      ) : null}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Showing {counts.shown}
          {listQ.data?.total != null ? ` of ${listQ.data.total}` : ""} accounts
        </span>
        {listQ.isFetching ? <span>Refreshing…</span> : null}
      </div>

      {rows.length === 0 && !listQ.isLoading ? (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <EmptyState icon={Building2} title="No matching accounts" />
        </div>
      ) : (
        <div className="grid gap-2.5">
          {rows.map((r) => (
            <Link
              key={r.id}
              to={`/admin/accounts/${r.id}`}
              className="group rounded-xl border bg-card p-3.5 shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold tracking-tight group-hover:text-primary">
                      {r.name}
                    </p>
                    <StatusPill status={r.status} />
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                        planTone(r.plan.code),
                      )}
                    >
                      {r.plan.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-mono">/{r.slug}</span>
                    <span className="mx-1.5">·</span>
                    {r.adminEmail}
                    <span className="mx-1.5">·</span>
                    Expires {formatDate(r.expiresAt)}
                  </p>
                </div>
                <div className="w-full max-w-xs space-y-1.5 sm:w-56">
                  <UsageBar label="Users" used={r.usage.users} max={r.limits.maxUsers} />
                  <UsageBar
                    label="Projects"
                    used={r.usage.projects}
                    max={r.limits.maxProjects}
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
