import { Building2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Field } from "@/components/shared/field";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { platformApi } from "@/lib/platform-api";
import { usePlatformAuthStore, type PlatformUser } from "@/stores/platform-auth";

export function PlatformLoginPage() {
  const navigate = useNavigate();
  const setSession = usePlatformAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await platformApi.post<{ token: string; user: PlatformUser }>(
        "/api/platform/auth/login",
        { email, password },
      );
      setSession(res.token, res.user);
      toast.success("Platform signed in");
      navigate("/admin");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_55%),linear-gradient(180deg,hsl(var(--muted)/0.5),transparent)]"
      />
      <div className="relative w-full max-w-md rounded-2xl border bg-card/95 p-6 shadow-elevated backdrop-blur">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm">
            <Building2 className="h-4 w-4 text-primary-foreground" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">UnitDesk Platform</p>
            <p className="text-[11px] text-muted-foreground">Super admin control plane</p>
          </div>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage client accounts, plans, and operators.
        </p>
        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <Field label="Email">
            <Input
              type="email"
              className="h-10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Client workspace login is at{" "}
          <Link to="/login" className="text-primary hover:underline">
            /login
          </Link>
        </p>
      </div>
    </div>
  );
}
