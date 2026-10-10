import { Building2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { PasswordInput } from "@/components/shared/password-input";
import { api, ApiError } from "@/lib/api";
import { setTenantSlug, tenantPath } from "@/lib/tenant";
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
      // Clear any prior workspace — server resolves tenant from email
      setTenantSlug(null);
      const res = await api.post<{
        token: string;
        user: AuthUser;
        tenantSlug?: string | null;
      }>("/api/auth/login", { email, password });

      if (res.tenantSlug) setTenantSlug(res.tenantSlug);
      else setTenantSlug(null);

      setSession(res.token, { ...res.user, kind: "employee" });
      toast.success("Welcome back");
      navigate(tenantPath("/"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-sidebar lg:block">
        <div
          className="absolute inset-0 opacity-40"
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
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Inventory operations
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Build Better Communities</h1>
            <p className="text-sm text-sidebar-foreground/70">
              One operational desk for companies, projects, unit inventory, bookings, and channel
              partner collections.
            </p>
          </div>
          <p className="text-[11px] text-sidebar-foreground/50">UnitDesk</p>
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
          <p className="mt-1 text-xs text-muted-foreground">Use your UnitDesk email and password.</p>
          <form className="mt-5 space-y-3" onSubmit={onSubmit}>
            <Field label="Email">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className="h-10"
                autoComplete="username"
              />
            </Field>
            <Field label="Password">
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10"
                autoComplete="current-password"
              />
            </Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Continue"}
            </Button>
          </form>
          <div className="mt-4 space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">Demo account</p>
            <p>
              <span className="text-foreground">vipin@cravingcode.in</span> / Admin@123
            </p>
            <p className="text-[10px]">Sales: rahul@cravingcode.in / Sales@123</p>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Channel partner?{" "}
            <a href="/partner/login" className="text-primary hover:underline">
              Partner portal
            </a>
            {" · "}
            <span className="text-[10px]">sanjay@cravingcode.in / Partner@123</span>
          </p>
        </div>
      </div>
    </div>
  );
}
