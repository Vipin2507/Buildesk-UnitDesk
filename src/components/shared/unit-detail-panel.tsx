import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronLeft, ChevronRight, FileText, LayoutTemplate, MoreHorizontal, Pencil, Plus, Upload, UserRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DocumentsPanel } from "@/components/shared/documents-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { StatusPill } from "@/components/shared/status-pill";
import { UnitEditDialog } from "@/components/shared/unit-edit-dialog";
import { UnitPlanImage } from "@/components/shared/unit-plan-image";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UNIT_DOC_UPLOAD_ACTIONS, useUnitBulkUpload } from "@/hooks/use-unit-bulk-upload";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { floorLabel, formatDate, inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { statusLabel } from "@/lib/status";
import { isCustomUnitPhoto, projectPlansFrom, resolveUnitPhotoUrl } from "@/lib/unit-plans";
import { useDrilldownSheetStore } from "@/stores/drilldown";

type UnitTab = "overview" | "customer" | "financials" | "documents" | "activity";

type UnitDetail = {
  id: string;
  unitNumber: string;
  unitType: string | null;
  configuration: string | null;
  carpetArea: number | null;
  builtUpArea: number | null;
  saleableArea: number | null;
  balconyArea: number | null;
  facing: string | null;
  parking: string | null;
  basePrice: number | null;
  plc: number | null;
  otherCharges: number | null;
  remarks: string | null;
  photoUrl: string | null;
  status: string;
  floor: {
    number: number;
    wing: {
      id: string;
      name: string;
      projectId?: string;
      project: {
        id: string;
        name: string;
        plan1bhkUrl?: string | null;
        plan2bhkUrl?: string | null;
        plan3bhkUrl?: string | null;
      };
    };
  };
  bookings: Array<{
    id: string;
    bookingNumber: string;
    status: string;
    customers: Array<{ name: string; mobile: string; email?: string | null; role: string }>;
    financials: {
      agreement?: number;
      gst?: number;
      otherCharges?: number;
      totalCost: number;
      gstOnAgreement?: number;
      stampDutyRegistration?: number;
      valueToBeCollected?: number;
      finance?: number;
    } | null;
  }>;
};

type Audit = { id: string; action: string; actorName: string | null; createdAt: string; meta: string | null };

function area(value?: number | null) {
  return value != null ? `${value.toLocaleString("en-IN")} sq.ft` : "—";
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/70 py-1.5 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">{value ?? "—"}</span>
    </div>
  );
}

