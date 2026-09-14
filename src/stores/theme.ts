import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export const useThemeStore = create<{
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}>()(
  persist(
    (set, get) => ({
      theme: "light",
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggle: () => {
        const next = get().theme === "light" ? "dark" : "light";
        applyTheme(next);
        set({ theme: next });
      },
    }),
    {
      name: "unitdesk.theme",
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? "light");
      },
    },
  ),
);

if (typeof document !== "undefined") {
  const raw = localStorage.getItem("unitdesk.theme");
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    applyTheme(parsed?.state?.theme === "dark" ? "dark" : "light");
  } catch {
    applyTheme("light");
  }
}
