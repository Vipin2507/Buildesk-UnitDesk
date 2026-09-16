import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { api, type ListResponse } from "@/lib/api";
import { formatDate, inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Kind = "bookings" | "inventory" | "payments";

export function ReportsPage() {
  const [kind, setKind] = useState<Kind>("bookings");
  const { data } = useQuery({
    queryKey: qk.reports(kind),
    queryFn: () => api.get<ListResponse<Record<string, unknown>>>(`/api/reports/${kind}`, { pageSize: 50 }),
  });

  function exportCsv() {
    const rows = data?.data ?? [];
    if (!rows.length) return;
    const keys = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== "object");
    const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageWrap>
      <PageHeader
        title="Reports"
        subtitle="CSV export now · PDF later"
        actions={
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        }
      />
      <SegmentedTabs
        tabs={[
          { id: "bookings", label: "Bookings" },
          { id: "inventory", label: "Inventory" },
          { id: "payments", label: "Payments" },
        ]}
        value={kind}
        onChange={setKind}
      >
        <CardSoft padded={false}>
          {kind === "bookings" && (
            <DataTable
              rows={(data?.data ?? []) as Array<{ id: string; bookingNumber: string; bookingDate: string; status: string; financials?: { totalDealValue: number } }>}
              columns={[
                { key: "no", header: "Booking", cell: (r) => r.bookingNumber },
                { key: "date", header: "Date", cell: (r) => formatDate(r.bookingDate) },
                { key: "val", header: "Value", cell: (r) => inr(r.financials?.totalDealValue) },
                { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
              ]}
            />
          )}
          {kind === "inventory" && (
            <DataTable
              rows={(data?.data ?? []) as Array<{ id: string; unitNumber: string; status: string; unitType?: string }>}
              columns={[
                { key: "no", header: "Unit", cell: (r) => r.unitNumber },
                { key: "type", header: "Type", cell: (r) => r.unitType ?? "—" },
                { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
              ]}
            />
          )}
          {kind === "payments" && (
            <DataTable
              rows={(data?.data ?? []) as Array<{ id: string; amount: number; paymentDate: string; status: string; appliesTo: string }>}
              columns={[
                { key: "date", header: "Date", cell: (r) => formatDate(r.paymentDate) },
                { key: "amt", header: "Amount", cell: (r) => inr(r.amount) },
                { key: "to", header: "Applies to", cell: (r) => r.appliesTo },
                { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
              ]}
            />
          )}
        </CardSoft>
      </SegmentedTabs>
    </PageWrap>
  );
}
