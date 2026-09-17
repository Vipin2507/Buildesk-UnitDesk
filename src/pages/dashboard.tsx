import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  CircleDot,
  HandCoins,
  LayoutGrid,
  Users,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { useChartColors } from "@/hooks/use-chart-colors";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, inr, pct } from "@/lib/format";
import { EASE, prefersReducedMotion, staggerDelay } from "@/lib/motion";
import { qk } from "@/lib/query-keys";
import { resolveProjectPhotoUrl } from "@/lib/project-photo";
import { useInventoryFilterStore } from "@/stores/inventory-filters";
import { useProjectContextStore } from "@/stores/project-context";

type Dash = {
  kpis: {
    companies: number;
    projects: number;
    units: number;
    available: number;
    sold: number;
    booked: number;
    hold: number;
    blocked: number;
    customers: number;
    totalCost: number;
    agreement: number;
    gst: number;
    otherCharges: number;
    finance: number;
    valueToBeCollected: number;
    collectionPct: number;
    pendingPct: number;
    partnerOutstanding: number;
    bookingsThisMonth: number;
    bookingValueThisMonth: number;
  };
  status: { name: string; value: number; key: string }[];
  unitTypes: Array<{
    id: string;
    type: string;
    total: number;
    sold: number;
    booked: number;
    unsold: number;
    available: number;
    hold: number;
    soldPct: number;
    avgPrice: number;
  }>;
  collectionTrend: Array<{
    month: string;
    bookings: number;
    dealValue: number;
    received: number;
    pending: number;
  }>;
  aging: Array<{ bucket: string; amount: number; count: number }>;
  area: { saleable: number; carpet: number; sold: number; unsold: number };
  projects: Array<{
    id: string;
    name: string;
    company: string;
    location: string | null;
    status: string;
    photoUrl: string | null;
    units: number;
    available: number;
    sold: number;
    booked: number;
    hold: number;
    totalCost: number;
    finance: number;
    valueToBeCollected: number;
    collectionPct: number;
  }>;
  recentBookings: Array<{
    id: string;
    bookingNumber: string;
    bookingDate: string;
    status: string;
    project: string;
    unit: string;
    customer: string;
    totalCost: number;
    finance: number;
    valueToBeCollected: number;
  }>;
  glance: {
    financial: {
      totalCost: number;
      agreement: number;
      gst: number;
      otherCharges: number;
      gstOnAgreement: number;
      stampDutyRegistration: number;
      finance: number;
      valueToBeCollected: number;
    };
    sales: { totalBookings: number; thisMonth: number; dealValue: number; avgDeal: number };
    inventory: { available: number; booked: number; sold: number; hold: number; blocked: number };
    partners: { active: number; entitlement: number; received: number; outstanding: number };
  };
};

const STATUS_COLOR: Record<string, string> = {
  available: "var(--success)",
  sold: "var(--chart-2)",
  booked: "var(--primary)",
  hold: "var(--warning)",
  blocked: "var(--muted-foreground)",
};

function Chip({
  children,
  tone = "muted",
  active,
  onClick,
}: {
  children: ReactNode;
  tone?: "muted" | "info" | "success" | "warning" | "danger";
  active?: boolean;
  onClick?: () => void;
}) {
  const tones = {
    muted: "border-border bg-muted/50 text-muted-foreground",
    info: "border-primary/25 bg-primary/10 text-primary",
    success: "border-success/25 bg-success/12 text-success",
    warning: "border-warning/30 bg-warning/15 text-warning-foreground",
    danger: "border-destructive/25 bg-destructive/10 text-destructive",
  };
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
        tones[tone],
        active && "ring-2 ring-primary/35",
        onClick && "hover:brightness-95",
      )}
    >
      {children}
    </Comp>
  );
}

function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {action}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  chips,
  icon: Icon,
  tone = "info",
  delay = 0,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  chips?: ReactNode;
  icon: typeof Building2;
  tone?: "info" | "success" | "warning" | "danger" | "muted";
  delay?: number;
  onClick?: () => void;
}) {
  const reduced = prefersReducedMotion();
  const tones = {
    info: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/12 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: EASE }}
      whileHover={onClick && !reduced ? { y: -2 } : undefined}
      className={cn(
        "card-soft flex h-full min-w-0 flex-col gap-2 p-3 text-left transition-[box-shadow,transform]",
        onClick ? "cursor-pointer hover:shadow-md" : "cursor-default",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-lg font-semibold tabular-nums tracking-tight">{value}</p>
        </div>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      {chips ? <div className="mt-auto flex flex-wrap gap-1">{chips}</div> : null}
    </motion.button>
  );
}

