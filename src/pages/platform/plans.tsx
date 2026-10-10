import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { platformApi } from "@/lib/platform-api";
import type { PlanRow } from "@/pages/platform/accounts";

export function PlatformPlansPage() {
  const qc = useQueryClient();
  const plansQ = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => platformApi.get<{ data: PlanRow[] }>("/api/platform/plans"),
  });

  return (
    <div className="space-y-3">
      <PageHeader
        title="Plans"
        subtitle="Default limits for Free, Basic, and Pro — accounts can override"
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
    <CardSoft className="space-y-3">
      <div>
        <p className="text-sm font-semibold capitalize">{plan.code}</p>
        <p className="text-[11px] text-muted-foreground">Plan code · immutable</p>
      </div>
      <Field label="Display name">
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Max users">
        <Input className="h-8" type="number" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} />
      </Field>
      <Field label="Max projects">
        <Input className="h-8" type="number" value={maxProjects} onChange={(e) => setMaxProjects(e.target.value)} />
      </Field>
      <Field label="Max units">
        <Input className="h-8" type="number" value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} />
      </Field>
      <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
        Save
      </Button>
    </CardSoft>
  );
}
