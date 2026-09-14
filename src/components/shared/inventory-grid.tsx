import { ChevronDown } from "lucide-react";
import { StatusPill } from "@/components/shared/status-pill";
import { cn } from "@/lib/cn";
import { statusLabel } from "@/lib/status";

export const UNIT_ICON = "/unit-icon.png";

export type GridUnit = {
  id: string;
  unitNumber: string;
  status: string;
  unitType?: string | null;
  configuration?: string | null;
  photoUrl?: string | null;
  sortOrder: number;
  wingId?: string;
  wingName?: string;
};

export type GridFloor = {
  number: number;
  units: GridUnit[];
};

const statusTileBg: Record<string, string> = {
  available: "bg-success/18",
  booked: "bg-status-booked/18",
  sold: "bg-destructive/16",
  hold: "bg-warning/20",
  blocked: "bg-status-blocked/18",
  not_available: "bg-muted",
};

const statusTintOverlay: Record<string, string> = {
  available: "bg-status-available",
  booked: "bg-status-booked",
  sold: "bg-status-sold",
  hold: "bg-status-hold",
  blocked: "bg-status-blocked",
  not_available: "bg-status-unavailable",
};

function isDimmed(unit: GridUnit, status?: string | null, wingId?: string | null) {
  if (status && unit.status !== status) return true;
  if (wingId && unit.wingId !== wingId) return true;
  return false;
}

function floorTitle(number: number) {
  return number === 0 ? "Ground" : `Floor ${number}`;
}

/** Isometric unit icon with status-tinted tile + color blend. */
function UnitIconTile({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "relative isolate block overflow-hidden rounded-2xl",
        size === "sm" ? "h-12 w-12" : "aspect-square w-full",
        statusTileBg[status] ?? statusTileBg.not_available,
      )}
    >
      <img
        src={UNIT_ICON}
        alt=""
        className="relative z-[1] h-full w-full object-contain p-[8%]"
        draggable={false}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-[2] opacity-50 mix-blend-color",
          statusTintOverlay[status] ?? statusTintOverlay.not_available,
        )}
      />
    </span>
  );
}

function UnitCard({
  unit,
  dim,
  selected,
  onSelect,
}: {
  unit: GridUnit;
  dim: boolean;
  selected?: boolean;
  onSelect: (unitId: string) => void;
}) {
  return (
    <button
      type="button"
      title={`${unit.unitNumber} · ${statusLabel[unit.status] ?? unit.status}`}
      onClick={() => onSelect(unit.id)}
      className={cn(
        "group flex flex-col items-center gap-1.5 rounded-2xl border border-transparent bg-card/40 p-2 text-center transition-[opacity,transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-sm",
        dim && !selected && "pointer-events-auto opacity-[0.28] grayscale",
        (!dim || selected) && "opacity-100",
        selected && "z-[1] border-primary/40 bg-card shadow-sm ring-2 ring-primary/50",
      )}
    >
      <span className="w-full max-w-[5.25rem] transition-transform duration-200 group-hover:scale-[1.03]">
        <UnitIconTile status={unit.status} />
      </span>
      <span className="text-xs font-semibold tabular-nums tracking-tight text-foreground">
        {unit.unitNumber}
      </span>
      <StatusPill status={unit.status} className="px-1.5 py-0 text-[10px]" />
    </button>
  );
}

function UnitCardGrid({
  units,
  dimStatus,
  dimWingId,
  selectedId,
  onSelect,
}: {
  units: GridUnit[];
  dimStatus?: string | null;
  dimWingId?: string | null;
  selectedId?: string | null;
  onSelect: (unitId: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
      {units.map((unit) => (
        <UnitCard
          key={unit.id}
          unit={unit}
          dim={isDimmed(unit, dimStatus, dimWingId)}
          selected={selectedId === unit.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function FloorAccordions({
  floors,
  dimStatus,
  dimWingId,
  selectedId,
  onSelect,
}: {
  floors: GridFloor[];
  dimStatus?: string | null;
  dimWingId?: string | null;
  selectedId?: string | null;
  onSelect: (unitId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {floors.map((floor) => (
        <details key={floor.number} open className="group/floor rounded-xl border bg-card/30">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl bg-muted/55 px-3 py-2.5 text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/floor:rotate-0 -rotate-90" />
            <span>
              {floorTitle(floor.number)}{" "}
              <span className="font-medium text-muted-foreground">({floor.units.length} Units)</span>
            </span>
          </summary>
          <div className="p-2.5 pt-2">
            <UnitCardGrid
              units={floor.units}
              dimStatus={dimStatus}
              dimWingId={dimWingId}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          </div>
        </details>
      ))}
    </div>
  );
}

function groupFloorsByWing(floors: GridFloor[]) {
  const order: string[] = [];
  const map = new Map<string, { id: string; name: string; floors: GridFloor[] }>();
  for (const floor of floors) {
    const unitsByWing = new Map<string, GridUnit[]>();
    for (const unit of floor.units) {
      const id = unit.wingId ?? "_";
      if (!unitsByWing.has(id)) unitsByWing.set(id, []);
      unitsByWing.get(id)!.push(unit);
      if (!map.has(id)) {
        order.push(id);
        map.set(id, { id, name: unit.wingName ?? id, floors: [] });
      }
    }
    for (const [id, units] of unitsByWing) {
      map.get(id)!.floors.push({ number: floor.number, units });
    }
  }
  return order.map((id) => map.get(id)!);
}

export function InventoryGrid({
  floors,
  onSelect,
  dimStatus,
  dimWingId,
  selectedId,
  variant = "unit",
}: {
  floors: GridFloor[];
  onSelect: (unitId: string) => void;
  dimStatus?: string | null;
  dimWingId?: string | null;
  selectedId?: string | null;
  variant?: "unit" | "wing" | "floor";
}) {
  if (variant === "wing") {
    const groups = groupFloorsByWing(floors);
    return (
      <div className="space-y-4">
        {groups.map((group) => (
          <div
            key={group.id}
            className={cn(
              "space-y-2 transition-opacity duration-300 ease-out",
              dimWingId && dimWingId !== group.id && "opacity-40",
            )}
          >
            <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Wing {group.name}
            </p>
            <FloorAccordions
              floors={group.floors}
              dimStatus={dimStatus}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "floor") {
    return (
      <div className="space-y-3">
        {floors.map((floor) => (
          <div key={floor.number} className="rounded-xl border bg-card/40 p-2.5">
            <p className="mb-2 text-sm font-semibold">
              {floorTitle(floor.number)}{" "}
              <span className="font-medium text-muted-foreground">({floor.units.length} Units)</span>
            </p>
            <UnitCardGrid
              units={floor.units}
              dimStatus={dimStatus}
              dimWingId={dimWingId}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <FloorAccordions
      floors={floors}
      dimStatus={dimStatus}
      dimWingId={dimWingId}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
}
