import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { CardSoft } from "@/components/shared/card-soft";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDate, inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Invoice = {
  id: string;
  number: string;
  kind: string;
  amount: number;
  tax: number;
  status: string;
  issuedAt: string;
  notes: string | null;
  booking: {
    bookingNumber: string;
    project: { name: string; company: { name: string; gst: string | null; address: string | null } };
    unit: { unitNumber: string };
    customers: { name: string; mobile: string; role: string }[];
    financials: { totalCost: number; gst: number } | null;
  };
};

export function InvoiceViewPage() {
  const { id } = useParams();
  const { data } = useQuery({
    queryKey: qk.invoice(id!),
    queryFn: () => api.get<Invoice>(`/api/invoices/${id}`),
    enabled: Boolean(id),
  });
  const primary = data?.booking.customers.find((c) => c.role === "primary");

  return (
    <PageWrap>
      <PageHeader
        title={data?.number ?? "Document"}
        subtitle={`${data?.kind ?? ""} · ${data?.booking.bookingNumber ?? ""}`}
        breadcrumbs={[{ label: "Bookings", to: "/bookings" }, { label: data?.number ?? "Invoice" }]}
        actions={<Button size="sm" variant="outline" onClick={() => window.print()}>Print</Button>}
      />
      {data ? (
        <CardSoft className="mx-auto max-w-2xl space-y-4 print:border-0 print:shadow-none">
          <div className="flex justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{data.booking.project.company.name}</p>
              <p className="text-xs text-muted-foreground">{data.booking.project.company.address}</p>
              {data.booking.project.company.gst ? (
                <p className="text-xs text-muted-foreground">GSTIN {data.booking.project.company.gst}</p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{data.kind}</p>
              <p className="text-base font-semibold">{data.number}</p>
              <p className="text-xs text-muted-foreground">{formatDate(data.issuedAt)}</p>
            </div>
          </div>
          <div className="grid gap-2 rounded-lg border p-2.5 text-sm sm:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Bill to</p>
              <p className="font-medium">{primary?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{primary?.mobile}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Property</p>
              <p className="font-medium">{data.booking.project.name}</p>
              <p className="text-xs text-muted-foreground">Unit {data.booking.unit.unitNumber}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="text-right tabular-nums">{inr(data.amount)}</span>
            <span className="text-muted-foreground">Tax</span>
            <span className="text-right tabular-nums">{inr(data.tax)}</span>
            <span className="font-medium">Total</span>
            <span className="text-right font-semibold tabular-nums">{inr(data.amount + data.tax)}</span>
          </div>
          {data.notes ? <p className="text-xs text-muted-foreground">{data.notes}</p> : null}
        </CardSoft>
      ) : null}
    </PageWrap>
  );
}
