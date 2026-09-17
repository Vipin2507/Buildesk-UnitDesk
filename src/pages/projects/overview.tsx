import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  CircleDollarSign,
  CircleDot,
  HandCoins,
  LayoutGrid,
  ShoppingBag,
  Users,
  Wallet,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
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
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { ImageUpload } from "@/components/shared/image-upload";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChartColors } from "@/hooks/use-chart-colors";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, inr, pct } from "@/lib/format";
import { EASE, prefersReducedMotion, staggerDelay } from "@/lib/motion";
import { DEFAULT_PROJECT_PHOTO } from "@/lib/project-photo";
import { qk } from "@/lib/query-keys";
import { systemUnitPlanUrl } from "@/lib/unit-plans";
import { useProjectContextStore } from "@/stores/project-context";
import { useEffect } from "react";

type Dash = {
  project: {
    id: string;
    name: string;
    location: string | null;
    reraNumber: string | null;
    status: string;
    launchDate: string | null;
    expectedCompletion: string | null;
    photoUrl: string | null;
    company: { id: string; name: string };
  };
  kpis: {
    units: number;
    available: number;
    booked: number;
    sold: number;
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
    bookingValue: number;
  };
  status: { name: string; value: number; key: string }[];
  unitTypes: Array<{
    id: string;
    type: string;
    total: number;
    sold: number;
    booked: number;
    unsold: number;
    soldPct: number;
    avgPrice: number;
  }>;
  collectionTrend: Array<{ month: string; bookings: number; dealValue: number; received: number; pending: number }>;
  aging: Array<{ bucket: string; amount: number; count: number }>;
  area: { saleable: number; carpet: number; sold: number; unsold: number };
  recentBookings: Array<{
    id: string;
    bookingNumber: string;
    bookingDate: string;
    status: string;
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
  };
};

type ProjectExtra = {
  plan1bhkUrl: string | null;
  plan2bhkUrl: string | null;
  plan3bhkUrl: string | null;
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
  icon: typeof LayoutGrid;
  tone?: "info" | "success" | "warning" | "danger";
  delay?: number;
  onClick?: () => void;
}) {
  const reduced = prefersReducedMotion();
  const tones = {
    info: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/12 text-destructive",
  };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: EASE }}
      whileHover={onClick && !reduced ? { y: -2 } : undefined}
      className="card-soft flex h-full min-w-0 flex-col gap-2 p-3 text-left transition-[box-shadow,transform] hover:shadow-md"
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

