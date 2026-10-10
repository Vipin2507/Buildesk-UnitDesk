import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { platformApi } from "@/lib/platform-api";
import { planTone } from "@/pages/platform/shared";
import type { PlanRow } from "@/pages/platform/types";

export function PlatformPlansPage() {
  const qc = useQueryClient();
  const plansQ = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => platformApi.get<{ data: PlanRow[] }>("/api/platform/plans"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plans"
        subtitle="Default limits for Free, Basic, and Pro — accounts can override per client"
      />
      <div className="grid gap-3 lg:grid-cols-3">
        {(plansQ.data?.data ?? []).map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onSaved={() => qc.invalidateQueries({ queryKey: ["platform", "plans"] })}
          />
        ))}
      </div>
    </div>
  );
}

function PlanCard({ plan, onSaved }: { plan: PlanRow; onSaved: () => void }) {
  const [name, setName] = useState(plan.name);
  const [maxUsers, setMaxUsers] = useState(String(plan.maxUsers));
  const [maxProjects, setMaxProjects] = useState(String(plan.maxProjects));
  const [maxUnits, setMaxUnits] = useState(String(plan.maxUnits));

  useEffect(() => {
    setName(plan.name);
    setMaxUsers(String(plan.maxUsers));
    setMaxProjects(String(plan.maxProjects));
    setMaxUnits(String(plan.maxUnits));
  }, [plan]);

  const save = useMutation({
    mutationFn: () =>
      platformApi.patch(`/api/platform/plans/${plan.id}`, {
        name,
        maxUsers: Number(maxUsers),
        maxProjects: Number(maxProjects),
        maxUnits: Number(maxUnits),
      }),
    onSuccess: () => {
      toast.success(`${plan.code} plan saved`);
      onSaved();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Save failed"),
  });

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span
            className={cn(
              "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              planTone(plan.code),
            )}
          >
            {plan.code}
          </span>
          <p className="mt-2 text-sm font-semibold">{plan.name}</p>
          <p className="text-[11px] text-muted-foreground">Code is immutable</p>
        </div>
      </div>
      <Field label="Display name">
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Users">
          <Input
            className="h-8"
            type="number"
            min={1}
            value={maxUsers}
            onChange={(e) => setMaxUsers(e.target.value)}
          />
        </Field>
        <Field label="Projects">
          <Input
            className="h-8"
            type="number"
            min={1}
            value={maxProjects}
            onChange={(e) => setMaxProjects(e.target.value)}
          />
        </Field>
        <Field label="Units">
          <Input
            className="h-8"
            type="number"
            min={1}
            value={maxUnits}
            onChange={(e) => setMaxUnits(e.target.value)}
          />
        </Field>
      </div>
      <Button size="sm" className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save plan"}
      </Button>
    </div>
  );
}
