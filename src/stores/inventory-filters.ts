import { create } from "zustand";
import { persist } from "zustand/middleware";

export type FinanceFocus = "value" | "sold" | "remaining" | "received" | "outstanding" | null;

type Filters = {
  wing: string | null;
  floor: number | null;
  status: string | null;
  unitType: string | null;
  search: string;
  financeFocus: FinanceFocus;
  view: "unit" | "wing" | "floor" | "list";
  layout: "grid" | "table";
  setWing: (wing: string | null) => void;
  setFloor: (floor: number | null) => void;
  setStatus: (status: string | null) => void;
  setUnitType: (unitType: string | null) => void;
  setSearch: (search: string) => void;
  setFinanceFocus: (financeFocus: FinanceFocus) => void;
  setView: (view: Filters["view"]) => void;
  setLayout: (layout: Filters["layout"]) => void;
  reset: () => void;
};

const defaults = {
  wing: null as string | null,
  floor: null as number | null,
  status: null as string | null,
  unitType: null as string | null,
  search: "",
  financeFocus: null as FinanceFocus,
  view: "unit" as const,
  layout: "grid" as const,
};

export const useInventoryFilterStore = create<Filters>()(
  persist(
    (set) => ({
      ...defaults,
      setWing: (wing) => set({ wing }),
      setFloor: (floor) => set({ floor }),
      setStatus: (status) => set({ status, financeFocus: null }),
      setUnitType: (unitType) => set({ unitType }),
      setSearch: (search) => set({ search }),
      setFinanceFocus: (financeFocus) => set({ financeFocus, status: null }),
      setView: (view) => set({ view }),
      setLayout: (layout) => set({ layout }),
      reset: () => set(defaults),
    }),
    {
      name: "unitdesk.inventory-filters",
      partialize: (s) => ({
        wing: s.wing,
        floor: s.floor,
        status: s.status,
        unitType: s.unitType,
        view: s.view,
        layout: s.layout,
        // don't persist search / financeFocus
      }),
    },
  ),
);
