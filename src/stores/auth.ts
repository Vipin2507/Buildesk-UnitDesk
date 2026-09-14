import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setToken } from "@/lib/api";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  isSuperAdmin: boolean;
  kind?: "employee" | "partner";
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => {
        setToken(token);
        set({ token, user });
      },
      clear: () => {
        setToken(null);
        set({ token: null, user: null });
      },
    }),
    {
      name: "unitdesk.auth",
      onRehydrateStorage: () => (state) => {
        if (state?.token) setToken(state.token);
      },
    },
  ),
);
