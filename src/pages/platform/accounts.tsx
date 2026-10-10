import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { platformApi } from "@/lib/platform-api";
import type { ListResponse } from "@/lib/api";
import { Building2 } from "lucide-react";

export type PlanRow = {
  id: string;
  code: string;
  name: string;
  maxUsers: number;
  maxProjects: number;
  maxUnits: number;
};

export type AccountRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  expiresAt: string | null;
  adminEmail: string;
  plan: PlanRow;
  limits: { maxUsers: number; maxProjects: number; maxUnits: number };
  usage: { users: number; projects: number; units: number };
};

type Dashboard = {
  total: number;
  active: number;
  trial: number;
  suspended: number;
  expired: number;
};

export function PlatformAccountsPage() {
  const dashQ = useQuery({
    queryKey: ["platform", "dashboard"],
    queryFn: () => platformApi.get<Dashboard>("/api/platform/dashboard"),
  });
  const listQ = useQuery({
    queryKey: ["platform", "accounts"],
    queryFn: () =>
      platformApi.get<ListResponse<AccountRow>>("/api/platform/accounts", { pageSize: 100 }),
  });

  const dash = dashQ.data;
  const rows = listQ.data?.data ?? [];

  return (
    <div className="space-y-3">
      <PageHeader
        title="Client accounts"
        subtitle="Provision isolated workspaces with plans and limits"
        actions={
          <Button size="sm" asChild>
            <Link to="/admin/accounts/new">
              <Plus className="h-3.5 w-3.5" />
              New account
            </Link>
          </Button>
        }
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Total", dash?.total],
          ["Active", dash?.active],
          ["Trial", dash?.trial],
          ["Suspended", dash?.suspended],
          ["Expired", dash?.expired],
        ].map(([label, n]) => (
          <CardSoft key={String(label)} className="space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="text-lg font-semibold tabular-nums">{n ?? "—"}</p>
          </CardSoft>
        ))}
      </div>

      <CardSoft className="overflow-hidden p-0">
        <DataTable
          rows={rows}
          empty={<EmptyState icon={Building2} title="No client accounts yet" />}
          onRowClick={(r) => {
            location.assign(`/admin/accounts/${r.id}`);
          }}
          columns={[
            {
              key: "name",
              header: "Account",
              cell: (r) => (
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground">/{r.slug}</p>
                </div>
              ),
            },
            {
              key: "plan",
              header: "Plan",
              cell: (r) => r.plan.name,
            },
            {
              key: "status",
              header: "Status",
              cell: (r) => (
                <span className="inline-flex rounded-full border px-2 py-0.5 text-[10px] capitalize">
                  {r.status}
                </span>
              ),
            },
            {
              key: "usage",
              header: "Usage",
              cell: (r) => (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {r.usage.users}/{r.limits.maxUsers} users · {r.usage.projects}/
                  {r.limits.maxProjects} projects
                </span>
              ),
            },
            {
              key: "admin",
              header: "Admin",
              cell: (r) => r.adminEmail,
            },
            {
              key: "expires",
              header: "Expires",
              cell: (r) =>
                r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "—",
            },
          ]}
        />
      </CardSoft>
    </div>
  );
}
