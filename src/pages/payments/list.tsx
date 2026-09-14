import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { api, type ListResponse } from "@/lib/api";
import { formatDate, inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Payment = {
  id: string;
  paymentDate: string;
  amount: number;
  paymentMode: string;
  status: string;
  appliesTo: string;
  booking: { id: string; bookingNumber: string; unit: { unitNumber: string }; project: { name: string } };
};

export function PaymentsPage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: qk.paymentsList({ projectId }),
    queryFn: () => api.get<ListResponse<Payment>>("/api/payments", { pageSize: 50, projectId }),
  });

  const rows = data?.data ?? [];

  return (
    <PageWrap>
      <PageHeader
        title={projectId ? "Demand & receipts" : "Payments"}
        subtitle="Customer receipts and partner payouts"
      />
      <DataTable
        rows={rows}
        onRowClick={(row) => navigate(`/bookings/${row.booking.id}`)}
        columns={[
          { key: "date", header: "Date", cell: (r) => formatDate(r.paymentDate) },
          { key: "bk", header: "Booking", cell: (r) => r.booking.bookingNumber },
          { key: "unit", header: "Unit", cell: (r) => r.booking.unit.unitNumber },
          { key: "amt", header: "Amount", cell: (r) => inr(r.amount) },
          { key: "mode", header: "Mode", cell: (r) => r.paymentMode.toUpperCase() },
          { key: "to", header: "Applies to", cell: (r) => r.appliesTo },
          { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
        ]}
      />
    </PageWrap>
  );
}