function ProgressStrip({
  parts,
}: {
  parts: { key: string; value: number; color: string }[];
}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-muted">
      {parts.map((p) => (
        <motion.span
          key={p.key}
          className="h-full"
          style={{ background: p.color }}
          initial={{ width: 0 }}
          animate={{ width: `${(p.value / total) * 100}%` }}
          transition={{ duration: 0.5, ease: EASE }}
        />
      ))}
    </div>
  );
}

function GlanceRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-semibold tabular-nums", accent && "text-primary")}>{value}</span>
    </div>
  );
}

function AreaBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const width = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value ? `${value.toLocaleString("en-IN")} sq.ft` : "—"}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 0.45, ease: EASE }}
        />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const colors = useChartColors();
  const setStatus = useInventoryFilterStore((s) => s.setStatus);
  const setProject = useProjectContextStore((s) => s.setProject);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const reduced = prefersReducedMotion();

  const { data, isFetching } = useQuery({
    queryKey: qk.dashboardAdmin,
    queryFn: () => api.get<Dash>("/api/dashboard/admin"),
  });

  const k = data?.kpis;
  const filteredTypes = useMemo(() => {
    const rows = data?.unitTypes ?? [];
    if (!typeFilter) return rows;
    return rows.filter((r) => r.type === typeFilter);
  }, [data?.unitTypes, typeFilter]);

  const filteredBookings = useMemo(() => {
    const rows = data?.recentBookings ?? [];
    if (!statusFilter) return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [data?.recentBookings, statusFilter]);

  const tooltipStyle = {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 12,
  };

  return (
    <PageWrap>
      <PageHeader
        title="Dashboard"
        subtitle="Portfolio snapshot · inventory, sales and collections"
        actions={
          <>
            <Chip tone={isFetching ? "info" : "success"}>{isFetching ? "Refreshing…" : "Live"}</Chip>
            <Button variant="outline" size="sm" onClick={() => navigate("/bookings/new")}>
              New booking
            </Button>
            <Button size="sm" onClick={() => navigate("/inventory")}>
              Open inventory
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-6">
        <MetricCard
          label="Total units"
          value={String(k?.units ?? 0)}
          hint={`${k?.projects ?? 0} projects · ${k?.companies ?? 0} companies`}
          icon={LayoutGrid}
          delay={staggerDelay(0)}
          onClick={() => navigate("/inventory")}
          chips={(data?.unitTypes ?? []).slice(0, 3).map((t) => (
            <Chip key={t.type} tone="muted">{t.total}×{t.type.replace("BHK", "B")}</Chip>
          ))}
        />
        <MetricCard
          label="Unit status"
          value={`${k?.sold ?? 0} sold`}
          hint={`${k?.available ?? 0} available · ${k?.hold ?? 0} hold`}
          icon={CircleDot}
          tone="success"
          delay={staggerDelay(1)}
          onClick={() => navigate("/inventory")}
          chips={
            <>
              <Chip tone="success">Sold {k?.sold ?? 0}</Chip>
              <Chip tone="info">Booked {k?.booked ?? 0}</Chip>
              <Chip tone="warning">Hold {k?.hold ?? 0}</Chip>
            </>
          }
        />
        <MetricCard
          label="Customers"
          value={String(k?.customers ?? 0)}
          hint={`${k?.bookingsThisMonth ?? 0} bookings this month`}
          icon={Users}
          delay={staggerDelay(2)}
          onClick={() => navigate("/customers")}
        />
        <MetricCard
          label="Total cost"
          value={inr(k?.totalCost, true)}
          hint={`Agreement ${inr(k?.agreement, true)}`}
          icon={CircleDollarSign}
          delay={staggerDelay(3)}
          onClick={() => navigate("/bookings")}
          chips={<Chip tone="success">Other {inr(k?.otherCharges, true)}</Chip>}
        />
        <MetricCard
          label="Finance"
          value={inr(k?.finance, true)}
          hint={`${k?.collectionPct ?? 0}% collected`}
          icon={HandCoins}
          tone="success"
          delay={staggerDelay(4)}
          onClick={() => navigate("/payments")}
          chips={<Chip tone="success">{k?.collectionPct ?? 0}%</Chip>}
        />
        <MetricCard
          label="Value to be collected"
          value={inr(k?.valueToBeCollected, true)}
          hint={`Partner due ${inr(k?.partnerOutstanding, true)}`}
          icon={Wallet}
          tone="warning"
          delay={staggerDelay(5)}
          onClick={() => navigate("/payments")}
          chips={<Chip tone="warning">{k?.pendingPct ?? 0}%</Chip>}
        />
      </div>

      <CardSoft className="space-y-2">
        <SectionTitle title="Inventory mix" />
        <ProgressStrip
          parts={(data?.status ?? []).map((s) => ({
            key: s.key,
            value: s.value,
            color: STATUS_COLOR[s.key] ?? colors[0],
          }))}
        />
        <div className="flex flex-wrap gap-1.5">
          {(data?.status ?? []).map((s) => (
            <Chip
              key={s.key}
              tone={s.key === "sold" || s.key === "available" ? "success" : s.key === "hold" ? "warning" : "info"}
              active={statusFilter === s.key}
              onClick={() => {
                setStatusFilter((cur) => (cur === s.key ? null : s.key));
                setStatus(s.key);
              }}
            >
              {s.name} · {s.value} ({pct(s.value, k?.units ?? 0)})
            </Chip>
          ))}
        </div>
      </CardSoft>

      <div className="grid gap-2 xl:grid-cols-12">
        <CardSoft className="xl:col-span-4">
          <SectionTitle
            title="Unit summary"
            action={
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => navigate("/inventory")}>
                View all <ArrowUpRight className="h-3 w-3" />
              </Button>
            }
          />
          <div className="flex items-center gap-3">
            <div className="h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.status ?? []}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={42}
                    outerRadius={64}
                    paddingAngle={2}
                    onClick={(entry) => {
                      const key = (entry as { key?: string }).key;
                      if (!key) return;
                      setStatus(key);
                      navigate("/inventory");
                    }}
                  >
                    {(data?.status ?? []).map((s) => (
                      <Cell key={s.key} fill={STATUS_COLOR[s.key] ?? colors[0]} cursor="pointer" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {(data?.status ?? []).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-muted/50"
                  onClick={() => {
                    setStatus(s.key);
                    navigate("/inventory");
                  }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s.key] }} />
                  <span className="flex-1 text-muted-foreground">{s.name}</span>
                  <span className="font-semibold tabular-nums">{s.value}</span>
                </button>
              ))}
            </div>
          </div>
        </CardSoft>

        <CardSoft className="xl:col-span-5">
          <SectionTitle
            title="Unit type breakdown"
            action={
              typeFilter ? (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setTypeFilter(null)}>
                  Clear
                </Button>
              ) : null
            }
          />
          <div className="mb-2 flex flex-wrap gap-1">
            {(data?.unitTypes ?? []).map((t) => (
              <Chip
                key={t.type}
                tone={typeFilter === t.type ? "info" : "muted"}
                active={typeFilter === t.type}
                onClick={() => setTypeFilter((cur) => (cur === t.type ? null : t.type))}
              >
                {t.type}
              </Chip>
            ))}
          </div>
          <DataTable
            rows={filteredTypes}
            onRowClick={(row) => setTypeFilter(row.type)}
            columns={[
              { key: "type", header: "Type", cell: (r) => <span className="font-medium">{r.type}</span> },
              { key: "total", header: "Total", cell: (r) => r.total },
              { key: "sold", header: "Sold", cell: (r) => r.sold + r.booked },
              { key: "unsold", header: "Unsold", cell: (r) => r.unsold },
              {
                key: "pct",
                header: "Sold %",
                cell: (r) => (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-success" style={{ width: `${Math.min(100, r.soldPct)}%` }} />
                    </span>
                    {r.soldPct}%
                  </span>
                ),
              },
              { key: "avg", header: "Avg price", hideOnMobile: true, cell: (r) => inr(r.avgPrice, true) },
            ]}
          />
        </CardSoft>

        <CardSoft className="xl:col-span-3">
          <SectionTitle title="Area summary" />
          <div className="space-y-3">
            <AreaBar label="Saleable" value={data?.area.saleable ?? 0} total={data?.area.saleable ?? 0} color={colors[0]} />
            <AreaBar label="Sold / booked" value={data?.area.sold ?? 0} total={data?.area.saleable ?? 0} color="var(--success)" />
            <AreaBar label="Unsold" value={data?.area.unsold ?? 0} total={data?.area.saleable ?? 0} color="var(--warning)" />
            <AreaBar label="RERA carpet" value={data?.area.carpet ?? 0} total={data?.area.saleable ?? 0} color={colors[2]} />
          </div>
        </CardSoft>
      </div>

      <div className="grid gap-2 xl:grid-cols-12">
        <CardSoft className="xl:col-span-8">
          <SectionTitle title="Collection overview" />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data?.collectionTrend ?? []}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" hide />
                <YAxis yAxisId="right" orientation="right" hide />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => {
                    const n = typeof value === "number" ? value : Number(value);
                    if (name === "bookings") return [n, "Bookings"];
                    return [inr(n, true), String(name)];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="received" name="Received" fill={colors[0]} radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="pending" name="Pending" fill={colors[3]} radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="dealValue" name="Total cost" stroke={colors[1]} strokeWidth={2} dot={false} />
                <Area yAxisId="right" type="monotone" dataKey="bookings" name="Bookings" fill={colors[2]} fillOpacity={0.08} stroke={colors[2]} strokeWidth={1.5} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardSoft>

        <CardSoft className="xl:col-span-4">
          <SectionTitle title="Outstanding aging" />
          <div className="space-y-2.5">
            {(data?.aging ?? []).map((row, i) => {
              const max = Math.max(...(data?.aging ?? []).map((a) => a.amount), 1);
              return (
                <div key={row.bucket} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{row.bucket}</span>
                    <span className="font-semibold tabular-nums">
                      {inr(row.amount, true)} · {row.count}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-warning"
                      initial={{ width: 0 }}
                      animate={{ width: `${(row.amount / max) * 100}%` }}
                      transition={{ delay: reduced ? 0 : staggerDelay(i), duration: 0.4, ease: EASE }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardSoft>
      </div>

      <div className="grid gap-2 xl:grid-cols-2">
        <CardSoft>
          <SectionTitle
            title="Projects"
            action={
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => navigate("/projects")}>
                All projects <ArrowUpRight className="h-3 w-3" />
              </Button>
            }
          />
          <DataTable
            rows={data?.projects ?? []}
            onRowClick={(row) => {
              setProject(row.id, "");
              navigate(`/projects/${row.id}/inventory`);
            }}
            columns={[
              {
                key: "name",
                header: "Project",
                cell: (r) => (
                  <span className="flex items-center gap-2">
                    <span className="h-7 w-7 shrink-0 overflow-hidden rounded-md border bg-muted">
                      <img src={resolveProjectPhotoUrl(r.photoUrl)} alt="" className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{r.company}</span>
                    </span>
                  </span>
                ),
              },
              { key: "units", header: "Units", cell: (r) => r.units },
              {
                key: "mix",
                header: "Status",
                cell: (r) => (
                  <span className="flex flex-wrap gap-1">
                    <Chip tone="success">{r.sold}S</Chip>
                    <Chip tone="info">{r.available}A</Chip>
                    <Chip tone="warning">{r.hold}H</Chip>
                  </span>
                ),
              },
              { key: "deal", header: "Total cost", hideOnMobile: true, cell: (r) => inr(r.totalCost, true) },
              {
                key: "coll",
                header: "Finance",
                cell: (r) => <Chip tone="success">{r.collectionPct}%</Chip>,
              },
            ]}
          />
        </CardSoft>

        <CardSoft>
          <SectionTitle
            title="Recent bookings"
            action={
              <div className="flex items-center gap-1">
                {["booked", "confirmed", "hold"].map((s) => (
                  <Chip
                    key={s}
                    tone={statusFilter === s ? "info" : "muted"}
                    active={statusFilter === s}
                    onClick={() => setStatusFilter((cur) => (cur === s ? null : s))}
                  >
                    {s}
                  </Chip>
                ))}
              </div>
            }
          />
          <DataTable
            rows={filteredBookings}
            onRowClick={(row) => navigate(`/bookings/${row.id}`)}
            columns={[
              {
                key: "no",
                header: "Booking",
                cell: (r) => (
                  <span>
                    <span className="block font-medium">{r.bookingNumber}</span>
                    <span className="block text-[10px] text-muted-foreground">{r.project} · {r.unit}</span>
                  </span>
                ),
              },
              { key: "customer", header: "Customer", cell: (r) => r.customer },
              { key: "date", header: "Date", hideOnMobile: true, cell: (r) => formatDate(r.bookingDate) },
              { key: "deal", header: "Total cost", cell: (r) => inr(r.totalCost, true) },
              {
                key: "pay",
                header: "Finance",
                hideOnMobile: true,
                cell: (r) => inr(r.finance, true),
              },
              { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
            ]}
          />
        </CardSoft>
      </div>

      <div>
        <SectionTitle title="Portfolio at a glance" />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: staggerDelay(0), duration: 0.3, ease: EASE }}
          >
            <CardSoft>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Financial overview</p>
              <GlanceRow label="Total cost" value={inr(data?.glance.financial.totalCost)} accent />
              <GlanceRow label="Agreement" value={inr(data?.glance.financial.agreement)} />
              <GlanceRow label="GST" value={inr(data?.glance.financial.gst)} />
              <GlanceRow label="Other charges" value={inr(data?.glance.financial.otherCharges)} />
              <GlanceRow label="GST on agreement" value={inr(data?.glance.financial.gstOnAgreement)} />
              <GlanceRow label="Stamp duty registration" value={inr(data?.glance.financial.stampDutyRegistration)} />
              <GlanceRow label="Value to be collected" value={inr(data?.glance.financial.valueToBeCollected)} />
              <GlanceRow label="Finance" value={inr(data?.glance.financial.finance)} />
            </CardSoft>
          </motion.div>
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: staggerDelay(1), duration: 0.3, ease: EASE }}
          >
            <CardSoft>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sales overview</p>
              <GlanceRow label="Total bookings" value={String(data?.glance.sales.totalBookings ?? 0)} />
              <GlanceRow label="This month" value={String(data?.glance.sales.thisMonth ?? 0)} accent />
              <GlanceRow label="Total cost" value={inr(data?.glance.sales.dealValue)} />
              <GlanceRow label="Avg deal" value={inr(data?.glance.sales.avgDeal)} />
              <GlanceRow label="Booking value MTD" value={inr(k?.bookingValueThisMonth)} />
            </CardSoft>
          </motion.div>
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: staggerDelay(2), duration: 0.3, ease: EASE }}
          >
            <CardSoft>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Inventory overview</p>
              <GlanceRow label="Available" value={String(data?.glance.inventory.available ?? 0)} />
              <GlanceRow label="Booked" value={String(data?.glance.inventory.booked ?? 0)} />
              <GlanceRow label="Sold" value={String(data?.glance.inventory.sold ?? 0)} />
              <GlanceRow label="Hold" value={String(data?.glance.inventory.hold ?? 0)} />
              <GlanceRow label="Blocked" value={String(data?.glance.inventory.blocked ?? 0)} />
            </CardSoft>
          </motion.div>
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: staggerDelay(3), duration: 0.3, ease: EASE }}
          >
            <CardSoft>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Partner overview</p>
              <GlanceRow label="Active partners" value={String(data?.glance.partners.active ?? 0)} />
              <GlanceRow label="Entitlement" value={inr(data?.glance.partners.entitlement)} />
              <GlanceRow label="Received" value={inr(data?.glance.partners.received)} />
              <GlanceRow label="Outstanding" value={inr(data?.glance.partners.outstanding)} />
              <div className="pt-2">
                <Button variant="outline" size="sm" className="h-7 w-full" onClick={() => navigate("/channel-partners")}>
                  <Building2 className="h-3 w-3" /> Partners
                </Button>
              </div>
            </CardSoft>
          </motion.div>
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground">All values are in INR · Updated just now</p>
    </PageWrap>
  );
}
