import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PlatformUser = {
  id: string;
  name: string;
  email: string;
};

type PlatformAuthState = {
  token: string | null;
  user: PlatformUser | null;
  setSession: (token: string, user: PlatformUser) => void;
  clear: () => void;
};

const PLATFORM_TOKEN_KEY = "unitdesk.platform.token";

export function getPlatformToken() {
  return localStorage.getItem(PLATFORM_TOKEN_KEY);
}

export function setPlatformToken(token: string | null) {
  if (token) localStorage.setItem(PLATFORM_TOKEN_KEY, token);
  else localStorage.removeItem(PLATFORM_TOKEN_KEY);
}

export const usePlatformAuthStore = create<PlatformAuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => {
        setPlatformToken(token);
        set({ token, user });
      },
      clear: () => {
        setPlatformToken(null);
        set({ token: null, user: null });
      },
    }),
    {
      name: "unitdesk.platform.auth",
      onRehydrateStorage: () => (state) => {
        if (state?.token) setPlatformToken(state.token);
      },
    },
  ),
);
