import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, MoreHorizontal, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, type ListResponse } from "@/lib/api";
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

type ProjectMandate = {
  id: string;
  name: string;
  mandateTerm: string | null;
  agreedMandateBrokerage: number | null;
  totalBrokeragePct: number | null;
  mandateBrokeragePaymentTerm: string | null;
  brokerageMilestones: { id: string; collectionPct: number; brokeragePct: number }[];
  commissionRules: Rule[];
};

type MasterRow = {
  id: string;
  group: string;
  label: string;
  value: string;
  sortOrder: number;
  active: boolean;
};

const MASTER_GROUPS = [
  { id: "unitType", label: "Unit types" },
  { id: "facing", label: "Facing" },
  { id: "paymentMode", label: "Payment modes" },
  { id: "documentCategory", label: "Document categories" },
] as const;

function fail(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback);
}

export function MastersPage() {
  const [tab, setTab] = useState<"lookups" | "commission" | "mandate">("lookups");

  return (
    <PageWrap>
      <PageHeader
        title="Masters"
        subtitle="Lookup values used across units & payments · commission rules · mandate brokerage"
      />
      <SegmentedTabs
        tabs={[
          { id: "lookups", label: "Lookups" },
          { id: "commission", label: "Commission" },
          { id: "mandate", label: "Mandate" },
        ]}
        value={tab}
        onChange={setTab}
      >
        {tab === "lookups" ? <MasterOptions /> : null}
        {tab === "commission" ? <CommissionRules /> : null}
        {tab === "mandate" ? <MandatePanel /> : null}
      </SegmentedTabs>
    </PageWrap>
  );
}

function MasterOptions() {
  const qc = useQueryClient();
  const [group, setGroup] = useState<string>("unitType");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<MasterRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [...qk.masters(), { includeInactive: showInactive }],
    queryFn: () =>
      api.get<ListResponse<MasterRow>>("/api/masters", {
        includeInactive: showInactive ? "true" : undefined,
        pageSize: 500,
      }),
  });

  const rows = useMemo(
    () => (data?.data ?? []).filter((r) => r.group === group),
    [data?.data, group],
  );

  const add = useMutation({
    mutationFn: () => {
      const raw = (value.trim() || label.trim()).trim();
      const stored =
        group === "paymentMode" ? raw.toLowerCase().replace(/\s+/g, "_") : raw;
      return api.post("/api/masters", {
        group,
        label: label.trim(),
        value: stored,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["masters"] });
      setLabel("");
      setValue("");
      toast.success("Option added — available in forms immediately");
    },
    onError: (err) => fail(err, "Could not add option"),
  });

  const saveEdit = useMutation({
    mutationFn: () =>
      api.patch(`/api/masters/${editing!.id}`, {
        label: editing!.label.trim(),
        value: editing!.value.trim(),
        active: editing!.active,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["masters"] });
      toast.success("Option updated");
      setEditing(null);
    },
    onError: (err) => fail(err, "Could not update option"),
  });

  const toggle = useMutation({
    mutationFn: (row: MasterRow) =>
      row.active ? api.del(`/api/masters/${row.id}`) : api.patch(`/api/masters/${row.id}`, { active: true }),
    onSuccess: (_, row) => {
      qc.invalidateQueries({ queryKey: ["masters"] });
      toast.success(row.active ? "Option deactivated" : "Option reactivated");
    },
    onError: (err) => fail(err, "Could not update option"),
  });

  return (
    <div className="space-y-3">
      <CardSoft className="space-y-2.5">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Group" className="min-w-[160px]">
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MASTER_GROUPS.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Label" className="min-w-[140px] flex-1">
            <Input
              className="h-8"
              value={label}
              placeholder="Display label"
              onChange={(e) => {
                setLabel(e.target.value);
                if (!value) setValue(e.target.value);
              }}
            />
          </Field>
          <Field label="Value" className="min-w-[120px]">
            <Input
              className="h-8"
              value={value}
              placeholder="Stored value"
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            disabled={!label.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border"
          />
          Show inactive options
        </label>
      </CardSoft>

      <CardSoft padded={false} className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <EmptyState icon={Boxes} title={isLoading ? "Loading…" : "No options in this group yet."} />
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Label</th>
                <th className="px-3 py-2 text-left font-medium">Value</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{r.value}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={r.active ? "active" : "inactive"} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing({ ...r })}>Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => toggle.mutate(r)}>
                          {r.active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardSoft>

      {editing ? (
        <CardSoft className="max-w-md space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Edit option</p>
          <Field label="Label">
            <Input
              className="h-8"
              value={editing.label}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
            />
          </Field>
          <Field label="Value">
            <Input
              className="h-8"
              value={editing.value}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={saveEdit.isPending} onClick={() => saveEdit.mutate()}>
              {saveEdit.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardSoft>
      ) : null}
    </div>
  );
}

