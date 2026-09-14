import { create } from "zustand";

export type DrillEntity = "unit" | "booking" | "partner" | "payment" | null;

export type DrillOpenOpts = {
  docked?: boolean;
  neighborIds?: string[];
};

type DrillState = {
  entity: DrillEntity;
  id: string | null;
  docked: boolean;
  neighborIds: string[];
  open: (entity: Exclude<DrillEntity, null>, id: string, opts?: DrillOpenOpts) => void;
  close: () => void;
};

export const useDrilldownSheetStore = create<DrillState>((set) => ({
  entity: null,
  id: null,
  docked: false,
  neighborIds: [],
  open: (entity, id, opts) =>
    set((s) => ({
      entity,
      id,
      docked: opts?.docked ?? false,
      neighborIds: opts?.neighborIds ?? s.neighborIds,
    })),
  close: () => set({ entity: null, id: null, docked: false, neighborIds: [] }),
}));
