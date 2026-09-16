import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type ListResponse } from "@/lib/api";
import { formatDate, inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { CalendarCheck } from "lucide-react";

type Booking = {
  id: string;
  bookingNumber: string;
  bookingDate: string;
  status: string;
  unit: { unitNumber: string };
  project: { name: string };
  customers: { name: string; role: string }[];
  financials: { totalDealValue: number } | null;
  channelPartner: { name: string } | null;
};

export function BookingsListPage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data } = useQuery({
    queryKey: qk.bookings({ projectId, search }),
    queryFn: () =>
      api.get<ListResponse<Booking>>("/api/bookings", {
        project: projectId,
        search,
        pageSize: 50,
      }),
  });

  return (
    <PageWrap>
      <PageHeader
        title="Bookings"
        subtitle="All unit bookings with customer and value"
        actions={
          <Button size="sm" onClick={() => navigate(projectId ? `/bookings/new?projectId=${projectId}` : "/bookings/new")}>
            <Plus className="h-3.5 w-3.5" /> New booking
          </Button>
        }
      />
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="Search booking / customer / unit" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-[11px] text-muted-foreground">{data?.total ?? 0} results</span>
      </div>
      <DataTable
        rows={data?.data ?? []}
        onRowClick={(row) => navigate(`/bookings/${row.id}`)}
        empty={<EmptyState icon={CalendarCheck} title="No bookings yet." actionLabel="Create booking" onAction={() => navigate("/bookings/new")} />}
        columns={[
          { key: "no", header: "Booking", cell: (r) => <span className="font-medium">{r.bookingNumber}</span> },
          { key: "date", header: "Date", cell: (r) => formatDate(r.bookingDate) },
          { key: "unit", header: "Unit", cell: (r) => r.unit.unitNumber },
          { key: "project", header: "Project", cell: (r) => r.project.name },
          { key: "customer", header: "Customer", cell: (r) => r.customers.find((c) => c.role === "primary")?.name ?? "—" },
          { key: "value", header: "Value", cell: (r) => inr(r.financials?.totalDealValue) },
          { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
        ]}
      />
    </PageWrap>
  );
}
