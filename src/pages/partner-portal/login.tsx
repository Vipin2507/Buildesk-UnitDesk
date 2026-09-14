import { Building2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { api, ApiError } from "@/lib/api";
import { useAuthStore, type AuthUser } from "@/stores/auth";

export function PartnerLoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("sanjay@cravingcode.in");
  const [password, setPassword] = useState("Partner@123");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: AuthUser }>("/api/partner-auth/login", {
        email,
        password,
      });
      setSession(res.token, { ...res.user, kind: "partner" });
      toast.success("Partner portal");
      navigate("/partner");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-5">
      <div className="card-soft w-full max-w-md p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary shadow-[var(--shadow-brand-glow)]">
            <Building2 className="h-4 w-4 text-primary-foreground" />
          </span>
          <span className="text-sm font-semibold">UnitDesk partner</span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Partner sign in</h2>
        <p className="mt-1 text-xs text-muted-foreground">View your bookings, entitlement and documents.</p>
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
        <p className="mt-4 text-[11px] text-muted-foreground">Demo: sanjay@cravingcode.in / Partner@123</p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Employee? <Link to="/login" className="text-primary hover:underline">Staff login</Link>
        </p>
      </div>
    </div>
  );
}
