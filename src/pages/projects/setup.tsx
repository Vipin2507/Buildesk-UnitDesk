import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { formatUnitNumber } from "@/lib/units";

type Tab = "wings" | "generate" | "details" | "pricing" | "users";

export function ProjectSetupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("generate");
  const [wingNames, setWingNames] = useState("A, B, C");
  const [floors, setFloors] = useState(12);
  const [unitsPerFloor, setUnitsPerFloor] = useState(8);
  const [numberFormat, setNumberFormat] = useState("[Wing]-[Floor][Unit:2]");

  const { data: project } = useQuery({
    queryKey: qk.project(id!),
    queryFn: () => api.get<{ name: string; company: { name: string }; totalWings: number; totalFloors: number; unitsPerFloor: number; numberFormat: string }>(`/api/projects/${id}`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!project) return;
    if (project.totalFloors) setFloors(project.totalFloors);
    if (project.unitsPerFloor) setUnitsPerFloor(project.unitsPerFloor);
    if (project.numberFormat) setNumberFormat(project.numberFormat);
  }, [project]);

  const wings = useMemo(
    () => wingNames.split(",").map((s) => s.trim()).filter(Boolean),
    [wingNames],
  );
  const preview = wings.length * floors * unitsPerFloor;
  const example = formatUnitNumber(numberFormat, wings[0] ?? "A", 1, 1);

  const generate = useMutation({
    mutationFn: () =>
      api.post(`/api/projects/${id}/generate-units`, {
        wings,
        floorsPerWing: floors,
        unitsPerFloor,
        numberFormat,
      }),
    onSuccess: (res: { preview: number }) => {
      qc.invalidateQueries({ queryKey: qk.project(id!) });
      qc.invalidateQueries({ queryKey: ["inventory", id] });
      toast.success(`Generated ${res.preview} units`);
      navigate(`/projects/${id}/inventory`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Generation failed"),
  });

  const { data: employees } = useQuery({
    queryKey: qk.employees,
    queryFn: () => api.get<ListResponse<{ id: string; name: string; email: string }>>("/api/employees"),
  });

  return (
    <PageWrap>
      <PageHeader
        title="Project setup"
        subtitle={project ? `${project.company.name} · ${project.name}` : "Wings, floors, units"}
        breadcrumbs={[
          { label: "Projects", to: "/projects" },
          { label: project?.name ?? "Setup" },
        ]}
      />
      <SegmentedTabs
        tabs={[
          { id: "wings", label: "Wings & Floors" },
          { id: "generate", label: "Unit Generation" },
          { id: "details", label: "Unit Details" },
          { id: "pricing", label: "Pricing" },
          { id: "users", label: "Users" },
        ]}
        value={tab}
        onChange={setTab}
      >
        {tab === "wings" || tab === "generate" ? (
          <CardSoft className="max-w-2xl space-y-2.5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field label="Total wings">
                <Input className="h-8" value={wings.length} readOnly />
              </Field>
              <Field label="Wing names" className="sm:col-span-2">
                <Input className="h-8" value={wingNames} onChange={(e) => setWingNames(e.target.value)} />
              </Field>
              <Field label="Floors per wing">
                <Input className="h-8" type="number" value={floors} onChange={(e) => setFloors(Number(e.target.value))} />
              </Field>
              <Field label="Units per floor">
                <Input className="h-8" type="number" value={unitsPerFloor} onChange={(e) => setUnitsPerFloor(Number(e.target.value))} />
              </Field>
              <Field label="Unit number format" className="sm:col-span-2">
                <Input className="h-8" value={numberFormat} onChange={(e) => setNumberFormat(e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Live example: <span className="font-medium text-foreground">{example}</span>
              {" · "}
              {wings.length} × {floors} × {unitsPerFloor} ={" "}
              <span className="font-semibold tabular-nums text-foreground">{preview}</span> units
            </p>
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={generate.isPending}
                onClick={() => {
                  if (!confirm(`Generate ${preview} units? This replaces empty inventory.`)) return;
                  generate.mutate();
                }}
              >
                Generate units
              </Button>
            </div>
          </CardSoft>
        ) : null}
        {tab === "details" || tab === "pricing" ? (
          <CardSoft>
            <p className="text-xs text-muted-foreground">
              Default type, facing, parking and base price are applied during generation. Edit individual units from Unit Master after generate.
            </p>
            <Button size="sm" className="mt-2" variant="outline" onClick={() => navigate(`/projects/${id}/units`)}>
              Open unit master
            </Button>
          </CardSoft>
        ) : null}
        {tab === "users" ? (
          <CardSoft>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Employees</p>
            <div className="space-y-1">
              {(employees?.data ?? []).map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs">
                  <span>{e.name}</span>
                  <span className="text-muted-foreground">{e.email}</span>
                </div>
              ))}
            </div>
            <Button size="sm" className="mt-2" variant="outline" onClick={() => navigate("/users")}>
              Manage access
            </Button>
          </CardSoft>
        ) : null}
      </SegmentedTabs>
    </PageWrap>
  );
}
