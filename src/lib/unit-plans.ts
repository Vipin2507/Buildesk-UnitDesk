const PLAN_FILES = {
  "1bhk": "/unit-plans/1bhk.png",
  "2bhk": "/unit-plans/2bhk.png",
  "3bhk": "/unit-plans/3bhk.png",
} as const;

export type UnitPlanKey = keyof typeof PLAN_FILES;

function planKey(value?: string | null): UnitPlanKey | null {
  if (!value) return null;
  const raw = value.toLowerCase().replace(/[\s_\-]/g, "");
  if (raw.includes("1bhk") || raw.includes("1rk") || raw.includes("studio")) return "1bhk";
  if (raw.includes("3bhk") || raw.includes("4bhk") || raw.includes("5bhk")) return "3bhk";
  if (raw.includes("2bhk")) return "2bhk";
  return null;
}

/** Default floor-plan image for a unit type / configuration. */
export function defaultUnitPlanUrl(unitType?: string | null, configuration?: string | null) {
  const key = planKey(unitType) ?? planKey(configuration) ?? "2bhk";
  return PLAN_FILES[key];
}

/** Custom upload wins; otherwise fall back to the type plan. */
export function resolveUnitPhotoUrl(
  photoUrl?: string | null,
  unitType?: string | null,
  configuration?: string | null,
) {
  if (photoUrl) return photoUrl;
  return defaultUnitPlanUrl(unitType, configuration);
}

export function isCustomUnitPhoto(photoUrl?: string | null) {
  return Boolean(photoUrl);
}
