import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type ListResponse } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useProjectContextStore } from "@/stores/project-context";

type Rule = {
  id: string;
  name: string | null;
  type: string;
  value: number | null;
  slabConfig: string | null;
  active: boolean;
};

export function MastersPage() {
  const projectId = useProjectContextStore((s) => s.projectId);
  const qc = useQueryClient();
  const [type, setType] = useState("percentage");
  const [value, setValue] = useState(2.5);
  const [name, setName] = useState("Standard CP share");
  const { data: projects } = useQuery({
    queryKey: qk.projects(),
    queryFn: () => api.get<ListResponse<{ id: string; name: string }>>("/api/projects", { pageSize: 50 }),
  });
  const selected = projectId ?? projects?.data[0]?.id ?? "";
  const { data: rules } = useQuery({
    queryKey: qk.commissionRules(selected),
    queryFn: () => api.get<ListResponse<Rule>>(`/api/projects/${selected}/commission-rules`),
    enabled: Boolean(selected),
  });
  const save = useMutation({
    mutationFn: () =>
      api.post(`/api/projects/${selected}/commission-rules`, {
        name,
        type,
        value: type === "slab" ? null : value,
        slabConfig:
          type === "slab"
            ? [
                { min: 0, max: 5000000, rate: 1.5 },
                { min: 5000001, max: 10000000, rate: 2 },
                { min: 10000001, max: null, rate: 2.75 },
              ]
            : undefined,
        active: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.commissionRules(selected) });
      toast.success("Commission rule saved (previous active rule deactivated)");
    },
  });

  return (
    <PageWrap>
      <PageHeader title="Masters" subtitle="Commission rules are per project — never hardcoded" />
      <CardSoft className="max-w-xl space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Commission rule engine</p>
        <Field label="Project">
          <Select value={selected} onValueChange={(v) => useProjectContextStore.getState().setProject(v)}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>
              {(projects?.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Rule name">
          <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Percentage</SelectItem>
              <SelectItem value="flat_per_unit">Flat per unit</SelectItem>
              <SelectItem value="slab">Slab</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {type !== "slab" ? (
          <Field label={type === "percentage" ? "Percent" : "Flat amount"}>
            <Input className="h-8" type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} />
          </Field>
        ) : (
          <p className="text-xs text-muted-foreground">Default slabs: ≤50L @ 1.5%, 50L–1Cr @ 2%, above @ 2.75%.</p>
        )}
        <Button size="sm" onClick={() => save.mutate()} disabled={!selected}>Save as active rule</Button>
        <div className="space-y-1 pt-2">
          {(rules?.data ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs">
              <span>{r.name} · {r.type} {r.value ?? ""}</span>
              <span className={r.active ? "text-success" : "text-muted-foreground"}>{r.active ? "Active" : "Inactive"}</span>
            </div>
          ))}
        </div>
      </CardSoft>
      <MasterOptions />
    </PageWrap>
  );
}

function MasterOptions() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: qk.masters(),
    queryFn: () => api.get<ListResponse<{ id: string; group: string; label: string; value: string }>>("/api/masters"),
  });
  const [group, setGroup] = useState("unitType");
  const [label, setLabel] = useState("");
  const add = useMutation({
    mutationFn: () => api.post("/api/masters", { group, label, value: label }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.masters() });
      setLabel("");
      toast.success("Master option added");
    },
  });
  const grouped = (data?.data ?? []).reduce<Record<string, { id: string; label: string; value: string }[]>>((acc, row) => {
    (acc[row.group] ??= []).push(row);
    return acc;
  }, {});

  return (
    <CardSoft className="max-w-xl space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lookup values</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Group">
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["unitType", "facing", "paymentMode", "documentCategory"].map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Label">
          <Input className="h-8" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      </div>
      <Button size="sm" disabled={!label} onClick={() => add.mutate()}>Add option</Button>
      {Object.entries(grouped).map(([g, rows]) => (
        <div key={g}>
          <p className="text-[11px] font-medium text-muted-foreground">{g}</p>
          <p className="text-xs">{rows.map((r) => r.label).join(" · ")}</p>
        </div>
      ))}
    </CardSoft>
  );
}
