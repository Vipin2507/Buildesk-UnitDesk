import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useProjectContextStore = create<{
  projectId: string | null;
  companyId: string | null;
  setProject: (projectId: string | null, companyId?: string | null) => void;
}>()(
  persist(
    (set) => ({
      projectId: null,
      companyId: null,
      setProject: (projectId, companyId) =>
        set((s) => ({
          projectId,
          companyId: companyId === undefined ? s.companyId : companyId,
        })),
    }),
    { name: "unitdesk.project" },
  ),
);
