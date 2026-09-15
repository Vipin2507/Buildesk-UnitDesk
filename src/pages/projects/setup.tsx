import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { qk } from "@/lib/query-keys";
import {
  defaultStackTypes,
  formatUnitNumber,
  resizeStackTypes,
  UNIT_TYPE_OPTIONS,
  type UnitTypeKey,
} from "@/lib/units";

type Tab = "wings" | "generate" | "details" | "pricing" | "users";

type FloorCfg = { number: number; types: UnitTypeKey[] };
type WingCfg = {
  key: string;
  name: string;
  floorCount: number;
  defaultUnits: number;
  startFloor: number;
  stackTypes: UnitTypeKey[];
  floors: FloorCfg[];
  open: boolean;
};

function makeFloors(
  count: number,
  start: number,
  stackTypes: UnitTypeKey[],
  existing?: FloorCfg[],
): FloorCfg[] {
  const n = Math.max(1, Math.min(60, count || 1));
  const s = Number.isFinite(start) ? start : 1;
  return Array.from({ length: n }, (_, i) => {
    const prev = existing?.[i];
    const types = resizeStackTypes(prev?.types?.length ? prev.types : stackTypes, stackTypes.length);
    return { number: s + i, types };
  });
}

function newWing(name: string, floorCount = 10, defaultUnits = 8, startFloor = 1): WingCfg {
  const stackTypes = defaultStackTypes(defaultUnits);
  return {
    key: `${name}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    floorCount,
    defaultUnits,
    startFloor,
    stackTypes,
    floors: makeFloors(floorCount, startFloor, stackTypes),
    open: true,
  };
}

function typeSummary(types: UnitTypeKey[]) {
  const counts: Record<UnitTypeKey, number> = { "1BHK": 0, "2BHK": 0, "3BHK": 0 };
  for (const t of types) counts[t] += 1;
  return (["1BHK", "2BHK", "3BHK"] as UnitTypeKey[])
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]}×${k.replace("BHK", "B")}`)
    .join(" · ");
}

