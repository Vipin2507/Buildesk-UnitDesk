import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
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

const CATEGORIES = ["kyc", "agreement", "floor_plan", "receipt", "invoice", "other"] as const;
type Category = (typeof CATEGORIES)[number];

const BULK_ACTIONS: { category: Category; label: string }[] = [
  { category: "kyc", label: "KYC" },
  { category: "agreement", label: "Agreement" },
  { category: "floor_plan", label: "Floor plan" },
  { category: "receipt", label: "Receipt" },
  { category: "invoice", label: "Invoice" },
  { category: "other", label: "Other" },
];

function categoryLabel(value: string) {
  return value.replace("_", " ");
}

export function DocumentsPanel({
  projectId,
  bookingId,
  unitId,
  customerId,
  entityType,
  entityId,
  compact,
  showBulkActions = true,
}: {
  projectId?: string | null;
  bookingId?: string | null;
  unitId?: string | null;
  customerId?: string | null;
  entityType: string;
  entityId: string;
  compact?: boolean;
  showBulkActions?: boolean;
}) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<Category>("kyc");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkCategoryRef = useRef<Category>("kyc");

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
    mutationFn: async ({ files, category: cat }: { files: File[]; category: string }) => {
      const list = Array.from(files);
      if (!list.length) return { ok: 0, fail: 0 };
      setProgress({ done: 0, total: list.length });
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < list.length; i++) {
        const file = list[i]!;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("entityType", entityType);
        fd.append("entityId", entityId);
        if (projectId) fd.append("projectId", projectId);
        if (bookingId) fd.append("bookingId", bookingId);
        if (unitId) fd.append("unitId", unitId);
        if (customerId) fd.append("customerId", customerId);
        fd.append("category", cat);
        fd.append("name", file.name);
        try {
          await api.upload("/api/documents", fd);
          ok += 1;
        } catch {
          fail += 1;
        }
        setProgress({ done: i + 1, total: list.length });
      }
      return { ok, fail };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: qk.booking(bookingId ?? "") });
      qc.invalidateQueries({ queryKey: qk.unit(unitId ?? "") });
      if (!res) return;
      if (res.fail === 0) toast.success(res.ok === 1 ? "Document uploaded" : `${res.ok} documents uploaded`);
      else if (res.ok === 0) toast.error("Upload failed");
      else toast.message(`Uploaded ${res.ok}, ${res.fail} failed`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Upload failed"),
    onSettled: () => setProgress(null),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Removed");
    },
  });

  function pickFiles(cat: Category, multiple = true) {
    bulkCategoryRef.current = cat;
    setCategory(cat);
    const input = fileInputRef.current;
    if (!input) return;
    input.multiple = multiple;
    input.value = "";
    input.click();
  }

  function onFilesSelected(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length) return;
    upload.mutate({ files, category: bulkCategoryRef.current });
  }

  const uploading = upload.isPending;
  const progressLabel =
    progress != null
      ? `Uploading ${progress.done}/${progress.total}…`
      : uploading
        ? "Uploading…"
        : null;

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => {
          onFilesSelected(e.target.files);
          e.target.value = "";
        }}
      />

      {showBulkActions ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bulk upload</p>
          <div className="flex flex-wrap gap-1.5">
            {BULK_ACTIONS.map((action) => (
              <Button
                key={action.category}
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                disabled={uploading}
                onClick={() => pickFiles(action.category, true)}
              >
                <Upload className="h-3 w-3" />
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <label
        className={cn(
          "flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-xs",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Upload className="h-3.5 w-3.5" />
          {progressLabel ?? "Drop zone — click to upload multiple files"}
        </span>
        <button
          type="button"
          className="text-[11px] font-medium text-primary"
          disabled={uploading}
          onClick={(e) => {
            e.preventDefault();
            pickFiles(category, true);
          }}
        >
          Choose files
        </button>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as Category)}
        >
          <SelectTrigger className="h-8 w-[10rem]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {categoryLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={uploading}
          onClick={() => pickFiles(category, true)}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload as {categoryLabel(category)}
        </Button>
      </div>

      {(data?.data ?? []).length ? (
        <ul className="space-y-1">
          {(data?.data ?? []).map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
              <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm hover:underline">
                {doc.name}
              </a>
              <div className="flex shrink-0 items-center gap-1.5">
                {!compact ? <StatusPill status={doc.category} /> : (
                  <span className="text-[10px] capitalize text-muted-foreground">{categoryLabel(doc.category)}</span>
                )}
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
    </div>
  );
}
