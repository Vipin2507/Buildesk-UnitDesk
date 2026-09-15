export function formatUnitNumber(
  template: string,
  wing: string,
  floor: number,
  unit: number,
) {
  return template
    .replaceAll("[Wing]", wing)
    .replaceAll("[Floor:2]", String(floor).padStart(2, "0"))
    .replaceAll("[Unit:2]", String(unit).padStart(2, "0"))
    .replaceAll("[Floor]", String(floor))
    .replaceAll("[Unit]", String(unit).padStart(2, "0"));
}

export type UnitTypeKey = "1BHK" | "2BHK" | "3BHK";

export const UNIT_TYPE_OPTIONS: { value: UnitTypeKey; label: string }[] = [
  { value: "1BHK", label: "1 BHK" },
  { value: "2BHK", label: "2 BHK" },
  { value: "3BHK", label: "3 BHK" },
];

const TYPE_DEFAULTS: Record<
  UnitTypeKey,
  {
    configuration: string;
    carpetArea: number;
    builtUpArea: number;
    saleableArea: number;
    parking: string;
    basePrice: number;
  }
> = {
  "1BHK": {
    configuration: "1 BHK",
    carpetArea: 520,
    builtUpArea: 640,
    saleableArea: 720,
    parking: "1 open",
    basePrice: 4800000,
  },
  "2BHK": {
    configuration: "2 BHK",
    carpetArea: 780,
    builtUpArea: 920,
    saleableArea: 1050,
    parking: "1 covered",
    basePrice: 7200000,
  },
  "3BHK": {
    configuration: "3 BHK",
    carpetArea: 1120,
    builtUpArea: 1320,
    saleableArea: 1480,
    parking: "1 covered",
    basePrice: 9800000,
  },
};

export function defaultsForUnitType(type: string) {
  const key = (["1BHK", "2BHK", "3BHK"].includes(type) ? type : "2BHK") as UnitTypeKey;
  return { unitType: key, ...TYPE_DEFAULTS[key] };
}

/** Default stack pattern for N units on a floor. */
export function defaultStackTypes(count: number): UnitTypeKey[] {
  const n = Math.max(1, Math.min(40, count || 1));
  return Array.from({ length: n }, (_, i) => {
    const u = i + 1;
    if (u === 1) return "1BHK";
    if (u <= 4) return "2BHK";
    return "3BHK";
  });
}

export function resizeStackTypes(existing: UnitTypeKey[], count: number, fallback: UnitTypeKey = "2BHK"): UnitTypeKey[] {
  const n = Math.max(1, Math.min(40, count || 1));
  const base = existing.length ? existing : defaultStackTypes(n);
  return Array.from({ length: n }, (_, i) => base[i] ?? base[base.length - 1] ?? fallback);
}