function TypeSelect({
  value,
  onChange,
  compact,
}: {
  value: UnitTypeKey;
  onChange: (v: UnitTypeKey) => void;
  compact?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as UnitTypeKey)}>
      <SelectTrigger className={cn(compact ? "h-7 text-[11px]" : "h-8")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {UNIT_TYPE_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProjectSetupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const uid = useId();
  const [tab, setTab] = useState<Tab>("generate");
  const [numberFormat, setNumberFormat] = useState("[Wing]-[Floor][Unit:2]");
  const [wings, setWings] = useState<WingCfg[]>([newWing("A"), newWing("B")]);
  const seeded = useRef(false);

  const { data: project } = useQuery({
    queryKey: qk.project(id!),
    queryFn: () =>
      api.get<{
        name: string;
        company: { name: string };
        totalWings: number;
        totalFloors: number;
        unitsPerFloor: number;
        numberFormat: string;
      }>(`/api/projects/${id}`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!project || seeded.current) return;
    seeded.current = true;
    if (project.numberFormat) setNumberFormat(project.numberFormat);
    if (project.totalWings > 0) {
      const names = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(0, Math.min(26, project.totalWings)).split("");
      setWings(
        names.map((name) =>
          newWing(name, project.totalFloors || 10, project.unitsPerFloor || 8, 1),
        ),
      );
    }
  }, [project]);

  const preview = useMemo(
    () => wings.reduce((sum, w) => sum + w.floors.reduce((s, f) => s + f.types.length, 0), 0),
    [wings],
  );
  const typeTotals = useMemo(() => {
    const counts: Record<UnitTypeKey, number> = { "1BHK": 0, "2BHK": 0, "3BHK": 0 };
    for (const w of wings) {
      for (const f of w.floors) for (const t of f.types) counts[t] += 1;
    }
    return counts;
  }, [wings]);
  const example = formatUnitNumber(
    numberFormat,
    wings[0]?.name || "A",
    wings[0]?.floors[0]?.number ?? 1,
    1,
  );

  function updateWing(key: string, patch: Partial<WingCfg>) {
    setWings((list) =>
      list.map((w) => {
        if (w.key !== key) return w;
        let next = { ...w, ...patch };
        if (patch.defaultUnits !== undefined) {
          next.stackTypes = resizeStackTypes(w.stackTypes, patch.defaultUnits);
        }
        if (patch.stackTypes) {
          next.stackTypes = patch.stackTypes;
          next.defaultUnits = patch.stackTypes.length;
        }
        if (
          patch.floorCount !== undefined ||
          patch.startFloor !== undefined ||
          patch.defaultUnits !== undefined ||
          patch.stackTypes
        ) {
          next.floors = makeFloors(next.floorCount, next.startFloor, next.stackTypes, next.floors);
        }
        return next;
      }),
    );
  }

  function applyStackToAllFloors(key: string) {
    setWings((list) =>
      list.map((w) =>
        w.key === key
          ? {
              ...w,
              floors: w.floors.map((f) => ({
                ...f,
                types: resizeStackTypes(w.stackTypes, f.types.length || w.stackTypes.length),
              })),
            }
          : w,
      ),
    );
  }

  function setFloorUnitCount(wingKey: string, floorIndex: number, count: number) {
    setWings((list) =>
      list.map((w) => {
        if (w.key !== wingKey) return w;
        const floors = w.floors.map((f, i) => {
          if (i !== floorIndex) return f;
          return { ...f, types: resizeStackTypes(f.types.length ? f.types : w.stackTypes, count) };
        });
        return { ...w, floors };
      }),
    );
  }

  function setFloorSlotType(wingKey: string, floorIndex: number, slotIndex: number, type: UnitTypeKey) {
    setWings((list) =>
      list.map((w) => {
        if (w.key !== wingKey) return w;
        const floors = w.floors.map((f, i) => {
          if (i !== floorIndex) return f;
          const types = f.types.map((t, si) => (si === slotIndex ? type : t));
          return { ...f, types };
        });
        return { ...w, floors };
      }),
    );
  }

  function setStackType(wingKey: string, slotIndex: number, type: UnitTypeKey) {
    setWings((list) =>
      list.map((w) => {
        if (w.key !== wingKey) return w;
        const stackTypes = w.stackTypes.map((t, i) => (i === slotIndex ? type : t));
        return {
          ...w,
          stackTypes,
          floors: w.floors.map((f) => ({
            ...f,
            types: resizeStackTypes(stackTypes, f.types.length),
          })),
        };
      }),
    );
  }

  const generate = useMutation({
    mutationFn: () =>
      api.post<{ preview: number }>(`/api/projects/${id}/generate-units`, {
        numberFormat,
        wings: wings.map((w) => ({
          name: w.name.trim(),
          floors: w.floors.map((f) => ({ number: f.number, types: f.types })),
        })),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qk.project(id!) });
      qc.invalidateQueries({ queryKey: ["inventory", id] });
      toast.success(`Generated ${res.preview} units`);
      navigate(`/projects/${id}/inventory`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Generation failed"),
  });

  const { data: employees } = useQuery({
    queryKey: qk.employees,
    queryFn: () => api.get<ListResponse<{ id: string; name: string; email: string }>>("/api/employees"),
  });

  const canGenerate =
    wings.length > 0 &&
    wings.every(
      (w) =>
        w.name.trim() &&
        w.floors.length > 0 &&
        w.floors.every((f) => f.types.length > 0 && f.types.every(Boolean)),
    );

  return (
    <PageWrap>
      <PageHeader
        title="Project setup"
        subtitle={project ? `${project.company.name} · ${project.name}` : "Wings, floors, units"}
        breadcrumbs={[
          { label: "Projects", to: "/projects" },
          { label: project?.name ?? "Setup" },
        ]}
      />
      <SegmentedTabs
        tabs={[
          { id: "wings", label: "Wings & Floors" },
          { id: "generate", label: "Unit Generation" },
          { id: "details", label: "Unit Details" },
          { id: "pricing", label: "Pricing" },
          { id: "users", label: "Users" },
        ]}
        value={tab}
        onChange={setTab}
      >
        {tab === "wings" || tab === "generate" ? (
          <div className="max-w-4xl space-y-3">
            <CardSoft className="space-y-2.5">
              <Field label="Unit number format">
                <Input className="h-8" value={numberFormat} onChange={(e) => setNumberFormat(e.target.value)} />
              </Field>
              <p className="text-xs text-muted-foreground">
                Live example: <span className="font-medium text-foreground">{example}</span>
                {" · "}
                Total <span className="font-semibold tabular-nums text-foreground">{preview}</span> units
                {" · "}
                {typeTotals["1BHK"] ? `${typeTotals["1BHK"]}×1B ` : ""}
                {typeTotals["2BHK"] ? `${typeTotals["2BHK"]}×2B ` : ""}
                {typeTotals["3BHK"] ? `${typeTotals["3BHK"]}×3B` : ""}
              </p>
            </CardSoft>

            <div className="space-y-2">
              {wings.map((wing, wi) => {
                const wingUnits = wing.floors.reduce((s, f) => s + f.types.length, 0);
                return (
                  <CardSoft key={wing.key} className="space-y-2.5 p-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <button
                        type="button"
                        className="mt-1 text-muted-foreground"
                        onClick={() => updateWing(wing.key, { open: !wing.open })}
                        aria-label={wing.open ? "Collapse wing" : "Expand wing"}
                      >
                        <ChevronDown className={cn("h-4 w-4 transition-transform", !wing.open && "-rotate-90")} />
                      </button>
                      <Field label="Wing name" className="min-w-[5rem] flex-1">
                        <Input
                          className="h-8"
                          value={wing.name}
                          onChange={(e) => updateWing(wing.key, { name: e.target.value })}
                        />
                      </Field>
                      <Field label="Floors">
                        <Input
                          className="h-8 w-20"
                          type="number"
                          min={1}
                          max={60}
                          value={wing.floorCount}
                          onChange={(e) => updateWing(wing.key, { floorCount: Number(e.target.value) })}
                        />
                      </Field>
                      <Field label="Start floor">
                        <Input
                          className="h-8 w-20"
                          type="number"
                          value={wing.startFloor}
                          onChange={(e) => updateWing(wing.key, { startFloor: Number(e.target.value) })}
                        />
                      </Field>
                      <Field label="Units / floor">
                        <Input
                          className="h-8 w-24"
                          type="number"
                          min={1}
                          max={40}
                          value={wing.defaultUnits}
                          onChange={(e) => updateWing(wing.key, { defaultUnits: Number(e.target.value) })}
                        />
                      </Field>
                      <div className="ml-auto flex items-end gap-1.5 pb-0.5">
                        <p className="pb-1.5 text-[11px] tabular-nums text-muted-foreground">
                          {wing.floors.length} fl · {wingUnits} units
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => applyStackToAllFloors(wing.key)}
                        >
                          Apply types to floors
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={wings.length <= 1}
                          onClick={() => setWings((list) => list.filter((w) => w.key !== wing.key))}
                          aria-label={`Remove wing ${wing.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-lg border bg-muted/20 p-2">
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Default stack types — Wing {wing.name || wi + 1}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{typeSummary(wing.stackTypes)}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
                        {wing.stackTypes.map((type, si) => (
                          <label key={`${wing.key}-stack-${si}`} className="space-y-0.5">
                            <span className="text-[10px] font-medium text-muted-foreground">U{si + 1}</span>
                            <TypeSelect value={type} onChange={(v) => setStackType(wing.key, si, v)} compact />
                          </label>
                        ))}
                      </div>
                    </div>

                    {wing.open ? (
                      <div className="space-y-2 rounded-lg border bg-card/60 p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Per floor — count & types
                        </p>
                        {wing.floors.map((floor, fi) => (
                          <div key={`${wing.key}-floor-${floor.number}-${fi}`} className="rounded-md border bg-muted/15 p-2">
                            <div className="mb-1.5 flex flex-wrap items-center gap-2">
                              <span className="w-12 text-xs font-semibold tabular-nums">
                                {floor.number === 0 ? "G" : `F${floor.number}`}
                              </span>
                              <Field label="Units">
                                <Input
                                  id={`${uid}-${wing.key}-${fi}-count`}
                                  className="h-7 w-20"
                                  type="number"
                                  min={1}
                                  max={40}
                                  value={floor.types.length}
                                  onChange={(e) => setFloorUnitCount(wing.key, fi, Number(e.target.value))}
                                />
                              </Field>
                              <p className="text-[11px] text-muted-foreground">{typeSummary(floor.types)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
                              {floor.types.map((type, si) => (
                                <label key={`${wing.key}-${fi}-${si}`} className="space-y-0.5">
                                  <span className="text-[10px] font-medium text-muted-foreground">U{si + 1}</span>
                                  <TypeSelect
                                    value={type}
                                    onChange={(v) => setFloorSlotType(wing.key, fi, si, v)}
                                    compact
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </CardSoft>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const next = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[wings.length] ?? `W${wings.length + 1}`;
                  setWings((list) => [...list, newWing(next)]);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add wing
              </Button>
              <Button
                size="sm"
                disabled={generate.isPending || !canGenerate}
                onClick={() => {
                  if (!confirm(`Generate ${preview} units with this layout & types? This replaces empty inventory.`)) {
                    return;
                  }
                  generate.mutate();
                }}
              >
                Generate {preview} units
              </Button>
            </div>
          </div>
        ) : null}
        {tab === "details" || tab === "pricing" ? (
          <CardSoft>
            <p className="text-xs text-muted-foreground">
              Type, areas and base price come from the configuration you set on each stack / floor above. Edit individual units later from Unit Master if needed.
            </p>
            <Button size="sm" className="mt-2" variant="outline" onClick={() => navigate(`/projects/${id}/units`)}>
              Open unit master
            </Button>
          </CardSoft>
        ) : null}
        {tab === "users" ? (
          <CardSoft>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Employees</p>
            <div className="space-y-1">
              {(employees?.data ?? []).map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs">
                  <span>{e.name}</span>
                  <span className="text-muted-foreground">{e.email}</span>
                </div>
              ))}
            </div>
            <Button size="sm" className="mt-2" variant="outline" onClick={() => navigate("/users")}>
              Manage access
            </Button>
          </CardSoft>
        ) : null}
      </SegmentedTabs>
    </PageWrap>
  );
}
