import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { qk } from "@/lib/query-keys";

export type VaultDoc = {
  id: string;
  name: string;
  category: string;
  fileUrl: string;
  createdAt: string;
  sizeBytes: number | null;
};

const CATEGORIES = ["kyc", "agreement", "floor_plan", "receipt", "invoice", "other"];

export function DocumentsPanel({
  projectId,
  bookingId,
  unitId,
  customerId,
  entityType,
  entityId,
  compact,
}: {
  projectId?: string | null;
  bookingId?: string | null;
  unitId?: string | null;
  customerId?: string | null;
  entityType: string;
  entityId: string;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const filters = {
    projectId: projectId ?? undefined,
    bookingId: bookingId ?? undefined,
    unitId: unitId ?? undefined,
    entityType,
  };
  const { data } = useQuery({
    queryKey: qk.documents(filters),
    queryFn: () => api.get<ListResponse<VaultDoc>>("/api/documents", { ...filters, pageSize: 50 }),
    enabled: Boolean(entityId),
  });
  const upload = useMutation({
    mutationFn: async ({ file, category }: { file: File; category: string }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entityType", entityType);
      fd.append("entityId", entityId);
      if (projectId) fd.append("projectId", projectId);
      if (bookingId) fd.append("bookingId", bookingId);
      if (unitId) fd.append("unitId", unitId);
      if (customerId) fd.append("customerId", customerId);
      fd.append("category", category);
      fd.append("name", file.name);
      return api.upload("/api/documents", fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: qk.booking(bookingId ?? "") });
      qc.invalidateQueries({ queryKey: qk.unit(unitId ?? "") });
      toast.success("Document uploaded");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Upload failed"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Removed");
    },
  });

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Upload className="h-3.5 w-3.5" />
          {upload.isPending ? "Uploading…" : "Upload KYC / agreement / other"}
        </span>
        <input
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate({ file, category: "kyc" });
            e.target.value = "";
          }}
        />
      </label>
      {(data?.data ?? []).length ? (
        <ul className="space-y-1">
          {(data?.data ?? []).map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
              <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm hover:underline">
                {doc.name}
              </a>
              <div className="flex shrink-0 items-center gap-1.5">
                {!compact ? <StatusPill status={doc.category} /> : null}
                <span className="text-[10px] text-muted-foreground">{formatDate(doc.createdAt)}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => remove.mutate(doc.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={FileText} title="No documents yet." />
      )}
      <div className="flex items-center gap-2">
        <Select
          defaultValue="kyc"
          onValueChange={(category) => {
            const input = document.createElement("input");
            input.type = "file";
            input.onchange = () => {
              const file = input.files?.[0];
              if (file) upload.mutate({ file, category });
            };
            input.click();
          }}
        >
          <SelectTrigger className="h-8 w-[10rem]">
            <SelectValue placeholder="Upload as…" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">Pick a category to upload</p>
      </div>
    </div>
  );
}
