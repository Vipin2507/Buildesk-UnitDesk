import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { Input } from "@/components/ui/input";
import { api, type ListResponse } from "@/lib/api";
import { qk } from "@/lib/query-keys";

type Customer = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  role: string;
  booking: { id: string; bookingNumber: string; unit: { unitNumber: string }; project: { name: string } };
};

export function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data } = useQuery({
    queryKey: qk.customers({ search }),
    queryFn: () => api.get<ListResponse<Customer>>("/api/customers", { search, pageSize: 50 }),
  });

  return (
    <PageWrap>
      <PageHeader title="Customers" subtitle="Primary applicants and co-applicants" />
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-8 pl-8" placeholder="Search customers" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <DataTable
        rows={data?.data ?? []}
        onRowClick={(row) => navigate(`/bookings/${row.booking.id}`)}
        columns={[
          { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "role", header: "Role", cell: (r) => r.role.replace("_", " ") },
          { key: "mobile", header: "Mobile", cell: (r) => r.mobile },
          { key: "project", header: "Project", cell: (r) => r.booking.project.name },
          { key: "unit", header: "Unit", cell: (r) => r.booking.unit.unitNumber },
          { key: "bk", header: "Booking", cell: (r) => r.booking.bookingNumber },
        ]}
      />
    </PageWrap>
  );
}
