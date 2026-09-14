import { useQuery } from "@tanstack/react-query";
import { Building2, CircleDot, LayoutGrid, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CardSoft } from "@/components/shared/card-soft";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useChartColors } from "@/hooks/use-chart-colors";
import { useInventoryFilterStore } from "@/stores/inventory-filters";

type Dash = {
  kpis: {
    projects: number;
    units: number;
    booked: number;
    available: number;
    hold: number;
    sold: number;
    bookingValue: number;
  };
  status: { name: string; value: number; key: string }[];
  trend: { month: string; count: number }[];
};

export function DashboardPage() {
  const navigate = useNavigate();
  const colors = useChartColors();
  const setStatus = useInventoryFilterStore((s) => s.setStatus);
  const { data } = useQuery({
    queryKey: qk.dashboardAdmin,
    queryFn: () => api.get<Dash>("/api/dashboard/admin"),
  });

  return (
    <PageWrap>
      <PageHeader title="Dashboard" subtitle="Portfolio snapshot across companies and projects" />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard
          label="Total projects"
          value={data?.kpis.projects ?? 0}
          icon={Building2}
          onClick={() => navigate("/companies")}
        />
        <KpiCard
          label="Total units"
          value={data?.kpis.units ?? 0}
          icon={LayoutGrid}
          onClick={() => navigate("/inventory")}
        />
        <KpiCard
          label="Booked units"
          value={data?.kpis.booked ?? 0}
          icon={ShoppingBag}
          tone="info"
          onClick={() => {
            setStatus("booked");
            navigate("/inventory");
          }}
        />
        <KpiCard
          label="Available units"
          value={data?.kpis.available ?? 0}
          icon={CircleDot}
          tone="success"
          onClick={() => {
            setStatus("available");
            navigate("/inventory");
          }}
        />
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <CardSoft>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Bookings trend
          </p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.trend ?? []}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill={colors[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardSoft>
        <CardSoft>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Unit status
          </p>
          <div className="flex h-32 items-center">
            <ResponsiveContainer width="50%" height="100%">
              <PieChart>
                <Pie data={data?.status ?? []} dataKey="value" nameKey="name" innerRadius={28} outerRadius={48} paddingAngle={2}>
                  {(data?.status ?? []).map((s, i) => (
                    <Cell key={s.key} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 text-xs">
              {(data?.status ?? []).map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  className="flex items-center gap-1.5"
                  onClick={() => {
                    setStatus(s.key);
                    navigate("/inventory");
                  }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: colors[i % colors.length] }} />
                  <span className="text-muted-foreground">{s.name}</span>
                  <span className="font-semibold tabular-nums">{s.value}</span>
                </button>
              ))}
            </div>
          </div>
        </CardSoft>
      </div>
    </PageWrap>
  );
}
