import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { platformApi } from "@/lib/platform-api";
import type { PlanRow } from "@/pages/platform/accounts";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
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
  const [expiresAt, setExpiresAt] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

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
      }),
    onSuccess: (row) => {
      toast.success("Client account created");
      navigate(`/admin/accounts/${row.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Create failed"),
  });

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <PageHeader title="New client account" subtitle="Provisions a dedicated database and admin login" />
      <CardSoft className="space-y-3">
        <Field label="Organisation name">
          <Input
            className="h-9"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
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
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Used only for data isolation — users sign in at /login with their email
          </p>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Plan">
            <Select value={planCode} onValueChange={setPlanCode}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(plansQ.data?.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.code}>
                    {p.name} · {p.maxUsers} users
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        <Field label="Expires (optional)">
          <Input
            type="date"
            className="h-9"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </Field>
        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-medium">First Super Admin</p>
          <div className="space-y-3">
            <Field label="Name">
              <Input className="h-9" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
            </Field>
            <Field label="Email (unique across all clients)">
              <Input
                type="email"
                className="h-9"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <PasswordInput value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="outline" onClick={() => navigate("/admin")}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={
              create.isPending ||
              !name ||
              !slug ||
              !adminName ||
              !adminEmail ||
              adminPassword.length < 6
            }
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Provisioning…" : "Create account"}
          </Button>
        </div>
      </CardSoft>
    </div>
  );
}
