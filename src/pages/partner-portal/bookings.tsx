import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { api, type ListResponse } from "@/lib/api";
import { formatDate, inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Booking = {
  id: string;
  bookingNumber: string;
  bookingDate: string;
  status: string;
  project: { name: string };
  unit: { unitNumber: string };
  financials: { totalDealValue: number } | null;
  entitlement: { entitlementAmount: number; received: number; outstanding: number } | null;
};

export function PartnerPortalBookings() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: [...qk.partnerPortal, "bookings"],
    queryFn: () => api.get<ListResponse<Booking>>("/api/partner-portal/bookings"),
  });

  return (
    <PageWrap>
      <PageHeader title="Bookings" subtitle="Units attributed to you" />
      <CardSoft padded={false}>
        <DataTable
          rows={data?.data ?? []}
          onRowClick={(row) => navigate(`/partner/bookings/${row.id}`)}
          columns={[
            { key: "dt", header: "Date", cell: (r) => formatDate(r.bookingDate) },
            { key: "no", header: "Booking", cell: (r) => r.bookingNumber },
            { key: "pr", header: "Project", cell: (r) => r.project.name },
            { key: "un", header: "Unit", cell: (r) => r.unit.unitNumber },
            { key: "val", header: "Value", cell: (r) => inr(r.financials?.totalDealValue) },
            { key: "ent", header: "Share", cell: (r) => inr(r.entitlement?.entitlementAmount) },
            { key: "rec", header: "Received", cell: (r) => inr(r.entitlement?.received) },
            { key: "out", header: "Outstanding", cell: (r) => inr(r.entitlement?.outstanding) },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          ]}
        />
      </CardSoft>
    </PageWrap>
  );
}
