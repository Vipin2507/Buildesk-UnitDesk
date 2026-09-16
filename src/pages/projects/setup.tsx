import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Building2,
  Check,
  ChevronDown,
  Layers3,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { EASE, prefersReducedMotion, staggerDelay } from "@/lib/motion";
import { qk } from "@/lib/query-keys";
import {
  defaultStackTypes,
  formatUnitNumber,
  resizeStackTypes,
  type UnitTypeKey,
} from "@/lib/units";

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

const TYPE_ORDER: UnitTypeKey[] = ["1BHK", "2BHK", "3BHK"];
const TYPE_TONE: Record<UnitTypeKey, string> = {
  "1BHK": "border-amber-500/35 bg-amber-500/12 text-amber-900 hover:bg-amber-500/18",
  "2BHK": "border-primary/35 bg-primary/12 text-primary hover:bg-primary/18",
  "3BHK": "border-emerald-500/35 bg-emerald-500/12 text-emerald-900 hover:bg-emerald-500/18",
};
const TYPE_DOT: Record<UnitTypeKey, string> = {
  "1BHK": "bg-amber-500",
  "2BHK": "bg-primary",
  "3BHK": "bg-emerald-600",
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
    open: false,
  };
}

function typeSummary(types: UnitTypeKey[]) {
  const counts: Record<UnitTypeKey, number> = { "1BHK": 0, "2BHK": 0, "3BHK": 0 };
  for (const t of types) counts[t] += 1;
  return (TYPE_ORDER.filter((k) => counts[k] > 0) as UnitTypeKey[])
    .map((k) => `${counts[k]}×${k.replace("BHK", "B")}`)
    .join(" · ");
}

function nextType(value: UnitTypeKey): UnitTypeKey {
  return TYPE_ORDER[(TYPE_ORDER.indexOf(value) + 1) % TYPE_ORDER.length]!;
}

function TypeChip({
  value,
  onChange,
  size = "md",
  className,
}: {
  value: UnitTypeKey;
  onChange: (v: UnitTypeKey) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <button
      type="button"
      title="Click to cycle 1 / 2 / 3 BHK"
      onClick={() => onChange(nextType(value))}
      className={cn(
        "inline-flex items-center justify-center rounded-md border font-semibold tabular-nums transition-[transform,background-color,box-shadow] duration-200 active:scale-95",
        TYPE_TONE[value],
        size === "sm" ? "h-7 min-w-[3.25rem] px-1.5 text-[10px]" : "h-8 min-w-[3.75rem] px-2 text-[11px]",
        className,
      )}
    >
      {value.replace("BHK", " BHK")}
    </button>
  );
}

function UnitTypeStack({
  types,
  size = "md",
  onChange,
  keyPrefix,
}: {
  types: UnitTypeKey[];
  size?: "sm" | "md";
  onChange: (slotIndex: number, type: UnitTypeKey) => void;
  keyPrefix: string;
}) {
  const col = size === "sm" ? "w-[3.25rem]" : "w-[3.75rem]";
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((type, si) => (
        <div key={`${keyPrefix}-${si}`} className={cn("flex flex-col items-center gap-1", col)}>
          <span className="w-full text-center text-[10px] font-medium leading-none text-muted-foreground">
            U{si + 1}
          </span>
          <TypeChip
            size={size}
            className="w-full"
            value={type}
            onChange={(v) => onChange(si, v)}
          />
        </div>
      ))}
    </div>
  );
}

function WingSilhouette({ floors, active }: { floors: number; active?: boolean }) {
  const bars = Math.min(14, Math.max(3, floors));
  return (
    <div className={cn("flex h-11 items-end gap-0.5 rounded-lg px-2 py-1.5", active ? "bg-primary/10" : "bg-muted/60")}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-sm transition-colors", active ? "bg-primary/70" : "bg-foreground/20")}
          style={{ height: `${28 + ((i * 17) % 40)}%` }}
        />
      ))}
    </div>
  );
}