function CommissionRules() {
  const navigate = useNavigate();
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
      qc.invalidateQueries({ queryKey: qk.project(selected) });
      toast.success("Active commission rule saved");
    },
    onError: (err) => fail(err, "Could not save rule"),
  });

  const setActive = useMutation({
    mutationFn: (rule: Rule) =>
      api.patch(`/api/projects/${selected}/commission-rules/${rule.id}`, { active: !rule.active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.commissionRules(selected) });
      toast.success("Rule status updated");
    },
    onError: (err) => fail(err, "Could not update rule"),
  });

  return (
    <CardSoft className="max-w-xl space-y-2.5">
      <Field label="Project">
        <Select value={selected} onValueChange={(v) => useProjectContextStore.getState().setProject(v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            {(projects?.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <p className="text-[11px] text-muted-foreground">
        Saving a mandate on the project auto-updates the active percentage rule. Override here when needed.
      </p>
      <Field label="Rule name">
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Type">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percentage">Percentage</SelectItem>
            <SelectItem value="flat_per_unit">Flat per unit</SelectItem>
            <SelectItem value="slab">Slab</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {type !== "slab" ? (
        <Field label={type === "percentage" ? "Percent" : "Flat amount"}>
          <Input
            className="h-8"
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </Field>
      ) : (
        <p className="text-xs text-muted-foreground">Default slabs: ≤50L @ 1.5%, 50L–1Cr @ 2%, above @ 2.75%.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => save.mutate()} disabled={!selected || save.isPending}>
          Save as active rule
        </Button>
        {selected ? (
          <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${selected}/edit`)}>
            Edit project mandate
          </Button>
        ) : null}
      </div>
      <div className="space-y-1 pt-2">
        {(rules?.data ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs">
            <span>
              {r.name || "Untitled"} · {r.type}
              {r.value != null ? ` ${r.value}` : ""}
            </span>
            <div className="flex items-center gap-2">
              <span className={r.active ? "text-success" : "text-muted-foreground"}>
                {r.active ? "Active" : "Inactive"}
              </span>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setActive.mutate(r)}>
                {r.active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </CardSoft>
  );
}

function MandatePanel() {
  const navigate = useNavigate();
  const projectId = useProjectContextStore((s) => s.projectId);
  const { data: projects } = useQuery({
    queryKey: qk.projects(),
    queryFn: () => api.get<ListResponse<{ id: string; name: string }>>("/api/projects", { pageSize: 50 }),
  });
  const selected = projectId ?? projects?.data[0]?.id ?? "";
  const { data: project } = useQuery({
    queryKey: qk.project(selected),
    queryFn: () => api.get<ProjectMandate>(`/api/projects/${selected}`),
    enabled: Boolean(selected),
  });

  return (
    <CardSoft className="max-w-xl space-y-2.5">
      <Field label="Project">
        <Select value={selected} onValueChange={(v) => useProjectContextStore.getState().setProject(v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            {(projects?.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {project ? (
        <>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Mandate term</p>
              <p className="font-medium">{project.mandateTerm?.trim() || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Agreed brokerage</p>
              <p className="font-semibold tabular-nums">
                {project.agreedMandateBrokerage != null ? `${project.agreedMandateBrokerage}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Total % of brokerage</p>
              <p className="font-semibold tabular-nums">
                {project.totalBrokeragePct != null ? `${project.totalBrokeragePct}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Payment term</p>
              <p className="font-medium">{project.mandateBrokeragePaymentTerm?.trim() || "—"}</p>
            </div>
          </div>
          {(project.brokerageMilestones?.length ?? 0) > 0 ? (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Collection done</th>
                    <th className="px-2 py-1.5 text-left font-medium">Brokerage due</th>
                  </tr>
                </thead>
                <tbody>
                  {project.brokerageMilestones.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="px-2 py-1.5 tabular-nums">{m.collectionPct}%</td>
                      <td className="px-2 py-1.5 tabular-nums font-medium">{m.brokeragePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No collection→brokerage milestones on this project yet.</p>
          )}
          <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${selected}/edit`)}>
            Edit on project
          </Button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Select a project to view mandate details.</p>
      )}
    </CardSoft>
  );
}
