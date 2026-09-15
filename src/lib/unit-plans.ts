const PLAN_FILES = {
  "1bhk": "/unit-plans/1bhk.png",
  "2bhk": "/unit-plans/2bhk.png",
  "3bhk": "/unit-plans/3bhk.png",
} as const;

export type UnitPlanKey = keyof typeof PLAN_FILES;

export type ProjectPlanUrls = {
  plan1bhkUrl?: string | null;
  plan2bhkUrl?: string | null;
  plan3bhkUrl?: string | null;
};

export function systemUnitPlanUrl(key: UnitPlanKey = "2bhk") {
  return PLAN_FILES[key];
}

export function planKey(value?: string | null): UnitPlanKey | null {
  if (!value) return null;
  const raw = value.toLowerCase().replace(/[\s_\-]/g, "");
  if (raw.includes("1bhk") || raw.includes("1rk") || raw.includes("studio")) return "1bhk";
  if (raw.includes("3bhk") || raw.includes("4bhk") || raw.includes("5bhk")) return "3bhk";
  if (raw.includes("2bhk")) return "2bhk";
  return null;
}

/** Project override → system default for a unit type. */
export function defaultUnitPlanUrl(
  unitType?: string | null,
  configuration?: string | null,
  projectPlans?: ProjectPlanUrls | null,
) {
  const key = planKey(unitType) ?? planKey(configuration) ?? "2bhk";
  if (projectPlans) {
    if (key === "1bhk" && projectPlans.plan1bhkUrl) return projectPlans.plan1bhkUrl;
    if (key === "2bhk" && projectPlans.plan2bhkUrl) return projectPlans.plan2bhkUrl;
    if (key === "3bhk" && projectPlans.plan3bhkUrl) return projectPlans.plan3bhkUrl;
  }
  return PLAN_FILES[key];
}

/** Per-unit custom upload wins; else project type plan; else system default. */
export function resolveUnitPhotoUrl(
  photoUrl?: string | null,
  unitType?: string | null,
  configuration?: string | null,
  projectPlans?: ProjectPlanUrls | null,
) {
  if (photoUrl) return photoUrl;
  return defaultUnitPlanUrl(unitType, configuration, projectPlans);
}

export function isCustomUnitPhoto(photoUrl?: string | null) {
  return Boolean(photoUrl);
}

export function projectPlansFrom(project?: ProjectPlanUrls | null): ProjectPlanUrls | null {
  if (!project) return null;
  return {
    plan1bhkUrl: project.plan1bhkUrl ?? null,
    plan2bhkUrl: project.plan2bhkUrl ?? null,
    plan3bhkUrl: project.plan3bhkUrl ?? null,
  };
}