export function ProjectSetupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const reduced = prefersReducedMotion();
  const [numberFormat, setNumberFormat] = useState("[Wing]-[Floor][Unit:2]");
  const [wings, setWings] = useState<WingCfg[]>([newWing("A", 10, 8, 1), newWing("B", 10, 8, 1)]);
  const [activeWingKey, setActiveWingKey] = useState<string | null>(null);
  const [showFormat, setShowFormat] = useState(false);
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
      const next = names.map((name, i) => ({
        ...newWing(name, project.totalFloors || 10, project.unitsPerFloor || 8, 1),
        open: i === 0,
      }));
      setWings(next);
      setActiveWingKey(next[0]?.key ?? null);
    }
  }, [project]);

  useEffect(() => {
    if (!activeWingKey && wings[0]) setActiveWingKey(wings[0].key);
  }, [activeWingKey, wings]);

  const preview = useMemo(
    () => wings.reduce((sum, w) => sum + w.floors.reduce((s, f) => s + f.types.length, 0), 0),
    [wings],
  );
  const floorCount = useMemo(() => wings.reduce((s, w) => s + w.floors.length, 0), [wings]);
  const typeTotals = useMemo(() => {
    const counts: Record<UnitTypeKey, number> = { "1BHK": 0, "2BHK": 0, "3BHK": 0 };
    for (const w of wings) for (const f of w.floors) for (const t of f.types) counts[t] += 1;
    return counts;
  }, [wings]);
  const example = formatUnitNumber(
    numberFormat,
    wings[0]?.name || "A",
    wings[0]?.floors[0]?.number ?? 1,
    1,
  );
  const activeWing = wings.find((w) => w.key === activeWingKey) ?? wings[0];

  function updateWing(key: string, patch: Partial<WingCfg>) {
    setWings((list) =>
      list.map((w) => {
        if (w.key !== key) return w;
        const next = { ...w, ...patch };
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
    toast.success("Stack types applied to all floors");
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
          return { ...f, types: f.types.map((t, si) => (si === slotIndex ? type : t)) };
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

  function selectWing(key: string) {
    setActiveWingKey(key);
    setWings((list) => list.map((w) => ({ ...w, open: w.key === key })));
  }

  return (
    <PageWrap>
      <PageHeader
        title="Project setup"
        subtitle={project ? `${project.company.name} · ${project.name}` : "Shape inventory before go-live"}
        breadcrumbs={[
          { label: "Projects", to: "/projects" },
          { label: project?.name ?? "Setup" },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}`)}>
            Overview
          </Button>
        }
      />

      {/* Live summary */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="relative overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(circle at 0% 0%, color-mix(in oklab, var(--color-primary) 16%, transparent), transparent 45%), radial-gradient(circle at 100% 100%, color-mix(in oklab, var(--color-primary) 10%, transparent), transparent 40%)",
          }}
        />
        <div className="relative grid gap-3 p-4 sm:grid-cols-[1.2fr_1fr] sm:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Inventory builder</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Design wings, then assign unit types</h2>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              Click a type chip to cycle 1 / 2 / 3 BHK. Each wing can have its own floors and stack mix.
            </p>
            <button
              type="button"
              className="mt-2 text-[11px] font-medium text-primary hover:underline"
              onClick={() => setShowFormat((v) => !v)}
            >
              {showFormat ? "Hide numbering format" : "Unit numbering format"} · example {example}
            </button>
            {showFormat ? (
              <div className="mt-2 max-w-md">
                <Input
                  className="h-9"
                  value={numberFormat}
                  onChange={(e) => setNumberFormat(e.target.value)}
                  placeholder="[Wing]-[Floor][Unit:2]"
                />
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Wings", value: wings.length, icon: Building2 },
              { label: "Floors", value: floorCount, icon: Layers3 },
              { label: "Units", value: preview, icon: Sparkles },
              { label: "Team", value: employees?.data.length ?? 0, icon: Users },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-xl border bg-card/80 px-2.5 py-2 backdrop-blur-sm">
                  <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    {stat.label}
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{stat.value}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="relative flex flex-wrap gap-2 border-t bg-muted/30 px-4 py-2.5">
          {TYPE_ORDER.map((key) => (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium"
            >
              <i className={cn("h-2 w-2 rounded-full", TYPE_DOT[key])} />
              {typeTotals[key]} {key.replace("BHK", " BHK")}
            </span>
          ))}
        </div>
      </motion.div>

      <div className="grid gap-3 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* Wing picker */}
        <div className="space-y-2 lg:sticky lg:top-[4.25rem] lg:self-start">
          <div className="flex items-center justify-between px-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Wings</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => {
                const nextName = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[wings.length] ?? `W${wings.length + 1}`;
                const wing = newWing(nextName);
                setWings((list) => [...list.map((w) => ({ ...w, open: false })), { ...wing, open: true }]);
                setActiveWingKey(wing.key);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          <div className="space-y-1.5">
            {wings.map((wing, i) => {
              const units = wing.floors.reduce((s, f) => s + f.types.length, 0);
              const active = wing.key === activeWing?.key;
              return (
                <motion.button
                  key={wing.key}
                  type="button"
                  initial={reduced ? false : { opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: staggerDelay(i), duration: 0.28, ease: EASE }}
                  onClick={() => selectWing(wing.key)}
                  className={cn(
                    "w-full rounded-xl border p-2.5 text-left transition-[box-shadow,border-color,transform] duration-200",
                    active
                      ? "border-primary/40 bg-card shadow-sm ring-2 ring-primary/25"
                      : "bg-card/70 hover:-translate-y-0.5 hover:border-border hover:bg-card",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <WingSilhouette floors={wing.floorCount} active={active} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-sm font-semibold">Wing {wing.name || "—"}</p>
                        {active ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                      </div>
                      <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                        {wing.floors.length} floors · {units} units
                      </p>
                      <p className="mt-1 truncate text-[10px] text-muted-foreground">{typeSummary(wing.stackTypes)}</p>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>

          <CardSoft className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Access</p>
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {(employees?.data ?? []).slice(0, 6).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[11px]">
                  <span className="truncate font-medium">{e.name}</span>
                  <span className="truncate text-muted-foreground">{e.email}</span>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="w-full" onClick={() => navigate("/users")}>
              Manage users
            </Button>
          </CardSoft>
        </div>

        {/* Active wing editor */}
        {activeWing ? (
          <motion.div
            key={activeWing.key}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="space-y-3"
          >
            <CardSoft className="space-y-3 p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Shape</p>
                  <h3 className="text-base font-semibold tracking-tight">Wing {activeWing.name || "—"}</h3>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={wings.length <= 1}
                  onClick={() => {
                    const next = wings.filter((w) => w.key !== activeWing.key);
                    setWings(next);
                    setActiveWingKey(next[0]?.key ?? null);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove wing
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <Field label="Wing name">
                  <Input
                    className="h-9"
                    value={activeWing.name}
                    onChange={(e) => updateWing(activeWing.key, { name: e.target.value })}
                  />
                </Field>
                <Field label="Floors">
                  <Input
                    className="h-9"
                    type="number"
                    min={1}
                    max={60}
                    value={activeWing.floorCount}
                    onChange={(e) => updateWing(activeWing.key, { floorCount: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Start floor">
                  <Input
                    className="h-9"
                    type="number"
                    value={activeWing.startFloor}
                    onChange={(e) => updateWing(activeWing.key, { startFloor: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Units / floor">
                  <Input
                    className="h-9"
                    type="number"
                    min={1}
                    max={40}
                    value={activeWing.defaultUnits}
                    onChange={(e) => updateWing(activeWing.key, { defaultUnits: Number(e.target.value) })}
                  />
                </Field>
              </div>
            </CardSoft>

            <CardSoft className="space-y-3 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Default stack</p>
                  <p className="text-sm text-muted-foreground">
                    One type per stack position · {typeSummary(activeWing.stackTypes)}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => applyStackToAllFloors(activeWing.key)}>
                  Apply to all floors
                </Button>
              </div>
              <UnitTypeStack
                keyPrefix={`${activeWing.key}-stack`}
                types={activeWing.stackTypes}
                onChange={(si, v) => setStackType(activeWing.key, si, v)}
              />
            </CardSoft>

            <CardSoft padded={false} className="overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 border-b bg-muted/25 px-3 py-2.5 text-left"
                onClick={() => updateWing(activeWing.key, { open: !activeWing.open })}
              >
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Floor overrides</p>
                  <p className="text-xs text-muted-foreground">
                    Optional — change unit count or types on specific floors
                  </p>
                </div>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", activeWing.open && "rotate-180")} />
              </button>

              {activeWing.open ? (
                <div className="max-h-[28rem] space-y-2 overflow-y-auto p-3">
                  {activeWing.floors.map((floor, fi) => (
                    <div
                      key={`${activeWing.key}-floor-${floor.number}-${fi}`}
                      className="rounded-xl border bg-muted/15 p-2.5 transition-colors hover:bg-muted/25"
                    >
                      <div className="mb-2.5 flex flex-wrap items-end gap-2.5">
                        <span className="inline-flex h-8 min-w-10 items-center justify-center rounded-md bg-card px-2 text-xs font-semibold tabular-nums shadow-sm">
                          {floor.number === 0 ? "G" : `F${floor.number}`}
                        </span>
                        <div className="space-y-1">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Units</p>
                          <Input
                            className="h-8 w-20"
                            type="number"
                            min={1}
                            max={40}
                            value={floor.types.length}
                            onChange={(e) => setFloorUnitCount(activeWing.key, fi, Number(e.target.value))}
                          />
                        </div>
                        <p className="pb-2 text-[11px] leading-none text-muted-foreground">
                          {typeSummary(floor.types)}
                        </p>
                      </div>
                      <UnitTypeStack
                        size="sm"
                        keyPrefix={`${activeWing.key}-${fi}`}
                        types={floor.types}
                        onChange={(si, v) => setFloorSlotType(activeWing.key, fi, si, v)}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </CardSoft>
          </motion.div>
        ) : null}
      </div>

      {/* Generate bar */}
      <div className="sticky bottom-2 z-20 mt-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card/95 px-3 py-2.5 shadow-[var(--shadow-elevated)] backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:px-4">
          <div>
            <p className="text-sm font-semibold tabular-nums">
              Ready to generate <span className="text-primary">{preview}</span> units
            </p>
            <p className="text-[11px] text-muted-foreground">
              {wings.length} wings · {floorCount} floors · replaces empty inventory
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/units`)}>
              Unit master
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
              <Sparkles className="h-3.5 w-3.5" />
              {generate.isPending ? "Generating…" : `Generate ${preview} units`}
            </Button>
          </div>
        </div>
      </div>
    </PageWrap>
  );
}
