import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { CardSoft } from "@/components/shared/card-soft";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { api, type ListResponse } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Doc = { id: string; name: string; category: string; fileUrl: string; createdAt: string };

export function PartnerPortalDocuments() {
  const { data } = useQuery({
    queryKey: [...qk.partnerPortal, "documents"],
    queryFn: () => api.get<ListResponse<Doc>>("/api/partner-portal/documents"),
  });

  return (
    <PageWrap>
      <PageHeader title="Documents" subtitle="Files on bookings attributed to you" />
      <CardSoft>
        {(data?.data ?? []).length ? (
          <ul className="space-y-1">
            {(data?.data ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm">
                <a href={d.fileUrl} target="_blank" rel="noreferrer" className="hover:underline">{d.name}</a>
                <span className="text-[11px] text-muted-foreground">{d.category} · {formatDate(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={FileText} title="No documents on your bookings yet." />
        )}
      </CardSoft>
    </PageWrap>
  );
}
