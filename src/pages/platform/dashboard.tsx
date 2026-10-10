import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Clock3, Plus, Shield } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { platformApi } from "@/lib/platform-api";
import { cn } from "@/lib/cn";
import { daysUntil, formatDate, planTone, StatCard } from "@/pages/platform/shared";
import type { PlatformDashboard } from "@/pages/platform/types";

export function PlatformDashboardPage() {
  const dashQ = useQuery({
    queryKey: ["platform", "dashboard"],
    queryFn: () => platformApi.get<PlatformDashboard>("/api/platform/dashboard"),
  });
  const d = dashQ.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Overview"
        subtitle="Health of your multi-client UnitDesk platform"
        actions={
          <Button size="sm" asChild>
            <Link to="/admin/accounts/new">
              <Plus className="h-3.5 w-3.5" />
              New account
            </Link>
          </Button>
        }
      />

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total clients" value={d?.total ?? "—"} hint="All workspaces" />
        <StatCard label="Active" value={d?.active ?? "—"} tone="success" />
        <StatCard label="Trial" value={d?.trial ?? "—"} tone="info" />
        <StatCard label="Suspended" value={d?.suspended ?? "—"} tone="danger" />
        <StatCard
          label="Email directory"
          value={d?.emailIndex ?? "—"}
          hint="Login emails indexed"
          tone="warning"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Recent accounts</h2>
              <p className="text-[11px] text-muted-foreground">Latest workspaces provisioned</p>
            </div>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/admin/accounts">
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          <div className="divide-y">
            {(d?.recent ?? []).length === 0 ? (
              <EmptyHint
                icon={Building2}
                title="No client accounts yet"
                action={
                  <Button size="sm" asChild>
                    <Link to="/admin/accounts/new">Create first account</Link>
                  </Button>
                }
              />
            ) : (
              d?.recent.map((row) => (
                <Link
                  key={row.id}
                  to={`/admin/accounts/${row.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {row.adminEmail} · /{row.slug}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "hidden rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize sm:inline",
                        planTone(row.plan.code),
                      )}
                    >
                      {row.plan.name}
                    </span>
                    <StatusPill status={row.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">Expiring soon</h2>
                <p className="text-[11px] text-muted-foreground">Next 14 days</p>
              </div>
            </div>
            <div className="space-y-2">
              {(d?.expiringSoon ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No upcoming expirations.</p>
              ) : (
                d?.expiringSoon.map((row) => {
                  const days = daysUntil(row.expiresAt);
                  return (
                    <Link
                      key={row.id}
                      to={`/admin/accounts/${row.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{row.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDate(row.expiresAt)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-[10px] font-semibold tabular-nums",
                          days != null && days <= 3 ? "text-destructive" : "text-warning-foreground",
                        )}
                      >
                        {days != null ? `${days}d` : "—"}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">By plan</h2>
            </div>
            <div className="space-y-2">
              {(d?.byPlan ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No plan distribution yet.</p>
              ) : (
                d?.byPlan.map((p) => (
                  <div key={p.planId} className="flex items-center justify-between text-xs">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                        planTone(p.planCode),
                      )}
                    >
                      {p.planCode}
                    </span>
                    <span className="tabular-nums font-semibold">{p.count}</span>
                  </div>
                ))
              )}
            </div>
            <Button size="sm" variant="outline" className="mt-3 w-full" asChild>
              <Link to="/admin/plans">Manage plans</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyHint({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof Building2;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{title}</p>
      {action}
    </div>
  );
}
