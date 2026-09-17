import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { api } from "@/lib/api";
import { formatDate, inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Booking = {
  id: string;
  bookingNumber: string;
  bookingDate: string;
  status: string;
  project: { name: string };
  unit: { unitNumber: string };
  customers: { id: string; name: string; mobile: string; role: string }[];
  financials: { totalCost: number; agreement: number } | null;
  entitlement: { entitlementPercent: number | null; entitlementAmount: number; received: number; outstanding: number } | null;
  schedules: { id: string; name: string; dueDate: string; amount: number; received: number; outstanding: number; status: string }[];
  invoices: { id: string; number: string; kind: string; amount: number; issuedAt: string }[];
  documents: { id: string; name: string; category: string; fileUrl: string; createdAt: string }[];
};

export function PartnerPortalBookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: [...qk.partnerPortal, "booking", id],
    queryFn: () => api.get<Booking>(`/api/partner-portal/bookings/${id}`),
    enabled: Boolean(id),
  });

  return (
    <PageWrap>
      <PageHeader
        title={data?.bookingNumber ?? "Booking"}
        subtitle={`${data?.project.name ?? ""} · ${data?.unit.unitNumber ?? ""}`}
        breadcrumbs={[{ label: "Bookings", to: "/partner/bookings" }, { label: data?.bookingNumber ?? "Detail" }]}
      />
      {data ? <StatusPill status={data.status} /> : null}
      <div className="grid gap-2 lg:grid-cols-2">
        <CardSoft className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customers</p>
          {data?.customers.map((c) => (
            <div key={c.id} className="rounded-lg border p-2.5">
              <p className="text-[10px] uppercase text-muted-foreground">{c.role.replace("_", " ")}</p>
              <p className="text-sm font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.mobile}</p>
            </div>
          ))}
        </CardSoft>
        <CardSoft className="space-y-2 text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your share</p>
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Percent</span>
            <span className="text-right tabular-nums">{data?.entitlement?.entitlementPercent ?? "—"}</span>
            <span className="text-muted-foreground">Entitlement</span>
            <span className="text-right tabular-nums">{inr(data?.entitlement?.entitlementAmount)}</span>
            <span className="text-muted-foreground">Received</span>
            <span className="text-right tabular-nums">{inr(data?.entitlement?.received)}</span>
            <span className="text-muted-foreground">Outstanding</span>
            <span className="text-right font-semibold tabular-nums">{inr(data?.entitlement?.outstanding)}</span>
          </div>
        </CardSoft>
      </div>
      <CardSoft>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payment schedule</p>
        <DataTable
          rows={data?.schedules ?? []}
          columns={[
            { key: "n", header: "Milestone", cell: (r) => r.name },
            { key: "d", header: "Due", cell: (r) => formatDate(r.dueDate) },
            { key: "a", header: "Amount", cell: (r) => inr(r.amount) },
            { key: "r", header: "Received", cell: (r) => inr(r.received) },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          ]}
        />
      </CardSoft>
      <CardSoft>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Invoices & receipts</p>
        <DataTable
          rows={data?.invoices ?? []}
          onRowClick={(row) => navigate(`/partner/bookings/${id}`)}
          columns={[
            { key: "n", header: "Number", cell: (r) => r.number },
            { key: "k", header: "Kind", cell: (r) => r.kind },
            { key: "a", header: "Amount", cell: (r) => inr(r.amount) },
            { key: "d", header: "Issued", cell: (r) => formatDate(r.issuedAt) },
          ]}
        />
      </CardSoft>
      <CardSoft>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</p>
        <ul className="space-y-1">
          {(data?.documents ?? []).map((d) => (
            <li key={d.id}>
              <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-sm hover:underline">
                {d.name}
              </a>
              <span className="ml-2 text-[11px] text-muted-foreground">{d.category}</span>
            </li>
          ))}
        </ul>
      </CardSoft>
    </PageWrap>
  );
}
