import { create } from "zustand";
import { persist } from "zustand/middleware";

type SidebarState = {
  collapsed: boolean;
  mobileOpen: boolean;
  projectsOpen: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;
  setMobileOpen: (v: boolean) => void;
  toggleProjectsOpen: () => void;
};

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      mobileOpen: false,
      projectsOpen: true,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
      setMobileOpen: (mobileOpen) => set({ mobileOpen }),
      toggleProjectsOpen: () => set((s) => ({ projectsOpen: !s.projectsOpen })),
    }),
    { name: "unitdesk.sidebar", partialize: (s) => ({ collapsed: s.collapsed, projectsOpen: s.projectsOpen }) },
  ),
);
