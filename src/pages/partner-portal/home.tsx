import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Handshake, IndianRupee, Wallet } from "lucide-react";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Dash = {
  kpis: { bookingValue: number; entitlement: number; received: number; outstanding: number };
  bookings: {
    id: string;
    bookingNumber: string;
    status: string;
    project: { name: string };
    unit: { unitNumber: string };
    financials: { totalDealValue: number } | null;
    entitlement: { entitlementAmount: number; received: number; outstanding: number } | null;
  }[];
};

export function PartnerPortalHome() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: qk.partnerPortal,
    queryFn: () => api.get<Dash>("/api/partner-portal/dashboard"),
  });

  return (
    <PageWrap>
      <PageHeader title="Your pipeline" subtitle="Bookings attributed to your firm" />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard label="Booking value" value={Math.round(data?.kpis.bookingValue ?? 0)} icon={IndianRupee} />
        <KpiCard label="Entitlement" value={Math.round(data?.kpis.entitlement ?? 0)} icon={Handshake} />
        <KpiCard label="Received" value={Math.round(data?.kpis.received ?? 0)} icon={Wallet} tone="success" />
        <KpiCard label="Outstanding" value={Math.round(data?.kpis.outstanding ?? 0)} icon={AlertCircle} tone="danger" />
      </div>
      <CardSoft padded={false} className="p-0">
        <div className="p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent bookings</p>
        </div>
        <DataTable
          rows={data?.bookings ?? []}
          onRowClick={(row) => navigate(`/partner/bookings/${row.id}`)}
          columns={[
            { key: "no", header: "Booking", cell: (r) => r.bookingNumber },
            { key: "pr", header: "Project", cell: (r) => r.project.name },
            { key: "un", header: "Unit", cell: (r) => r.unit.unitNumber },
            { key: "val", header: "Value", cell: (r) => inr(r.financials?.totalDealValue) },
            { key: "out", header: "Outstanding", cell: (r) => inr(r.entitlement?.outstanding) },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          ]}
        />
      </CardSoft>
    </PageWrap>
  );
}