export function UnitDetailPanel({
  unitId,
  neighborIds = [],
  variant = "docked",
  onClose,
}: {
  unitId: string | null;
  neighborIds?: string[];
  variant?: "docked" | "sheet";
  onClose?: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const open = useDrilldownSheetStore((s) => s.open);
  const docked = useDrilldownSheetStore((s) => s.docked);
  const storedNeighbors = useDrilldownSheetStore((s) => s.neighborIds);
  const [tab, setTab] = useState<UnitTab>("overview");
  const [editing, setEditing] = useState(false);
  const navIds = neighborIds.length ? neighborIds : storedNeighbors;

  const { data } = useQuery({
    queryKey: qk.unit(unitId ?? ""),
    queryFn: () => api.get<UnitDetail>(`/api/units/${unitId}`),
    enabled: Boolean(unitId),
    placeholderData: keepPreviousData,
  });
  const { data: audit } = useQuery({
    queryKey: qk.audit({ entityType: "unit", entityId: unitId }),
    queryFn: () => api.get<ListResponse<Audit>>("/api/audit", { entityType: "unit", entityId: unitId, pageSize: 20 }),
    enabled: tab === "activity" && Boolean(unitId),
    placeholderData: keepPreviousData,
  });

  const booking = data?.bookings?.find((b) => b.status !== "cancelled");
  const projectId = data?.floor.wing.project.id;
  const bulkUpload = useUnitBulkUpload(projectId);
  const index = unitId ? navIds.indexOf(unitId) : -1;
  const prevId = index > 0 ? navIds[index - 1] : undefined;
  const nextId = index >= 0 && index < navIds.length - 1 ? navIds[index + 1] : undefined;
  const canBook = Boolean(data) && !booking && data?.status !== "blocked" && data?.status !== "sold";
  const canBlock = Boolean(data) && data?.status !== "blocked" && !booking && data?.status !== "sold";

  const setStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/api/units/${unitId}`, { status }),
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: qk.unit(unitId ?? "") });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`Marked ${statusLabel[status] ?? status}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update unit"),
  });

  const setPhoto = useMutation({
    mutationFn: (photoUrl: string | null) => api.patch(`/api/units/${unitId}`, { photoUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.unit(unitId ?? "") });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update photo"),
  });

  function startBulkUpload(category: string) {
    if (!unitId) return;
    setTab("documents");
    bulkUpload.start(unitId, category, booking?.id);
  }

  function goNeighbor(id?: string) {
    if (!id) return;
    open("unit", id, { docked });
  }

  const shown = unitId ? data : undefined;
  const projectPlans = projectPlansFrom(shown?.floor.wing.project);
  const planUrl = shown
    ? resolveUnitPhotoUrl(shown.photoUrl, shown.unitType, shown.configuration, projectPlans)
    : null;
  const customPhoto = isCustomUnitPhoto(shown?.photoUrl);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-card",
        variant === "docked" && "card-soft min-h-[32rem] overflow-hidden lg:h-[calc(100vh-6.75rem)] lg:min-h-0",
        variant === "sheet" && "h-full",
      )}
    >
      <div className={cn("flex items-center justify-between border-b px-3 py-2", variant === "sheet" && "pr-10")}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unit Details</p>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" disabled={!prevId} onClick={() => goNeighbor(prevId)} aria-label="Previous unit">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={!nextId} onClick={() => goNeighbor(nextId)} aria-label="Next unit">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!unitId ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium">Select a unit</p>
          <p className="text-xs text-muted-foreground">Click a cell on the map to inspect availability, customer and financials.</p>
        </div>
      ) : (
        <>
          {bulkUpload.fileInput}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-stretch gap-3 px-3 pt-3">
              <div className="min-w-0 w-[9.5rem] shrink-0">
                {shown ? <StatusPill status={shown.status} /> : <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />}
                <h2 className="mt-1.5 text-xl font-semibold tracking-tight">
                  {shown?.unitNumber ?? "…"}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {shown
                    ? `Wing ${shown.floor.wing.name} · ${floorLabel(shown.floor.number)} · ${shown.configuration ?? shown.unitType ?? "—"}`
                    : "Loading…"}
                </p>
                {shown ? (
                  <Button variant="outline" size="sm" className="mt-2 h-7" onClick={() => setEditing(true)}>
                    <Pencil className="h-3 w-3" />
                    Edit unit
                  </Button>
                ) : null}
              </div>
              {planUrl ? (
                <UnitPlanImage
                  src={planUrl}
                  size="fill"
                  fit="contain"
                  className="min-h-[7.5rem] flex-1"
                  editable
                  isCustom={customPhoto}
                  onChange={(url) => setPhoto.mutate(url)}
                />
              ) : (
                <div className="min-h-[7.5rem] flex-1 rounded-lg border bg-muted" />
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <SegmentedTabs
                compact
                tabs={[
                  { id: "overview", label: "Overview" },
                  { id: "customer", label: "Customer" },
                  { id: "financials", label: "Financials" },
                  { id: "documents", label: "Documents" },
                  { id: "activity", label: "Activity" },
                ]}
                value={tab}
                onChange={setTab}
              >
                {tab === "overview" && shown ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <Row label="Unit No." value={shown.unitNumber} />
                      <Row label="Wing" value={shown.floor.wing.name} />
                      <Row label="Floor" value={floorLabel(shown.floor.number)} />
                      <Row label="Unit Type" value={shown.configuration ?? shown.unitType} />
                      <Row label="Carpet Area" value={area(shown.carpetArea)} />
                      <Row label="Built-up Area" value={area(shown.builtUpArea)} />
                      <Row label="Facing" value={shown.facing} />
                      <div className="flex items-center justify-between gap-3 border-b border-border/70 py-1.5">
                        <span className="text-[11px] text-muted-foreground">Status</span>
                        <StatusPill status={shown.status} />
                      </div>
                      <Row label="Remarks" value={shown.remarks} />
                      <Row label="Base price" value={inr(shown.basePrice)} />
                    </div>
                    {planUrl ? (
                      <UnitPlanImage
                        src={planUrl}
                        size="lg"
                        fit="contain"
                        className="w-full shrink-0 sm:w-[9.5rem]"
                        editable
                        isCustom={customPhoto}
                        onChange={(url) => setPhoto.mutate(url)}
                      />
                    ) : null}
                  </div>
                ) : null}

                {tab === "customer" ? (
                  booking ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        className="w-full rounded-lg border px-2.5 py-2 text-left hover:bg-muted/40"
                        onClick={() => {
                          onClose?.();
                          navigate(`/bookings/${booking.id}`);
                        }}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Booking</p>
                        <p className="text-sm font-medium">{booking.bookingNumber}</p>
                      </button>
                      {booking.customers.map((c) => (
                        <div key={`${c.role}-${c.mobile}-${c.name}`} className="rounded-lg border px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{c.role}</p>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.mobile}</p>
                          {c.email ? <p className="text-xs text-muted-foreground">{c.email}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                      <UserRound className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">No customer linked to this unit yet.</p>
                      {canBook && shown ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onClose?.();
                            navigate(`/bookings/new?unitId=${shown.id}&projectId=${shown.floor.wing.project.id}`);
                          }}
                        >
                          Create booking to add a customer
                        </Button>
                      ) : null}
                    </div>
                  )
                ) : null}

                {tab === "financials" ? (
                  booking?.financials ? (
                    <div>
                      <Row label="Agreement" value={inr(booking.financials.agreement)} />
                      <Row label="GST" value={inr(booking.financials.gst)} />
                      <Row label="Other charges" value={inr(booking.financials.otherCharges)} />
                      <Row label="Total cost" value={inr(booking.financials.totalCost)} />
                      <Row label="GST on agreement" value={inr(booking.financials.gstOnAgreement)} />
                      <Row label="Stamp duty registration" value={inr(booking.financials.stampDutyRegistration)} />
                      <Row label="Value to be collected" value={inr(booking.financials.valueToBeCollected)} />
                      <Row label="Finance" value={inr(booking.financials.finance)} />
                    </div>
                  ) : (
                    <EmptyState icon={FileText} title="No financials captured yet." />
                  )
                ) : null}

                {tab === "documents" && shown && projectId ? (
                  <div className="space-y-2">
                    {bulkUpload.uploading ? (
                      <p className="text-xs text-muted-foreground">Uploading documents…</p>
                    ) : null}
                    <DocumentsPanel
                      compact
                      showBulkActions
                      projectId={projectId}
                      unitId={shown.id}
                      bookingId={booking?.id}
                      entityType="unit"
                      entityId={shown.id}
                    />
                  </div>
                ) : null}

                {tab === "activity" ? (
                  (audit?.data ?? []).length ? (
                    <ul className="space-y-1.5">
                      {(audit?.data ?? []).map((row) => (
                        <li key={row.id} className="rounded-md border px-2 py-1.5">
                          <p className="text-xs font-medium">{row.action}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {row.actorName ?? "system"} · {formatDate(row.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState icon={FileText} title="No activity recorded yet." />
                  )
                ) : null}
              </SegmentedTabs>
            </div>
          </div>

          {shown ? (
            <div className="flex items-center gap-1.5 border-t p-2.5">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={!canBlock || setStatus.isPending}
                onClick={() => setStatus.mutate("blocked")}
              >
                <Ban className="h-3.5 w-3.5" />
                Block Unit
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={!canBook}
                onClick={() => {
                  onClose?.();
                  navigate(`/bookings/new?unitId=${shown.id}&projectId=${shown.floor.wing.project.id}`);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Create Booking
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="px-2">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="hidden sm:inline">More</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={shown.status === "hold" || Boolean(booking) || setStatus.isPending}
                    onClick={() => setStatus.mutate("hold")}
                  >
                    Put on hold
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={shown.status === "available" || Boolean(booking) || setStatus.isPending}
                    onClick={() => setStatus.mutate("available")}
                  >
                    Mark available
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={shown.status === "not_available" || Boolean(booking) || setStatus.isPending}
                    onClick={() => setStatus.mutate("not_available")}
                  >
                    Mark not released
                  </DropdownMenuItem>
                  {booking ? (
                    <DropdownMenuItem
                      onClick={() => {
                        onClose?.();
                        navigate(`/bookings/${booking.id}`);
                      }}
                    >
                      Open booking
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  {UNIT_DOC_UPLOAD_ACTIONS.map((action) => (
                    <DropdownMenuItem
                      key={action.category}
                      disabled={bulkUpload.uploading}
                      onClick={() => startBulkUpload(action.category)}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onClick={() => setTab("documents")}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Open documents
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setEditing(true)}>Edit unit</DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      onClose?.();
                      navigate(`/projects/${shown.floor.wing.project.id}/units/${shown.id}/edit`);
                    }}
                  >
                    Full edit page
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      onClose?.();
                      navigate(`/projects/${shown.floor.wing.project.id}/units`);
                    }}
                  >
                    Open in unit master
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </>
      )}
      <UnitEditDialog unitId={unitId} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
