import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Approval = {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  status: string;
  reason: string | null;
  requestedBy: string;
  createdAt: string;
};

export function ApprovalsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: qk.approvals(),
    queryFn: () => api.get<ListResponse<Approval>>("/api/approvals", { pageSize: 50 }),
  });
  const decide = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) =>
      api.post(`/api/approvals/${id}/decide`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Decision recorded");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed"),
  });

  return (
    <PageWrap>
      <PageHeader title="Approvals" subtitle="Cancel, confirm and payment verification queues" />
      <CardSoft padded={false}>
        <DataTable
          rows={data?.data ?? []}
          onRowClick={(row) => {
            if (row.entityType === "booking") navigate(`/bookings/${row.entityId}`);
          }}
          columns={[
            { key: "t", header: "When", cell: (r) => formatDate(r.createdAt) },
            { key: "type", header: "Type", cell: (r) => r.type.replaceAll("_", " ") },
            { key: "ent", header: "Entity", cell: (r) => `${r.entityType} ${r.entityId.slice(0, 8)}` },
            { key: "reason", header: "Reason", cell: (r) => r.reason ?? "—" },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
            {
              key: "act",
              header: "",
              cell: (r) =>
                r.status === "pending" ? (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); decide.mutate({ id: r.id, status: "approved" }); }}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); decide.mutate({ id: r.id, status: "rejected" }); }}>
                      Reject
                    </Button>
                  </div>
                ) : null,
            },
          ]}
        />
      </CardSoft>
    </PageWrap>
  );
}
