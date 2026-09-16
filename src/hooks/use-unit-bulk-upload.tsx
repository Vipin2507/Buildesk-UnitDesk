import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export const UNIT_DOC_UPLOAD_ACTIONS = [
  { category: "kyc", label: "Bulk upload KYC" },
  { category: "agreement", label: "Bulk upload agreement" },
  { category: "floor_plan", label: "Bulk upload floor plan" },
  { category: "receipt", label: "Bulk upload receipts" },
  { category: "other", label: "Bulk upload other docs" },
] as const;

export function useUnitBulkUpload(projectId?: string | null) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<{ unitId: string; category: string; bookingId?: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);

  function start(unitId: string, category: string, bookingId?: string | null) {
    if (!projectId) {
      toast.error("Project required");
      return;
    }
    targetRef.current = { unitId, category, bookingId };
    const input = inputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }

  async function onFiles(files: FileList | null) {
    const target = targetRef.current;
    if (!files?.length || !target || !projectId) return;
    const list = Array.from(files);
    setUploading(true);
    let ok = 0;
    let fail = 0;
    for (const file of list) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entityType", "unit");
      fd.append("entityId", target.unitId);
      fd.append("projectId", projectId);
      fd.append("unitId", target.unitId);
      if (target.bookingId) fd.append("bookingId", target.bookingId);
      fd.append("category", target.category);
      fd.append("name", file.name);
      try {
        await api.upload("/api/documents", fd);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setUploading(false);
    qc.invalidateQueries({ queryKey: ["documents"] });
    qc.invalidateQueries({ queryKey: qk.unit(target.unitId) });
    if (fail === 0) toast.success(ok === 1 ? "Document uploaded" : `${ok} documents uploaded`);
    else if (ok === 0) toast.error("Upload failed");
    else toast.message(`Uploaded ${ok}, ${fail} failed`);
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      className="hidden"
      multiple
      onChange={(e) => {
        void onFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  return { start, uploading, fileInput };
}
