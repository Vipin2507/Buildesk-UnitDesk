import { Building2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { api, ApiError } from "@/lib/api";
import { useAuthStore, type AuthUser } from "@/stores/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: AuthUser }>("/api/auth/login", {
        email,
        password,
      });
      setSession(res.token, { ...res.user, kind: "employee" });
      toast.success("Welcome back");
      navigate("/");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-sidebar lg:block">
        <div className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, color-mix(in oklab, var(--color-primary) 45%, transparent), transparent 42%), radial-gradient(circle at 80% 80%, color-mix(in oklab, var(--color-primary) 25%, transparent), transparent 40%)",
          }}
        />
        <div className="relative z-10 flex h-full flex-col justify-between p-10">
          <div className="flex items-center gap-2 text-sidebar-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary shadow-[var(--shadow-brand-glow)]">
              <Building2 className="h-4 w-4 text-white" />
            </span>
            <span className="text-sm font-semibold">Buildesk</span>
          </div>
          <div className="max-w-md space-y-3 text-sidebar-foreground">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Inventory operations</p>
            <h1 className="text-2xl font-semibold tracking-tight">Build Better Communities</h1>
            <p className="text-sm text-sidebar-foreground/70">
              One operational desk for companies, projects, unit inventory, bookings, and channel partner collections.
            </p>
          </div>
          <p className="text-[11px] text-sidebar-foreground/50">UnitDesk · internal admin</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-5">
        <div className="card-soft w-full max-w-md p-6">
          <div className="mb-5 flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary shadow-[var(--shadow-brand-glow)]">
              <Building2 className="h-4 w-4 text-primary-foreground" />
            </span>
            <span className="text-sm font-semibold">UnitDesk</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-xs text-muted-foreground">Use your UnitDesk employee account.</p>
          <form className="mt-5 space-y-3" onSubmit={onSubmit}>
            <Field label="Email">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="h-10" />
            </Field>
            <Field label="Password">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="h-10" />
            </Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Continue"}
            </Button>
          </form>
          <p className="mt-4 text-[11px] text-muted-foreground">
            Channel partner?{" "}
            <a href="/partner/login" className="text-primary hover:underline">
              Partner portal
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