export function ProjectOverviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const colors = useChartColors();
  const setProject = useProjectContextStore((s) => s.setProject);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const reduced = prefersReducedMotion();

  const { data: dash } = useQuery({
    queryKey: qk.dashboardProject(id!),
    queryFn: () => api.get<Dash>(`/api/dashboard/project/${id}`),
    enabled: Boolean(id),
  });
  const { data: project } = useQuery({
    queryKey: qk.project(id!),
    queryFn: () => api.get<ProjectExtra & { id: string; name: string; company: { id: string; name: string } }>(`/api/projects/${id}`),
    enabled: Boolean(id),
  });

  const setPhoto = useMutation({
    mutationFn: (photoUrl: string | null) => api.patch(`/api/projects/${id}`, { photoUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.project(id!) });
      qc.invalidateQueries({ queryKey: qk.dashboardProject(id!) });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Project photo updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update photo"),
  });

  useEffect(() => {
    if (dash?.project) setProject(dash.project.id, dash.project.company.id);
  }, [dash?.project, setProject]);

  const filteredTypes = useMemo(() => {
    const rows = dash?.unitTypes ?? [];
    if (!typeFilter) return rows;
    return rows.filter((r) => r.type === typeFilter);
  }, [dash?.unitTypes, typeFilter]);

  const k = dash?.kpis;
  const p = dash?.project;
  const tooltipStyle = {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 12,
  };

  return (
    <PageWrap>
      <PageHeader
        title={p?.name ?? "Project"}
        subtitle="Project overview · inventory, sales and collections"
        breadcrumbs={[
          { label: "Companies", to: "/companies" },
          { label: p?.company.name ?? "…", to: p ? `/companies/${p.company.id}/projects` : "/companies" },
          { label: p?.name ?? "Overview" },
        ]}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">Project actions</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/projects/${id}/inventory`)}>Unit inventory</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/projects/${id}/setup`)}>Setup</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/projects/${id}/edit`)}>Edit project</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/projects/${id}/units/new`)}>Add unit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/bookings/new?projectId=${id}`)}>Create booking</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <CardSoft className="flex flex-col gap-3 md:flex-row md:items-stretch">
        <div className="w-full shrink-0 md:w-52">
          <ImageUpload
            compact
            variant="cover"
            className="h-full [&_>div]:h-28 md:[&_>div]:h-full md:[&_>div]:min-h-[8rem]"
            hint=""
            value={p?.photoUrl}
            fallback={DEFAULT_PROJECT_PHOTO}
            onChange={(url) => setPhoto.mutate(url)}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">{p?.name}</h2>
            {p ? <StatusPill status={p.status} /> : null}
            <Chip tone="info">Residential</Chip>
          </div>
          <div className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <p><span className="text-muted-foreground">Developer · </span>{p?.company.name ?? "—"}</p>
            <p><span className="text-muted-foreground">Location · </span>{p?.location ?? "—"}</p>
            <p><span className="text-muted-foreground">RERA · </span>{p?.reraNumber ?? "—"}</p>
            <p><span className="text-muted-foreground">Launch · </span>{formatDate(p?.launchDate)}</p>
            <p><span className="text-muted-foreground">Possession · </span>{formatDate(p?.expectedCompletion)}</p>
            <p><span className="text-muted-foreground">Total units · </span>{k?.units ?? 0}</p>
          </div>
        </div>
      </CardSoft>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-6">
        <MetricCard
          label="Total units"
          value={String(k?.units ?? 0)}
          icon={LayoutGrid}
          delay={staggerDelay(0)}
          onClick={() => navigate(`/projects/${id}/inventory`)}
          chips={(dash?.unitTypes ?? []).slice(0, 3).map((t) => (
            <Chip key={t.type}>{t.total}×{t.type.replace("BHK", "B")}</Chip>
          ))}
        />
        <MetricCard
          label="Unit status"
          value={`${k?.sold ?? 0} sold`}
          hint={`${k?.available ?? 0} available`}
          icon={CircleDot}
          tone="success"
          delay={staggerDelay(1)}
          onClick={() => navigate(`/projects/${id}/inventory`)}
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
          hint={`${k?.bookingsThisMonth ?? 0} bookings MTD`}
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

      <div className="grid gap-2 xl:grid-cols-12">
        <CardSoft className="xl:col-span-4">
          <SectionTitle title="Unit summary" />
          <div className="flex items-center gap-3">
            <div className="h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dash?.status ?? []} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2}>
                    {(dash?.status ?? []).map((s) => (
                      <Cell key={s.key} fill={STATUS_COLOR[s.key] ?? colors[0]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {(dash?.status ?? []).map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s.key] }} />
                  <span className="flex-1 text-muted-foreground">{s.name}</span>
                  <span className="font-semibold tabular-nums">{s.value}</span>
                  <span className="text-[10px] text-muted-foreground">{pct(s.value, k?.units ?? 0)}</span>
                </div>
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
            {(dash?.unitTypes ?? []).map((t) => (
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
            <AreaBar label="Saleable" value={dash?.area.saleable ?? 0} total={dash?.area.saleable ?? 0} color={colors[0]} />
            <AreaBar label="Sold / booked" value={dash?.area.sold ?? 0} total={dash?.area.saleable ?? 0} color="var(--success)" />
            <AreaBar label="Unsold" value={dash?.area.unsold ?? 0} total={dash?.area.saleable ?? 0} color="var(--warning)" />
            <AreaBar label="RERA carpet" value={dash?.area.carpet ?? 0} total={dash?.area.saleable ?? 0} color={colors[2]} />
          </div>
        </CardSoft>
      </div>

      <div className="grid gap-2 xl:grid-cols-12">
        <CardSoft className="xl:col-span-8">
          <SectionTitle title="Collection overview" />
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dash?.collectionTrend ?? []}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => {
                    const n = typeof value === "number" ? value : Number(value);
                    if (name === "bookings") return [n, "Bookings"];
                    return [inr(n, true), String(name)];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="received" name="Received" fill={colors[0]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="pending" name="Pending" fill={colors[3]} radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="dealValue" name="Total cost" stroke={colors[1]} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardSoft>
        <CardSoft className="xl:col-span-4">
          <SectionTitle title="Outstanding aging" />
          <div className="space-y-2.5">
            {(dash?.aging ?? []).map((row, i) => {
              const max = Math.max(...(dash?.aging ?? []).map((a) => a.amount), 1);
              return (
                <div key={row.bucket} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{row.bucket}</span>
                    <span className="font-semibold tabular-nums">{inr(row.amount, true)} · {row.count}</span>
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

      <div className="grid gap-2 lg:grid-cols-2">
        <CardSoft>
          <SectionTitle
            title="Recent bookings"
            action={
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => navigate("/bookings")}>
                View all <ArrowUpRight className="h-3 w-3" />
              </Button>
            }
          />
          <DataTable
            rows={dash?.recentBookings ?? []}
            onRowClick={(row) => navigate(`/bookings/${row.id}`)}
            columns={[
              {
                key: "no",
                header: "Booking",
                cell: (r) => (
                  <span>
                    <span className="block font-medium">{r.bookingNumber}</span>
                    <span className="block text-[10px] text-muted-foreground">Unit {r.unit}</span>
                  </span>
                ),
              },
              { key: "customer", header: "Customer", cell: (r) => r.customer },
              { key: "deal", header: "Total cost", cell: (r) => inr(r.totalCost, true) },
              { key: "recv", header: "Finance", hideOnMobile: true, cell: (r) => inr(r.finance, true) },
              { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
            ]}
          />
        </CardSoft>

        <CardSoft>
          <SectionTitle title="Floor plans" />
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ["plan1bhkUrl", "1 BHK", "1bhk"],
                ["plan2bhkUrl", "2 BHK", "2bhk"],
                ["plan3bhkUrl", "3 BHK", "3bhk"],
              ] as const
            ).map(([key, label, sys]) => (
              <ImageUpload
                key={key}
                label={label}
                variant="plan"
                compact
                hint=""
                value={project?.[key] ?? null}
                fallback={systemUnitPlanUrl(sys)}
                onChange={(url) =>
                  api
                    .patch(`/api/projects/${id}`, { [key]: url })
                    .then(() => {
                      qc.invalidateQueries({ queryKey: qk.project(id!) });
                      toast.success(`${label} plan updated`);
                    })
                    .catch((err) => toast.error(err instanceof ApiError ? err.message : "Could not update plan"))
                }
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${id}/inventory`)}>
              <ShoppingBag className="h-3.5 w-3.5" /> Inventory
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/bookings/new?projectId=${id}`)}>
              Create booking
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${id}/units`)}>
              <LayoutGrid className="h-3.5 w-3.5" /> Unit master
            </Button>
          </div>
        </CardSoft>
      </div>

      <div>
        <SectionTitle title="Project at a glance" />
        <div className="grid gap-2 sm:grid-cols-3">
          <CardSoft>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Financial overview</p>
            <GlanceRow label="Total cost" value={inr(dash?.glance.financial.totalCost)} accent />
            <GlanceRow label="Agreement" value={inr(dash?.glance.financial.agreement)} />
            <GlanceRow label="GST" value={inr(dash?.glance.financial.gst)} />
            <GlanceRow label="Other charges" value={inr(dash?.glance.financial.otherCharges)} />
            <GlanceRow label="GST on agreement" value={inr(dash?.glance.financial.gstOnAgreement)} />
            <GlanceRow label="Stamp duty registration" value={inr(dash?.glance.financial.stampDutyRegistration)} />
            <GlanceRow label="Value to be collected" value={inr(dash?.glance.financial.valueToBeCollected)} />
            <GlanceRow label="Finance" value={inr(dash?.glance.financial.finance)} />
          </CardSoft>
          <CardSoft>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sales overview</p>
            <GlanceRow label="Total bookings" value={String(dash?.glance.sales.totalBookings ?? 0)} />
            <GlanceRow label="This month" value={String(dash?.glance.sales.thisMonth ?? 0)} accent />
            <GlanceRow label="Total cost" value={inr(dash?.glance.sales.dealValue)} />
            <GlanceRow label="Avg deal" value={inr(dash?.glance.sales.avgDeal)} />
          </CardSoft>
          <CardSoft>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Inventory overview</p>
            <GlanceRow label="Available" value={String(dash?.glance.inventory.available ?? 0)} />
            <GlanceRow label="Booked" value={String(dash?.glance.inventory.booked ?? 0)} />
            <GlanceRow label="Sold" value={String(dash?.glance.inventory.sold ?? 0)} />
            <GlanceRow label="Hold" value={String(dash?.glance.inventory.hold ?? 0)} />
            <GlanceRow label="Blocked" value={String(dash?.glance.inventory.blocked ?? 0)} />
          </CardSoft>
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground">All values are in INR</p>
    </PageWrap>
  );
}
