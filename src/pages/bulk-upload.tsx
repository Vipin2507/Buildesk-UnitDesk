import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { Button } from "@/components/ui/button";
import { api, ApiError, getToken } from "@/lib/api";
import { cn } from "@/lib/cn";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth";

type ColumnDef = {
  key: string;
  label: string;
  required?: boolean;
  hint?: string;
};

type KindMeta = {
  id: string;
  label: string;
  sheetName: string;
  description: string;
  permission: string;
  order: number;
  columns: ColumnDef[];
};

type RowOutcome = {
  row: number;
  status: "created" | "updated" | "skipped" | "error";
  message: string;
  key?: string;
};

type ImportResult = {
  kind: string;
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  outcomes: RowOutcome[];
  sheetName?: string;
};

function fail(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback);
}

async function downloadSheetTemplate(kind: string, sheetName: string) {
  const token = getToken();
  const res = await fetch(`/api/bulk-import/templates/${kind}?format=xlsx`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError("Template download failed", res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `unitdesk-${sheetName.replace(/\s+/g, "-").toLowerCase()}-sheet.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importSheet(kind: string, file: File, dryRun: boolean) {
  const fd = new FormData();
  fd.append("file", file);
  const token = getToken();
  const res = await fetch(`/api/bulk-import/${kind}?dryRun=${dryRun ? "true" : "false"}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(json?.message ?? "Import failed", res.status);
  return json as ImportResult;
}

export function BulkUploadPage() {
  const user = useAuthStore((s) => s.user);
  const perms = user?.permissions ?? [];
  const can = (p: string) => Boolean(user?.isSuperAdmin || perms.includes(p));

  const { data: kindsData, isLoading } = useQuery({
    queryKey: qk.bulkImportKinds,
    queryFn: () => api.get<{ data: KindMeta[] }>("/api/bulk-import/kinds"),
  });

  const kinds = useMemo(
    () => [...(kindsData?.data ?? [])].sort((a, b) => a.order - b.order),
    [kindsData],
  );

  return (
    <PageWrap>
      <PageHeader
        title="Bulk upload"
        subtitle="Each entity has its own Excel sheet — download, fill, and upload separately in order"
      />

      <CardSoft className="mb-3 space-y-1.5 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">How to import</p>
        <ol className="list-decimal space-y-0.5 pl-4">
          <li>Download the sheet template for one entity (e.g. Companies).</li>
          <li>Fill only that sheet — do not mix other entity columns in it.</li>
          <li>Upload that file in the matching card below (Preview, then Import).</li>
          <li>
            Repeat for the next sheet in order: Companies → Projects → Units → Bookings →
            Installments → Payments.
          </li>
        </ol>
      </CardSoft>

      {isLoading ? (
        <EmptyState icon={Upload} title="Loading sheets…" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {kinds.map((kind, idx) => (
            <SheetUploadCard
              key={kind.id}
              kind={kind}
              step={idx + 1}
              allowed={can(kind.permission)}
            />
          ))}
        </div>
      )}
    </PageWrap>
  );
}

function SheetUploadCard({
  kind,
  step,
  allowed,
}: {
  kind: KindMeta;
  step: number;
  allowed: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [showCols, setShowCols] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async (dryRun: boolean) => {
    if (!file) {
      toast.error(`Choose the ${kind.sheetName} Excel sheet first`);
      return;
    }
    if (!dryRun && !confirm(`Import ${kind.sheetName} sheet now?`)) return;
    setBusy(dryRun ? "preview" : "import");
    try {
      const res = await importSheet(kind.id, file, dryRun);
      setResult(res);
      if (dryRun) {
        toast.message(
          `${kind.sheetName} preview · ${res.created} create · ${res.updated} update · ${res.failed} errors`,
        );
      } else if (res.failed && !res.created && !res.updated) {
        toast.error(`${kind.sheetName}: errors only`);
      } else {
        toast.success(
          `${kind.sheetName} imported · ${res.created} created · ${res.updated} updated`,
        );
      }
    } catch (err) {
      fail(err, `${kind.sheetName} import failed`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <CardSoft className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-[11px] font-semibold">
            {step}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{kind.label}</p>
            <p className="text-[11px] text-muted-foreground">
              Sheet name: <span className="font-medium text-foreground">{kind.sheetName}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{kind.description}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() =>
            downloadSheetTemplate(kind.id, kind.sheetName)
              .then(() => toast.success(`${kind.sheetName} sheet downloaded`))
              .catch((err) => fail(err, "Download failed"))
          }
        >
          <Download className="h-3.5 w-3.5" />
          Sheet
        </Button>
      </div>

      <button
        type="button"
        className="text-left text-[11px] text-primary hover:underline"
        onClick={() => setShowCols((v) => !v)}
      >
        {showCols ? "Hide columns" : `Show ${kind.columns.length} columns`}
      </button>
      {showCols ? (
        <div className="max-h-36 overflow-auto rounded-md border">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-muted/80">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Column</th>
                <th className="px-2 py-1 text-left font-medium">Req</th>
              </tr>
            </thead>
            <tbody>
              {kind.columns.map((c) => (
                <tr key={c.key} className="border-t">
                  <td className="px-2 py-0.5 font-mono">{c.key}</td>
                  <td className="px-2 py-0.5 text-muted-foreground">
                    {c.required ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!allowed ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] text-warning-foreground">
          Needs <span className="font-medium">{kind.permission}</span> permission
        </p>
      ) : null}

      <div
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-center transition-colors",
          file ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40",
          !allowed && "pointer-events-none opacity-50",
        )}
        onClick={() => allowed && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!allowed) return;
          const f = e.dataTransfer.files?.[0];
          if (f) {
            setFile(f);
            setResult(null);
          }
        }}
      >
        <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
        {file ? (
          <>
            <p className="truncate text-xs font-medium">{file.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB · click to change
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-medium">Drop {kind.sheetName} .xlsx here</p>
            <p className="text-[10px] text-muted-foreground">
              One sheet only · .xlsx or .csv · max 8 MB
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
          }}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={!allowed || !file || Boolean(busy)}
          onClick={() => run(true)}
        >
          {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Preview
        </Button>
        <Button size="sm" disabled={!allowed || !file || Boolean(busy)} onClick={() => run(false)}>
          {busy === "import" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          Import {kind.sheetName}
        </Button>
      </div>

      {result ? <MiniResult result={result} /> : null}
    </CardSoft>
  );
}

function MiniResult({ result }: { result: ImportResult }) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="text-[11px] font-medium">
          {result.dryRun ? "Preview" : "Imported"}
          {result.sheetName ? ` · ${result.sheetName}` : ""}
        </p>
        <div className="flex flex-wrap gap-1 text-[10px]">
          <span className="rounded border px-1.5 py-0.5">+{result.created} created</span>
          <span className="rounded border px-1.5 py-0.5">~{result.updated} updated</span>
          <span className="rounded border px-1.5 py-0.5">{result.skipped} skipped</span>
          <span className="rounded border border-destructive/30 px-1.5 py-0.5 text-destructive">
            {result.failed} failed
          </span>
        </div>
      </div>
      <div className="max-h-40 overflow-auto">
        <table className="w-full text-[11px]">
          <tbody>
            {result.outcomes.slice(0, 40).map((o, i) => (
              <tr key={`${o.row}-${i}`} className="border-t border-border/60">
                <td className="w-8 py-0.5 tabular-nums text-muted-foreground">{o.row || "—"}</td>
                <td className="w-20 py-0.5 capitalize">
                  <span className="inline-flex items-center gap-0.5">
                    {o.status === "error" ? (
                      <XCircle className="h-3 w-3 text-destructive" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    )}
                    {o.status}
                  </span>
                </td>
                <td className="py-0.5">{o.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.outcomes.length > 40 ? (
          <p className="pt-1 text-[10px] text-muted-foreground">
            Showing first 40 of {result.outcomes.length} rows
          </p>
        ) : null}
      </div>
    </div>
  );
}
