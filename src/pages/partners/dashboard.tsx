import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Handshake, IndianRupee, Wallet, AlertCircle } from "lucide-react";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Dash = {
  partner: { name: string; phone: string | null };
  kpis: { bookingValue: number; entitlement: number; received: number; outstanding: number };
  bookings: {
    id: string;
    project: string;
    unit: string;
    bookingValue: number;
    entitlement: number;
    received: number;
    outstanding: number;
  }[];
};

export function PartnerDashboardPage() {
  const { id } = useParams();
  const { data } = useQuery({
    queryKey: qk.partnerDashboard(id!),
    queryFn: () => api.get<Dash>(`/api/channel-partners/${id}/dashboard`),
    enabled: Boolean(id),
  });

  return (
    <PageWrap>
      <PageHeader
        title={data?.partner.name ?? "Partner"}
        subtitle={data?.partner.phone ?? "Channel partner dashboard"}
        breadcrumbs={[{ label: "Channel partners", to: "/channel-partners" }, { label: data?.partner.name ?? "…" }]}
      />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard label="Total booking value" value={Math.round(data?.kpis.bookingValue ?? 0)} icon={IndianRupee} />
        <KpiCard label="Total entitlement" value={Math.round(data?.kpis.entitlement ?? 0)} icon={Handshake} />
        <KpiCard label="Total received" value={Math.round(data?.kpis.received ?? 0)} icon={Wallet} tone="success" />
        <KpiCard label="Outstanding" value={Math.round(data?.kpis.outstanding ?? 0)} icon={AlertCircle} tone="danger" />
      </div>
      <CardSoft padded={false} className="p-0">
        <div className="p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Booking-wise</p>
        </div>
        <DataTable
          rows={(data?.bookings ?? []).map((b) => ({ ...b }))}
          columns={[
            { key: "project", header: "Project", cell: (r) => r.project },
            { key: "unit", header: "Unit", cell: (r) => r.unit },
            { key: "val", header: "Booking value", cell: (r) => inr(r.bookingValue) },
            { key: "ent", header: "Entitlement", cell: (r) => inr(r.entitlement) },
            { key: "rec", header: "Received", cell: (r) => inr(r.received) },
            {
              key: "out",
              header: "Outstanding",
              cell: (r) => (
                <span className={r.outstanding > 0 ? "font-medium text-destructive" : ""}>{inr(r.outstanding)}</span>
              ),
            },
          ]}
        />
      </CardSoft>
    </PageWrap>
  );
}
