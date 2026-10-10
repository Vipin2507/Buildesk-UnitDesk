import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { platformApi } from "@/lib/platform-api";
import type { PlanRow } from "@/pages/platform/types";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function PlatformAccountCreatePage() {
  const navigate = useNavigate();
  const plansQ = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => platformApi.get<{ data: PlanRow[] }>("/api/platform/plans"),
  });

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [planCode, setPlanCode] = useState("basic");
  const [status, setStatus] = useState("trial");
  const [trialPreset, setTrialPreset] = useState("30");
  const [expiresAt, setExpiresAt] = useState(plusDays(30));
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [notes, setNotes] = useState("");

  const selectedPlan = useMemo(
    () => (plansQ.data?.data ?? []).find((p) => p.code === planCode),
    [plansQ.data?.data, planCode],
  );

  const create = useMutation({
    mutationFn: () =>
      platformApi.post<{ id: string }>("/api/platform/accounts", {
        name,
        slug,
        planCode,
        status,
        expiresAt: expiresAt || null,
        adminName,
        adminEmail,
        adminPassword,
        notes: notes || null,
      }),
    onSuccess: (row) => {
      toast.success("Client account created — admin can sign in at /login");
      navigate(`/admin/accounts/${row.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Create failed"),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="New client account"
        subtitle="Creates an isolated database and first Super Admin"
        breadcrumbs={[
          { label: "Accounts", to: "/admin/accounts" },
          { label: "New" },
        ]}
      />

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Organisation</h2>
          <Field label="Organisation name">
            <Input
              className="h-9"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder="Acme Realty"
              required
            />
          </Field>
          <Field label="Internal workspace id">
            <Input
              className="h-9 font-mono"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
              required
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Used for data isolation only — users sign in at /login with their email
            </p>
          </Field>
          <Field label="Internal notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Sales owner, contract ref, special limits…"
              rows={2}
            />
          </Field>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Plan & access</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan">
              <Select value={planCode} onValueChange={setPlanCode}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(plansQ.data?.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.code}>
                      {p.name} · {p.maxUsers} users · {p.maxProjects} projects
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPlan ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Limits: {selectedPlan.maxUsers} users, {selectedPlan.maxProjects} projects,{" "}
                  {selectedPlan.maxUnits.toLocaleString()} units
                </p>
              ) : null}
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Trial / expiry preset">
              <Select
                value={trialPreset}
                onValueChange={(v) => {
                  setTrialPreset(v);
                  if (v === "none") setExpiresAt("");
                  else setExpiresAt(plusDays(Number(v)));
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="none">No expiry</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Expires on">
              <Input
                type="date"
                className="h-9"
                value={expiresAt}
                onChange={(e) => {
                  setTrialPreset("custom");
                  setExpiresAt(e.target.value);
                }}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">First Super Admin</h2>
          <p className="text-[11px] text-muted-foreground">
            Email must be unique across every client. They sign in at /login.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input
                className="h-9"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                className="h-9"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="Password">
            <PasswordInput
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Minimum 6 characters</p>
          </Field>
        </section>

        <div className="flex justify-end gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={() => navigate("/admin/accounts")}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={
              create.isPending ||
              !name ||
              !slug ||
              !adminName ||
              !adminEmail ||
              adminPassword.length < 6
            }
          >
            {create.isPending ? "Provisioning…" : "Create account"}
          </Button>
        </div>
      </form>
    </div>
  );
}
