import { create } from "zustand";
import { persist } from "zustand/middleware";

type Filters = {
  wing: string | null;
  floor: number | null;
  status: string | null;
  unitType: string | null;
  view: "unit" | "wing" | "floor" | "list";
  layout: "grid" | "table";
  setWing: (wing: string | null) => void;
  setFloor: (floor: number | null) => void;
  setStatus: (status: string | null) => void;
  setUnitType: (unitType: string | null) => void;
  setView: (view: Filters["view"]) => void;
  setLayout: (layout: Filters["layout"]) => void;
  reset: () => void;
};

const defaults = {
  wing: null as string | null,
  floor: null as number | null,
  status: null as string | null,
  unitType: null as string | null,
  view: "unit" as const,
  layout: "grid" as const,
};

export const useInventoryFilterStore = create<Filters>()(
  persist(
    (set) => ({
      ...defaults,
      setWing: (wing) => set({ wing }),
      setFloor: (floor) => set({ floor }),
      setStatus: (status) => set({ status }),
      setUnitType: (unitType) => set({ unitType }),
      setView: (view) => set({ view }),
      setLayout: (layout) => set({ layout }),
      reset: () => set(defaults),
    }),
    { name: "unitdesk.inventory-filters" },
  ),
);
